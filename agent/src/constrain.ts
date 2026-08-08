/**
 * 제약 레이어 — 이 파일이 제품이다.
 *
 * RawObservation → Observation.
 * **LLM에게 가는 모든 바이트가 이 함수를 통과한다.** 우회로가 없어야 한다.
 * 우회로가 하나라도 생기면 「연기하는 AI」로 돌아가고, 그건 이미 존재하는 카테고리다.
 *
 * 여기서 하는 일은 전부 뺄셈이다. 아무것도 더하지 않는다.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { mask, type MaskHit, type MaskPolicy } from "../../lexicon/src/mask.ts";
import type { Element, RawObservation } from "./observe.ts";

const PROFILE_DIR = join(import.meta.dirname, "..", "..", "profiles");

export type Profile = {
  id: string;
  version: string;
  label: { ja: string; ko: string };
  purpose: string;
  claims: string;
  does_not_claim: string;
  lexicon: (MaskPolicy & { source?: string }) | null;
  viewport: { width: number; height: number; zoom: number };
  observation: { dom_text: boolean; screenshot: boolean };
  tools: {
    find_in_page: boolean;
    site_search: boolean;
    site_search_input?: string;
    back_limit: number | null;
  };
  patience: { clicks: number; seconds: number };
  variants: Array<Record<string, unknown>>;
};

export function loadProfile(id: string): Profile {
  return JSON.parse(readFileSync(join(PROFILE_DIR, `${id}.json`), "utf8")) as Profile;
}

export function allProfiles(): Profile[] {
  return readdirSync(PROFILE_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(PROFILE_DIR, f), "utf8")) as Profile);
}

/** 에이전트가 실제로 받는 것. RawObservation은 여기서 끝나고 밖으로 나가지 않는다. */
export type Observation = {
  url: string;
  title: string;
  /** dom_text=false인 프로필에서는 null. 스크린샷만으로 판단해야 한다. */
  text: string | null;
  elements: Array<Pick<Element, "index" | "role" | "name" | "in_viewport">>;
  screenshot: Buffer | null;
  scroll: { y: number; height: number };
};

/** 무엇을 왜 가렸는지의 기록. 리포트와 화면의 근거가 된다. */
export type ConstraintTrace = {
  profile: string;
  profile_version: string;
  masked_words: MaskHit[];
  /** 마스킹된 단어가 링크·버튼 라벨 안에 있었던 횟수. 이게 클수록 탐색이 막힌다. */
  masked_in_controls: number;
  dom_text_withheld: boolean;
  elements_total: number;
};

/**
 * 관측을 프로필에 맞게 훼손한다.
 *
 * 마스킹 대상은 두 곳이다:
 *   1) 본문 텍스트 — 「무엇에 대한 페이지인가」를 못 읽게 된다
 *   2) ★ 링크·버튼 라벨 — 「어디를 눌러야 하는가」를 못 정하게 된다
 * 2번이 본질이다. 본문만 가리면 에이전트는 여전히 정확한 링크를 누른다.
 */
export function constrain(raw: RawObservation, p: Profile): { obs: Observation; trace: ConstraintTrace } {
  const hits: MaskHit[] = [];
  let inControls = 0;

  const maskText = (s: string, isControl: boolean): string => {
    if (!p.lexicon) return s;
    const r = mask(s, p.lexicon);
    for (const h of r.hits) {
      if (h.action === "mask" || h.action === "partial" || h.action === "unknown") {
        hits.push(h);
        if (isControl) inControls++;
      }
    }
    return r.text;
  };

  const elements = raw.elements.map((e) => ({
    index: e.index,
    role: e.role,
    name: maskText(e.name, true),
    in_viewport: e.in_viewport,
  }));

  const text = p.observation.dom_text ? maskText(raw.text, false) : null;

  return {
    obs: {
      url: raw.url,
      title: maskText(raw.title, false),
      text,
      elements,
      screenshot: p.observation.screenshot ? raw.screenshot : null,
      scroll: raw.scroll,
    },
    trace: {
      profile: p.id,
      profile_version: p.version,
      masked_words: hits,
      masked_in_controls: inControls,
      dom_text_withheld: !p.observation.dom_text,
      elements_total: raw.elements.length,
    },
  };
}

/**
 * 인내 예산. 「諦めた」 판정은 여기 한 곳에서만 나온다.
 * 이탈률 지표 전체가 이 클래스에 걸려 있으므로 로직이 흩어지면 안 된다.
 */
export class Patience {
  // Node의 타입 스트립 모드는 constructor 파라미터 프로퍼티를 지원하지 않는다.
  // 빌드 스텝을 안 두기로 했으므로 필드를 명시한다.
  clicks = 0;
  readonly startedAt: number;
  readonly limitClicks: number;
  readonly limitSeconds: number;

  constructor(limitClicks: number, limitSeconds: number, now: number) {
    this.limitClicks = limitClicks;
    this.limitSeconds = limitSeconds;
    this.startedAt = now;
  }

  spend() {
    this.clicks++;
  }

  /** 소진 사유. null이면 아직 계속할 수 있다. */
  exhausted(now: number): "clicks" | "time" | null {
    if (this.clicks >= this.limitClicks) return "clicks";
    if ((now - this.startedAt) / 1000 >= this.limitSeconds) return "time";
    return null;
  }

  state(now: number) {
    return {
      clicks: this.clicks,
      clicks_left: this.limitClicks - this.clicks,
      seconds: Math.round((now - this.startedAt) / 1000),
      seconds_left: this.limitSeconds - Math.round((now - this.startedAt) / 1000),
    };
  }
}
