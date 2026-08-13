/**
 * A-5 · 에이전트 루프 — 1미션 × 1프로필을 끝까지 돌리고 RunTrace를 남긴다.
 *
 *   observe → constrain → decide → act → (키 대조) → 반복
 *
 * 이 파일이 검증하려는 가설은 하나다:
 *   **「제약을 받은 에이전트가 *헤매는가*, 아니면 그냥 *즉시 못 하는가*」**
 * 헤매지 않고 1스텝에서 끝나면 3분 영상이 성립하지 않는다.
 *
 * 사용:
 *   node --env-file=.env agent/src/run.ts shinjuku-tennyu senior-70s
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import type {
  ConstraintRecord,
  CostRecord,
  MaskRecord,
  Mission,
  ObservationSnapshot,
  Outcome,
  RunTrace,
  Step,
  StepType,
  ThreatRecord,
  Verdict,
} from "../../core/types.ts";
import { evidence } from "../../lexicon/src/mask.ts";
import { BASELINE_MODEL, estimateCost } from "../../llm/pricing.ts";
import { ensureLivePrices, onBilledCost, prices } from "../../llm/orca.ts";
import { routingTable } from "../../llm/routing.ts";
import { act, RateLimiter } from "./act.ts";
import { constrain, loadProfile, Patience, type ConstraintTrace, type Observation, type Profile } from "./constrain.ts";
import { decide } from "./decide.ts";
import { diagnose } from "./diagnose.ts";
import { MAX_SIGNALS } from "./signals.ts";
import { routingOff } from "./llm-opts.ts";
import { keyMatch, judge } from "./judge.ts";
import { hasKey, loadMission } from "./mission.ts";
import { observe, type RawObservation } from "./observe.ts";
import type { HistoryEntry } from "./prompts.ts";
import { blockedNavigationThreat, shield } from "../../security/inspect.ts";

const RUNS_DIR = join(import.meta.dirname, "..", "runs");

/** 줌은 CSS 뷰포트를 좁히는 것과 같다. 200% = 1280px 화면에 640px 분량만 들어온다. */
function viewportFor(p: Profile) {
  return {
    width: Math.round(p.viewport.width / p.viewport.zoom),
    height: Math.round(p.viewport.height / p.viewport.zoom),
  };
}

/**
 * Step의 raw/seen 쌍은 화면의 Before/After 그 자체다 (core/types.ts).
 * 그래서 raw 쪽도 **같은 화면**의 텍스트를 넣는다. 페이지 전체를 넣으면
 * 「뷰포트 절단」과 「마스킹」이 한 화면에 섞여 제약 효과가 부풀려진다.
 */
function snapshot(o: RawObservation | Observation, screenshotKey: string | null): ObservationSnapshot {
  const s: ObservationSnapshot = {
    url: o.url,
    title: o.title,
    text: "text_viewport" in o ? o.text_viewport : o.text,
    elements: o.elements.map((e) => ({
      index: e.index,
      role: e.role,
      name: e.name,
      in_viewport: e.in_viewport,
      // 리플레이 전용. decide()가 만드는 프롬프트에는 들어가지 않는다 — decide.ts는
      // index/role/name만 문자열로 엮는다. 여기에 실어도 모델은 못 본다.
      box: e.box,
    })),
    scroll: o.scroll,
    screenshot_key: screenshotKey,
  };
  // ★ 언어는 raw에만 붙인다. Observation(=LLM이 받는 것)에는 lang이라는 필드 자체가 없어서,
  //   여기서 넣고 싶어도 넣을 수가 없다 — 그게 「모델은 이걸 본 적이 없다」의 보증이다.
  if ("lang" in o) s.lang = o.lang;
  return s;
}

function constraintRecord(t: ConstraintTrace, charsBefore: number, charsAfter: number): ConstraintRecord {
  // ★ basis 없는 히트는 기록에 넣지 않는다.
  //   "none"은 조사 미수록어(unknown)다 — 「왜 가렸는가」에 답할 근거가 없다.
  //   계약(core/types.ts)의 MaskRecord.basis도 이 값을 받지 않으므로 DB 저장에서 거부된다.
  //   근거 없는 히트는 버그다 (절대규칙 2).
  const masked: MaskRecord[] = t.masked_words
    .filter((h) => h.basis !== "none")
    .map((h) => ({
      surface: h.surface,
      entry: h.entry,
      action: h.action as MaskRecord["action"],
      // 이해율(数値) 근거인가, 지정 명단 근거인가. 리포트 문구가 여기서 갈린다
      basis: h.basis as MaskRecord["basis"],
      comprehension: h.comprehension,
      cohort: h.cohort as MaskRecord["cohort"],
      // 명단 근거일 때의 「대신 이렇게 쓰세요」 — 그대로 개선 제안이 된다
      listing: h.listing,
      in_control: h.in_control,
      evidence_ja: evidence(h),
    }));
  return {
    profile: t.profile,
    profile_version: t.profile_version,
    masked,
    // 버린 히트까지 세면 실제보다 많이 가린 것처럼 보인다. 오차는 항상 과소 쪽이어야 한다.
    // core/fixtures도 같은 정의다 — masked 안에서 센다.
    masked_in_controls: masked.filter((m) => m.in_control).length,
    dom_text_withheld: t.dom_text_withheld,
    elements_total: t.elements_total,
    elements_in_viewport: t.elements_in_viewport,
    chars_before: charsBefore,
    chars_after: charsAfter,
  };
}

/**
 * 원가 집계.
 * ⚠️ 모르는 모델은 `estimateCost`가 null을 주고 `cost_usd`는 NaN이 되어 있다.
 *   그걸 0으로 바꾸지 않는다. 합계가 NaN이면 시끄럽게 드러나야 한다 (절대규칙 4).
 */
function aggregate(calls: CostRecord[]) {
  const byStep: Record<StepType, number> = { perceive: 0, decide: 0, judge: 0, diagnose: 0 };
  const byModel: Record<string, number> = {};
  let total = 0;
  let cached = 0;
  let baseline: number | null = 0;

  const table = prices();
  for (const c of calls) {
    total += c.cost_usd;
    byStep[c.step_type] += c.cost_usd;
    byModel[c.model] = (byModel[c.model] ?? 0) + c.cost_usd;
    cached += c.cached_tokens;

    // 「라우팅하지 않았다면 얼마였는가」 — 전량 프론티어 단가로 다시 센다
    const b = estimateCost(BASELINE_MODEL, c.prompt_tokens, c.completion_tokens, table);
    if (b === null) baseline = null;
    else if (baseline !== null) baseline += b;
  }
  return { total_usd: total, by_step_type: byStep, by_model: byModel, calls: calls.length, cached_tokens: cached, baseline_usd: baseline };
}

/**
 * 실행 중에 밖으로 흘려보내는 진행 상황.
 *
 * ★ 왜 필요한가: 1회 실행이 5분 넘게 걸린다. 그동안 화면이 「実行中…」만 띄우고 있으면
 *   보는 사람은 무엇이 일어나는지 모르고, **우리 제품에서 제일 볼 만한 부분(헤매는 과정)이
 *   통째로 안 보인다.** 트레이스는 끝나야 나오므로, 도중에 나가는 통로가 따로 있어야 한다.
 *
 * ⚠️ Step을 통째로 싣지 않는다. raw.text는 페이지 한 장에 수만 자다 —
 *   그걸 스텝마다 흘리면 통로가 막힌다. 전체 기록은 끝난 뒤 trace.json에서 읽는다.
 */
export type Progress =
  | {
      kind: "start";
      run_id: string;
      site_name: string;
      start_url: string;
      goal_ja: string;
      profile_id: string;
      profile_label_ja: string;
      max_steps: number;
      /** 사람이 만든 정답 키가 있는가. false면 도달 판정이 AI 하나뿐이다 */
      key_available: boolean;
    }
  | {
      kind: "step";
      n: number;
      url: string;
      title: string;
      /** click / scroll / scroll_side / back / find_in_page / site_search / give_up / null(판단 실패) */
      action: string | null;
      detail: string;
      reason_ja: string;
      ok: boolean;
      error: string | null;
      screenshot_key: string | null;
      /** 이 스텝에서 실제로 가린 단어들. 화면의 Before/After가 여기서 나온다 */
      masked: string[];
      elements_total: number;
      elements_in_viewport: number;
      clicks_left: number;
      seconds_left: number;
      threats: number;
    }
  | { kind: "verdict"; outcome: Outcome; reached: boolean; reason_ja: string; key_available: boolean }
  /** 근거(evidence)를 반드시 같이 싣는다 — 근거 없는 지적은 리포트가 아니라 비난이다 */
  | { kind: "finding"; step_n: number; severity: string; cause_ja: string; fix_ja: string; evidence: string[] }
  | { kind: "done"; run_id: string; trace_path: string; cost_usd: number; steps: number }
  | { kind: "failed"; message: string };

export type RunOptions = {
  missionId?: string;
  /**
   * 즉석 미션 — 그 자리에서 받은 URL. `missions/`에 없다 = **정답 키도 없다.**
   * 이때 도달 판정은 AI 하나뿐이 되고, 그 사실은 Progress와 verdict 문구로 화면까지 간다.
   */
  mission?: Mission;
  profileId: string;
  variant?: number;
  batchId?: string;
  headless?: boolean;
  /** 도메인당 최소 요청 간격. 절대규칙 6 — 기본 4초에서 낮추지 않는다 */
  delayMs?: number;
  /**
   * 미션의 스텝 상한을 실험용으로 덮어쓴다.
   * 「인내 예산이 짧아서 실패한 게 아니냐」를 확인하려면 예산만 늘려도 소용없다.
   * 스텝 상한에 먼저 걸리면 그건 사이트가 아니라 우리 계측 장치가 만든 결과다.
   * ★ 덮어쓴 값은 trace.mission.max_steps에 그대로 남는다. 숨기지 않는다.
   */
  maxSteps?: number;
  /**
   * 결과를 어디에 쓸 것인가. 기본은 `agent/runs/`.
   *
   * ★ 즉석 실행은 **반드시 다른 폴더로 보낸다.** `scripts/build-web-data.ts`가
   *   `agent/runs/` 전체를 훑어서 matrix.json(=화면의 모든 숫자)을 만들기 때문이다.
   *   즉석 실행이 거기 섞이면 105회 실측 통계에 심사장에서 넣은 URL이 들어간다.
   *   그 순간 「이 숫자 어디서 나왔나요」에 답할 수 없다 (절대규칙 4).
   */
  outDir?: string;
  /** 스텝마다 호출된다. 던지면 실행이 죽으므로 받는 쪽에서 삼킨다 */
  onProgress?: (p: Progress) => void;
};

export async function runOnce(opts: RunOptions): Promise<RunTrace> {
  const mission = opts.mission ?? (opts.missionId ? loadMission(opts.missionId) : null);
  if (!mission) throw new Error("미션이 없다 — missionId 또는 mission 중 하나는 줘야 한다");
  if (opts.maxSteps) mission.max_steps = opts.maxSteps;
  const profile = loadProfile(opts.profileId);
  const variant = opts.variant ?? 0;
  const runId = `${mission.id}__${profile.id}__v${variant}__${Date.now()}`;
  const runDir = join(opts.outDir ?? RUNS_DIR, runId);
  mkdirSync(runDir, { recursive: true });

  // 던져도 실행이 죽지 않게 감싼다. 진행 표시가 계측을 죽이면 본말전도다
  const emit = (p: Progress) => {
    try {
      opts.onProgress?.(p);
    } catch {
      /* 화면 사정으로 계측을 잃지 않는다 */
    }
  };

  /**
   * ★ 이 실행에 사람이 만든 정답 키가 있는가. **없으면 판정 방식 자체가 달라진다.**
   *   키가 있으면: 키가 맞은 스텝에서만 심판을 부른다 (105회와 완전히 동일).
   *   키가 없으면: 그 신호가 영원히 안 오므로, **페이지가 바뀔 때마다** 한 번 묻는다.
   *   매 스텝 묻지 않는 이유는 원가와 시간이다 — 스크롤만 한 스텝은 같은 페이지다.
   */
  const keyed = hasKey(mission.id);
  let lastJudgedUrl = "";

  // 라이브 가격표를 먼저 받아둔다. 실패하면 폴백 표로 계속하되 cost_source가 "table"이 된다.
  await ensureLivePrices();

  const rl = new RateLimiter(opts.delayMs ?? 4000);
  const origin = new URL(mission.start_url).origin;
  const steps: Step[] = [];
  const history: HistoryEntry[] = [];

  /**
   * ★ 원가 원장. **부른 쪽이 아니라 실제로 과금된 쪽**에서 받는다 (llm/orca.ts).
   *
   *   `complete()`의 반환값(`LlmResponse.cost`)은 **채택된 시도 1건**뿐이다.
   *   스키마 위반이나 429로 버려진 시도도 토큰은 이미 태웠고 이미 과금됐는데, 거기엔 없다.
   *   그것만 세면 실행 합계가 실제보다 **적게** 나온다 — 「実測原価」라고 부르면서
   *   과소 보고하는 셈이라 ⑥에서 「이 숫자 어디서 나왔나요」에 답할 수 없다 (절대규칙 4).
   *
   *   실측으로 새던 곳 두 군데. 이제 둘 다 이 싱크가 잡는다:
   *     judge()  — 산문을 뱉은 1차 시도를 버리고 2차만 돌려준다. 1차분이 사라졌다
   *     orca.ts  — 내부 재시도(429·5xx·스키마 위반)는 A에게 보이지도 않았다
   *
   * ⚠️ 이 구독은 **프로세스 전역**이다. 한 프로세스에서 runOnce를 동시에 두 개 돌리면
   *   서로의 호출이 섞인다. 지금은 CLI 1실행 = 1프로세스라 문제없지만, 배치 하네스를
   *   만들 때는 complete()의 per-call `onBilled` 옵션으로 갈아타야 한다.
   */
  const billed: CostRecord[] = [];
  const offBilled = onBilledCost((c) => billed.push(c));

  let browser: Browser | null = null;
  let outcome: Outcome = "max_steps";
  let verdictReason = "";
  let keyHit = false;
  let llmHit = false;
  let disagreed = false;
  let backsUsed = 0;
  /** 연속 실패 횟수. 모델 잡음 1회로 실행 전체를 「에러」로 만들지 않기 위한 것 */
  let failStreak = 0;

  const t0 = Date.now();
  const patience = new Patience(profile.patience.clicks, profile.patience.seconds, t0);

  emit({
    kind: "start",
    run_id: runId,
    site_name: mission.site_name,
    start_url: mission.start_url,
    goal_ja: mission.goal_ja,
    profile_id: profile.id,
    profile_label_ja: profile.label.ja,
    max_steps: mission.max_steps,
    key_available: keyed,
  });

  try {
    browser = await chromium.launch({ channel: "chrome", headless: opts.headless ?? true });
    const ctx = await browser.newContext({
      viewport: viewportFor(profile),
      locale: "ja-JP",
      timeZoneId: "Asia/Tokyo",
    });
    const page = await ctx.newPage();
    await page.goto(mission.start_url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1500);
    rl.last = Date.now();

    for (let n = 1; n <= mission.max_steps; n++) {
      // 이 스텝이 시작된 시점의 원장 위치. 여기부터 끝까지가 이 스텝이 태운 호출이다.
      // 루프 맨 위에서 찍는 이유: 아래 키 대조 judge()도 이 스텝 중에 일어난 일이다.
      const billedMark = billed.length;
      const raw = await observe(page, profile.observation.screenshot);

      // ★ 위협 검사는 constrain()보다 **먼저** 온다 (docs/SECURITY.md).
      //   여기부터 아래로 흐르는 것은 전부 `safe`다. `raw`는 트레이스의 증거로만 남는다 —
      //   지운 뒤를 증거로 남기면 「무엇을 막았는가」를 사후에 아무도 확인할 수 없다.
      //   judge()도 `safe`를 받는다. 심판 역시 LLM 호출이라 예외를 두면 우회로가 된다.
      const { safe, threats } = shield(raw);

      // 키 대조는 LLM을 안 쓴다. 매 스텝 돌려도 원가 0이다.
      // 키가 없는 즉석 미션에서는 그 신호가 안 오므로, 페이지가 바뀐 스텝에서만 대신 묻는다.
      const askJudge = keyed ? keyMatch(mission.id, safe) : safe.url !== lastJudgedUrl;
      if (askJudge) {
        lastJudgedUrl = safe.url;
        const j = await judge(mission, safe);
        keyHit = j.key_match;
        llmHit = j.llm_match;
        disagreed = j.disagreed;
        verdictReason = j.reason_ja;
        if (j.reached) {
          outcome = "reached";
          console.log(`  [${n}] ✓ 到達 — ${j.reason_ja}`);
          break;
        }
        // 아직 아니다. 계속 탐색시킨다.
        // (키 있음 = 키는 맞았는데 LLM이 아니라고 했다 / 키 없음 = LLM이 아니라고 했다)
        console.log(`  [${n}] ~ 미도달 판정 — ${j.reason_ja}`);
      }

      // visible: 화면에 실제로 보여준 원본 요소들. obs.elements와 같은 순서·같은 번호다.
      // act()는 이걸로 좌표를 되찾는다 — raw에서 찾으면 화면 밖 요소를 눌러버린다.
      const { obs, trace, visible } = constrain(safe, profile);

      let screenshotKey: string | null = null;
      if (raw.screenshot) {
        screenshotKey = `${runId}/step-${String(n).padStart(2, "0")}.png`;
        writeFileSync(join(runDir, `step-${String(n).padStart(2, "0")}.png`), raw.screenshot);
      }

      let action = null;
      let actOk = false;
      let actErr: string | null = null;
      /** 「#3 「転入届」」처럼 사람이 읽는 꼬리표. 로그와 진행 표시가 같은 문자열을 쓴다 */
      let actDetail = "";

      try {
        const d = await decide(mission, obs, profile, history);
        action = d.action;
        failStreak = 0;

        const r = await act(page, action, raw, visible, profile, origin, rl, backsUsed);
        actOk = r.ok;
        actErr = r.error;
        if (action.kind === "back" && r.ok) backsUsed++;

        // 도메인 가드(C-5)는 이미 act.ts에 있었다. 없던 것은 **막았다는 사실이 남는 것**이다.
        // 조용히 막으면 방어한 증거가 어디에도 안 남는다 (docs/SECURITY.md).
        if (r.blocked) {
          threats.push(
            blockedNavigationThreat(r.blocked, typeof action.index === "number" ? `element:${action.index}` : "action"),
          );
        }

        const landed = r.blocked ? `${r.blocked.reason}` : r.tool_note ?? (await page.title());
        history.push({ n, action, landed_title: landed, ok: r.ok, changed: r.navigated });

        // structured output은 required 때문에 안 쓰는 필드도 채워 온다.
        // 그걸 그대로 찍으면 로그가 거짓말을 한다 (scroll인데 검색어가 보인다).
        // 번호는 constrain()에서 0부터 다시 매겼으므로 배열 첨자와 같다.
        const clicked = typeof action.index === "number" ? obs.elements[action.index] : undefined;
        actDetail =
          action.kind === "click"
            ? ` #${action.index}${clicked?.name ? ` 「${clicked.name}」` : ""}`
            : action.kind === "scroll" || action.kind === "scroll_side"
              ? ` ${r.tool_note ?? ""}` // 모델이 요청한 값이 아니라 실제로 움직인 양
              : action.kind === "find_in_page" || action.kind === "site_search"
                ? ` 「${action.query ?? ""}」`
                : "";
        console.log(
          `  [${n}] ${action.kind}${actDetail} — ${action.reason_ja}${r.ok ? "" : `  ⚠️ ${r.error}`}`,
        );

        // 인내는 「무언가를 눌렀다」에만 든다. 스크롤로 예산이 마르면 이탈률이 왜곡된다.
        if (action.kind === "click" || action.kind === "site_search") patience.spend();
      } catch (e) {
        actErr = e instanceof Error ? e.message : String(e);
        failStreak++;
        // 판단에 실패해도 그때까지 부른 호출은 이미 과금됐다 (절대규칙 4).
        // 여기서 회수하지 않는다 — onBilledCost 싱크가 이미 잡았다. 또 담으면 이중 계상이다.
        console.log(`  [${n}] ✗ ${actErr}`);

        // 한 번의 모델 잡음(JSON 대신 YAML 등)으로 실행 전체를 죽이지 않는다.
        // 죽이면 「예산을 다 쓰고 포기했다」가 「에러」로 기록되어 이탈률이 오염된다.
        // 다만 판단 재료가 아예 없는 건 설계 구멍(vision 미지원)이라 다시 돌려도 같다.
        if (actErr.includes("판단 재료 없음") || failStreak >= 3) {
          outcome = "error";
          verdictReason = actErr;
        }
      }

      steps.push({
        n,
        ts: new Date().toISOString(),
        raw: snapshot(raw, screenshotKey),
        seen: snapshot(obs, screenshotKey),
        // chars_before는 「화면에 있던 글자수」다. 페이지 전체(raw.text)와 비교하면
        // 뷰포트 절단과 마스킹이 한 숫자에 섞여, 마스킹 효과를 부풀리게 된다.
        constraint: constraintRecord(trace, raw.text_viewport.length, obs.text?.length ?? 0),
        threats,
        action,
        action_ok: actOk,
        action_error: actErr,
        // 이 스텝이 태운 전건. 재질문이 붙었으면 2~3건이 된다 = 사후에 셀 수 있다 = 숨기지 않는다
        llm_calls: billed.slice(billedMark),
        patience: patience.state(Date.now()),
      });

      // ★ 기록을 남긴 **뒤에** 흘린다. 순서를 바꾸면 화면에는 보였는데 트레이스에는 없는
      //   스텝이 생길 수 있고, 그러면 영상에 찍힌 것과 제출한 파일이 어긋난다.
      {
        const st = steps[steps.length - 1];
        emit({
          kind: "step",
          n,
          url: raw.url,
          title: raw.title,
          action: action?.kind ?? null,
          detail: actDetail.trim(),
          reason_ja: action?.reason_ja ?? "",
          ok: actOk,
          error: actErr,
          screenshot_key: screenshotKey,
          // 화면의 Before/After는 이 목록에서 나온다. 근거 없는 히트는 여기 못 들어온다
          masked: st.constraint.masked.map((m) => m.surface),
          elements_total: st.constraint.elements_total,
          elements_in_viewport: st.constraint.elements_in_viewport,
          clicks_left: st.patience.clicks_left,
          seconds_left: st.patience.seconds_left,
          threats: threats.length,
        });
      }

      if (outcome === "error") break;

      if (action?.kind === "give_up") {
        outcome = "gave_up_self";
        verdictReason = action.reason_ja;
        console.log(`  [${n}] ⨯ 諦めた — ${action.reason_ja}`);
        break;
      }

      const spent = patience.exhausted(Date.now());
      if (spent) {
        outcome = spent === "clicks" ? "gave_up_clicks" : "gave_up_time";
        verdictReason = spent === "clicks" ? "クリック予算を使い切った" : "時間予算を使い切った";
        console.log(`  [${n}] ⨯ 予算切れ (${spent})`);
        break;
      }
    }

    // 루프가 도달 없이 끝났으면, 놓친 도달이 없는지 마지막으로 한 번만 본다.
    if (outcome !== "reached" && outcome !== "error") {
      const raw = await observe(page, false);
      // 심판도 LLM 호출이다. 마지막 1회라고 검사를 건너뛰면 그게 우회로가 된다
      const { safe } = shield(raw);
      // ★ 심판이 죽어도 그때까지의 계측은 반드시 남긴다.
      //   40스텝을 다 돌고 마지막 1회 호출이 형식을 어겼다는 이유로 실행 전체를 버린 적이 있다.
      //   스텝 기록이 이 도구의 본체다. 판정은 그 위에 붙는 해석일 뿐이다.
      try {
        const j = await judge(mission, safe);
        keyHit = j.key_match;
        llmHit = j.llm_match;
        disagreed = j.disagreed;
        if (j.reached) {
          outcome = "reached";
          verdictReason = j.reason_ja;
        } else if (!verdictReason) {
          verdictReason = j.reason_ja;
        }
      } catch (e) {
        // 키 대조는 LLM을 안 쓰므로 심판이 죽어도 살아 있다. 그것만 남기고,
        // LLM 판정은 「하지 않았다」를 명시한다. 미도달로 위장하지 않는다.
        keyHit = keyMatch(mission.id, safe);
        llmHit = false;
        disagreed = false;
        // 키가 없는 즉석 미션에서 심판까지 죽으면 **남는 판정이 하나도 없다.** 그렇게 쓴다.
        verdictReason = keyed
          ? `審判の呼び出しに失敗したため、AI判定なし（キー照合のみ）: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`
          : `審判の呼び出しに失敗し、正解キーもないため、到達判定ができませんでした: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`;
        console.log(`  ⚠️ 심판 실패 — 스텝 기록은 보존한다: ${verdictReason}`);
      }
    }
  } catch (e) {
    // 여기까지 온 스텝 기록은 이미 계측 결과다. 예외 하나로 통째로 버리지 않는다.
    // outcome을 "error"로 남겨서, 이 실행을 이탈률 통계에 섞지 않도록 표시한다.
    outcome = "error";
    verdictReason = `実行が中断した: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`;
    console.error(`\n  ⚠️ 실행 중단 — ${steps.length}스텝까지의 기록은 저장한다\n     ${verdictReason}`);
  } finally {
    await browser?.close();
    // 전역 구독이다. 안 끊으면 다음 실행의 호출까지 이 배열로 흘러든다
    offBilled();
  }

  /**
   * ★ 키가 없었다는 사실을 **판정문 자체에** 박는다.
   *   `Verdict`는 `core/types.ts`의 공유 계약이라 필드를 늘릴 수 없다 (절대규칙 10).
   *   그런데 이 문장은 화면에 그대로 나간다. 아무 말도 안 붙이면 즉석 실행 결과가
   *   105회 실측과 같은 급으로 읽힌다 — 실제로는 판정이 한 겹 얇다 (절대규칙 4).
   */
  if (!keyed) {
    const notice = "※ このURLには人が用意した正解キーがないため、到達判定はAIのみ（キー照合なし）です。";
    verdictReason = verdictReason ? `${verdictReason}\n${notice}` : notice;
  }

  const verdict: Verdict = {
    outcome,
    reached: outcome === "reached",
    key_match: keyHit,
    llm_match: llmHit,
    disagreed,
    reason_ja: verdictReason,
    clicks: patience.clicks,
    seconds: Math.round((Date.now() - t0) / 1000),
  };

  emit({
    kind: "verdict",
    outcome,
    reached: verdict.reached,
    reason_ja: verdictReason,
    key_available: keyed,
  });

  const trace: RunTrace = {
    run_id: runId,
    batch_id: opts.batchId ?? runId,
    created_at: new Date(t0).toISOString(),
    mission,
    profile_id: profile.id,
    profile_version: profile.version,
    variant,
    steps,
    verdict,
    findings: [],
    cost: aggregate(billed),
  };

  // ★ 진단은 **트레이스를 다 쓴 뒤에** 돈다. 실패해도 계측은 남아야 한다.
  //   여기서 던지면 40스텝짜리 실행이 통째로 사라진다 — 실제로 judge()에서 그랬다.
  //   진단은 사후에 다시 돌릴 수 있지만(`npm run diagnose <run_id>`), 브라우저 조작은 못 돌린다.
  writeFileSync(join(runDir, "trace.json"), JSON.stringify(trace, null, 2));
  try {
    const d = await diagnose(trace);
    trace.findings = d.findings;
    console.log(`  진단     : ${d.findings.length}건`);
    for (const f of d.findings) console.log(`             [${f.severity.padEnd(6)}] step ${String(f.step_n).padStart(2)}  ${f.cause_ja}`);
    // 뺀 것을 적지 않으면 「이 사이트엔 이만큼만 문제가 있었다」로 읽힌다 (절대규칙 3)
    for (const s of d.ours) console.log(`             [제외  ] step ${String(s.step_n).padStart(2)}  사이트가 아니라 계측 고장: ${s.ours}`);
    if (d.dropped) console.log(`  ⚠️ 신호 ${d.dropped}건은 상한(${MAX_SIGNALS})을 넘어 리포트에서 뺐다`);
    // 진단 호출도 과금이다. 원가에 넣지 않으면 「우리 도구는 싸다」가 거짓이 된다 (절대규칙 4).
    // ⚠️ 여기서 **직접** 넣어야 한다. 전역 싱크(offBilled)는 브라우저를 닫을 때 이미 끊겼고,
    //    진단은 그 뒤에 돈다. 그래서 지금까지 by_step_type.diagnose가 0이었다 (2026-08-13 확인)
    billed.push(...d.costs);
    trace.cost = aggregate(billed);
    writeFileSync(join(runDir, "trace.json"), JSON.stringify(trace, null, 2));
    for (const f of d.findings) {
      emit({ kind: "finding", step_n: f.step_n, severity: f.severity, cause_ja: f.cause_ja, fix_ja: f.fix_ja, evidence: f.evidence });
    }
  } catch (e) {
    console.error(`  ⚠️ 진단 실패 — 계측은 남았다: ${e instanceof Error ? e.message : String(e)}`);
  }

  emit({
    kind: "done",
    run_id: runId,
    trace_path: join(runDir, "trace.json"),
    cost_usd: trace.cost.total_usd,
    steps: trace.steps.length,
  });
  return trace;
}

// ── CLI ──────────────────────────────────────────────────────
//
// ★ import.meta.main 가드가 필요한 이유: batch.ts가 runOnce를 import 한다.
//   가드가 없으면 import 하는 순간 이 아래가 통째로 실행돼서, 인자가 없다며
//   batch를 process.exit(1)로 죽인다.
if (import.meta.main) {
const [missionId, profileId = "senior-70s"] = process.argv.slice(2);
if (!missionId) {
  console.error("사용법: node --env-file=.env agent/src/run.ts <mission-id> [profile-id]");
  process.exit(1);
}

const maxSteps = process.env.MAX_STEPS ? Number(process.env.MAX_STEPS) : undefined;

const mission = loadMission(missionId);
const profile = loadProfile(profileId);
console.log(`\n▶ ${mission.site_name} / ${mission.id}`);
console.log(`  프로필 : ${profile.id} v${profile.version} — ${profile.label.ja}`);
console.log(`  용무   : ${mission.intent_ja}`);
console.log(`  예산   : ${profile.patience.clicks}클릭 / ${profile.patience.seconds}초`);
console.log(`  스텝상한: ${maxSteps ?? mission.max_steps}${maxSteps ? " (MAX_STEPS로 덮어씀)" : ""}`);
// 어느 쪽으로 돌 **예정**인지. 실제로 뭐가 돌았는지는 아래 결과의 by_model이 말한다.
//   여기(계획)와 저기(실측)를 나눠 찍는 이유: 429로 폴백하면 둘이 달라진다.
//   한 줄로 합치면 「돌지도 않은 모델을 주장했다」가 된다 (절대규칙 4).
console.log(`  라우팅  : ${routingOff() ? "OFF — 대조군 (ORCA_NO_ROUTING=1)" : "llm/routing.ts 표"}`);
for (const r of routingTable()) {
  console.log(`             ${r.step_type.padEnd(9)} ${r.model.padEnd(32)} [${r.source}]`);
}
console.log("");

const t = await runOnce({ missionId, profileId, maxSteps, headless: process.env.HEADED !== "1" });

console.log(`\n── 결과 ─────────────────────────────────`);
console.log(`  outcome  : ${t.verdict.outcome}  (到達 ${t.verdict.reached ? "○" : "×"})`);
console.log(`  판정     : key ${t.verdict.key_match ? "○" : "×"} / llm ${t.verdict.llm_match ? "○" : "×"}` +
  `${t.verdict.disagreed ? "  ⚠️ 불일치" : ""}`);
console.log(`  이유     : ${t.verdict.reason_ja}`);
console.log(`  스텝     : ${t.steps.length}  클릭 ${t.verdict.clicks}  ${t.verdict.seconds}초`);
console.log(`  원가     : $${t.cost.total_usd.toFixed(6)}  (호출 ${t.cost.calls}회 — 버려진 시도 포함)`);
// ★ ⑥의 근거. 「무슨 모델을 왜 골랐나」에 답하려면 실제로 뭐가 돌았는지가 보여야 한다
for (const [m, v] of Object.entries(t.cost.by_model).sort((a, b) => b[1] - a[1])) {
  console.log(`             ${m.padEnd(30)} $${v.toFixed(6)}`);
}
if (t.cost.baseline_usd !== null && t.cost.total_usd > 0) {
  const cut = (1 - t.cost.total_usd / t.cost.baseline_usd) * 100;
  console.log(`  기준선   : $${t.cost.baseline_usd.toFixed(6)} (전량 ${BASELINE_MODEL}) → ${cut.toFixed(1)}% 절감`);
}
// 1스텝만 보여주면 「첫 화면이 마침 그랬다」로 들린다. 실행 전체를 합쳐야 제약의 크기가 보인다.
//
// ★ 「◯건」이 아니라 「◯단어 / 연 ◯회」로 쓴다.
//   constrain()의 maskText()는 요소 라벨과 본문에 각각 돌기 때문에 같은 단어가 두 번 기록된다.
//   건수를 그대로 「가린 단어 수」라고 부르면 2배 과대 보고가 된다 (절대규칙 2 — 오차는 과소 쪽으로).
//
// chars_before → chars_after는 뺐다. 마스킹이 길이 보존(転入届 → ◯◯◯)이라 항상 같은 숫자다.
if (t.steps.length) {
  const total = t.steps.reduce((a, s) => a + s.constraint.elements_total, 0);
  const shown = t.steps.reduce((a, s) => a + s.constraint.elements_in_viewport, 0);
  const hits = t.steps.flatMap((s) => s.constraint.masked);
  const inCtl = t.steps.reduce((a, s) => a + s.constraint.masked_in_controls, 0);
  const words = new Set(hits.map((m) => m.surface));
  console.log(`  제약 실측 : 요소 ${total} → ${shown} (${total ? Math.round((1 - shown / total) * 100) : 0}% 차단)`);
  console.log(`             마스킹 ${words.size}단어 / 연 ${hits.length}회 (링크 라벨 안 ${inCtl}회)`);
  if (words.size) console.log(`             ${[...words].join(" ")}`);
}
// ⑦의 근거. 0건도 결과다 — 「검사는 돌았고 이 사이트에서는 안 나왔다」와
// 「검사를 안 돌렸다」는 다르다. 안 찍으면 화면에서 둘이 같아 보인다.
{
  const th = t.steps.flatMap((s) => s.threats);
  const blocked = th.filter((x) => x.verdict === "block").length;
  console.log(`  위협 검사 : ${th.length}건 (차단 ${blocked} / 기록만 ${th.length - blocked})`);
  for (const x of th.filter((y) => y.verdict === "block")) {
    console.log(`             ⛔ ${x.kind} @${x.location} — ${x.note_ja}`);
  }
}
console.log(`  트레이스 : agent/runs/${t.run_id}/trace.json\n`);
}
