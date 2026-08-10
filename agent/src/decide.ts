/**
 * A-2 · decide() — 관측 하나에서 다음 수 하나를 뽑는다.
 *
 * 이 파일은 `missions/keys/`를 import 하지 않는다. 앞으로도 하지 않는다.
 * import 목록이 「정답을 안 봤다」의 증거다.
 */

import { complete } from "../../llm/orca.ts";
import type { Action, ActionKind, CostRecord, Mission } from "../../core/types.ts";
import type { Observation, Profile } from "./constrain.ts";
import { actionSchema, allowedKinds, DECIDE_SYSTEM, decideUser, type HistoryEntry } from "./prompts.ts";

/**
 * 재시도가 붙으면 실제 API 호출이 2회다. 한 개만 돌려주면 그 스텝의 원가가 과소 계상된다.
 * 절대규칙 4 — 「이 숫자 어디서 나왔나요」에 답하려면 호출 단위로 남아 있어야 한다.
 */
export type Decision = { action: Action; costs: CostRecord[] };

/** structured output이 와도 형태는 믿지 않는다. 여기서 한 번 좁힌다. */
function toAction(raw: unknown): Action {
  const o = (raw ?? {}) as Record<string, unknown>;
  const kind = String(o.kind ?? "") as ActionKind;
  const a: Action = { kind, reason_ja: String(o.reason_ja ?? "") };
  if (typeof o.index === "number") a.index = o.index;
  if (typeof o.delta === "number") a.delta = o.delta;
  if (typeof o.query === "string" && o.query.length > 0) a.query = o.query;
  return a;
}

export async function decide(
  mission: Mission,
  obs: Observation,
  profile: Profile,
  history: HistoryEntry[],
): Promise<Decision> {
  // 본문도 없고 라벨도 전부 비어 있으면, 이 모델에게는 판단 재료가 하나도 없다.
  // 스크린샷만으로 도는 프로필(smartphone-novice)은 vision 지원이 필요하다 → B-1.
  // 조용히 빈 화면으로 돌리면 「제약이 세서 실패했다」로 오독된다. 그건 거짓말이 된다.
  if (obs.text === null && obs.elements.every((e) => !e.name)) {
    throw new Error(
      `[decide] 판단 재료 없음 (profile=${profile.id}). ` +
        `dom_text=false 프로필은 스크린샷 입력(vision)이 필요하다. llm/orca.ts 미지원 — B-1 대기.`,
    );
  }

  const base = {
    step_type: "decide" as const,
    system: DECIDE_SYSTEM,
    user: decideUser(mission, obs, history),
    schema: actionSchema(profile),
  };

  const kinds = allowedKinds(profile);

  try {
    const r = await complete(base);
    const action = toAction(r.parsed);
    // ★ 스키마에 enum을 걸어도 kind가 ""로 오는 일이 실제로 있었다 (2026-08-10, 20스텝 중 3회).
    //   그대로 흘리면 act()가 「알 수 없는 액션」으로 버리고, 그 스텝은 통째로 낭비된다.
    //   이건 사이트의 문제가 아니라 우리 쪽 잡음이므로, 실패 기록에 섞이면 측정이 오염된다.
    if (kinds.includes(action.kind)) return { action, costs: [r.cost] };
    const retry = await complete({
      ...base,
      system: `${DECIDE_SYSTEM}\n\nkind は必ず次のいずれか1つにしてください: ${kinds.join(" / ")}。空文字は不可です。`,
    });
    return { action: toAction(retry.parsed), costs: [r.cost, retry.cost] };
  } catch (e) {
    // 싼 모델은 가끔 JSON 대신 YAML 비슷한 것을 뱉는다. 그건 우리 관측 제약과 무관한
    // 모델 쪽 잡음이므로, 한 번만 더 물어본다. 여기서 실행을 죽이면 「예산 소진으로
    // 포기했다」가 「에러」로 기록되어 이탈률 통계가 오염된다.
    if (!(e instanceof Error) || !e.message.includes("JSON")) throw e;
    const r = await complete({
      ...base,
      system: `${DECIDE_SYSTEM}\n\n出力はJSONオブジェクトのみ。前置きも説明も付けないでください。`,
    });
    return { action: toAction(r.parsed), costs: [r.cost] };
  }
}
