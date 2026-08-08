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

const DEFAULT_DATA = join(import.meta.dirname, "..", "data", "gairaigo.jsonl");

/** 카타카나 연속열. 이 안에서만 사전을 찾는다. */
const KATAKANA_RUN = /[ァ-ヺーヽヾ・ｦ-ﾟ]+/g;

export const MASK_CHAR = "◯";

/**
 * 어느 세대의 이해율을 볼 것인가.
 * 조사는 「全体」와 「60歳以上」 두 계열만 제공한다. 없는 세대를 만들어내지 않는다.
 */
export type Cohort = "overall" | "senior";

export type MaskPolicy = {
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
};

export type MaskHit = {
  /** 원문에 나타난 표기 */
  surface: string;
  /** 사전 표제어 */
  entry: string | null;
  index: number;
  action: "mask" | "partial" | "keep" | "unknown";
  /** 판단 근거. null이면 사전 미수록. */
  comprehension: number | null;
  recognition: number | null;
  cohort: Cohort;
};

export type MaskResult = {
  text: string;
  hits: MaskHit[];
  stats: {
    katakana_tokens: number;
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

export function mask(
  text: string,
  policy: MaskPolicy,
  lex: Map<string, GairaigoEntry> = loadLexicon(),
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
          comprehension: null,
          recognition: null,
          cohort: policy.cohort,
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
          comprehension: r.comprehension,
          recognition: r.recognition,
          cohort: policy.cohort,
        });
      }
      out += replaced;
    }
    cursor = runIndex + run.length;
  }
  out += text.slice(cursor);

  const inDict = hits.filter((h) => h.entry !== null).length;
  return {
    text: out,
    hits,
    stats: {
      katakana_tokens: hits.length,
      in_dictionary: inDict,
      masked: hits.filter((h) => h.action === "mask" || h.action === "unknown").length,
      partial: hits.filter((h) => h.action === "partial").length,
    },
  };
}

/**
 * 리포트용 근거 문장. 「なぜ隠したのか」에 대한 답이 항상 붙어다녀야 한다.
 * 이 문장이 화면에 없으면 우리는 그냥 텍스트를 망가뜨린 것이다.
 */
export function evidence(h: MaskHit): string {
  if (h.entry === null) return `「${h.surface}」調査対象外（根拠なし・マスクせず）`;
  const label = h.cohort === "senior" ? "60歳以上" : "全体";
  return `「${h.entry}」${label}の理解率 ${h.comprehension}%（国立国語研究所 外来語定着度調査）`;
}
