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
import type { Element, RawObservation, ScrollState } from "./observe.ts";

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

/**
 * ★ variant에서 꺼내는 것은 `language_preference` **하나뿐이다.**
 *
 * 프로필 파일의 `variants`에는 patience·entry도 적혀 있지만, 코드가 그것을 읽은 적이
 * 한 번도 없다 (2026-08-13 확인 — `batch.ts`는 `variants`를 「몇 번 반복할까」라는
 * 횟수로만 썼다). 즉 105회의 a와 b는 **다른 조건이 아니라 같은 조건의 반복**이었다.
 *
 * 지금 그것들을 같이 살리면 senior-70s·busy-worker가 105회와 다른 조건이 되고,
 * 사이트 간 비교(渋谷区 0% ↔ 港区 94%)가 근거를 잃는다. 그래서 **일부러 잠들려 둔다.**
 * 살릴 때는 그 프로필을 처음부터 다시 돌려야 한다.
 */
export type VariantSpec = { suffix?: string; language_preference?: string };

export function variantOf(p: Profile, i: number): VariantSpec {
  const v = (p.variants?.[i] ?? {}) as Record<string, unknown>;
  return {
    suffix: typeof v.suffix === "string" ? v.suffix : undefined,
    language_preference: typeof v.language_preference === "string" ? v.language_preference : undefined,
  };
}

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
  /**
   * box는 리플레이 화면 전용이다. `decideUser()`(prompts.ts)는 index/role/name만
   * 문자열로 엮으므로 좌표는 프롬프트에 실리지 않는다 — 모델은 이 값을 못 본다.
   * 실어도 되는 이유가 이것이고, 이 조건이 깨지면 시각 정보를 준 것이 되어 제약이 무너진다.
   */
  elements: Array<Pick<Element, "index" | "role" | "name" | "in_viewport" | "box">>;
  screenshot: Buffer | null;
  /**
   * ★ 여기는 마스킹하지 않고 그대로 통과시킨다. 스크롤 막대는 사이트가 쓴 글이 아니라
   *   브라우저가 그리는 것이라, 어려운 낱말로 가려질 대상이 아니다.
   *   `overflow_x`가 좌우 스크롤이라는 수단의 유일한 열쇠다 (observe.ts `ScrollState`).
   */
  scroll: ScrollState;
};

/** 무엇을 왜 가렸는지의 기록. 리포트와 화면의 근거가 된다. */
export type ConstraintTrace = {
  profile: string;
  profile_version: string;
  /** in_control: 링크·버튼 라벨 안이었는가. 본문만 가려진 것과는 무게가 다르다 */
  masked_words: Array<MaskHit & { in_control: boolean }>;
  /** 마스킹된 단어가 링크·버튼 라벨 안에 있었던 횟수. 이게 클수록 탐색이 막힌다. */
  masked_in_controls: number;
  dom_text_withheld: boolean;
  elements_total: number;
  /** 실제로 에이전트에게 넘어간 요소 수. `elements_total`과의 차이가 「줌」의 실체다. */
  elements_in_viewport: number;
};

/**
 * 관측을 프로필에 맞게 훼손한다.
 *
 * 마스킹 대상은 두 곳이다:
 *   1) 본문 텍스트 — 「무엇에 대한 페이지인가」를 못 읽게 된다
 *   2) ★ 링크·버튼 라벨 — 「어디를 눌러야 하는가」를 못 정하게 된다
 * 2번이 본질이다. 본문만 가리면 에이전트는 여전히 정확한 링크를 누른다.
 */
export function constrain(
  raw: RawObservation,
  p: Profile,
): { obs: Observation; trace: ConstraintTrace; visible: Element[] } {
  const hits: Array<MaskHit & { in_control: boolean }> = [];
  let inControls = 0;

  const maskText = (s: string, isControl: boolean): string => {
    if (!p.lexicon) return s;
    const r = mask(s, p.lexicon);
    for (const h of r.hits) {
      if (h.action === "mask" || h.action === "partial" || h.action === "unknown") {
        hits.push({ ...h, in_control: isControl });
        if (isControl) inControls++;
      }
    }
    return r.text;
  };

  // ★ 화면 밖 요소는 목록에서 지운다. 플래그만 붙여 전부 넘기면 에이전트는
  //   스크롤 없이 페이지 맨 아래 링크를 누를 수 있다. 사람이 겪을 수 없는 경로다.
  //   그 순간 이 도구는 사용성이 아니라 DOM을 측정하게 된다.
  //   여기서 지우는 것이 「줌 200%」의 실체다 — 나머지는 스크롤해야 보인다.
  //
  //   ★ 번호는 0부터 다시 매긴다.
  //   원본 번호를 그대로 두면 [0, 11, 13, 58…]처럼 구멍이 뚫린 목록이 되고,
  //   모델은 없는 번호(6, 7…)를 꽤 자주 만들어낸다. 그건 우리 도구가 만든 잡음이지
  //   제약의 효과가 아니다. 측정하려는 것에 잡음을 섞지 않는다.
  //   원본 요소는 `visible`로 같은 순서로 함께 돌려준다 — act()는 그걸로 되돌아간다.
  const visible = raw.elements.filter((e) => e.in_viewport);

  const elements = visible.map((e, i) => ({
    index: i,
    role: e.role,
    name: maskText(e.name, true),
    in_viewport: true,
    box: e.box,
  }));

  // ★ `raw.text`(페이지 전체)가 아니라 `raw.text_viewport`(지금 화면)를 쓴다.
  //   전체 본문을 주면 조작요소만 뷰포트로 자른 것과 앞뒤가 안 맞는다 — observe.ts 참조.
  const text = p.observation.dom_text ? maskText(raw.text_viewport, false) : null;

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
      elements_in_viewport: visible.length,
    },
    visible,
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
