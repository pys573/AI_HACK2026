/**
 * 사전 검증 프로브 — R7(WAF 통과) + R8(관측 개입 가능성)을 한 번에 확인한다.
 *
 * 하는 일: 공개 페이지 1장을 열고, 관측을 뽑고, 제약을 걸어 before/after를 인쇄한다.
 * 하지 않는 일: 폼 제출, 로그인, 회원가입, 연속 크롤링. 읽기 전용 · 1페이지.
 *
 * 사용: node agent/src/probe.ts <url> [profile-id]
 */

import { chromium, type Browser } from "playwright";
import { observe } from "./observe.ts";
import { constrain, loadProfile, type Profile } from "./constrain.ts";
import { evidence } from "../../lexicon/src/mask.ts";

/**
 * 줌은 CSS 뷰포트를 좁히는 것과 같다.
 * 200% 줌 = 1280px 화면에 640px 분량만 들어온다. 고령자 설정의 핵심은 이 정보량 감소다.
 */
function viewportFor(p: Profile) {
  return {
    width: Math.round(p.viewport.width / p.viewport.zoom),
    height: Math.round(p.viewport.height / p.viewport.zoom),
  };
}

async function run(url: string, profileId: string) {
  const p = loadProfile(profileId);
  let browser: Browser | null = null;

  try {
    // 시스템에 설치된 실제 Chrome을 쓴다 (channel).
    // Playwright 번들 chromium은 지문이 달라 공공기관 WAF에 걸리기 쉽다 (R7).
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const ctx = await browser.newContext({
      viewport: viewportFor(p),
      locale: "ja-JP",
      timeZoneId: "Asia/Tokyo",
    });
    const page = await ctx.newPage();

    const t0 = Date.now();
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1500); // 지연 렌더 대기. 급하게 긁지 않는다.
    const ms = Date.now() - t0;

    console.log(`\n[R7] HTTP ${res?.status()}  ${ms}ms  ${page.url()}`);
    console.log(`     viewport ${JSON.stringify(viewportFor(p))} (zoom ${p.viewport.zoom}x)`);

    const raw = await observe(page, p.observation.screenshot);
    const { obs, trace } = constrain(raw, p);

    console.log(`\n[R8] 관측 → 제약 파이프라인`);
    console.log(`     제목        : ${raw.title}`);
    console.log(`     조작요소    : ${raw.elements.length}개 (뷰포트 내 ${raw.elements.filter((e) => e.in_viewport).length}개)`);
    console.log(`     본문        : ${raw.text.length}자`);
    console.log(`     스크린샷    : ${raw.screenshot ? `${Math.round(raw.screenshot.length / 1024)}KB` : "없음"}`);

    console.log(`\n[제약] ${p.id} v${p.version} — ${p.label.ja}`);
    console.log(`     마스킹      : ${trace.masked_words.length}건 (그중 링크·버튼 라벨 안 ${trace.masked_in_controls}건)`);
    console.log(`     본문 차단   : ${trace.dom_text_withheld ? "예 (스크린샷만)" : "아니오"}`);

    // 라벨이 실제로 훼손됐는지 — 여기가 안 되면 제품이 없다.
    const changed = raw.elements
      .map((e, i) => ({ before: e.name, after: obs.elements[i].name }))
      .filter((x) => x.before !== x.after);

    console.log(`\n[before → after] 라벨이 바뀐 조작요소 ${changed.length}개`);
    for (const c of changed.slice(0, 12)) {
      console.log(`     ${c.before}`);
      console.log(`  →  ${c.after}`);
    }

    const uniq = new Map<string, (typeof trace.masked_words)[number]>();
    for (const h of trace.masked_words) if (h.entry) uniq.set(h.entry, h);
    console.log(`\n[근거] 가린 단어 ${uniq.size}종`);
    for (const h of [...uniq.values()].sort((a, b) => (a.comprehension ?? 0) - (b.comprehension ?? 0))) {
      console.log(`     ${evidence(h)}`);
    }
  } finally {
    await browser?.close();
  }
}

const [url, profileId = "senior-70s"] = process.argv.slice(2);
if (!url) {
  console.error("사용법: node agent/src/probe.ts <url> [profile-id]");
  process.exit(1);
}
await run(url, profileId);
