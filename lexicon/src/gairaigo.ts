/**
 * 国立国語研究所「外来語定着度調査」 → 어휘 난이도 코퍼스
 *
 * 왜 이 데이터인가:
 *   「72세는 이 단어를 모른다」는 우리가 주장하면 검증 불가능한 연기다.
 *   국어연 조사는 全国16歳以上 층화2단 무작위추출 · 개별면접 · n=750〜2118 이다.
 *   「60歳以上の理解率 4.1%」는 우리 주장이 아니라 인용이다. 여기서 방어선이 생긴다.
 *
 * 출처: https://mmsrv.ninjal.ac.jp/gairaigo_yoron/  (CC BY 4.0)
 * 조사어 405어 / 조사시기 平成14年11月〜平成16年8月 (2002-11〜2004-08)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SRC_CSV = join(ROOT, "vendor", "ninjal_gairaigo_teichakudo.sjis.csv");
const OUT_JSONL = join(ROOT, "data", "gairaigo.jsonl");
const OUT_MANIFEST = join(ROOT, "data", "gairaigo.manifest.json");

/** 조사 1회분의 원자료. 같은 단어가 여러 조사에 걸린 경우가 있어 배열로 보존한다. */
export type Survey = {
  kind: string; // "A" | "B(1)" | "B(2)" | "C"
  round: number | null;
  period: string; // "H15年2月"
  period_iso: string; // "2003-02"
  n: number; // 응답자 수 (조사종류에서 역산)
  overall: Rates;
  senior: Rates; // 60歳以上
};

export type Rates = {
  /** 見聞きしたことがある */
  recognition: number;
  /** 意味が分かる ("何となく分かる"는 제외된 엄격한 정의) */
  comprehension: number;
  /** 自分で使ったことがある */
  usage: number;
};

export type GairaigoEntry = {
  /** 조사표 표기 그대로 */
  word: string;
  /** 매칭용 정규화 키 (§normalize) */
  key: string;
  /** 대표값 — 가장 표본이 큰 조사, 동률이면 최신 */
  overall: Rates;
  senior: Rates;
  /** 전체와 60세 이상의 이해율 격차. 클수록 「고령자만 막히는 단어」 */
  senior_gap: number;
  surveys: Survey[];
  source: "NINJAL-gairaigo-teichakudo";
};

/**
 * 조사종류별 표본 수. readme.txt 「3. 外来語定着度調査の詳細」에 근거.
 * 대표값을 고를 때 A(750명)보다 B/C(2100명대)를 우선하기 위해 필요하다.
 */
const SAMPLE_SIZE: Record<string, number> = {
  A: 750,
  "B(1)": 2115,
  "B(2)": 2111,
  C: 2115,
};

/** 和暦 → ISO. 조사시기가 「H15年2月」 형식이다. */
export function waregkiToIso(s: string): string {
  const m = s.match(/^H(\d+)年(\d+)月$/);
  if (!m) return s;
  const year = 1988 + Number(m[1]); // 平成1年 = 1989
  return `${year}-${String(Number(m[2])).padStart(2, "0")}`;
}

/**
 * 매칭용 정규화.
 *
 * 조사표는「アイデンティティ」인데 실제 사이트는「アイデンティティー」라고 쓴다.
 * 「コモン・アジェンダ」의 中黒도 사이트마다 있거나 없다.
 * 이 흔들림을 흡수하지 않으면 사전이 있어도 걸리지 않는다.
 */
export function normalize(s: string): string {
  return s
    .normalize("NFKC") // 半角カタカナ → 全角
    .replace(/[・･\s　]/g, "") // 中黒·공백 제거
    .replace(/ー+$/, "") // 어미 장음 제거: アイデンティティー → アイデンティティ
    .replace(/ヶ/g, "ケ");
}

function parseCsv(text: string): string[][] {
  // 이 CSV에는 따옴표로 감싼 필드가 없다 (검증됨). 단순 분할로 충분하다.
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .map((l) => l.split(","));
}

function rates(a: string, b: string, c: string): Rates {
  return {
    recognition: Number(a),
    comprehension: Number(b),
    usage: Number(c),
  };
}

export function build(): GairaigoEntry[] {
  const buf = readFileSync(SRC_CSV);
  const text = new TextDecoder("shift_jis").decode(buf);
  const rows = parseCsv(text);
  const header = rows.shift();
  if (!header || header[0] !== "調査語") {
    throw new Error(`예상치 못한 헤더: ${header?.slice(0, 3).join(",")}`);
  }

  const byWord = new Map<string, GairaigoEntry>();

  for (const r of rows) {
    const [word, oR, oC, oU, sR, sC, sU, kindRaw, roundRaw, period] = r;
    // 調査種類는 全角英字(Ａ/Ｂ)로 들어온다. NFKC로 반각화해서 SAMPLE_SIZE 키와 맞춘다.
    const kind = kindRaw.normalize("NFKC");
    const n = SAMPLE_SIZE[kind];
    if (n === undefined) throw new Error(`미지의 조사종류: ${kindRaw} (${word})`);

    const survey: Survey = {
      kind,
      round: roundRaw === "" ? null : Number(roundRaw),
      period,
      period_iso: waregkiToIso(period),
      n,
      overall: rates(oR, oC, oU),
      senior: rates(sR, sC, sU),
    };

    const key = normalize(word);
    const existing = byWord.get(key);
    if (existing) {
      existing.surveys.push(survey);
    } else {
      byWord.set(key, {
        word,
        key,
        overall: survey.overall,
        senior: survey.senior,
        senior_gap: 0,
        surveys: [survey],
        source: "NINJAL-gairaigo-teichakudo",
      });
    }
  }

  // 대표값 선정: 표본이 큰 조사 우선, 동률이면 최신.
  // 평균내지 않는 이유 — 조사마다 질문 맥락(C조사는 語別 질문문)이 달라 평균에 의미가 없다.
  for (const e of byWord.values()) {
    const best = [...e.surveys].sort(
      (a, b) => b.n - a.n || b.period_iso.localeCompare(a.period_iso),
    )[0];
    e.overall = best.overall;
    e.senior = best.senior;
    e.senior_gap = Number((best.overall.comprehension - best.senior.comprehension).toFixed(1));
  }

  return [...byWord.values()].sort((a, b) => a.senior.comprehension - b.senior.comprehension);
}

function main() {
  const entries = build();
  writeFileSync(OUT_JSONL, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");

  const multi = entries.filter((e) => e.surveys.length > 1).length;
  const manifest = {
    built_at_note: "재빌드해도 동일 (입력이 고정 CSV)",
    source: {
      name: "国立国語研究所「外来語定着度調査」",
      url: "https://mmsrv.ninjal.ac.jp/gairaigo_yoron/",
      license: "CC BY 4.0",
      license_url: "https://creativecommons.org/licenses/by/4.0/",
      survey_words: 405,
      respondents: "1語あたり750〜2118人",
      population: "全国16歳以上の男女個人",
      sampling: "層化二段無作為抽出法",
      method: "調査員による個別面接聴取法",
      period: "2002-11 〜 2004-08 (平成14年11月〜平成16年8月)",
      definitions: {
        recognition: "「見聞きしたことがある」と答えた人の比率",
        comprehension: "「意味が分かる」と答えた人の比率（「何となく分かる」は含まない）",
        usage: "「自分で使ったことがある」と答えた人の比率",
      },
    },
    entries: entries.length,
    surveys_total: entries.reduce((s, e) => s + e.surveys.length, 0),
    words_surveyed_multiple_times: multi,
    senior_comprehension_under_10: entries.filter((e) => e.senior.comprehension < 10).length,
    senior_comprehension_under_30: entries.filter((e) => e.senior.comprehension < 30).length,
    largest_senior_gap: entries
      .slice()
      .sort((a, b) => b.senior_gap - a.senior_gap)
      .slice(0, 10)
      .map((e) => ({ word: e.word, gap: e.senior_gap })),
  };
  writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

  console.log(`${entries.length}어 / 조사 ${manifest.surveys_total}건 → ${OUT_JSONL}`);
  console.log(`  60세 이상 이해율 10% 미만: ${manifest.senior_comprehension_under_10}어`);
  console.log(`  60세 이상 이해율 30% 미만: ${manifest.senior_comprehension_under_30}어`);
  console.log(`  세대 격차 최대: ${manifest.largest_senior_gap.map((x) => `${x.word}(${x.gap})`).join(" ")}`);
}

if (import.meta.filename === process.argv[1]) main();
