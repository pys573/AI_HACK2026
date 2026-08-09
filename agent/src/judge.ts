/**
 * A-4 · judge() — 도달했는가 (R6).
 *
 * ★ **정답 키를 읽는 파일은 이 파일 하나다.** (`agent/src/mission.ts`의 `loadKey`)
 *   decide.ts·prompts.ts·act.ts·run.ts는 import 하지 않는다.
 *
 * 판정은 2단이다. 어느 한쪽만으로는 못 믿기 때문이다.
 *
 *   키 대조만  → URL이 바뀌거나 표현이 다르면 도달했는데도 미도달이 된다
 *   LLM만      → 관대해진다. 「案内の入口に着いたので到達」을 하기 시작한다
 *
 * 두 판정을 **독립으로** 돌리고, 어긋나면 숨기지 않고 `disagreed`로 남긴다.
 * 어긋난 비율 자체가 이 지표의 신뢰도이며, 심사에서 먼저 말해야 하는 숫자다.
 *
 * ★ judge는 **제약 전의 원본**을 본다.
 *   「그 사람에게 보였는가」가 아니라 「거기에 도달했는가」를 재는 것이기 때문이다.
 *   여기에 제약을 걸면 마스킹된 정답 페이지가 미도달로 잡혀 측정이 무너진다.
 */

import { complete } from "../../llm/orca.ts";
import type { CostRecord, Mission } from "../../core/types.ts";
import type { RawObservation } from "./observe.ts";
import { loadKey } from "./mission.ts";
import { JUDGE_SCHEMA, JUDGE_SYSTEM, judgeUser } from "./prompts.ts";

/** LLM을 부르지 않는다. 매 스텝 돌려도 원가가 0이다. */
export function keyMatch(missionId: string, raw: RawObservation): boolean {
  const k = loadKey(missionId);
  const url = raw.url.toLowerCase();
  const urlHit = k.url_patterns.some((p) => url.includes(p.toLowerCase()));
  // text_patterns는 AND. 「転入」 하나로는 一覧 페이지에서도 맞아버린다.
  const hay = `${raw.title}\n${raw.text}`;
  const textHit = k.text_patterns.length > 0 && k.text_patterns.every((p) => hay.includes(p));
  return urlHit && textHit;
}

export type Judgement = {
  key_match: boolean;
  llm_match: boolean;
  reached: boolean;
  disagreed: boolean;
  reason_ja: string;
  cost: CostRecord | null;
};

/**
 * 최종 판정. LLM을 1회 부른다.
 * 도달 여부는 **둘 다 맞을 때만** true다 — 관대한 쪽에 맞추면 到達率이 부풀려진다.
 */
export async function judge(mission: Mission, raw: RawObservation): Promise<Judgement> {
  const key = keyMatch(mission.id, raw);

  const r = await complete({
    step_type: "judge",
    system: JUDGE_SYSTEM,
    user: judgeUser(mission, raw.url, raw.title, raw.text),
    schema: JUDGE_SCHEMA,
  });

  const p = (r.parsed ?? {}) as { reached?: unknown; reason_ja?: unknown };
  const llm = p.reached === true;

  return {
    key_match: key,
    llm_match: llm,
    reached: key && llm,
    disagreed: key !== llm,
    reason_ja: String(p.reason_ja ?? ""),
    cost: r.cost,
  };
}
