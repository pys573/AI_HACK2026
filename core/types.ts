/**
 * 공유 계약 — ツマヅキ(Tsumazuki)
 *
 * ★ 이 파일은 전 워크트리에서 **읽기 전용**이다.
 *   변경이 필요하면 main에서만 처리하고 각 워크트리가 rebase한다.
 *   여기가 흔들리면 병렬 작업이 전부 깨진다.
 *
 * ★ 이 파일은 **아무것도 import 하지 않는다.**
 *   web(Next.js)이 그대로 가져다 쓸 수 있어야 하므로 playwright·node 의존이 있으면 안 된다.
 *   따라서 Buffer 대신 스토리지 키를, Date 대신 ISO 문자열을 쓴다. 전부 JSON 직렬화 가능해야 한다.
 */

// ─────────────────────────────────────────────────────────────
// 미션
// ─────────────────────────────────────────────────────────────

/**
 * 에이전트에게 주는 과제.
 * ⚠️ 여기에는 **정답이 들어가지 않는다.** 정답은 MissionKey에 따로 있고 프롬프트에 절대 넣지 않는다.
 *    정답을 프롬프트에 넣는 순간 「도달했다」는 측정이 아니라 자기충족적 예언이 된다.
 */
export type Mission = {
  id: string;
  /** 데모 축. hybrid 구성에서 어느 쪽 이야기인지 */
  track: "public" | "b2b";
  site_id: string;
  site_name: string;
  start_url: string;
  /** 에이전트에게 그대로 전달되는 일본어 과제문 */
  goal_ja: string;
  /** 사람이 실제로 하려는 일. 리포트·영상 자막에 쓴다 */
  intent_ja: string;
  max_steps: number;
};

/**
 * 도달 판정의 근거. **사람이 사전에 손으로 만든다.**
 * LLM에게 보여주지 않는다 — judge()는 이걸 대조에만 쓴다.
 */
export type MissionKey = {
  mission_id: string;
  /** 이 URL 패턴 중 하나에 도달하면 성공 후보 */
  url_patterns: string[];
  /** 페이지에 이 문자열이 있어야 최종 성공 */
  text_patterns: string[];
  /** 사람이 실제로 몇 클릭에 도달했는지 (기준선). 없으면 null */
  human_baseline_clicks: number | null;
  note: string;
};

// ─────────────────────────────────────────────────────────────
// 액션
// ─────────────────────────────────────────────────────────────

export type ActionKind =
  | "click"
  | "scroll"
  /**
   * 좌우 스크롤. **화면이 실제로 옆으로 잘렸을 때만** 후보에 오른다 (prompts.ts `allowedKinds`).
   *
   * 줌 200%는 창을 좁히는 것과 같아서, 좁아진 창에 맞춰 다시 배치되지 않는 사이트에서는
   * 오른쪽 끝이 화면 밖으로 나간다. 그때 브라우저는 가로 막대를 띄운다 — 즉 **사람에게는
   * 있는 수단**이다. 그게 없으면 「사이트가 어려워서 못 찾았다」와 「우리가 옆으로 못 가서
   * 못 찾았다」가 구별되지 않고, 계측값이 우리에게 유리한 쪽(=이탈률 과대)으로 기운다.
   */
  | "scroll_side"
  | "back"
  | "find_in_page"
  | "site_search"
  | "give_up";

/**
 * 에이전트가 낼 수 있는 수의 전부.
 * 프로필의 tools에서 허용되지 않은 종류는 act()가 거부한다 — 제약은 코드로 강제한다.
 */
export type Action = {
  kind: ActionKind;
  /** click: 관측 elements의 index */
  index?: number;
  /** scroll: 화면 수(세로). 음수는 위로 / scroll_side: 화면 수(가로). 음수는 왼쪽 */
  delta?: number;
  /** find_in_page / site_search: 질의어 */
  query?: string;
  /** LLM이 스스로 말한 이유. 리포트의 재료이자 「헤맴」의 증거 */
  reason_ja: string;
};

// ─────────────────────────────────────────────────────────────
// 관측 (직렬화 형태)
// ─────────────────────────────────────────────────────────────

/** agent/src/observe.ts의 Element에서 에이전트가 실제로 보는 필드만 */
export type ElementView = {
  index: number;
  role: string;
  name: string;
  in_viewport: boolean;
  /**
   * 화면상 위치. **에이전트에게는 가지 않는다** — 리플레이 화면이 스크린샷 위에
   * 「어디를 봤고 어디를 눌렀는가」를 그리기 위해서만 존재한다.
   * 모델에게 좌표를 주면 시각 정보를 준 것이 되어 프로필의 관측 제약이 무너진다.
   *
   * ⚠️ x와 y의 기준이 다르다. y는 **문서 좌표**(scrollY 포함)라 스크린샷 위에 그릴 때
   * scroll.y를 빼야 하지만, **x는 화면 좌표**라 그대로 쓴다 (scroll.x를 빼면 안 된다).
   * 좌우 스크롤이 생긴 뒤로 이 차이가 실제로 어긋남을 만든다 — 관측은 매 수마다 다시
   * 찍히므로 x는 언제나 「지금 화면에서 몇 px 오른쪽」이다.
   * optional인 이유: 2026-08-12 이전 트레이스 28건에는 이 필드가 없다. 없으면 안 그린다.
   */
  box?: { x: number; y: number; w: number; h: number };
};

/**
 * 트레이스에 저장되는 관측 스냅샷.
 * before/after를 둘 다 저장한다 — 이게 D-4(머니샷)의 자료이자
 * 「제약이 원인이다」의 증거다. 한쪽만 저장하면 나중에 만들 수 없다.
 */
export type ObservationSnapshot = {
  url: string;
  title: string;
  text: string | null;
  elements: ElementView[];
  /**
   * x·width·overflow_x가 optional인 이유: 좌우 스크롤 도입(2026-08-13) 전의 트레이스에는
   * 이 세 필드가 없다. 없으면 「가로로 잘린 적 없다」가 아니라 **「재지 않았다」**로 읽는다.
   */
  scroll: { y: number; height: number; x?: number; width?: number; overflow_x?: boolean };
  /** Supabase Storage 키. 이미지 자체는 트레이스에 넣지 않는다 */
  screenshot_key: string | null;
};

/**
 * 마스킹 1건의 기록. 근거가 반드시 붙는다.
 *
 * 근거는 두 종류이고 **성질이 다르다.** 섞으면 주장이 무너진다 (절대규칙 4).
 * - `comprehension_rate` — 国立国語研究所 外来語定着度調査. 이해율 %가 있다 → `comprehension` + `cohort`
 * - `designated_list`    — 「やさしい日本語 書き換え例」. %가 없는 지정 명단이다 → `listing`
 *
 * 명단에 「이해율」을 붙이면 존재하지 않는 조사를 존재한다고 말하는 것이 된다.
 * 그래서 %를 공유 필드로 강제하지 않고 `basis`로 갈라 둔다.
 *
 * ★ `MaskHit`에는 세 번째 값 `"none"`(사전 미수록어를 `unknown: "mask"`로 가린 경우)이 있지만
 *   여기에는 일부러 넣지 않았다. 근거 없이 가린 것은 기록 대상이 아니다 (절대규칙 2).
 *   출품 프로필 5종은 전부 `unknown: "keep"`이므로 이 경로는 발생하지 않는다.
 *   저장 단계에서 `basis === "none"`인 히트는 버린다.
 */
export type MaskRecord = {
  surface: string;
  entry: string | null;
  action: "mask" | "partial" | "unknown";
  /** 어느 근거로 가렸는가. 리포트 문구·집계 축이 여기서 갈린다 */
  basis: "comprehension_rate" | "designated_list";
  /** 이해율 근거일 때만 값이 있다 */
  comprehension: number | null;
  /** 명단 근거에는 코호트가 없다. 「누구의 이해율인가」라는 질문 자체가 성립하지 않는다 */
  cohort: "overall" | "senior" | null;
  /** 명단 근거일 때만 값이 있다. `meaning`이 「대신 이렇게 쓰세요」 → 리포트의 개선 제안이 된다 */
  listing: { no: number; term: string; meaning: string } | null;
  /** 링크·버튼 라벨 안이었는가. true가 많을수록 탐색이 막힌다 */
  in_control: boolean;
  /**
   * 「ダウンロード」60歳以上の理解率 8.2%（国立国語研究所 外来語定着度調査）
   * 「転入届」『やさしい日本語 書き換え例』(出入国在留管理庁・文化庁 2020) 収録語 No.97
   */
  evidence_ja: string;
};

export type ConstraintRecord = {
  profile: string;
  profile_version: string;
  masked: MaskRecord[];
  masked_in_controls: number;
  dom_text_withheld: boolean;
  elements_total: number;
  elements_in_viewport: number;
  /** ⑥ 제약 자체가 코스트 절감이다 — 원본 대비 얼마나 줄었는가 */
  chars_before: number;
  chars_after: number;
};

// ─────────────────────────────────────────────────────────────
// LLM (A ↔ B 경계)
// ─────────────────────────────────────────────────────────────

/**
 * 스텝 종류. **라우팅의 유일한 입력**이다.
 * A는 step_type만 붙이고 모델을 모른다. B는 step_type만 보고 모델을 고르며 미션을 모른다.
 * 이 분리가 「⑥ 削減施策」을 설명 가능하게 만든다.
 */
export type StepType =
  /** 화면이 지금 무엇인지 요약·분류. 정형 처리 → 최저가 */
  | "perceive"
  /** 다음에 무엇을 할까. 판단이지만 선택지가 유한 → 중 */
  | "decide"
  /** 미션에 도달했는가. 오판 비용이 크다 → 중상 */
  | "judge"
  /** 왜 실패했고 무엇을 고쳐야 하는가. 리포트 본문 → 프론티어 */
  | "diagnose";

export type LlmRequest = {
  step_type: StepType;
  system: string;
  user: string;
  /** structured output용 JSON Schema. 있으면 검증까지 통과해야 반환된다 */
  schema?: Record<string, unknown>;
  /** 라우팅 모드 강제. A/B 하네스에서만 쓴다 */
  force_model?: string;
};

/**
 * 1회 LLM 호출의 원가 기록. **⑥「実測原価」가 이 타입 하나로 성립한다.**
 *
 * cost_source가 중요하다 — API가 원가를 돌려주면 "api",
 * 우리가 가격표로 계산했으면 "table". 심사에서 「이 숫자 어디서 나왔나요」에 답할 수 있어야 한다.
 * 추정치를 실측이라고 부르지 않는다.
 */
export type CostRecord = {
  step_type: StepType;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
  cost_usd: number;
  cost_source: "api" | "table";
  latency_ms: number;
  /** OrcaRouter가 돌려주는 라우팅 결과 (cheapest / quality / balanced / auto …) */
  route: string | null;
  /** 라우팅 모드 (요청 시 지정한 것) */
  mode: string | null;
  retries: number;
};

export type LlmResponse = {
  text: string;
  parsed?: unknown;
  cost: CostRecord;
};

/** A가 의존하는 유일한 LLM 인터페이스. 구현은 B가 소유한다 */
export type LlmClient = (req: LlmRequest) => Promise<LlmResponse>;

// ─────────────────────────────────────────────────────────────
// 보안 (C 경계)
// ─────────────────────────────────────────────────────────────

/**
 * 관측에서 발견된 위협.
 * 우리는 외부의 신뢰할 수 없는 웹 텍스트를 LLM에 먹인다 → 인젝션이 실재 위협이다.
 * 탐지 결과는 트레이스에 남고 화면에 뜬다. 조용히 처리하면 ⑦의 증거가 사라진다.
 */
export type ThreatRecord = {
  kind: "prompt_injection" | "pii" | "tool_abuse" | "offsite_navigation";
  severity: "info" | "warn" | "block";
  /** 어디서 나왔는가 — element index 또는 "body" */
  location: string;
  /** 문제가 된 원문 (잘라서 보관). 화면에 그대로 띄운다 */
  excerpt: string;
  /** ALLOW / REVIEW / BLOCK — OrcaRouter Agent Firewall 판정 또는 자체 판정 */
  verdict: "allow" | "review" | "block";
  detector: "local" | "orcarouter_firewall" | "orcarouter_pii";
  note_ja: string;
};

// ─────────────────────────────────────────────────────────────
// 실행 트레이스 (제품의 중심 자료구조)
// ─────────────────────────────────────────────────────────────

/**
 * 1스텝.
 * before/after 관측을 둘 다 들고 있다. 이게 D-4 Before/After 토글의 원천이고,
 * 「제약이 원인이다」를 사후에 증명할 수 있는 유일한 방법이다.
 */
export type Step = {
  n: number;
  ts: string;
  /** 제약 전 — 대조·증거용. LLM은 이걸 본 적이 없다 */
  raw: ObservationSnapshot;
  /** 제약 후 — LLM이 실제로 본 것 */
  seen: ObservationSnapshot;
  constraint: ConstraintRecord;
  threats: ThreatRecord[];
  action: Action | null;
  /** 조작이 실제로 성공했는가. 실패도 기록한다 */
  action_ok: boolean;
  action_error: string | null;
  llm_calls: CostRecord[];
  patience: { clicks: number; clicks_left: number; seconds: number; seconds_left: number };
};

export type Outcome =
  | "reached"
  /** 인내 예산 소진 = 諦めた. 이탈률 지표는 전부 여기서 나온다 */
  | "gave_up_clicks"
  | "gave_up_time"
  /** 스스로 give_up 액션을 냈다 */
  | "gave_up_self"
  | "max_steps"
  | "error";

export type Verdict = {
  outcome: Outcome;
  reached: boolean;
  /** 정답 키 대조 결과 */
  key_match: boolean;
  /** LLM 판정 결과 */
  llm_match: boolean;
  /** 두 판정이 갈렸는가. 갈린 건은 사람이 본다 — 감추면 R6이 그대로 남는다 */
  disagreed: boolean;
  reason_ja: string;
  clicks: number;
  seconds: number;
};

/** diagnose()의 산출물. 리포트 본문이자 ②의 재료 */
export type Finding = {
  /** 몇 번째 스텝에서 막혔는가 */
  step_n: number;
  url: string;
  /** 무엇이 막았는가 */
  cause_ja: string;
  /** 무엇을 고치면 되는가 */
  fix_ja: string;
  /** 근거 — 마스킹 기록·요소 수·인내 소진 등 실측치만 */
  evidence: string[];
  severity: "high" | "medium" | "low";
};

export type RunTrace = {
  run_id: string;
  /** 같은 미션·같은 사이트에 대한 여러 프로필 실행을 묶는 키. 분할화면은 이걸로 짝을 찾는다 */
  batch_id: string;
  created_at: string;
  mission: Mission;
  profile_id: string;
  profile_version: string;
  /** 프로필 variants 중 몇 번째인가 (R9 분산 확인용) */
  variant: number;
  steps: Step[];
  verdict: Verdict;
  findings: Finding[];
  /** 이 실행 전체의 원가 합계 */
  cost: {
    total_usd: number;
    by_step_type: Record<StepType, number>;
    by_model: Record<string, number>;
    calls: number;
    cached_tokens: number;
    /** 전량 프론티어로 돌렸다면 얼마였을까 (B-5 A/B). 없으면 null */
    baseline_usd: number | null;
  };
  runner: { node: string; playwright: string; chrome: string | null };
};

// ─────────────────────────────────────────────────────────────
// 배치 (분할화면·리포트의 단위)
// ─────────────────────────────────────────────────────────────

export type Batch = {
  batch_id: string;
  created_at: string;
  mission_id: string;
  site_name: string;
  run_ids: string[];
  /** 대조군 run_id. 분할화면 왼쪽 */
  control_run_id: string | null;
  summary: {
    total_runs: number;
    reached: number;
    gave_up: number;
    /** 이탈률 = gave_up / total */
    dropout_rate: number;
    total_cost_usd: number;
    baseline_cost_usd: number | null;
  };
};

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

/** 계약 버전. 깨는 변경을 하면 올린다 */
export const TRACE_SCHEMA_VERSION = "1.0";

export const STEP_TYPES: StepType[] = ["perceive", "decide", "judge", "diagnose"];
