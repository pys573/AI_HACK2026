/**
 * 프롬프트 조립 — **여기에 페르소나를 쓰지 않는다.**
 *
 * 이 파일의 규율이 제품의 주장 전체를 지탱한다.
 *
 *   control과 senior-70s는 **바이트 단위로 같은 프롬프트**를 받는다.
 *   다른 것은 obs(관측)뿐이다. 그래서 결과가 갈리면 원인이 관측이라고 말할 수 있다.
 *
 * 「あなたは72歳です」를 한 줄이라도 넣는 순간:
 *   1) 그건 연기이고, 연기는 새어나온다 (모델은 답을 알면서 모르는 척한다)
 *   2) 인과가 증명 불가능해진다 (프롬프트가 달라졌으니 관측 탓이라 못 한다)
 *   3) 「AIが72歳を再現」이라는 우리가 금지한 주장 그 자체가 된다
 *
 * 시스템 프롬프트는 **상수**다. 프로필·미션과 무관하게 같은 바이트다.
 * 프롬프트 캐시가 여기서 먹는다 (B-4). 가변부는 전부 user 쪽에 둔다.
 */

import type { Action, Mission } from "../../core/types.ts";
import type { Observation, Profile } from "./constrain.ts";

/** 이 문자열은 절대 프로필별로 갈라지지 않는다. 갈라지는 순간 인과 주장이 죽는다. */
export const DECIDE_SYSTEM = [
  "あなたは、ある用事を済ませるためにウェブサイトを見ている一人の利用者です。",
  "",
  "画面から読み取れる情報だけを使って、次にどう操作するかを決めてください。",
  "画面に出ていないリンクやボタンは存在しません。知識で補わないでください。",
  "サイトの一般的な構造を推測して直接URLを組み立てることもできません。",
  "",
  "普通の人は、少し分からないくらいではすぐに諦めません。",
  "確信が持てなくても、それらしいものを押してみたり、下にスクロールして探したりします。",
  "本当にどうすればよいか分からなくなったときだけ、諦めてください。",
  "",
  "理由(reason_ja)は、そのとき自分が何を考えたかを一人称の日本語で短く書いてください。",
].join("\n");

/**
 * LLM이 낼 수 있는 수. 프로필이 허용하지 않는 종류는 **목록에 넣지 않는다.**
 *
 * ★ 2026-08-13. `obs`가 인자로 들어왔다. 그전까지 이 목록은 프로필만 보고 정해졌다.
 *   그래서 불변식을 여기서 다시 적어 둔다 — 예전 문장 그대로 두면 거짓말이 된다.
 *
 *   (전) 프롬프트도 스키마도 프로필만의 함수였다
 *   (후) **스키마는 (프로필의 도구, 관측)의 함수다.** 프롬프트 본문은 여전히 관측만의 함수다
 *
 *   왜 넓혔는가: 가로 막대가 화면에 있는지 없는지는 **관측의 일부**다. 창이 좁아 오른쪽이
 *   잘리면 브라우저가 막대를 띄우고, 사람은 그걸 보고 옆으로 민다. 그 수단을 안 주면
 *   「오른쪽 끝의 링크에 절대 못 간다」가 되는데, 그건 사이트의 성질이 아니라 우리 도구의
 *   한계다. 관측에서 나온 차이만 결과를 가른다는 원칙은 그대로다.
 *
 *   ⚠️ 그 결과 control(줌 1배)과 senior-70s(줌 2배)가 **같은 페이지에서 다른 스키마**를 받는
 *   경우가 생긴다. 잘리는 쪽에만 `scroll_side`가 붙기 때문이다. 이 비대칭은 항상
 *   **제약이 걸린 쪽에 수단을 더 주는** 방향이고, 그쪽이 잘 찾을수록 이탈률은 내려간다.
 *   즉 오차는 우리 주장에 **불리한** 방향이다 — 절대규칙 2가 요구하는 방향이 이쪽이다.
 */
export function allowedKinds(p: Profile, obs?: Observation): string[] {
  const kinds = ["click", "scroll"];
  // 옆으로 잘려 있을 때만. 안 잘린 페이지에서는 목록이 예전과 한 글자도 다르지 않다
  // (= 지금까지의 105회와 같은 조건). 그래서 이전 계측과 비교가 계속 성립한다.
  if (obs?.scroll.overflow_x) kinds.push("scroll_side");
  kinds.push("give_up");
  if (p.tools.find_in_page) kinds.push("find_in_page");
  if (p.tools.site_search) kinds.push("site_search");
  // back은 back_limit가 0이 아닌 한 사람이면 누구나 할 수 있다
  if (p.tools.back_limit === null || p.tools.back_limit > 0) kinds.push("back");
  return kinds;
}

export function actionSchema(p: Profile, obs?: Observation): Record<string, unknown> {
  const kinds = allowedKinds(p, obs);
  const side = kinds.includes("scroll_side");

  return {
    type: "object",
    properties: {
      kind: { type: "string", enum: kinds },
      index: { type: ["integer", "null"], description: "kind=click のとき、押す要素の番号" },
      // ★ px로 물으면 모델은 0·3·500·1000 같은 값을 낸다. 사람은 픽셀로 스크롤하지 않는다.
      //   enum으로 잠가서 「몇 화면」만 고르게 한다 — 설명문보다 이쪽이 확실히 지켜진다.
      //   가로도 같은 칸을 쓴다. 칸을 새로 만들면 스키마 모양 자체가 바뀌어,
      //   옆으로 안 잘린 페이지에서도 예전과 다른 요청이 나가게 된다.
      delta: {
        type: ["integer", "null"],
        enum: [-3, -2, -1, 1, 2, 3, null],
        description: side
          ? "kind=scroll のとき、動かす画面数。1で1画面分下へ、-1で1画面分上へ。" +
            "kind=scroll_side のときは横で、1で1画面分右へ、-1で1画面分左へ"
          : "kind=scroll のとき、動かす画面数。1で1画面分下へ、-1で1画面分上へ",
      },
      query: { type: ["string", "null"], description: "find_in_page / site_search の検索語" },
      reason_ja: { type: "string" },
    },
    required: ["kind", "index", "delta", "query", "reason_ja"],
    additionalProperties: false,
  };
}

export type HistoryEntry = {
  n: number;
  action: Action;
  /** 그 수를 둔 결과 어디에 도착했는가. 사람으로 치면 「눌렀더니 이 화면이 나왔다」 */
  landed_title: string;
  ok: boolean;
  /**
   * 눌렀는데 페이지가 바뀌었는가.
   * 사람은 「눌렀는데 아무 일도 안 일어났다」를 **즉시** 안다. 그걸 안 알려주면
   * 에이전트는 같은 버튼을 여섯 번 누르고, 그 헛발질이 「제약 때문에 헤맸다」로 집계된다.
   */
  changed: boolean;
};

const MAX_TEXT = 6000;
const MAX_HISTORY = 8;

/**
 * 「자기가 방금 무엇을 했는가」를 사람 말로 되돌려준다.
 *
 * 여기 한 줄이 빠지면 그 수는 `scroll_side` 같은 날것으로 히스토리에 남는다.
 * 모델은 자기가 뭘 했는지 못 읽고 같은 수를 반복하며, 그 반복이 「제약 때문에 헤맸다」로
 * 집계된다 — 우리 쪽 누락이 사이트 탓으로 기록되는 경로다.
 */
function describeAction(a: Action): string {
  switch (a.kind) {
    case "click":
      return `[${a.index}] を押した`;
    case "scroll":
      return `${(a.delta ?? 0) > 0 ? "下" : "上"}にスクロールした`;
    case "scroll_side":
      return `${(a.delta ?? 0) > 0 ? "右" : "左"}にスクロールした`;
    case "back":
      return "前のページに戻った";
    case "site_search":
      return `サイト内検索で「${a.query}」を調べた`;
    case "find_in_page":
      return `ページ内で「${a.query}」を探した`;
    default:
      return a.kind;
  }
}

/**
 * ⚠️ mission의 goal_ja는 **넣지 않는다.** intent_ja만 넣는다.
 *
 * goal_ja는 우리가 채점하려고 쓴 문장이라 「たどり着く」같은 정답 힌트가 들어있다.
 * 사람이 머릿속에 갖고 있는 건 목적(intent)이지 정답 경로가 아니다.
 */
export function decideUser(
  mission: Mission,
  obs: Observation,
  history: HistoryEntry[],
): string {
  const els = obs.elements.length
    ? obs.elements.map((e) => `[${e.index}] ${e.role} 「${e.name || "(名前なし)"}」`).join("\n")
    : "(操作できるものが画面にありません)";

  const text =
    obs.text === null
      ? "(このページの文章は読み取れていません。画面に出ている操作要素だけで判断してください)"
      : obs.text.length > MAX_TEXT
        ? `${obs.text.slice(0, MAX_TEXT)}\n…(以下省略)`
        : obs.text;

  const hist = history.length
    ? history
        .slice(-MAX_HISTORY)
        .map((h) => {
          const what = describeAction(h.action);
          if (!h.ok) return `${h.n}. ${what} → うまくいかなかった (${h.landed_title})`;
          // 클릭·검색인데 페이지가 그대로면, 사람이 화면에서 받는 신호를 그대로 준다.
          const dead =
            (h.action.kind === "click" || h.action.kind === "site_search") && !h.changed;
          return `${h.n}. ${what} → ${dead ? "画面は何も変わらなかった" : h.landed_title}`;
        })
        .join("\n")
    : "(まだ何もしていません)";

  // 옆으로 잘려 있을 때만 한 줄 붙는다. 안 잘렸으면 문자열은 예전과 완전히 같다 —
  // 지금까지의 105회와 같은 프롬프트가 나간다.
  //
  // ★ 좌표만 적지 않고 「오른쪽이 잘려 있다」까지 쓴다.
  //   눈으로 보는 사람은 글자가 화면 끝에서 잘린 것과 아래의 가로 막대를 **동시에** 본다.
  //   글자만 받는 모델에게 숫자 두 개만 주면 그 신호가 통째로 빠지고, 그 결과
  //   「오른쪽에 못 갔다」가 사이트의 성질이 아니라 우리 전달 방식의 결과가 된다.
  //   ⚠️ 다만 **거기에 무엇이 있는지는 말하지 않는다.** 그건 화면을 본 사람만 아는 것이고,
  //   말하는 순간 관측 제약을 우리가 풀어준 것이 된다.
  const sideLine = obs.scroll.overflow_x
    ? `\n横のスクロール位置: ${obs.scroll.x}px / 全体 ${obs.scroll.width}px` +
      `（このページは画面の幅に収まっていません。右側が切れていて、横に動かすと続きが見えます）`
    : "";

  return [
    `## あなたの用事`,
    mission.intent_ja,
    ``,
    `## これまでにしたこと`,
    hist,
    ``,
    `## 今見えている画面`,
    `URL: ${obs.url}`,
    `タイトル: ${obs.title}`,
    `スクロール位置: ${obs.scroll.y}px / 全体 ${obs.scroll.height}px${sideLine}`,
    ``,
    `### 押せるもの`,
    els,
    ``,
    `### 画面の文章`,
    text,
  ].join("\n");
}

/**
 * 판정 프롬프트.
 * ★ judge는 **제약 전의 원본**을 본다. 도달했는지는 우리의 계측이지 그 사람의 체험이 아니다.
 *   여기에 제약을 걸면 「보이지 않았으니 도달 안 했다」가 되어 측정이 무너진다.
 */
export const JUDGE_SYSTEM = [
  "あなたは、ある利用者がウェブサイト上で用事を達成できたかどうかを判定する審査員です。",
  "",
  "判定は厳しめにしてください。「近いページに着いた」は到達ではありません。",
  "利用者が知りたかったことが、そのページに実際に書かれている場合だけ到達とします。",
  "一覧ページや案内の入口にとどまっている場合は到達ではありません。",
].join("\n");

export const JUDGE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    reached: { type: "boolean" },
    reason_ja: { type: "string", description: "そう判断した根拠を、ページ内の記述を引用して1〜2文で" },
  },
  required: ["reached", "reason_ja"],
  additionalProperties: false,
};

export function judgeUser(mission: Mission, url: string, title: string, text: string): string {
  return [
    `## 利用者が知りたかったこと`,
    mission.goal_ja,
    ``,
    `## 今いるページ`,
    `URL: ${url}`,
    `タイトル: ${title}`,
    ``,
    `### 本文`,
    text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n…(以下省略)` : text,
  ].join("\n");
}
