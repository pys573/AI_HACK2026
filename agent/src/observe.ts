/**
 * 관측 레이어 — 페이지에서 「에이전트가 볼 수 있는 것」을 뽑아낸다.
 *
 * 왜 browser-use를 쓰지 않는가:
 *   browser-use의 존재 이유는 관측 품질을 **최대화**하는 것이다.
 *   이 제품의 존재 이유는 관측을 **의도적으로 훼손**하는 것이다. 정면으로 충돌한다.
 *   프레임워크를 쓰면 관측 생성과 LLM 호출 사이에 억지로 끼어들어야 하고,
 *   그 지점은 전부 private API다. 제품의 심장을 남의 내부 구현에 건다는 뜻이다.
 *
 *   그래서 관측은 우리가 만든다. LLM에게 가는 모든 바이트가 constrain()을 통과한다.
 *   대신 조작(actuation)은 Playwright에 맡긴다 — 거기엔 моat가 없다.
 */

import type { Page } from "playwright";

export type Element = {
  /** 에이전트가 액션에서 지정하는 번호 */
  index: number;
  tag: string;
  role: string;
  /** 접근가능한 이름. 이게 마스킹의 주 대상이다. */
  name: string;
  href: string | null;
  box: { x: number; y: number; w: number; h: number };
  /** 뷰포트 안에 보이는가. 스크롤 없이 도달 가능한지의 판단 근거. */
  in_viewport: boolean;
};

export type RawObservation = {
  url: string;
  title: string;
  /**
   * 페이지 전체 텍스트. **에이전트에게 가지 않는다.**
   * judge()가 「거기에 도달했는가」를 재는 데만 쓴다 — 판정은 제약 전의 원본을 봐야 한다.
   */
  text: string;
  /**
   * ★ 지금 화면에 실제로 보이는 텍스트. 에이전트가 받는 것은 이쪽이다.
   *
   * 전체 본문을 주면서 조작요소만 뷰포트로 자르면, 에이전트는 「본문에는 보이는데
   * 누를 수 없는」 상태에 빠져 같은 자리를 맴돈다. 그건 제약의 효과가 아니라
   * 우리 관측이 앞뒤가 안 맞아서 생긴 잡음이다. 측정하려는 것에 잡음을 섞지 않는다.
   */
  text_viewport: string;
  elements: Element[];
  screenshot: Buffer | null;
  scroll: ScrollState;
  /**
   * ★ 페이지가 **스스로 선언한** 언어 (`<html lang="...">`). 영/일 패리티 측정 전용.
   *
   * ⚠️ **에이전트에게는 가지 않는다** (`prompts.ts`의 `decideUser`가 안 엮는다).
   *   주면 「지금 일본어 페이지에 있다」를 공짜로 알려주는 것이 되어, 영어 안내를
   *   찾아냈는지를 재는 계측 자체가 무의미해진다.
   *
   * ⚠️ 이 값은 **사이트의 자기 신고**다. 영어 페이지인데 `lang="ja"`인 사이트가 흔하다.
   *   그래서 이것만으로 「영어 페이지에 도달했다」고 단정하지 않는다 — URL과 함께 본다.
   */
  lang: string;
};

/**
 * 스크롤 상태. 가로가 세로와 대등하게 들어온다.
 *
 * `overflow_x`가 이 파일에서 가장 중요한 한 줄이다. **가로 스크롤이라는 수단을 열지 말지를
 * 이 값 하나가 정한다** (prompts.ts `allowedKinds`). 즉 「사람에게 가로 막대가 보이는가」를
 * 우리가 여기서 판정하고 있다 — 그래서 창 폭과 문서 폭을 그 자리에서 재서 넣는다.
 */
export type ScrollState = {
  y: number;
  height: number;
  x: number;
  width: number;
  /** 문서가 창보다 옆으로 넓은가 = 브라우저가 가로 막대를 띄우는 상태인가 */
  overflow_x: boolean;
};

/**
 * 페이지 안에서 실행되는 추출기.
 *
 * 「눈에 보이는 조작 가능한 것」만 모은다. display:none·aria-hidden·크기 0은 제외한다.
 * 화면에 없는 것을 에이전트에게 주면 사람이 겪을 수 없는 경로를 발견하게 되고,
 * 그 순간 이 도구는 사용성을 측정하는 게 아니라 DOM을 측정하는 게 된다.
 */
const EXTRACT = `() => {
  const SEL = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=menuitem], [onclick], [tabindex]:not([tabindex="-1"])';
  // ★ 관측 중에 페이지가 넘어가면 document.body가 잠깐 null이 된다.
  //   그대로 createTreeWalker에 넘기면 TypeError로 실행 전체가 죽는다.
  //   실측: 2026-08-11 control 실행이 2스텝에서 이렇게 끊겼다. 사이트 탓이 아니라 우리 쪽 경합이다.
  //   빈 관측을 돌려주면 다음 스텝에서 다시 찍는다 — 죽는 것보다 한 스텝 낭비가 싸다.
  if (!document.body) return { url: location.href, title: document.title, text: '', text_viewport: '', elements: [], scroll: { y: 0, height: 0, x: 0, width: 0, overflow_x: false }, lang: '' };
  const vw = window.innerWidth, vh = window.innerHeight;
  const out = [];
  let i = 0;
  for (const el of document.querySelectorAll(SEL)) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;

    // 접근가능한 이름 — 스크린리더가 읽는 것에 가깝게.
    const label =
      el.getAttribute('aria-label') ||
      (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.innerText) ||
      (el.innerText || '').trim() ||
      el.getAttribute('title') ||
      el.querySelector('img')?.getAttribute('alt') ||
      el.getAttribute('value') ||
      el.getAttribute('placeholder') ||
      '';

    out.push({
      index: i++,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || (el.tagName === 'A' ? 'link' : el.tagName === 'BUTTON' ? 'button' : el.tagName.toLowerCase()),
      name: label.replace(/\\s+/g, ' ').trim().slice(0, 120),
      href: el.getAttribute('href'),
      box: { x: Math.round(r.x), y: Math.round(r.y + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) },
      in_viewport: r.top < vh && r.bottom > 0 && r.left < vw && r.right > 0,
    });
  }
  // 화면에 보이는 텍스트만 따로 모은다.
  // Range로 텍스트 노드 자체의 위치를 잰다 — 부모 요소 박스로 재면 긴 단락이
  // 화면 밖에서도 통째로 「보인다」가 되어버린다.
  const seen = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const s = (node.nodeValue || '').replace(/\\s+/g, ' ').trim();
    if (!s) continue;
    const parent = node.parentElement;
    if (!parent) continue;
    if (parent.closest('script, style, noscript, [aria-hidden="true"]')) continue;
    const pcs = getComputedStyle(parent);
    if (pcs.display === 'none' || pcs.visibility === 'hidden' || pcs.opacity === '0') continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const tr = range.getBoundingClientRect();
    if (tr.width < 1 && tr.height < 1) continue;
    // 한 줄이라도 걸치면 포함한다. 오차는 「더 보여주는」 쪽으로 낸다 (절대규칙 2).
    if (!(tr.top < vh && tr.bottom > 0 && tr.left < vw && tr.right > 0)) continue;
    seen.push(s);
  }

  return {
    text: (document.body.innerText || '').replace(/\\n{3,}/g, '\\n\\n').trim(),
    text_viewport: seen.join('\\n'),
    elements: out,
    scroll: {
      y: Math.round(window.scrollY),
      height: Math.round(document.body.scrollHeight),
      x: Math.round(window.scrollX),
      // 가로는 body가 아니라 documentElement로 잰다. 넘치는 자식이 있어도 body 자신은
      // 창 폭 그대로인 경우가 흔해서, body로 재면 「잘리지 않았다」로 잘못 나온다.
      width: Math.round(document.documentElement.scrollWidth),
      // +2px은 소수점 반올림 여유다. 1px 차이로 가로 스크롤을 열면 모델은 옆으로 밀고
      // 아무 일도 안 일어난다 — 그 헛수고가 「제약 때문에 헤맸다」로 집계된다.
      // 우리 도구가 만든 잡음을 측정값에 섞지 않는다.
      overflow_x: document.documentElement.scrollWidth > window.innerWidth + 2,
    },
    // 사이트의 자기 신고. 앞 2글자만 본다 ('en-US'와 'en'을 같은 것으로 세기 위해)
    lang: (document.documentElement.getAttribute('lang') || '').trim().toLowerCase(),
  };
}`;

export async function observe(page: Page, withScreenshot = true): Promise<RawObservation> {
  // 문자열을 넘기면 Playwright는 *식*으로 평가한다. 즉시 호출로 감싸지 않으면
  // 함수 객체 자체가 직렬화 대상이 되어 undefined가 돌아온다.
  const r = (await page.evaluate(`(${EXTRACT})()`)) as {
    text: string;
    text_viewport: string;
    elements: Element[];
    scroll: ScrollState;
    lang: string;
  };
  return {
    url: page.url(),
    title: await page.title(),
    text: r.text,
    text_viewport: r.text_viewport,
    elements: r.elements,
    scroll: r.scroll,
    lang: r.lang ?? "",
    screenshot: withScreenshot ? await page.screenshot({ type: "png" }) : null,
  };
}
