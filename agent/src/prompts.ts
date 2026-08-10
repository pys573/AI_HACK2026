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

/** LLM이 낼 수 있는 수. 프로필이 허용하지 않는 종류는 **목록에 넣지 않는다.** */
export function allowedKinds(p: Profile): string[] {
  const kinds = ["click", "scroll", "give_up"];
  if (p.tools.find_in_page) kinds.push("find_in_page");
  if (p.tools.site_search) kinds.push("site_search");
  // back은 back_limit가 0이 아닌 한 사람이면 누구나 할 수 있다
  if (p.tools.back_limit === null || p.tools.back_limit > 0) kinds.push("back");
  return kinds;
}

export function actionSchema(p: Profile): Record<string, unknown> {
  const kinds = allowedKinds(p);

  return {
    type: "object",
    properties: {
      kind: { type: "string", enum: kinds },
      index: { type: ["integer", "null"], description: "kind=click のとき、押す要素の番号" },
      // ★ px로 물으면 모델은 0·3·500·1000 같은 값을 낸다. 사람은 픽셀로 스크롤하지 않는다.
      //   enum으로 잠가서 「몇 화면」만 고르게 한다 — 설명문보다 이쪽이 확실히 지켜진다.
      delta: {
        type: ["integer", "null"],
        enum: [-3, -2, -1, 1, 2, 3, null],
        description: "kind=scroll のとき、動かす画面数。1で1画面分下へ、-1で1画面分上へ",
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
          const what =
            h.action.kind === "click"
              ? `[${h.action.index}] を押した`
              : h.action.kind === "scroll"
                ? `${(h.action.delta ?? 0) > 0 ? "下" : "上"}にスクロールした`
                : h.action.kind === "back"
                  ? "前のページに戻った"
                  : h.action.kind === "site_search"
                    ? `サイト内検索で「${h.action.query}」を調べた`
                    : h.action.kind === "find_in_page"
                      ? `ページ内で「${h.action.query}」を探した`
                      : h.action.kind;
          if (!h.ok) return `${h.n}. ${what} → うまくいかなかった (${h.landed_title})`;
          // 클릭·검색인데 페이지가 그대로면, 사람이 화면에서 받는 신호를 그대로 준다.
          const dead =
            (h.action.kind === "click" || h.action.kind === "site_search") && !h.changed;
          return `${h.n}. ${what} → ${dead ? "画面は何も変わらなかった" : h.landed_title}`;
        })
        .join("\n")
    : "(まだ何もしていません)";

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
    `スクロール位置: ${obs.scroll.y}px / 全体 ${obs.scroll.height}px`,
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
