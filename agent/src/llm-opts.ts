/**
 * A가 `complete()`에 붙이는 호출 옵션 — 지금은 라우팅 on/off 하나뿐이다.
 *
 * ★ 왜 프로필이 아니라 실행 단위인가.
 *
 *   「대조군」이라는 말이 이 프로젝트에 **두 개** 있다. 섞으면 둘 다 못 쓰게 된다.
 *
 *     ① 제약 대조군  = `profiles/control.json`. 제약을 안 건 에이전트.
 *                      좌우 분할 데모의 왼쪽. 「제약이 원인이다」를 증명한다.
 *     ② 라우팅 대조군 = `resolveModel: null`. 모델을 우리가 안 고른 호출(orcarouter/auto).
 *                      「⑥의 절감은 우리 시책이다」를 증명한다.
 *
 *   ①에 ②를 붙이면 — 즉 control 프로필만 auto로 보내면 — 좌우 데모의 변수가
 *   **제약과 모델 두 개**가 된다. 그러면 「제약 때문에 실패했다」를 더 이상 말할 수 없다.
 *   그게 이 제품의 주장 전부다. 그래서 붙이지 않는다.
 *
 *   ②는 같은 프로필을 두 번 돌려서 원가만 비교하는 것이다:
 *     npm run -- run shinjuku-tennyu senior-70s                       # 우리 표
 *     ORCA_NO_ROUTING=1 npm run -- run shinjuku-tennyu senior-70s     # 안 고른 경우
 *
 * 기록은 어디에 남는가: `core/types.ts`는 읽기 전용이라(절대규칙 10) trace에 필드를
 * 못 늘린다. 대신 **모든 CostRecord에 실제로 쓴 모델명이 박혀 있고**, 그게
 * `trace.cost.by_model`로 집계된다. 어느 쪽으로 돌렸는지는 거기서 사후에 읽을 수 있다.
 */

import type { CompleteOptions } from "../../llm/orca.ts";

export function routingOff(): boolean {
  return process.env.ORCA_NO_ROUTING === "1";
}

/** decide()·judge()가 `complete()`에 그대로 넘긴다 */
export function llmOpts(): CompleteOptions {
  // undefined가 아니라 명시적 null이어야 라우팅이 꺼진다 (llm/orca.ts CompleteOptions)
  return routingOff() ? { resolveModel: null } : {};
}
