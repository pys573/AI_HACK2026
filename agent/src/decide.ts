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

/**
 * 쓸 수 있는 답이 올 때까지 몇 번 묻는가 (첫 호출 포함).
 *
 * 1이면 재질문이 없다. 2 이상이어야 「모델이 스키마를 어겼다」를 흡수할 수 있다.
 * 이 값을 올리면 스텝당 원가가 오르지만, 대신 **버려지는 스텝이 줄어든다.**
 * 버려진 스텝은 「제약 때문에 헤맸다」로 집계되므로 그쪽이 훨씬 비싸다.
 */
const MAX_ATTEMPTS = 3;

/**
 * decide()가 끝내 쓸 수 있는 답을 못 받았을 때 던진다.
 *
 * ★ 그때까지 실제로 부른 호출의 원가를 들고 나간다.
 *   실패했어도 과금은 됐다. 실패를 이유로 원가에서 빼면 「우리 도구는 싸다」가
 *   거짓말이 된다 (절대규칙 4).
 */
export type DecideFailure = Error & { costs: CostRecord[] };

export function isDecideFailure(e: unknown): e is DecideFailure {
  return e instanceof Error && Array.isArray((e as DecideFailure).costs);
}

function decideFailure(message: string, costs: CostRecord[]): DecideFailure {
  const e = new Error(message) as DecideFailure;
  e.costs = costs;
  return e;
}

/**
 * structured output이 와도 형태는 믿지 않는다. 여기서 한 번 좁힌다.
 *
 * ★ 라우터가 고르는 모델 중 일부(실측: glm-5.2)는 우리가 준 JSON 스키마를 지키지 않고
 *   제멋대로 필드명을 쓴다 — `{"action":"click","target":[0],"reason_ja":"…"}`.
 *   `kind`가 없으니 예전 코드는 빈 문자열로 읽었고, 그 스텝은 통째로 버려졌다.
 *   버려진 스텝은 「제약 때문에 헤맸다」로 집계되므로 측정이 오염된다.
 *   모델은 판단을 했다. 못 읽은 건 우리 쪽이다 — 그래서 읽어준다.
 */
export function toAction(raw: unknown): Action {
  const o = (raw ?? {}) as Record<string, unknown>;
  const kind = String(o.kind ?? o.action ?? "") as ActionKind;
  const a: Action = { kind, reason_ja: String(o.reason_ja ?? "") };
  // target: [0] 형태로 오는 모델이 있다. 배열이면 첫 번째만 쓴다 — 사람은 한 번에 하나만 누른다
  const target = Array.isArray(o.target) ? o.target[0] : o.target;
  const index = typeof o.index === "number" ? o.index : target;
  if (typeof index === "number") a.index = index;
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

  // ★ 모든 시도의 원가가 여기 쌓인다. 성공했든 실패했든 부른 호출은 전부 남는다.
  //   재시도가 붙은 스텝은 trace의 llm_calls가 2~3건이 된다 = 사후에 셀 수 있다 = 숨기지 않는다.
  const costs: CostRecord[] = [];
  let lastNote = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // 재질문일수록 말로 못을 박는다. 스키마만 주면 안 지키는 모델이 실제로 있다(glm-5.2).
      const r = await complete(attempt === 1 ? base : { ...base, system: `${DECIDE_SYSTEM}\n\n${nag(kinds, lastNote)}` });
      costs.push(r.cost);

      const action = toAction(r.parsed);
      // 별칭까지 읽어줘도 허용 목록 밖이면, 그건 진짜로 못 알아들은 것이다.
      // ★ 이 검사는 재질문의 답에도 똑같이 걸린다. 예전엔 첫 답에만 걸려서,
      //   재질문이 빈 kind를 돌려줘도 그대로 통과했다. 그 스텝은 act()에서 죽고
      //   「제약 때문에 헤맸다」로 집계됐다 — 우리 도구가 만든 잡음이 측정에 섞인 것이다.
      if (kinds.includes(action.kind)) return { action, costs };

      lastNote = `kind「${action.kind}」は使えません`;
    } catch (e) {
      if (!(e instanceof Error)) throw e;
      // 4xx·키 없음 같은 건 다시 물어도 같은 답이 온다. 돈만 쓴다.
      // 싼 모델이 JSON 대신 YAML 비슷한 걸 뱉는 경우만 다시 묻는다.
      if (!e.message.includes("JSON")) throw decideFailure(e.message, costs);
      lastNote = "出力がJSONではありませんでした";
    }
  }

  // 여기까지 오면 모델 쪽 문제다. 관측 제약과는 무관하다.
  // 그럴듯한 액션을 지어내지 않는다 (절대규칙 3) — 실패를 실패라고 기록하고 넘긴다.
  throw decideFailure(`[decide] ${MAX_ATTEMPTS}회 물어도 쓸 수 있는 action이 오지 않았다 (${lastNote})`, costs);
}

/** 무엇이 틀렸는지 알려주고 다시 묻는다. 「다시 해봐」만으로는 같은 답이 온다. */
function nag(kinds: string[], lastNote: string): string {
  return (
    `前回の回答は使えませんでした: ${lastNote}。\n` +
    `kind は必ず次のいずれか1つにしてください: ${kinds.join(" / ")}。空文字も省略も不可です。\n` +
    `出力はJSONオブジェクトのみ。前置きも説明も付けないでください。`
  );
}
