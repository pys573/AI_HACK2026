/**
 * 모델 가격표 — **폴백 전용**.
 *
 * 출처: AI HACK 2026 OrcaRouter 스폰서 덱 v2 (2026-08-08) p.5
 * 덱에 「料金は…1分ごとに更新」이라고 명시돼 있다. 즉 이 표는 시시각각 틀려진다.
 *
 * ★ 따라서 원가는 이 순서로 구한다:
 *     1) API 응답이 원가를 돌려주면 그걸 쓴다        → cost_source: "api"
 *     2) 못 받으면 /models 로 받아온 라이브 가격표    → cost_source: "api"
 *     3) 그것도 못 받으면 아래 표                     → cost_source: "table"
 *
 * 「실측 원가」라고 말할 수 있는 건 1·2뿐이다. 3을 실측이라고 부르지 않는다.
 * 심사에서 「이 숫자 어디서 나왔나요」에 답하지 못하면 ⑥은 0점이다.
 */

export type ModelPrice = {
  /** 100만 토큰당 USD */
  input_per_m: number;
  output_per_m: number;
  /** 덱 게재 품질 스코어 (10점 만점). /models 응답에는 없다 */
  quality?: number;
  provider: string;
};

/**
 * 덱 p.5 게재분 + 우리가 실제로 라우팅하는 모델의 스냅샷.
 *
 * ⚠️ 라우팅 표(`llm/routing.ts`)에 있는 모델이 여기 없으면, 라이브 취득이 실패한 실행의
 *    원가가 통째로 NaN이 된다 — 「모르는 모델을 0원으로 세지 않는다」의 대가다.
 *    그래서 4개 스텝의 담당 모델은 반드시 여기에도 있어야 한다.
 *    **routing.ts를 고치면 이 표도 같이 고친다.**
 */
export const FALLBACK_PRICES: Record<string, ModelPrice> = {
  // ── 덱 p.5 게재분 (2026-08-08) ──
  "anthropic/claude-opus-5": { input_per_m: 5.0, output_per_m: 25.0, quality: 10.0, provider: "Anthropic Direct" },
  "google/gemini-3.6-flash": { input_per_m: 1.5, output_per_m: 7.5, quality: 8.0, provider: "Google Direct" },
  "meta/muse-spark-1.1": { input_per_m: 1.25, output_per_m: 4.25, quality: 8.0, provider: "-" },
  "google/gemini-3.5-flash-lite": { input_per_m: 0.3, output_per_m: 2.5, quality: 6.0, provider: "Google Direct" },
  "deepseek/deepseek-v4-flash": { input_per_m: 0.147, output_per_m: 0.295, quality: 6.0, provider: "DeepSeek" },
  "qwen/qwen3.7-flash": { input_per_m: 0.03, output_per_m: 0.13, quality: 7.0, provider: "Alibaba Cloud" },

  // ── 라이브 /models 스냅샷 (2026-08-11 취득). 덱 미게재분이라 quality 점수가 없다 ──
  // 이 값으로 계산된 원가는 cost_source "table" = **추정치**다. 実測이라 부르지 않는다
  "google/gemini-3.1-flash-lite": { input_per_m: 0.25, output_per_m: 1.5, provider: "Google Direct" },
  "openai/gpt-5-mini": { input_per_m: 0.25, output_per_m: 2.0, provider: "OpenAI" },
};

/**
 * A/B 하네스의 기준선.
 * 「라우팅하지 않았다면 얼마였는가」를 계산할 때 전량 이 모델로 돌린 셈 친다.
 */
export const BASELINE_MODEL = "anthropic/claude-opus-5";

/**
 * 캐시 히트 토큰의 단가 배율.
 * ⚠️ 덱은 「キャッシュ単価で課金」이라고만 하고 배율을 밝히지 않았다.
 *    실측으로 확정하기 전까지 이 값을 근거로 절감액을 주장하지 않는다.
 */
export const CACHE_INPUT_MULTIPLIER: number | null = null;

export function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
  prices: Record<string, ModelPrice> = FALLBACK_PRICES,
): number | null {
  const p = prices[model];
  if (!p) return null; // 모르는 모델을 0원으로 세지 않는다. 모르면 모른다고 한다
  return (promptTokens / 1_000_000) * p.input_per_m + (completionTokens / 1_000_000) * p.output_per_m;
}
