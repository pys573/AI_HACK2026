/**
 * 어휘 마스킹 엔진 — 이 제품의 심장.
 *
 * 지식베이스는 능력을 *추가*하지, *제거*하지 못한다.
 * md 파일에 「나는 카타카나 외래어를 모른다」고 아무리 써도 기반 LLM은 「ダウンロード」를 안다.
 * 연기는 새어나간다. 필요한 건 덧셈이 아니라 뺄셈이다.
 *
 * 그래서 프롬프트가 아니라 **도구 계층에서 정보를 실제로 훼손**한다.
 * 에이전트에게 넘어가는 텍스트에서 어휘 밖 단어를 ◯로 치환한다.
 * 에이전트는 「모르는 척」하는 게 아니라 **정말로 모르는 상태**가 된다.
 *
 * 마스킹의 근거는 우리 감이 아니라 국립국어연구소 조사다 (gairaigo.ts 참조).
 * 「なぜこの語を隠したのか」에 항상 숫자와 출처로 답할 수 있어야 한다.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalize, type GairaigoEntry } from "./gairaigo.ts";
import type { YasashiiEntry } from "./yasashii.ts";

const DATA = join(import.meta.dirname, "..", "data");
const DEFAULT_DATA = join(DATA, "gairaigo.jsonl");
const DEFAULT_DESIGNATED = join(DATA, "yasashii.jsonl");

/** 카타카나 연속열. 이 안에서만 사전을 찾는다. */
const KATAKANA_RUN = /[ァ-ヺーヽヾ・ｦ-ﾟ]+/g;

export const MASK_CHAR = "◯";

/**
 * 어느 세대의 이해율을 볼 것인가.
 * 조사는 「全体」와 「60歳以上」 두 계열만 제공한다. 없는 세대를 만들어내지 않는다.
 */
export type Cohort = "overall" | "senior";

/**
 * ① 이해율 기반 정책 — 국어연 外来語定着度調査.
 * 데이터가 「이 단어를 아는 사람이 몇 %인가」라서 임계값으로 자를 수 있다.
 */
export type RatePolicy = {
  kind?: "comprehension_rate";
  cohort: Cohort;
  /** 이해율이 이 값 미만이면 마스킹. 프로필이 공개 선언하는 값이다. */
  mask_below: number;
  /**
   * 이해율이 mask_below 이상 partial_below 미만인 「경계역」 처리.
   * null이면 경계역 없음(2단). 숫자면 첫 글자만 남기고 마스킹(3단).
   */
  partial_below: number | null;
  /**
   * 조사에 없는 카타카나어를 어떻게 할 것인가.
   * 기본은 "keep" — 근거 없는 마스킹은 하지 않는다.
   * 근거 있는 것만 가리므로 결과는 항상 **과소평가**다. 그게 방어선이다.
   */
  unknown: "keep" | "mask";
  source?: string;
};

/**
 * ② 명단 기반 정책 — 「やさしい日本語 書き換え例」.
 *
 * 이 데이터에는 % 가 없다. 「이해율 12%」가 아니라 **「정부가 바꿔 쓰라고 지정했다」**는 명단이다.
 * 그러니 임계값이 없다. 실려 있으면 가리고, 없으면 통과시킨다. 그뿐이다.
 * 억지로 % 모델에 끼워넣으면 없는 숫자를 지어내는 것이 되고, 그건 절대규칙 4 위반이다.
 *
 * unknown이 "keep" 고정인 이유:
 *   카타카나는 연속열이라는 자연스러운 경계가 있어서 「미수록어」를 셀 수 있다.
 *   漢語는 그런 경계가 없다 — 형태소 분석기 없이는 무엇이 「단어」인지 모른다.
 *   그러니 미수록어를 가릴 방법이 없고, 세었다고 주장할 수도 없다. 그게 정직한 상태다.
 */
export type ListPolicy = {
  kind: "designated_list";
  list: "yasashii-kakikae-2020";
  unknown: "keep";
  source?: string;
};

/** 프로필의 `lexicon` 블록이 취할 수 있는 값. */
export type MaskPolicy = RatePolicy | ListPolicy;

export type MaskHit = {
  /** 원문에 나타난 표기 */
  surface: string;
  /** 사전 표제어 */
  entry: string | null;
  index: number;
  action: "mask" | "partial" | "keep" | "unknown";
  /**
   * 무엇을 근거로 판단했는가. evidence()가 이걸 보고 문장을 고른다.
   * 근거의 종류가 다르면 할 수 있는 주장도 다르다 — 섞으면 質疑에서 무너진다.
   */
  basis: "comprehension_rate" | "designated_list" | "none";
  /** 이해율 기반일 때의 근거 숫자. 명단 기반에는 없다 (지어내지 않는다). */
  comprehension: number | null;
  recognition: number | null;
  cohort: Cohort | null;
  /** 명단 기반일 때의 근거. 원본의 番号와 やさしい日本語 설명이 그대로 붙는다. */
  listing: { no: number; term: string; meaning: string } | null;
};

export type MaskResult = {
  text: string;
  hits: MaskHit[];
  stats: {
    /** 정책이 검사한 토큰 수. 외래어=카타카나 런의 분절, 명단=명단과 일치한 구간. */
    scanned: number;
    /** 사전에 있던 비율. 낮으면 「근거 없이 통과시킨 단어」가 많다는 뜻이다. */
    in_dictionary: number;
    masked: number;
    partial: number;
  };
};

let cache: Map<string, GairaigoEntry> | null = null;

export function loadLexicon(path = DEFAULT_DATA): Map<string, GairaigoEntry> {
  if (cache) return cache;
  const m = new Map<string, GairaigoEntry>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const e = JSON.parse(line) as GairaigoEntry;
    m.set(e.key, e);
  }
  cache = m;
  return m;
}

/** 테스트에서 사전을 갈아끼우기 위한 훅. */
export function __setLexicon(m: Map<string, GairaigoEntry> | null) {
  cache = m;
}

/** 명단 사전. 표기 → 항목. 한 항목이 여러 표기를 가진다 (yasashii.ts §surfaces). */
export type DesignatedList = {
  id: string;
  bySurface: Map<string, YasashiiEntry>;
  maxLen: number;
};

let designatedCache: DesignatedList | null = null;

export function loadDesignated(path = DEFAULT_DESIGNATED): DesignatedList {
  if (designatedCache) return designatedCache;
  const bySurface = new Map<string, YasashiiEntry>();
  let maxLen = 0;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const e = JSON.parse(line) as YasashiiEntry;
    for (const s of e.surfaces) {
      bySurface.set(s, e);
      if (s.length > maxLen) maxLen = s.length;
    }
  }
  designatedCache = { id: "yasashii-kakikae-2020", bySurface, maxLen };
  return designatedCache;
}

export function __setDesignated(d: DesignatedList | null) {
  designatedCache = d;
}

/** 사전의 최장 표제어 길이. 매칭 상한으로 쓴다. */
function maxKeyLen(lex: Map<string, GairaigoEntry>): number {
  let n = 0;
  for (const k of lex.keys()) if (k.length > n) n = k.length;
  return n;
}

/**
 * 카타카나 런 안에서 최장일치로 표제어를 찾는다.
 *
 * 「オンラインサービス」는 하나의 런이지만 두 단어다.
 * 최장일치가 아니면 「オンライン」이 「オン」에서 끊겨 사전을 못 탄다.
 */
function* segment(
  run: string,
  runIndex: number,
  lex: Map<string, GairaigoEntry>,
  cap: number,
): Generator<{ surface: string; index: number; entry: GairaigoEntry | null }> {
  let i = 0;
  while (i < run.length) {
    let matched: { surface: string; entry: GairaigoEntry } | null = null;
    const limit = Math.min(cap, run.length - i);
    for (let len = limit; len >= 2; len--) {
      const surface = run.slice(i, i + len);
      const e = lex.get(normalize(surface));
      if (e) {
        matched = { surface, entry: e };
        break;
      }
    }
    if (matched) {
      yield { surface: matched.surface, index: runIndex + i, entry: matched.entry };
      i += matched.surface.length;
    } else {
      // 미수록 구간. 런 끝 또는 다음 일치 직전까지를 하나의 미지어로 본다.
      let j = i + 1;
      for (; j < run.length; j++) {
        let hit = false;
        const lim = Math.min(cap, run.length - j);
        for (let len = lim; len >= 2; len--) {
          if (lex.has(normalize(run.slice(j, j + len)))) {
            hit = true;
            break;
          }
        }
        if (hit) break;
      }
      yield { surface: run.slice(i, j), index: runIndex + i, entry: null };
      i = j;
    }
  }
}

function maskOf(surface: string, keepFirst: boolean): string {
  if (!keepFirst) return MASK_CHAR.repeat(surface.length);
  return surface[0] + MASK_CHAR.repeat(surface.length - 1);
}

/**
 * 정책에 따라 텍스트를 훼손한다. **LLM에게 가는 모든 바이트가 여기를 지난다.**
 *
 * 정책은 두 종류고 근거의 성질이 다르다. 어느 쪽이든 히트에는 근거가 붙는다 (evidence()).
 * 근거 없는 히트는 버그다.
 */
export function mask(
  text: string,
  policy: MaskPolicy,
  lex?: Map<string, GairaigoEntry> | DesignatedList,
): MaskResult {
  if (policy.kind === "designated_list") {
    return maskByList(text, policy, (lex as DesignatedList) ?? loadDesignated());
  }
  return maskByRate(text, policy, (lex as Map<string, GairaigoEntry>) ?? loadLexicon());
}

function maskByRate(
  text: string,
  policy: RatePolicy,
  lex: Map<string, GairaigoEntry>,
): MaskResult {
  const cap = maxKeyLen(lex);
  const hits: MaskHit[] = [];
  let out = "";
  let cursor = 0;

  for (const m of text.matchAll(KATAKANA_RUN)) {
    const run = m[0];
    const runIndex = m.index;
    out += text.slice(cursor, runIndex);

    for (const seg of segment(run, runIndex, lex, cap)) {
      const e = seg.entry;
      let action: MaskHit["action"];
      let replaced: string;

      if (!e) {
        action = policy.unknown === "mask" ? "unknown" : "keep";
        replaced = policy.unknown === "mask" ? maskOf(seg.surface, false) : seg.surface;
        hits.push({
          surface: seg.surface,
          entry: null,
          index: seg.index,
          action,
          basis: "none",
          comprehension: null,
          recognition: null,
          cohort: policy.cohort,
          listing: null,
        });
      } else {
        const r = policy.cohort === "senior" ? e.senior : e.overall;
        if (r.comprehension < policy.mask_below) {
          action = "mask";
          replaced = maskOf(seg.surface, false);
        } else if (policy.partial_below !== null && r.comprehension < policy.partial_below) {
          action = "partial";
          replaced = maskOf(seg.surface, true);
        } else {
          action = "keep";
          replaced = seg.surface;
        }
        hits.push({
          surface: seg.surface,
          entry: e.word,
          index: seg.index,
          action,
          basis: "comprehension_rate",
          comprehension: r.comprehension,
          recognition: r.recognition,
          cohort: policy.cohort,
          listing: null,
        });
      }
      out += replaced;
    }
    cursor = runIndex + run.length;
  }
  out += text.slice(cursor);

  return summarize(out, hits);
}

/** ASCII 표기는 낱말 경계를 요구한다. 「EJU」가 「PROJECT」 안에서 걸리면 근거 없는 히트다. */
const ASCII_ONLY = /^[A-Za-z0-9]+$/;
const ASCII_CHAR = /[A-Za-z0-9]/;

function boundaryOk(text: string, i: number, surface: string): boolean {
  if (!ASCII_ONLY.test(surface)) return true;
  const before = i > 0 ? text[i - 1] : "";
  const after = text[i + surface.length] ?? "";
  return !ASCII_CHAR.test(before) && !ASCII_CHAR.test(after);
}

/**
 * 명단 기반 마스킹.
 *
 * 카타카나와 달리 漢語에는 낱말 경계가 없다. 그래서 텍스트 전체를 훑으며 최장일치로 찾는다.
 * 최장일치가 아니면 「介護保険」이 「介護」에서 끊겨 더 짧은 근거로 가려진다.
 *
 * 미수록어를 히트로 남기지 않는 이유:
 *   무엇이 「단어」인지 모르는 채로 「이건 미수록이다」라고 세면 그건 세었다는 거짓말이 된다.
 *   명단에 있는 것만 보고, 나머지는 손대지 않은 채 지나간다 (절대규칙 2).
 */
function maskByList(text: string, policy: ListPolicy, list: DesignatedList): MaskResult {
  if (policy.unknown !== "keep") {
    throw new Error(`명단 정책은 unknown="keep" 뿐이다 (미수록어를 판정할 근거가 없다): ${policy.unknown}`);
  }
  if (policy.list !== list.id) {
    throw new Error(`프로필이 요구한 명단(${policy.list})과 적재된 명단(${list.id})이 다르다`);
  }

  const hits: MaskHit[] = [];
  let out = "";
  let i = 0;

  while (i < text.length) {
    const limit = Math.min(list.maxLen, text.length - i);
    let found: { surface: string; entry: YasashiiEntry } | null = null;
    for (let len = limit; len >= 2; len--) {
      const surface = text.slice(i, i + len);
      const e = list.bySurface.get(surface);
      if (e && boundaryOk(text, i, surface)) {
        found = { surface, entry: e };
        break;
      }
    }
    if (!found) {
      out += text[i];
      i++;
      continue;
    }
    hits.push({
      surface: found.surface,
      entry: found.entry.term,
      index: i,
      action: "mask",
      basis: "designated_list",
      comprehension: null,
      recognition: null,
      cohort: null,
      listing: { no: found.entry.no, term: found.entry.term, meaning: found.entry.meaning },
    });
    out += maskOf(found.surface, false);
    i += found.surface.length;
  }

  return summarize(out, hits);
}

function summarize(text: string, hits: MaskHit[]): MaskResult {
  return {
    text,
    hits,
    stats: {
      scanned: hits.length,
      in_dictionary: hits.filter((h) => h.entry !== null).length,
      masked: hits.filter((h) => h.action === "mask" || h.action === "unknown").length,
      partial: hits.filter((h) => h.action === "partial").length,
    },
  };
}

/**
 * 리포트용 근거 문장. 「なぜ隠したのか」에 대한 답이 항상 붙어다녀야 한다.
 * 이 문장이 화면에 없으면 우리는 그냥 텍스트를 망가뜨린 것이다.
 *
 * 근거의 종류마다 문장이 다르다. 이해율은 숫자를 말하고, 명단은 누가 지정했는지를 말한다.
 * 명단에 「理解率」이라고 쓰면 없는 조사를 있다고 하는 것이 된다.
 */
export function evidence(h: MaskHit): string {
  if (h.basis === "designated_list" && h.listing) {
    return `「${h.listing.term}」『やさしい日本語 書き換え例』(出入国在留管理庁・文化庁 2020) 収録語 No.${h.listing.no}`;
  }
  if (h.entry === null) return `「${h.surface}」調査対象外（根拠なし・マスクせず）`;
  const label = h.cohort === "senior" ? "60歳以上" : "全体";
  return `「${h.entry}」${label}の理解率 ${h.comprehension}%（国立国語研究所 外来語定着度調査）`;
}

/** 「대신 뭐라고 쓰라는 건가」. 명단 히트에만 있다 — 이게 리포트의 개선 제안이 된다. */
export function plainJapanese(h: MaskHit): string | null {
  return h.listing?.meaning ?? null;
}
