/**
 * 프로필 = 우리의 주장 그 자체. 화면에는 **사람과 사양이 함께** 뜬다.
 *
 * ★ 2026-08-12 방침 변경 (「심사위원 예상 반박과 대응.md」 §7).
 *   원래는 사람 사진을 전부 뺐다. 사진이 「이 사람을 재현했다」는 주장으로 읽힐까 봐서다.
 *   그건 과잉이었다 — 채점표에는 「자격 없는 주장을 안 했는가」라는 항목이 없고,
 *   대신 ③完成度・デモ의 채점 관점이 **「触れて数十秒で価値がわかる」**이다.
 *   사진을 빼서 이해를 늦춘 만큼 ③에서 잃는다.
 *
 *   그래서 규칙을 이렇게 바꾼다 — **누구를 위한 것인지는 대담하게, 숫자는 정확하게.**
 *   · 사진과 사람 이름(高齢者·外国人住民…)은 **누구를 위한 계측인지**를 1초에 전달한다
 *   · 바로 밑에 프로필 id·version·제약 사양이 붙는다. 그게 「재현했다」가 아니라
 *     「이 조건으로 돌렸다」임을 같은 화면에서 못 박는다
 *   · 이름·나이를 붙인 가공의 개인(「72歳の田中さん」)은 여전히 만들지 않는다.
 *     그건 존재하지 않는 개인의 데이터를 있는 것처럼 보이게 하는 것이라 성격이 다르다
 *
 * 카드에 뜨는 **사양과 숫자**는 전부 파일에서 기계적으로 만든다. 손으로 쓴 설명을 섞으면
 * 프로필을 고쳤을 때 화면만 옛날 값으로 남는다.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PERSONA } from "./persona";

const DIR = join(process.cwd(), "..", "profiles");

type Raw = {
  id: string;
  version: string;
  label: { ja: string; ko: string };
  lexicon:
    | null
    | ({ unknown: string; source?: string } & (
        | { kind?: "comprehension_rate"; cohort: string; mask_below: number }
        | { kind: "designated_list"; list: string }
      ));
  viewport: { width: number; height: number; zoom: number };
  observation: { dom_text: boolean; screenshot: boolean };
  tools: { find_in_page: boolean; site_search: boolean; back_limit: number | null };
  patience: { clicks: number; seconds: number };
};

export type ProfileCard = {
  id: string;
  version: string;
  /** 사양 이름. 「高齢者制約プロファイル」처럼 정확하지만 길다 */
  labelJa: string;
  /** 화면에 크게 뜨는 사람 이름. 없으면(대조군) null */
  personaJa: string | null;
  /** 인물 사진. 없으면 null — 대조군은 사람이 아니라 기준선이라서 없다 */
  photo: string | null;
  /** 사진 밑에 붙는 짧은 상태 태그 */
  personaTags: string[];
  /** 사양을 그대로 옮긴 짧은 줄들. 카드에 태그로 붙는다 */
  specs: string[];
  /**
   * 화면 조건 한 줄. **진행 화면에서 이게 없으면 반드시 오해받는다.**
   *
   * 실행 중 화면에는 좁은 사진이 흐르는데, 그 좁음의 이유가 두 가지다 —
   * ① 스마트폰 폭이라서(375px) ② PC를 확대해서 한 번에 보이는 범위가 줄어서(1280px·200%).
   * 둘은 완전히 다른 조건인데 사진만 보면 똑같이 「모바일 화면」으로 보인다.
   * 적어 두지 않으면 高齢者 프로필이 「스마트폰을 쓰는 노인」으로 읽히고,
   * 그건 우리가 재고 있는 것과 다르다.
   */
  screenJa: string;
  /** 어휘 근거 한 줄. 출처가 없으면 null이고, 없으면 화면도 안 그린다 */
  evidenceJa: string | null;
  /** 제약이 아예 없는가 — 대조군만 true */
  isControl: boolean;
};

function specsOf(p: Raw): string[] {
  const s: string[] = [];

  if (p.lexicon?.kind === "designated_list") {
    s.push("行政が「書き換えろ」と指定した語を伏せる");
  } else if (p.lexicon) {
    s.push(`理解率${p.lexicon.mask_below}%未満の語を伏せる`);
  }

  if (p.viewport.zoom > 1) s.push(`画面を${p.viewport.zoom}倍に拡大`);
  if (p.viewport.width <= 420) s.push(`横${p.viewport.width}pxの画面`);
  if (!p.observation.dom_text) s.push("本文を渡さない");
  if (!p.tools.site_search) s.push("サイト内検索なし");
  if (!p.tools.find_in_page) s.push("ページ内検索なし");
  if (p.tools.back_limit !== null) s.push(`「戻る」は${p.tools.back_limit}回まで`);

  const min = Math.round(p.patience.seconds / 60);
  s.push(`${p.patience.clicks}クリック / ${min}分で打ち切り`);
  return s;
}

/**
 * ★ %를 쓸 수 있는 것은 이해율 조사뿐이다.
 *   지정 명단에는 조사도 %도 존재하지 않는다 — 붙이면 없는 조사를 있다고 말하는 것이 된다.
 */
function evidenceOf(p: Raw): string | null {
  // 출처가 없으면 줄 자체를 안 그린다. 「— undefined」로 나가면 그건 근거 없는 히트를
  // 근거 있는 것처럼 보이게 만드는 것이라 버그다.
  if (!p.lexicon?.source) return null;
  // 분기 기준을 mask.ts와 같게 둔다 — kind는 이해율 정책에서는 생략 가능한 필드다.
  // 「designated_list가 아니면 이해율」이 실제 마스킹 엔진의 판정이다.
  if (p.lexicon.kind === "designated_list") {
    return `指定語リスト（理解率調査ではないため%は付けない） — ${p.lexicon.source}`;
  }
  return `60歳以上の理解率が${p.lexicon.mask_below}%未満の語 — ${p.lexicon.source}`;
}

/**
 * 「PC인가 스마트폰인가」는 **선언한 폭**으로 가른다(확대 후의 폭이 아니다).
 *
 * senior-70s는 1280px을 200%로 본다 → 실효 640px. 이걸 실효 폭으로 가르면
 * 「스마트폰」으로 분류돼 버리는데, 실제로는 **PC 앞에 앉아 확대한 사람**이다.
 * 잰 것과 다른 말이 화면에 뜨면 그건 계측이 아니라 창작이 된다.
 */
function screenOf(p: Raw): string {
  const kind = p.viewport.width >= 1024 ? "PC" : "スマートフォン";
  const base = `${kind}・${p.viewport.width}×${p.viewport.height}`;
  if (p.viewport.zoom === 1) return base;
  const w = Math.round(p.viewport.width / p.viewport.zoom);
  const h = Math.round(p.viewport.height / p.viewport.zoom);
  return `${base}・表示${p.viewport.zoom * 100}%（実効 ${w}×${h}）`;
}

export function loadProfileCards(ids: string[]): ProfileCard[] {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));
  const out: ProfileCard[] = [];
  for (const id of ids) {
    const f = files.find((x) => x === `${id}.json`);
    if (!f) continue;
    const p = JSON.parse(readFileSync(join(DIR, f), "utf8")) as Raw;
    out.push({
      id: p.id,
      version: p.version,
      labelJa: p.label.ja,
      personaJa: PERSONA[p.id]?.name ?? null,
      photo: PERSONA[p.id]?.photo ?? null,
      personaTags: PERSONA[p.id]?.tags ?? [],
      specs: specsOf(p),
      screenJa: screenOf(p),
      evidenceJa: evidenceOf(p),
      isControl: p.id === "control",
    });
  }
  return out;
}
