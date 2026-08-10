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
import type { RunTrace, Step } from "@core/types.ts";

const DEMO_DIR = join(process.cwd(), "public", "demo");

/** 원본 요소 목록은 「벽처럼 많다」가 전해지면 충분하다. 전량 보내면 페이로드만 커진다 */
const RAW_ELEMENT_CAP = 160;

export type ElementView = {
  index: number;
  role: string;
  name: string;
  inViewport: boolean;
};

export type MaskView = {
  surface: string;
  /** 「「サイト」60歳以上の理解率 7.8%（国立国語研究所 外来語定着度調査）」 */
  evidence: string;
  /** 링크·버튼 라벨 안이었는가. 본문이 가려진 것과는 무게가 다르다 */
  inControl: boolean;
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
  masked: MaskView[];
  maskedInControls: number;
  action: {
    kind: string;
    index: number | null;
    query: string | null;
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
  /** "api" = 실측 원가. "table" = 가격표 계산치. 섞이면 "mixed" */
  costSource: "api" | "table" | "mixed";
  byModel: Record<string, number>;
  steps: StepView[];
};

export type Profile = {
  id: string;
  label: { ja: string; ko: string };
  claims: string;
  does_not_claim: string;
  viewport: { width: number; height: number; zoom: number };
  observation: { dom_text: boolean; screenshot: boolean };
  tools: { find_in_page: boolean; site_search: boolean; back_limit: number | null };
  patience: { clicks: number; seconds: number };
  lexicon: { cohort: string; mask_below: number; source?: string } | null;
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
    masked: s.constraint.masked.map((m) => ({
      surface: m.surface,
      evidence: m.evidence_ja,
      inControl: m.in_control,
    })),
    maskedInControls: s.constraint.masked_in_controls,
    action: s.action
      ? {
          kind: s.action.kind,
          index: typeof s.action.index === "number" ? s.action.index : null,
          query: s.action.query ?? null,
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

function toRunView(t: RunTrace): RunView {
  const profile = loadProfile(t.profile_id);

  const sources = new Set(t.steps.flatMap((s) => s.llm_calls.map((c) => c.cost_source)));
  const costSource = sources.size === 1 ? [...sources][0] : "mixed";

  return {
    runId: t.run_id,
    profileId: t.profile_id,
    profileVersion: t.profile_version,
    labelJa: profile.label.ja,
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
    costSource,
    byModel: t.cost.by_model,
    steps: t.steps.map((s) => stepView(s, t.profile_id)),
  };
}

export function loadRun(file: string): RunView {
  return toRunView(readTrace(file));
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

export function loadDemo() {
  const ct = readTrace("control.json");
  const st = readTrace("senior-70s.json");
  return {
    control: toRunView(ct),
    senior: toRunView(st),
    matched: loadMatched(),
    moment: findMoment(ct, st),
    mission: {
      intentJa: ct.mission.intent_ja,
      goalJa: ct.mission.goal_ja,
      siteName: ct.mission.site_name,
      startUrl: ct.mission.start_url,
    },
  };
}
