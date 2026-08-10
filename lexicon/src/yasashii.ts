/**
 * 出入国在留管理庁・文化庁「やさしい日本語 書き換え例」(2020) → 行政用語 명단 코퍼스
 *
 * 왜 이 데이터인가:
 *   행정 사이트의 진짜 장벽은 카타카나가 아니라 漢語다 (「転入届」「特別徴収」).
 *   그런데 「N3 외국인은 이 단어를 모른다」를 우리가 판정하면 검증 불가능한 연기가 된다.
 *   이 목록은 **정부 스스로가 「이 말은 그대로 쓰면 안 통한다」고 지정한 명단**이다.
 *   「難しいと我々が思う語」가 아니라 「出入国在留管理庁が書き換えろと言っている語」다.
 *
 * gairaigo와 성질이 다르다는 점이 중요하다:
 *   gairaigo = 이해율 %  → 임계값으로 자른다 (mask_below)
 *   여기      = 명단     → % 가 없다. 실려 있으면 가리고, 없으면 통과시킨다.
 *   억지로 % 모델에 끼워넣으면 없는 숫자를 지어내는 것이 되므로 정책을 따로 만든다 (mask.ts).
 *
 * 출처: https://www.bunka.go.jp/seisaku/kokugo_nihongo/kyoiku/92484001.html
 *       文部科学省ウェブサイト利用規約 (政府標準利用規約 2.0 / CC BY 4.0 互換)
 * 조사시기: 2020-08 · 수록 134어
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SRC_XML = join(ROOT, "vendor", "bunkacho_yasashii_nihongo_kakikae.bbox.xml");
const OUT_JSONL = join(ROOT, "data", "yasashii.jsonl");
const OUT_MANIFEST = join(ROOT, "data", "yasashii.manifest.json");

/** 원본 PDF에 수록된 어휘 수. 여기서 어긋나면 파싱이 깨진 것이다. */
export const EXPECTED_ENTRIES = 134;

export type YasashiiEntry = {
  /** 원본의 番号. 근거 문장에 그대로 인용한다. */
  no: number;
  /** 語彙 열의 표기 그대로 (괄호·中黒 포함) */
  term: string;
  /**
   * 실제 페이지 텍스트에서 찾을 표기들. term에서 기계적으로 파생한다 (§surfaces).
   * 「管理費（共益費）」는 어느 사이트도 그대로 쓰지 않는다. 쪼개지 않으면 사전이 있어도 안 걸린다.
   */
  surfaces: string[];
  /** 意味 열 — 원본이 제시하는 やさしい日本語 설명. 「대신 뭐라고 쓰라는 건가」의 답이다. */
  meaning: string;
  /** 원본 PDF 페이지 (1-origin). 심사에서 「어디서 났나」에 페이지로 답한다. */
  page: number;
  source: "bunkacho-yasashii-kakikae-2020";
};

// ─────────────────────────────────────────────────────────────
// PDF 텍스트 레이어 파싱
//
// pdftotext -raw 로 뽑으면 함정이 3개 있다 (vendor/SOURCES.md 참조):
//   ① 語彙가 한자 덩어리 단위로 쪼개진다 (確定 + 申告)
//   ② 意味의 첫 덩어리가 語彙에 딸려온다 (育児休業 + 子)
//   ③ 카타카나 표제어엔 루비가 없어 교대 패턴이 깨진다 → 129/134
// 셋 다 「행(行)만 보고 열(列)을 못 본다」는 같은 원인이다.
// 그래서 -bbox 로 좌표째 뽑아 **열 위치와 글자 크기로** 나눈다. 함정 3개가 구조적으로 사라진다.
// ─────────────────────────────────────────────────────────────

type Word = { x0: number; y0: number; x1: number; y1: number; h: number; text: string };

/** 番号 열과 語彙 열의 경계. 실측: 번호는 x≈70, 語彙는 x≥95.8 */
const COL_NUMBER_MAX = 90;
/**
 * 語彙 열과 意味 열의 경계. 실측: 語彙의 xMin 최대 193.0 / 意味의 xMin 최소 206.4.
 * 그 사이는 비어 있다 — assertColumnGap()이 매 빌드마다 확인한다.
 */
const COL_SPLIT_X = 200;
/** 루비(6.1pt)와 본문(12.19pt)의 경계. 루비는 표기가 아니라 읽기이므로 버린다. */
const RUBY_MAX_H = 9;

const WORD_RE =
  /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/word>/g;

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parsePages(xml: string): Word[][] {
  return xml
    .split("<page ")
    .slice(1)
    .map((p) => {
      const ws: Word[] = [];
      for (const m of p.matchAll(WORD_RE)) {
        const x0 = Number(m[1]);
        const y0 = Number(m[2]);
        const x1 = Number(m[3]);
        const y1 = Number(m[4]);
        ws.push({ x0, y0, x1, y1, h: y1 - y0, text: unescapeXml(m[5]) });
      }
      return ws;
    });
}

/** 읽기 순서(위→아래, 왼→오른쪽). 같은 행은 yMin이 소수점까지 일치한다. */
function readingOrder(a: Word, b: Word): number {
  return a.y0 - b.y0 || a.x0 - b.x0;
}

/**
 * 열 경계가 실제로 비어 있는지 확인한다 (루비를 걷어낸 본문 기준).
 * PDF를 갈아끼웠는데 레이아웃이 바뀌면 조용히 잘못된 데이터가 나온다. 그걸 막는다.
 */
function assertColumnGap(base: Word[]) {
  const stray = base.filter((w) => w.x0 > 195 && w.x0 < 205);
  if (stray.length > 0) {
    throw new Error(
      `열 경계(x=${COL_SPLIT_X})에 글자가 걸쳤다 — 레이아웃이 바뀌었다: ` +
        stray.map((w) => `${w.text}@${w.x0.toFixed(1)}`).join(" "),
    );
  }
}

export function build(): YasashiiEntry[] {
  const pages = parsePages(readFileSync(SRC_XML, "utf8"));
  const entries: YasashiiEntry[] = [];

  for (let pi = 0; pi < pages.length; pi++) {
    const words = pages[pi];

    // 표 머리글(「番号」)의 아래쪽이 본문의 시작이다.
    // 이걸로 표지·안내문·あいうえお 색인이 한 번에 떨어져 나간다.
    const header = words.find((w) => w.text === "番号" && w.x0 < COL_NUMBER_MAX);
    if (!header) continue;

    const body = words.filter((w) => w.y0 > header.y1);
    const base = body.filter((w) => w.h > RUBY_MAX_H);
    assertColumnGap(base);
    const numbers = base
      .filter((w) => w.x0 < COL_NUMBER_MAX && /^\d+$/.test(w.text))
      .sort(readingOrder);
    if (numbers.length === 0) continue;

    // 행 경계 = 이웃한 번호 y의 중점.
    // 번호는 행 안에서 세로 가운데에 오고, 語彙는 행의 첫 줄에 온다. 그래서 중점으로 갈린다.
    const bounds: number[] = [];
    for (let i = 0; i < numbers.length - 1; i++) {
      bounds.push((numbers[i].y0 + numbers[i + 1].y0) / 2);
    }
    const rowOf = (y: number) => {
      let i = 0;
      while (i < bounds.length && y > bounds[i]) i++;
      return i;
    };

    const terms: string[][] = numbers.map(() => []);
    const meanings: string[][] = numbers.map(() => []);
    for (const w of base.filter((w) => w.x0 >= COL_NUMBER_MAX).sort(readingOrder)) {
      (w.x0 < COL_SPLIT_X ? terms : meanings)[rowOf(w.y0)].push(w.text);
    }

    for (let i = 0; i < numbers.length; i++) {
      const term = terms[i].join("").trim();
      if (!term) throw new Error(`p${pi + 1} 번호 ${numbers[i].text}: 語彙가 비었다`);
      entries.push({
        no: Number(numbers[i].text),
        term,
        surfaces: surfacesOf(term),
        meaning: meanings[i].join("").trim(),
        page: pi + 1,
        source: "bunkacho-yasashii-kakikae-2020",
      });
    }
  }

  entries.sort((a, b) => a.no - b.no);
  assertShape(entries);
  return entries;
}

function assertShape(entries: YasashiiEntry[]) {
  if (entries.length !== EXPECTED_ENTRIES) {
    throw new Error(`수록어 ${entries.length}어 — 원본은 ${EXPECTED_ENTRIES}어다. 파싱이 깨졌다`);
  }
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].no !== i + 1) throw new Error(`번호가 이어지지 않는다: ${entries[i].no} (${i + 1}번째)`);
    if (entries[i].surfaces.length === 0) throw new Error(`표기가 없다: ${entries[i].term}`);
    if (!entries[i].meaning) throw new Error(`意味가 비었다: ${entries[i].term}`);
  }
}

// ─────────────────────────────────────────────────────────────
// 표기 파생
//
// 원본 표기를 그대로 찾으면 절반이 죽는다. 「（賃貸契約の）更新料」라고 쓰는 사이트는 없다.
// 규칙은 전부 기계적이다 — 손으로 고른 예외표를 만들지 않는다. 재빌드하면 같은 결과가 나온다.
// ─────────────────────────────────────────────────────────────

const KATAKANA_ONLY = /^[ァ-ヺーヽヾ]+$/;

export function surfacesOf(term: string): string[] {
  const out: string[] = [];

  // ① 앞머리 괄호는 한정어다. 「（賃貸契約の）更新料」의 표제어는 更新料.
  let head = term.replace(/^（[^）]*）/, "");
  // ② 뒤·중간 괄호는 별칭이다. 바깥과 안을 각각 하나의 표기로 본다.
  const alias = head.match(/（([^）]*)）/);
  if (alias) {
    out.push(head.replace(/（[^）]*）/g, ""), alias[1]);
  } else {
    out.push(head);
  }

  // ③ 中黒·斜線은 열거다 — 단, 카타카나어 내부의 中黒은 열거가 아니라 단어의 일부다.
  //    「自治会・町内会」는 두 단어지만 「ファミリー・サポート・センター」는 한 단어다.
  const split: string[] = [];
  for (const s of out) {
    const parts = s.split(/[・／]/).filter(Boolean);
    const allKatakana = parts.length > 1 && parts.every((p) => KATAKANA_ONLY.test(p));
    if (parts.length > 1 && !allKatakana) split.push(...parts);
    else split.push(s);
  }

  // ④ 표기 흔들림 — 카타카나어의 中黒은 사이트마다 있거나 없다.
  const variants = new Set<string>();
  for (const s of split) {
    const t = s.trim();
    if (t.length < 2) continue; // 1글자는 근거 대비 오탐이 너무 크다
    variants.add(t);
    if (KATAKANA_ONLY.test(t.replace(/・/g, ""))) variants.add(t.replace(/・/g, ""));
    const nfkc = t.normalize("NFKC");
    if (nfkc !== t) variants.add(nfkc);
  }

  // ⑤ 같은 항목 안에서 다른 표기의 부분문자열인 것은 버린다.
  //    「自動車税／軽自動車税環境性能割」을 쪼개면 「自動車税」가 남는데,
  //    그건 이 항목이 지정한 말이 아니다. 짧고 흔한 말을 긴 표제어를 빌미로 가리는 것은
  //    과잉 마스킹이고, 절대규칙 2 (오차는 항상 과소 마스킹 방향)에 어긋난다.
  const all = [...variants];
  return all.filter((s) => !all.some((o) => o !== s && o.includes(s)));
}

// ─────────────────────────────────────────────────────────────

function main() {
  const entries = build();
  writeFileSync(OUT_JSONL, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");

  const surfaces = entries.flatMap((e) => e.surfaces);
  const manifest = {
    built_at_note: "재빌드해도 동일 (입력이 고정 PDF 텍스트 레이어)",
    source: {
      name: "「やさしい日本語 書き換え例」(『生活・仕事ガイドブック』別冊)",
      publisher: "出入国在留管理庁 · 文化庁",
      url: "https://www.bunka.go.jp/seisaku/kokugo_nihongo/kyoiku/92484001.html",
      pdf_url: "https://www.bunka.go.jp/seisaku/kokugo_nihongo/kyoiku/pdf/92484001_02.pdf",
      license: "文部科学省ウェブサイト利用規約（政府標準利用規約 第2.0版）— CC BY 4.0 互換",
      license_url: "https://www.mext.go.jp/b_menu/1343445.htm",
      attribution: "出典：文化庁ウェブサイト（https://www.bunka.go.jp/）",
      surveyed: "2020-08",
      published: "2020-08",
      entries_in_source: EXPECTED_ENTRIES,
      nature:
        "理解率の調査ではなく、行政が「そのまま使うと伝わらない」と判定して書き換えを指定した用語の一覧である。",
    },
    extraction: {
      from: "vendor/bunkacho_yasashii_nihongo_kakikae.bbox.xml",
      command: "pdftotext -bbox bunkacho_yasashii_nihongo_kakikae.pdf bunkacho_yasashii_nihongo_kakikae.bbox.xml",
      tool: "poppler pdftotext 26.07.0",
      note: "列のx座標と文字サイズ（ルビ6.1pt / 本文12.19pt）で分離。行単位の解析では語彙と意味が混ざる。",
    },
    entries: entries.length,
    surfaces: surfaces.length,
    surface_max_len: Math.max(...surfaces.map((s) => s.length)),
    multi_surface_entries: entries.filter((e) => e.surfaces.length > 1).map((e) => ({
      no: e.no,
      term: e.term,
      surfaces: e.surfaces,
    })),
    limitations: [
      "134語のみ。収録外の行政用語はマスクしない（根拠がないため通過させる）。",
      "個人の理解度の測定値ではないため、理解率%は持たない。閾値による調整はできない。",
      "表記の一致で判定するため、収録語が長い語の一部として現れた場合も一致する（例：「大家」／「大家族」）。",
    ],
  };
  writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

  console.log(`${entries.length}어 / 표기 ${surfaces.length}건 → ${OUT_JSONL}`);
  console.log(`  복수 표기: ${manifest.multi_surface_entries.length}어`);
  console.log(`  최장 표기: ${manifest.surface_max_len}자`);
  const sample = entries.filter((e) => ["転入届", "確定申告", "特別徴収", "オーバーステイ"].includes(e.term));
  for (const e of sample) console.log(`  No.${e.no} ${e.term} — ${e.meaning.slice(0, 40)}…`);
}

if (import.meta.filename === process.argv[1]) main();
