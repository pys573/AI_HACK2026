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
  ObservationSnapshot,
  Outcome,
  RunTrace,
  Step,
  StepType,
  Verdict,
} from "../../core/types.ts";
import { evidence } from "../../lexicon/src/mask.ts";
import { BASELINE_MODEL, estimateCost } from "../../llm/pricing.ts";
import { ensureLivePrices, prices } from "../../llm/orca.ts";
import { act, RateLimiter } from "./act.ts";
import { constrain, loadProfile, Patience, type ConstraintTrace, type Observation, type Profile } from "./constrain.ts";
import { decide } from "./decide.ts";
import { keyMatch, judge } from "./judge.ts";
import { loadMission } from "./mission.ts";
import { observe, type RawObservation } from "./observe.ts";
import type { HistoryEntry } from "./prompts.ts";

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
  return {
    url: o.url,
    title: o.title,
    text: "text_viewport" in o ? o.text_viewport : o.text,
    elements: o.elements.map((e) => ({
      index: e.index,
      role: e.role,
      name: e.name,
      in_viewport: e.in_viewport,
    })),
    scroll: o.scroll,
    screenshot_key: screenshotKey,
  };
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

export type RunOptions = {
  missionId: string;
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
};

export async function runOnce(opts: RunOptions): Promise<RunTrace> {
  const mission = loadMission(opts.missionId);
  if (opts.maxSteps) mission.max_steps = opts.maxSteps;
  const profile = loadProfile(opts.profileId);
  const variant = opts.variant ?? 0;
  const runId = `${mission.id}__${profile.id}__v${variant}__${Date.now()}`;
  const runDir = join(RUNS_DIR, runId);
  mkdirSync(runDir, { recursive: true });

  // 라이브 가격표를 먼저 받아둔다. 실패하면 폴백 표로 계속하되 cost_source가 "table"이 된다.
  await ensureLivePrices();

  const rl = new RateLimiter(opts.delayMs ?? 4000);
  const origin = new URL(mission.start_url).origin;
  const steps: Step[] = [];
  const history: HistoryEntry[] = [];
  const allCalls: CostRecord[] = [];

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
      const raw = await observe(page, profile.observation.screenshot);

      // 키 대조는 LLM을 안 쓴다. 매 스텝 돌려도 원가 0이다.
      if (keyMatch(mission.id, raw)) {
        const j = await judge(mission, raw);
        if (j.cost) allCalls.push(j.cost);
        keyHit = j.key_match;
        llmHit = j.llm_match;
        disagreed = j.disagreed;
        verdictReason = j.reason_ja;
        if (j.reached) {
          outcome = "reached";
          console.log(`  [${n}] ✓ 到達 — ${j.reason_ja}`);
          break;
        }
        // 키는 맞았는데 LLM이 아니라고 했다. 계속 탐색시킨다.
        console.log(`  [${n}] ~ 키는 일치, LLM은 미도달 판정 — ${j.reason_ja}`);
      }

      // visible: 화면에 실제로 보여준 원본 요소들. obs.elements와 같은 순서·같은 번호다.
      // act()는 이걸로 좌표를 되찾는다 — raw에서 찾으면 화면 밖 요소를 눌러버린다.
      const { obs, trace, visible } = constrain(raw, profile);

      let screenshotKey: string | null = null;
      if (raw.screenshot) {
        screenshotKey = `${runId}/step-${String(n).padStart(2, "0")}.png`;
        writeFileSync(join(runDir, `step-${String(n).padStart(2, "0")}.png`), raw.screenshot);
      }

      const stepCalls: CostRecord[] = [];
      let action = null;
      let actOk = false;
      let actErr: string | null = null;

      try {
        const d = await decide(mission, obs, profile, history);
        action = d.action;
        failStreak = 0;
        stepCalls.push(...d.costs);
        allCalls.push(...d.costs);

        const r = await act(page, action, raw, visible, profile, origin, rl, backsUsed);
        actOk = r.ok;
        actErr = r.error;
        if (action.kind === "back" && r.ok) backsUsed++;

        const landed = r.blocked ? `${r.blocked.reason}` : r.tool_note ?? (await page.title());
        history.push({ n, action, landed_title: landed, ok: r.ok, changed: r.navigated });

        // structured output은 required 때문에 안 쓰는 필드도 채워 온다.
        // 그걸 그대로 찍으면 로그가 거짓말을 한다 (scroll인데 검색어가 보인다).
        // 번호는 constrain()에서 0부터 다시 매겼으므로 배열 첨자와 같다.
        const clicked = typeof action.index === "number" ? obs.elements[action.index] : undefined;
        const detail =
          action.kind === "click"
            ? ` #${action.index}${clicked?.name ? ` 「${clicked.name}」` : ""}`
            : action.kind === "scroll"
              ? ` ${r.tool_note ?? ""}` // 모델이 요청한 값이 아니라 실제로 움직인 양
              : action.kind === "find_in_page" || action.kind === "site_search"
                ? ` 「${action.query ?? ""}」`
                : "";
        console.log(
          `  [${n}] ${action.kind}${detail} — ${action.reason_ja}${r.ok ? "" : `  ⚠️ ${r.error}`}`,
        );

        // 인내는 「무언가를 눌렀다」에만 든다. 스크롤로 예산이 마르면 이탈률이 왜곡된다.
        if (action.kind === "click" || action.kind === "site_search") patience.spend();
      } catch (e) {
        actErr = e instanceof Error ? e.message : String(e);
        failStreak++;
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
        threats: [],
        action,
        action_ok: actOk,
        action_error: actErr,
        llm_calls: stepCalls,
        patience: patience.state(Date.now()),
      });

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
      // ★ 심판이 죽어도 그때까지의 계측은 반드시 남긴다.
      //   40스텝을 다 돌고 마지막 1회 호출이 형식을 어겼다는 이유로 실행 전체를 버린 적이 있다.
      //   스텝 기록이 이 도구의 본체다. 판정은 그 위에 붙는 해석일 뿐이다.
      try {
        const j = await judge(mission, raw);
        if (j.cost) allCalls.push(j.cost);
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
        keyHit = keyMatch(mission.id, raw);
        llmHit = false;
        disagreed = false;
        verdictReason = `審判の呼び出しに失敗したため、AI判定なし（キー照合のみ）: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`;
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
    cost: aggregate(allCalls),
  };

  writeFileSync(join(runDir, "trace.json"), JSON.stringify(trace, null, 2));
  return trace;
}

// ── CLI ──────────────────────────────────────────────────────
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
console.log(`  스텝상한: ${maxSteps ?? mission.max_steps}${maxSteps ? " (MAX_STEPS로 덮어씀)" : ""}\n`);

const t = await runOnce({ missionId, profileId, maxSteps, headless: process.env.HEADED !== "1" });

console.log(`\n── 결과 ─────────────────────────────────`);
console.log(`  outcome  : ${t.verdict.outcome}  (到達 ${t.verdict.reached ? "○" : "×"})`);
console.log(`  판정     : key ${t.verdict.key_match ? "○" : "×"} / llm ${t.verdict.llm_match ? "○" : "×"}` +
  `${t.verdict.disagreed ? "  ⚠️ 불일치" : ""}`);
console.log(`  이유     : ${t.verdict.reason_ja}`);
console.log(`  스텝     : ${t.steps.length}  클릭 ${t.verdict.clicks}  ${t.verdict.seconds}초`);
console.log(`  원가     : $${t.cost.total_usd.toFixed(6)}  (호출 ${t.cost.calls}회)`);
if (t.cost.baseline_usd !== null && t.cost.total_usd > 0) {
  const cut = (1 - t.cost.total_usd / t.cost.baseline_usd) * 100;
  console.log(`  기준선   : $${t.cost.baseline_usd.toFixed(6)} (전량 ${BASELINE_MODEL}) → ${cut.toFixed(1)}% 절감`);
}
const s1 = t.steps[0];
if (s1) {
  console.log(`  1스텝 제약: 요소 ${s1.constraint.elements_total} → ${s1.constraint.elements_in_viewport}` +
    ` / 본문 ${s1.constraint.chars_before} → ${s1.constraint.chars_after}자` +
    ` / 마스킹 ${s1.constraint.masked.length}건 (라벨 안 ${s1.constraint.masked_in_controls})`);
}
console.log(`  트레이스 : agent/runs/${t.run_id}/trace.json\n`);
