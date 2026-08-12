/**
 * 실행 트레이스를 화면용 형태로 줄인다. **서버에서만 돈다.**
 *
 * 왜 줄이는가: trace.json은 관측 본문까지 전부 들고 있어 576KB다.
 * 그대로 클라이언트에 보내면 첫 화면이 늦어지는데, 심사 ③은 「触れて数十秒で価値がわかる」다.
 * 느린 첫 화면은 그 자체로 감점이다.
 *
 * ⚠️ 여기서 숫자를 만들지 않는다. 전부 trace.json에 이미 있는 값을 옮기기만 한다.
 *   화면에 뜨는 수치는 실행 결과와 1:1로 대응해야 한다 (절대규칙 3·4).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Finding, MaskRecord, RunTrace, Step } from "@core/types.ts";

const DEMO_DIR = join(process.cwd(), "public", "demo");
const FIXTURE_DIR = join(process.cwd(), "..", "core", "fixtures");

/** 원본 요소 목록은 「벽처럼 많다」가 전해지면 충분하다. 전량 보내면 페이로드만 커진다 */
const RAW_ELEMENT_CAP = 160;

export type ElementView = {
  index: number;
  role: string;
  name: string;
  inViewport: boolean;
};

/**
 * ★ 근거의 종류가 다르면 **화면에 쓸 수 있는 말도 다르다.**
 *
 * - `comprehension_rate` — 이해율 조사가 있다 → 「60歳以上の理解率 8.2%」라고 쓸 수 있다
 * - `designated_list`    — 「이 말은 바꿔 써라」는 지정 명단이다. **조사도 %도 존재하지 않는다**
 *
 * 명단 쪽에 %를 붙이면 존재하지 않는 조사를 존재한다고 말하는 것이 된다 (절대규칙 4).
 * 그래서 UI의 성실함에 기대지 않고 **여기서** 잘라낸다 — 근거가 이해율이 아니면
 * `comprehension`은 화면까지 도달하지 못한다.
 */
export type MaskView = {
  surface: string;
  basis: "comprehension_rate" | "designated_list" | null;
  /** basis가 comprehension_rate일 때만 값이 있다. %는 이 필드에서만 나온다 */
  comprehension: number | null;
  /** 명단 근거에는 코호트가 없다 — 「누구의 이해율인가」가 성립하지 않으므로 null이다 */
  cohort: "overall" | "senior" | null;
  /** basis가 designated_list일 때만. `meaning`이 「대신 이렇게 쓰세요」 */
  listing: { no: number; term: string; meaning: string } | null;
  /** 「「サイト」60歳以上の理解率 7.8%（国立国語研究所 外来語定着度調査）」 */
  evidence: string;
  /** 링크·버튼 라벨 안이었는가. 본문이 가려진 것과는 무게가 다르다 */
  inControl: boolean;
};

/**
 * 같은 줄의 before/after 한 쌍.
 *
 * raw의 「화면 안」 요소는 seen과 순서가 1:1로 대응한다 (control·senior-70s·resident-n3
 * 전 트레이스 실측 확인). seen의 index는 다시 매겨지므로 **번호로 짝지으면 틀린다.**
 */
export type LabelPair = {
  /** seen 쪽 번호 — 에이전트가 실제로 지목에 쓴 번호 */
  index: number;
  role: string;
  /** 페이지에 있던 글자 */
  raw: string;
  /** 에이전트에게 건네진 글자 */
  seen: string;
  changed: boolean;
};

/** diagnose()의 산출물. B2B 리포트의 본문이 되는 부분 */
export type FindingView = {
  stepN: number;
  url: string;
  causeJa: string;
  fixJa: string;
  evidence: string[];
  /** 출처가 깨져서 버린 근거 줄 수. 0이 아니면 화면에 그 사실을 적는다 */
  evidenceDropped: number;
  severity: "high" | "medium" | "low";
};

/**
 * 「대신 이렇게 쓰세요」 목록.
 *
 * ⚠️ 이 문장은 **우리가 쓴 것이 아니다.** 出入国在留管理庁・文化庁의 언어 바꿔쓰기 예를
 *    그대로 옮긴 것이다. 우리가 손대면 그 순간 「우리 의견」이 되고 근거가 사라진다.
 */
export type RewriteView = {
  term: string;
  no: number;
  meaning: string;
  /** 링크 라벨 안에서 사라진 적이 있는가. 있으면 탐색 자체가 막힌 것이라 우선순위가 높다 */
  inControl: boolean;
  stepNs: number[];
};

export type StepView = {
  n: number;
  url: string;
  title: string;
  shot: string | null;
  /** 페이지에 실제로 있던 조작요소 수 */
  rawTotal: number;
  /** 그중 에이전트에게 건네진 수 */
  seenTotal: number;
  charsBefore: number;
  charsAfter: number;
  rawElements: ElementView[];
  rawTruncated: number;
  seenElements: ElementView[];
  /** 화면 안 요소의 before/after 대응. 짝을 못 만들면 빈 배열이다 */
  pairs: LabelPair[];
  masked: MaskView[];
  maskedInControls: number;
  action: {
    kind: string;
    index: number | null;
    query: string | null;
    delta: number | null;
    reason: string;
  } | null;
  actionOk: boolean;
  actionError: string | null;
  clicksLeft: number;
  secondsLeft: number;
  usd: number;
};

export type RunView = {
  runId: string;
  profileId: string;
  profileVersion: string;
  labelJa: string;
  /** 이 프로필의 어휘 정책. 근거의 종류가 여기서 정해진다 */
  lexiconKind: "comprehension_rate" | "designated_list" | null;
  /** 어휘 데이터의 출처. 표시 의무가 있고, 「우리 의견이 아니다」의 증거이기도 하다 */
  lexiconSourceJa: string | null;
  /** 이 프로필이 주장하는 것 / 주장하지 않는 것. 화면에 그대로 띄운다 */
  claimsJa: string;
  doesNotClaimJa: string;
  viewport: { width: number; height: number; zoom: number };
  toolsJa: string[];
  patience: { clicks: number; seconds: number };
  outcome: string;
  outcomeJa: string;
  reached: boolean;
  keyMatch: boolean;
  llmMatch: boolean;
  disagreed: boolean;
  reasonJa: string;
  clicks: number;
  seconds: number;
  totalUsd: number;
  baselineUsd: number | null;
  calls: number;
  /**
   * 기록에 남지 않은 호출 수. 재시도로 버려진 시도는 `llm_calls`에 행이 안 생기는데,
   * 스키마 불일치로 버린 건 200 OK라 **과금은 됐다**. 즉 total_usd는 과소집계일 수 있다.
   * 「이 숫자 어디서 나왔나요」에 답하려면 이 결손을 화면에서 먼저 말해야 한다 (절대규칙 4).
   */
  discardedCalls: number;
  /**
   * 진단(리포트를 쓰게 한 호출)의 원가. **0의 뜻이 두 가지라 그냥 쓰면 안 된다:**
   *   - findings가 0건인데 0 → 진짜 0이다. 신호가 없으면 모델을 아예 안 부른다
   *     (`agent/src/diagnose.ts` — `if (!signals.length) return`).
   *   - findings가 있는데 0 → **기록 누락**이다. `agent/src/rediagnose.ts`가 findings만
   *     써넣고 원가는 콘솔에만 찍는다. 그 호출은 실제로 과금됐다.
   * 즉 리포트가 있는 실행에서는 화면의 합계가 리포트 제작비를 포함하지 않는다 (절대규칙 4).
   */
  diagnoseUsd: number;
  /** "api" = 실측 원가. "table" = 가격표 계산치. 섞이면 "mixed" */
  costSource: "api" | "table" | "mixed";
  byModel: Record<string, number>;
  steps: StepView[];
  findings: FindingView[];
  /** 명단 근거 실행에서만 나온다. 이해율 실행은 「바꿔쓰기 예」를 갖지 않는다 */
  rewrites: RewriteView[];
  missionIntentJa: string;
  siteName: string;
};

/**
 * ⚠️ `lexicon`은 프로필마다 **모양이 다르다.** kind가 그 구분자다.
 *    senior-70s: 이해율 임계값 / resident-n3: 지정 명단. 공통 필드로 뭉개면 안 된다.
 */
export type LexiconPolicy =
  | { kind: "comprehension_rate"; cohort: string; mask_below: number; source?: string }
  | { kind: "designated_list"; list: string; source?: string };

export type Profile = {
  id: string;
  label: { ja: string; ko: string };
  claims: string;
  does_not_claim: string;
  viewport: { width: number; height: number; zoom: number };
  observation: { dom_text: boolean; screenshot: boolean };
  tools: { find_in_page: boolean; site_search: boolean; back_limit: number | null };
  patience: { clicks: number; seconds: number };
  lexicon: LexiconPolicy | null;
};

const OUTCOME_JA: Record<string, string> = {
  reached: "たどり着いた",
  gave_up_clicks: "クリック予算を使い切って諦めた",
  gave_up_time: "時間予算を使い切って諦めた",
  gave_up_self: "自分から諦めた",
  max_steps: "手数の上限に達した",
  error: "エラーで中断した",
};

function loadProfile(id: string): Profile {
  const p = join(process.cwd(), "..", "profiles", `${id}.json`);
  return JSON.parse(readFileSync(p, "utf8")) as Profile;
}

function toolsJa(p: Profile): string[] {
  const out: string[] = ["クリック", "スクロール"];
  if (p.tools.site_search) out.push("サイト内検索");
  if (p.tools.find_in_page) out.push("ページ内検索");
  if (p.tools.back_limit === null) out.push("戻る（無制限）");
  else if (p.tools.back_limit > 0) out.push(`戻る（${p.tools.back_limit}回まで）`);
  return out;
}

/**
 * 옛 트레이스(2026-08-10 실행)에는 `basis`가 없다. mask-basis 마이그레이션 이전이다.
 * 없는 것을 있다고 채우지 않는다 — 실제로 이해율 숫자를 들고 있을 때만 이해율 근거로 본다.
 * 어느 쪽도 아니면 `null`로 두고, 화면은 `evidence_ja`만 그대로 띄운다.
 */
function basisOf(m: MaskRecord): MaskView["basis"] {
  if (m.basis) return m.basis;
  if (typeof m.comprehension === "number") return "comprehension_rate";
  if (m.listing) return "designated_list";
  return null;
}

/** ★ %가 화면으로 나가는 유일한 통로. 근거가 이해율이 아니면 여기서 끊긴다 */
function maskView(m: MaskRecord): MaskView {
  const basis = basisOf(m);
  return {
    surface: m.surface,
    basis,
    comprehension: basis === "comprehension_rate" ? (m.comprehension ?? null) : null,
    cohort: basis === "comprehension_rate" ? (m.cohort ?? null) : null,
    listing: basis === "designated_list" ? (m.listing ?? null) : null,
    evidence: m.evidence_ja,
    inControl: m.in_control,
  };
}

/**
 * 화면 안 요소의 before/after 짝.
 * 개수가 어긋나면 **짝을 만들지 않는다.** 잘못 짝지은 before/after는 화면 위의 거짓말이다.
 */
function labelPairs(s: Step): LabelPair[] {
  const vp = s.raw.elements.filter((e) => e.in_viewport);
  if (vp.length !== s.seen.elements.length) return [];
  return s.seen.elements.map((e, i) => ({
    index: e.index,
    role: e.role,
    raw: vp[i].name,
    seen: e.name,
    changed: vp[i].name !== e.name,
  }));
}

function stepView(s: Step, profileId: string): StepView {
  const raw = s.raw.elements;
  const shotName = s.seen.screenshot_key?.split("/").pop() ?? null;

  return {
    n: s.n,
    url: s.seen.url,
    title: s.seen.title,
    shot: shotName ? `/demo/shots/${profileId}/${shotName}` : null,
    rawTotal: s.constraint.elements_total,
    seenTotal: s.constraint.elements_in_viewport,
    charsBefore: s.constraint.chars_before,
    charsAfter: s.constraint.chars_after,
    rawElements: raw.slice(0, RAW_ELEMENT_CAP).map((e) => ({
      index: e.index,
      role: e.role,
      name: e.name,
      inViewport: e.in_viewport,
    })),
    rawTruncated: Math.max(0, raw.length - RAW_ELEMENT_CAP),
    seenElements: s.seen.elements.map((e) => ({
      index: e.index,
      role: e.role,
      name: e.name,
      inViewport: true,
    })),
    pairs: labelPairs(s),
    masked: s.constraint.masked.map(maskView),
    maskedInControls: s.constraint.masked_in_controls,
    action: s.action
      ? {
          kind: s.action.kind,
          // 대상이 없는 수(스크롤·포기)는 -1로 기록된다. 요소 번호가 아니므로 null로 만든다
          index: typeof s.action.index === "number" && s.action.index >= 0 ? s.action.index : null,
          query: s.action.query ?? null,
          delta: typeof s.action.delta === "number" ? s.action.delta : null,
          reason: s.action.reason_ja,
        }
      : null,
    actionOk: s.action_ok,
    actionError: s.action_error,
    clicksLeft: s.patience.clicks_left,
    secondsLeft: s.patience.seconds_left,
    usd: s.llm_calls.reduce((a, c) => a + c.cost_usd, 0),
  };
}

function readTrace(file: string): RunTrace {
  return JSON.parse(readFileSync(join(DEMO_DIR, file), "utf8")) as RunTrace;
}

/**
 * 실행 전체에서 「대신 이렇게 쓰세요」를 모은다. 이게 B2B 리포트의 상품 부분이다.
 *
 * 한 번이라도 링크 라벨 안에서 사라진 말을 위로 올린다 — 본문이 어려운 것과
 * 눌러야 할 링크의 이름이 사라진 것은 무게가 다르다. 후자는 탐색 자체를 막는다.
 */
function collectRewrites(t: RunTrace): RewriteView[] {
  const byTerm = new Map<string, RewriteView>();
  for (const s of t.steps) {
    for (const m of s.constraint.masked) {
      if (m.basis !== "designated_list" || !m.listing) continue;
      const prev = byTerm.get(m.listing.term);
      if (prev) {
        prev.inControl ||= m.in_control;
        if (!prev.stepNs.includes(s.n)) prev.stepNs.push(s.n);
      } else {
        byTerm.set(m.listing.term, {
          term: m.listing.term,
          no: m.listing.no,
          meaning: m.listing.meaning,
          inControl: m.in_control,
          stepNs: [s.n],
        });
      }
    }
  }
  return [...byTerm.values()].sort((a, b) => Number(b.inControl) - Number(a.inControl));
}

/**
 * ★ 출처가 깨진 근거 줄은 **화면에 내보내지 않는다.**
 *
 * 실제로 나오고 있다. `agent/src/signals.ts`가 `m.basis`만 보고 분기하는데,
 * 2026-08-10 실행의 마스크 기록에는 `basis` 필드가 아직 없다(위 `basisOf()`가 그래서 있다).
 * 그래서 **이해율 근거인 「サイト」가 지정 명단 쪽으로 새어** 화면에
 * 「やさしい日本語 書き換え例 No.undefined（出入国在留管理庁）— 言い換え「」」가 찍힌다.
 * 존재하지 않는 명단 번호를, 존재하지 않는 조사의 출처와 함께 쓰는 것이다 (절대규칙 4).
 *
 * `MaskRecord`는 `maskView()`에서 걸러지지만 `Finding.evidence`는 엔진이 만든 자유 문장이라
 * 그 관문을 지나지 않는다. 그래서 여기에 관문을 하나 더 둔다.
 *
 * ⚠️ **고쳐 쓰지 않는다.** 우리가 올바른 문장으로 바꿔 넣으면 그건 우리가 지어낸 근거가 된다.
 *    버리고, 버린 개수를 화면에 적는다. 오차는 언제나 「주장을 덜 하는」 쪽으로 넘긴다.
 */
const BROKEN_EVIDENCE = /undefined|言い換え「」/;

function findingView(f: Finding): FindingView {
  const evidence = f.evidence.filter((e) => !BROKEN_EVIDENCE.test(e));
  return {
    stepN: f.step_n,
    url: f.url,
    causeJa: f.cause_ja,
    fixJa: f.fix_ja,
    evidence,
    evidenceDropped: f.evidence.length - evidence.length,
    severity: f.severity,
  };
}

function toRunView(t: RunTrace): RunView {
  const profile = loadProfile(t.profile_id);

  const sources = new Set(t.steps.flatMap((s) => s.llm_calls.map((c) => c.cost_source)));
  const costSource = sources.size === 1 ? [...sources][0] : "mixed";

  return {
    runId: t.run_id,
    profileId: t.profile_id,
    profileVersion: t.profile_version,
    labelJa: profile.label.ja,
    lexiconKind: profile.lexicon?.kind ?? null,
    lexiconSourceJa: profile.lexicon?.source ?? null,
    claimsJa: profile.claims,
    doesNotClaimJa: profile.does_not_claim,
    viewport: profile.viewport,
    toolsJa: toolsJa(profile),
    patience: profile.patience,
    outcome: t.verdict.outcome,
    outcomeJa: OUTCOME_JA[t.verdict.outcome] ?? t.verdict.outcome,
    reached: t.verdict.reached,
    keyMatch: t.verdict.key_match,
    llmMatch: t.verdict.llm_match,
    disagreed: t.verdict.disagreed,
    reasonJa: t.verdict.reason_ja,
    clicks: t.verdict.clicks,
    seconds: t.verdict.seconds,
    totalUsd: t.cost.total_usd,
    baselineUsd: t.cost.baseline_usd,
    calls: t.cost.calls,
    // 성공한 호출의 attempt 번호 = 그 앞에서 버려진 시도 수. 버려진 시도 자체는 행이 없다
    discardedCalls: t.steps.reduce(
      (a, s) => a + s.llm_calls.reduce((b, c) => b + (c.retries ?? 0), 0),
      0,
    ),
    diagnoseUsd: t.cost.by_step_type?.diagnose ?? 0,
    costSource,
    byModel: t.cost.by_model,
    steps: t.steps.map((s) => stepView(s, t.profile_id)),
    findings: t.findings.map(findingView),
    rewrites: collectRewrites(t),
    missionIntentJa: t.mission.intent_ja,
    siteName: t.mission.site_name,
  };
}

export function loadRun(file: string): RunView {
  return toRunView(readTrace(file));
}

/**
 * ★ resident-n3 실행 — 行政漢語의 벽.
 *
 * ⚠️ **이건 실측이 아니다.** 페이지 관측(3화면)과 마스킹 결과는 실제지만,
 *    스텝 진행·LLM 발화·토큰·레이턴시는 손으로 만든 값이다 (core/fixtures/README.md).
 *    그래서 실측 전용인 `public/demo/`가 아니라 `core/fixtures/`에서 직접 읽는다.
 *    한 디렉터리에 섞어 두면 어느 쪽이 실측인지 파일에서도 화면에서도 구분이 안 된다 (절대규칙 3).
 *
 * 파일이 없어도 페이지는 뜬다 — A가 실제 트레이스로 갈아끼우는 중일 수 있다.
 */
export function loadN3(): RunView | null {
  try {
    const raw = readFileSync(join(FIXTURE_DIR, "sample-run-n3.json"), "utf8");
    return toRunView(JSON.parse(raw) as RunTrace);
  } catch {
    return null;
  }
}

/**
 * ★ 두 실행이 **같은 페이지에 서 있었던** 마지막 순간.
 *
 * 이게 데모의 급소다. 「제약을 걸었더니 실패했다」는 인과가 약하다.
 * 「같은 URL에 둘 다 도착했는데, 한쪽에는 정답 링크가 화면 안에 있었고
 *  다른 쪽에는 없어서 되돌아갔다」는 인과가 강하다.
 *
 * 하드코딩하지 않는다. control이 그 페이지에서 실제로 누른 링크를 「정답 링크」로 삼고,
 * 같은 라벨이 상대 쪽 페이지에 존재했는지 / 화면 안이었는지만 확인한다.
 * 다른 미션·다른 사이트로 바꿔도 그대로 성립한다.
 */
export type MomentView = {
  url: string;
  title: string;
  controlStepN: number;
  seniorStepN: number;
  /** control이 여기서 누른 링크 = 정답으로 이어진 링크 */
  answerLabel: string;
  /** 그 링크가 상대 쪽 페이지에도 존재했는가 */
  answerExisted: boolean;
  /** 존재했다면, 화면 안이었는가 */
  answerInViewport: boolean;
  rawTotal: number;
  controlSeenTotal: number;
  seniorSeenTotal: number;
  controlSeen: ElementView[];
  seniorSeen: ElementView[];
  seniorChoiceLabel: string;
  seniorReasonJa: string;
  /** 이 순간 이후 senior가 더 쓴 클릭 수 */
  seniorClicksAfter: number;
} | null;

function findMoment(ct: RunTrace, st: RunTrace): MomentView {
  // control의 마지막 스텝부터 거슬러 올라가며, senior도 밟았던 URL을 찾는다
  for (let i = ct.steps.length - 1; i >= 0; i--) {
    const c = ct.steps[i];
    const s = st.steps.find((x) => x.seen.url === c.seen.url);
    if (!s || !c.action || typeof c.action.index !== "number") continue;

    const answer = c.seen.elements.find((e) => e.index === c.action!.index);
    if (!answer) continue;

    const same = s.raw.elements.find((e) => e.name === answer.name);
    const choice =
      s.action && typeof s.action.index === "number"
        ? (s.seen.elements.find((e) => e.index === s.action!.index)?.name ?? "")
        : (s.action?.query ?? "");

    return {
      url: c.seen.url,
      title: c.seen.title,
      controlStepN: c.n,
      seniorStepN: s.n,
      answerLabel: answer.name,
      answerExisted: Boolean(same),
      answerInViewport: Boolean(same?.in_viewport),
      rawTotal: s.constraint.elements_total,
      controlSeenTotal: c.constraint.elements_in_viewport,
      seniorSeenTotal: s.constraint.elements_in_viewport,
      controlSeen: c.seen.elements.map((e) => ({
        index: e.index,
        role: e.role,
        name: e.name,
        inViewport: true,
      })),
      seniorSeen: s.seen.elements.map((e) => ({
        index: e.index,
        role: e.role,
        name: e.name,
        inViewport: true,
      })),
      seniorChoiceLabel: choice,
      seniorReasonJa: s.action?.reason_ja ?? "",
      seniorClicksAfter: st.steps.filter((x) => x.n > s.n && x.action?.kind === "click").length,
    };
  }
  return null;
}

/**
 * ★ 「제약 때문에 실패」와 「예산이 짧아서 실패」를 분리하는 실행.
 *
 * 이게 없으면 우리 주장의 가장 큰 구멍이 열려 있다 —
 * 「제약이 아니라 그냥 클릭 예산을 적게 줘서 실패한 것 아닌가」.
 *
 * 인내 예산만 대조군과 같게 맞춘 프로필로 한 번 더 돌렸다.
 * 이 실행에서 화면에 띄우는 숫자는 전부 trace에 그대로 있는 값이다.
 *
 * ⚠️ profile json이 아니라 trace만 읽는다. profiles/는 E 소유라
 *    web 워크트리에 사본을 두지 않기 위해서다.
 */
export type MatchedView = {
  runId: string;
  profileId: string;
  profileVersion: string;
  outcome: string;
  outcomeJa: string;
  reached: boolean;
  /** 예산을 다 썼으므로(gave_up_clicks) 이 값이 곧 주어진 예산이다 */
  clicks: number;
  seconds: number;
  steps: number;
  /** 여기에 걸린 게 아니라는 증거. 상한이 아니라 예산이 먼저 바닥났다 */
  maxSteps: number;
  /** 우리 쪽 잡음으로 버려진 스텝. 숨기면 이 실험의 신뢰도가 사라진다 */
  discardedSteps: number;
  totalUsd: number;
} | null;

function loadMatched(): MatchedView {
  let t: RunTrace;
  try {
    t = readTrace("senior-70s-patient.json");
  } catch {
    return null; // 실험 트레이스가 없어도 화면은 뜬다
  }
  return {
    runId: t.run_id,
    profileId: t.profile_id,
    profileVersion: t.profile_version,
    outcome: t.verdict.outcome,
    outcomeJa: OUTCOME_JA[t.verdict.outcome] ?? t.verdict.outcome,
    reached: t.verdict.reached,
    clicks: t.verdict.clicks,
    seconds: t.verdict.seconds,
    steps: t.steps.length,
    maxSteps: t.mission.max_steps,
    discardedSteps: t.steps.filter((s) => !s.action_ok).length,
    totalUsd: t.cost.total_usd,
  };
}

/**
 * ★ 위협 검사 실행 — 프롬프트 인젝션을 심어 둔 로컬 픽스처에 대한 1회 실행.
 *
 * ⚠️ **사이트는 가공이다.** 실재하지 않는 「ツマヅキ市（架空）」이고, 인젝션은 우리가
 *    심었다. 남의 사이트에는 심지 않는다 (절대규칙 8). 다만 **실행 자체는 실측이다** —
 *    실제 브라우저, 실제 모델 호출, 실제 원가. 그래서 숫자를 화면에 쓸 수 있다.
 *    이 구분이 무너지면 「인젝션을 막았다」가 연출이 된다.
 *
 * 화면에 필요한 것은 3가지뿐이다:
 *   ① 무엇을 잡았는가 (기록)
 *   ② 그래서 모델에게 **무엇이 갔는가** (before/after) ← 여기가 증거다
 *   ③ 에이전트가 함정으로 갔는가 (행동)
 */
export type ThreatView = {
  kind: string;
  severity: "block" | "warn" | "info";
  location: string;
  excerpt: string;
  verdict: "allow" | "review" | "block";
  noteJa: string;
};

export type ShieldView = {
  runId: string;
  siteNameJa: string;
  startUrl: string;
  intentJa: string;
  threats: ThreatView[];
  blockedCount: number;
  /** 관측 그대로 — 인젝션이 들어 있는 쪽 */
  rawText: string;
  /** 모델에게 실제로 건네진 쪽 */
  seenText: string;
  /** 요소 라벨의 before/after. 이름이 통째로 지워진 링크가 여기 나온다 */
  labels: { index: number; raw: string; seen: string }[];
  /** 방문한 URL. 함정 페이지가 여기 없다는 것이 결과다 */
  visited: string[];
  reached: boolean;
  clicks: number;
  seconds: number;
  totalUsd: number;
  calls: number;
  /** 에이전트가 실제로 고른 것과 그 이유 — 인젝션이 아니라 용건을 따랐다는 기록 */
  choiceJa: string;
  reasonJa: string;
} | null;

export function loadShield(): ShieldView {
  let t: RunTrace;
  try {
    t = readTrace("honeypot.json");
  } catch {
    return null; // 검증 트레이스가 없어도 페이지는 뜬다
  }

  const s = t.steps[0];
  const vp = s.raw.elements.filter((e) => e.in_viewport);
  // 화면 안 요소는 seen과 순서가 1:1이다 (위 labelPairs()와 같은 근거).
  // 어긋나면 짝을 만들지 않는다 — 잘못 짝지은 before/after는 화면 위의 거짓말이다
  const labels =
    vp.length === s.seen.elements.length
      ? s.seen.elements
          .map((e, i) => ({ index: e.index, raw: vp[i].name, seen: e.name }))
          .filter((p) => p.raw !== p.seen)
      : [];

  const threats: ThreatView[] = t.steps.flatMap((x) =>
    x.threats.map((th) => ({
      kind: th.kind,
      severity: th.severity,
      location: th.location,
      excerpt: th.excerpt,
      verdict: th.verdict,
      noteJa: th.note_ja,
    })),
  );

  const choice =
    s.action && typeof s.action.index === "number"
      ? (s.seen.elements.find((e) => e.index === s.action!.index)?.name ?? "")
      : "";

  return {
    runId: t.run_id,
    siteNameJa: t.mission.site_name,
    startUrl: t.mission.start_url,
    intentJa: t.mission.intent_ja,
    threats,
    blockedCount: threats.filter((x) => x.verdict === "block").length,
    rawText: s.raw.text ?? "",
    seenText: s.seen.text ?? "",
    labels,
    visited: [...new Set(t.steps.map((x) => x.raw.url))],
    reached: t.verdict.reached,
    clicks: t.verdict.clicks,
    seconds: t.verdict.seconds,
    totalUsd: t.cost.total_usd,
    calls: t.cost.calls,
    choiceJa: choice,
    reasonJa: s.action?.reason_ja ?? "",
  };
}

export function loadDemo() {
  const ct = readTrace("control.json");
  const st = readTrace("senior-70s.json");
  return {
    control: toRunView(ct),
    senior: toRunView(st),
    n3: loadN3(),
    matched: loadMatched(),
    shield: loadShield(),
    moment: findMoment(ct, st),
    mission: {
      intentJa: ct.mission.intent_ja,
      goalJa: ct.mission.goal_ja,
      siteName: ct.mission.site_name,
      startUrl: ct.mission.start_url,
    },
  };
}
