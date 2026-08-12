/**
 * step_type → 모델 라우팅 표 (B-1).
 *
 * ★ 이 파일이 「⑥ 削減施策」의 근거 그 자체다.
 *   여기가 비어 있으면 전 호출이 `orcarouter/auto` 한 창구로 나가고,
 *   그때 나오는 절감은 **OrcaRouter가 한 것**이지 우리가 한 것이 아니다.
 *   심사에서 「무엇을 했나요」에 답할 수 있어야 한다.
 *
 * 설계 근거는 core/types.ts:161 —
 *   A는 step_type만 붙이고 모델을 모른다. B는 step_type만 보고 모델을 고르며 미션을 모른다.
 *   그 분리 덕에 「왜 이 모델인가」를 미션과 무관하게 설명할 수 있다.
 *
 * ─────────────────────────────────────────────────────────────
 * ✅ 2026-08-11 실측 (라이브 /models 162모델 · 동일 프롬프트 = 新宿区 住民異動届 페이지 조각 분류)
 *
 *   모델                          판정      원가        지연     출력tok
 *   google/gemini-3.1-flash-lite  index   $0.000075   1044ms      37
 *   google/gemini-2.5-flash-lite  form    $0.000029   1211ms      54
 *   qwen/qwen3.7-flash            ✗스키마무시 $0.000112  —        842
 *   openai/gpt-5-mini             index   $0.000507   3468ms     234
 *   google/gemini-3.6-flash       index   $0.002354   2969ms     298
 *   anthropic/claude-sonnet-5     index   $0.002384   3461ms      49
 *   anthropic/claude-opus-5       index   $0.005960   5640ms      49
 *   anthropic/claude-haiku-4.5    index   $0.006910   6584ms      58  ← opus보다 비싸다(주2)
 *
 * 주1) `index`가 정답이다 — 프론티어 4종(opus·sonnet·haiku·gemini-3.6)이 전부 `index`로 일치했다.
 *      2.5-flash-lite만 `form`으로 갈렸다. 더 싸지만 **프론티어와 불일치**해서 쓰지 않는다.
 *      perceive는 뒤의 모든 스텝이 먹는 입력이라, 여기서 틀리면 전부 틀린다.
 * 주2) haiku가 opus보다 비싼 건 프롬프트 토큰이 6620개로 부풀었기 때문이다(opus·sonnet은 947).
 *      벤더별로 스키마를 프롬프트에 펼치는 방식이 달라서다. **정가표만 보고 고르면 틀린다** —
 *      이것도 ⑥에서 할 얘기다.
 * 주3) 원가는 라이브 /models 가격표 × 실토큰이다 (`cost_source: "api"`).
 *      리포에 박아둔 폴백 표로 계산된 값은 「実測」이라 부르지 않는다 (절대규칙 4).
 * ─────────────────────────────────────────────────────────────
 */

import type { LlmRequest, StepType } from "../core/types.ts";

/**
 * 스텝별 담당 모델.
 *
 * 등급의 근거는 「틀렸을 때 무엇이 무너지는가」다. 가격이 아니라 **오판 비용**으로 정한다.
 *   perceive  화면이 지금 무엇인가.   뒤의 전 스텝이 이걸 먹는다 → 싸되 프론티어와 일치해야 한다
 *   decide    다음에 무엇을 할까.     선택지가 유한하다 → 중
 *   judge     미션에 도달했는가.      오판하면 실험 결과 자체가 거짓이 된다 → 중상
 *   diagnose  왜 실패했나.            리포트 본문이고 1회만 돈다 → 프론티어(원가 무시 가능)
 */
export const MODEL_BY_STEP: Record<StepType, string> = {
  // 최저가대에서 유일하게 프론티어와 판정이 일치했다. 1초·37토큰으로 제일 빠르기도 하다
  perceive: "google/gemini-3.1-flash-lite",
  // 스키마 준수가 안정적이다(maxItems 포함 전체 통과). 판단 스텝의 하한선으로 둔다
  decide: "openai/gpt-5-mini",
  // 덱 품질 8.0. sonnet-5와 실원가가 거의 같은데(2354 vs 2384) 더 빠르다
  judge: "google/gemini-3.6-flash",
  // BASELINE_MODEL과 같은 모델이다 — 「라우팅 안 했으면 전부 이거였다」는 비교 기준을
  // 리포트를 쓰는 모델 자신이 맡는다. A/B 하네스의 서술이 깔끔해진다
  diagnose: "anthropic/claude-opus-5",
};

/**
 * 절대 쓰지 않는 모델과 그 이유.
 * 「싸니까 골랐다가 조용히 틀린다」를 막는다. 목록에 없으면 그냥 안 쓰는 것보다 나쁘다 —
 * 나중에 누가 다시 후보로 올린다.
 */
export const DENYLIST: Record<string, string> = {
  // JSON.parse는 통과하는데 요구한 필드가 하나도 없는 딴 모양을 뱉는다.
  // 2026-08-11 실측: {"classification":{"primary_category":...}} — 스키마를 무시했다.
  // 조용히 틀리는 게 제일 위험하다. orcarouter/auto가 고르는 게 하필 이 모델이다
  "qwen/qwen3.7-flash": "response_format json_schema를 무시한다 (2026-08-11 실측)",
  // 프론티어 4종이 index로 일치한 입력을 혼자 form이라 했다
  "google/gemini-2.5-flash-lite": "프론티어와 판정 불일치 (2026-08-11 실측)",
};

/** 라우팅을 끈 상태에서 나가는 곳. OrcaRouter가 알아서 고른다 */
export const AUTO_MODEL = "orcarouter/auto";

/**
 * 실행 단위로 라우팅을 끈다 — A/B 하네스의 **대조군**.
 *
 * 왜 프로필이 아니라 실행 단위인가 (A의 판단, 2026-08-11):
 *   `profiles/*.json`에 붙이면 좌우 데모의 변수가 「제약」과 「모델」 두 개가 된다.
 *   무엇 때문에 차이가 났는지 말할 수 없게 된다.
 *
 * 왜 호출부가 아니라 여기서 보는가:
 *   호출부마다 `resolveModel: null`을 넘기는 방식이면, 호출부가 하나 늘어날 때
 *   거기서 빠뜨리는 순간 **일부만 라우팅된 섞인 실행**이 된다. 그런데도 실행은
 *   성공하고 숫자도 나온다 — 조용히 무의미해진 원가 비교가 리포트에 실린다.
 *   판단 지점을 한 곳으로 모아서 그 사고 자체를 불가능하게 만든다.
 *
 * ⚠️ `force_model`은 이보다 우선한다. 「전량 opus-5로 돌렸다면」 기준선을
 *    재려면 라우팅을 끈 채로 모델을 못 박을 수 있어야 하기 때문이다.
 */
export function routingDisabled(): boolean {
  const v = process.env.ORCA_NO_ROUTING;
  return v === "1" || v === "true";
}

/** `ORCA_MODEL_PERCEIVE=...` 형태로 스텝별 덮어쓰기. A/B 하네스가 쓴다 */
function envOverride(step: StepType): string | undefined {
  const v = process.env[`ORCA_MODEL_${step.toUpperCase()}`];
  return v && v.trim() ? v.trim() : undefined;
}

/**
 * 실행 전체를 **한 모델에 못 박는다.** `ORCA_FORCE_MODEL=openai/gpt-5-mini`
 *
 * 왜 필요한가 (2026-08-12):
 *   지금까지의 배치는 대조군이 auto 1종, 제약측이 표에 따라 여러 종이었다.
 *   그래서 「도달률의 차이는 제약이 아니라 모델의 차이 아니냐」는 반론에
 *   **이 데이터로는 답할 수 없다.** 전원을 같은 모델에 못 박고 같은 차이가
 *   남으면, 그때 처음으로 「제약 때문이다」라고 말할 수 있다.
 *
 * ⚠️ 이것은 라우팅 끄기(ORCA_NO_ROUTING)보다 **강하다.** 대조군까지 못 박아야
 *    의미가 있는 실험이기 때문이다. 대신 이 실행의 원가는 라우팅 절감의 증거가
 *    아니다 — 그래서 배치 디렉터리 이름을 나누고 집계에서 뺀다.
 */
export function pinnedModel(): string | undefined {
  const v = process.env.ORCA_FORCE_MODEL;
  return v && v.trim() ? v.trim() : undefined;
}

/**
 * 이 표가 라우팅의 전부다. 미션도 프로필도 보지 않는다 — step_type만 본다.
 * 그래야 「왜 이 모델인가」가 미션과 무관하게 설명된다.
 */
export function resolveModel(req: LlmRequest): string {
  const pin = pinnedModel();
  if (pin) return pin;
  if (routingDisabled()) return AUTO_MODEL;
  return envOverride(req.step_type) ?? MODEL_BY_STEP[req.step_type] ?? MODEL_BY_STEP.decide;
}

/** 이 모델이 어디서 정해졌는가. 리포트에 「왜 이 모델인가」를 쓰려면 이게 필요하다 */
export type ModelSource = "table" | "env" | "disabled" | "pinned";

/**
 * 리포트·발표에 그대로 붙일 수 있는 형태. 근거 없는 표는 ⑥에서 0점이다.
 *
 * ⚠️ **지금 실제로 나가는 모델**을 돌려준다. 라우팅이 꺼져 있으면 표도 auto라고 말한다.
 *    여기가 설정값을 그대로 읊으면, 대조군 실행의 리포트가 돌지도 않은 모델을 주장하게 된다.
 */
export function routingTable(): Array<{ step_type: StepType; model: string; source: ModelSource }> {
  const pinned = pinnedModel() !== undefined;
  const disabled = routingDisabled();
  return (Object.keys(MODEL_BY_STEP) as StepType[]).map((s) => ({
    step_type: s,
    model: resolveModel({ step_type: s, system: "", user: "" }),
    source: pinned ? "pinned" : disabled ? "disabled" : envOverride(s) !== undefined ? "env" : "table",
  }));
}
