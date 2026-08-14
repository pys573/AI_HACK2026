/**
 * 발표 중인 숫자가 이 변경으로 오염되지 않는가. **모델을 부르지 않는다 = 원가 0.**
 *
 *   npm run overlay:corpus
 *
 * `close_overlay`는 「덮여 있을 때만」 열린다. 그러니 **발표 중인 사이트에서 한 번이라도
 * 켜지면** 그 사이트의 옛 기록과 조건이 달라지고, 사이트 간 비교(渋谷区 4% ↔ 港区 95%)가
 * 근거를 잃는다. 여기서 확인하는 것은 「잘 켜지는가」가 아니라 **「안 켜지는가」**다.
 *
 * ★ 화면 크기를 프로필마다 따로 잰다. 덮개는 좁은 화면에서만 생기는 일이 많아서,
 *   한 크기만 보고 「안 켜진다」고 말하면 그건 확인이 아니라 추측이다.
 *   (250×445에서 東京電力의 채팅 버튼이 나온 것이 F17이다)
 */
import { chromium } from "playwright";
import { observe } from "../src/observe.ts";
import { allProfiles } from "../src/constrain.ts";

const SITES: Array<[string, string]> = [
  ["渋谷区", "https://www.city.shibuya.tokyo.jp/"],
  ["新宿区", "https://www.city.shinjuku.lg.jp/"],
  ["港区", "https://www.city.minato.tokyo.jp/"],
  ["浜松市", "https://www.city.hamamatsu.shizuoka.jp/"],
  ["大泉町", "https://www.town.oizumi.gunma.jp/"],
  ["日本郵便", "https://www.post.japanpost.jp/"],
  ["東京電力EP", "https://www.tepco.co.jp/ep/"],
];

// 프로필들이 실제로 쓰는 화면 크기만 추린다 (중복 제거)
const sizes = new Map<string, { w: number; h: number; who: string[] }>();
for (const p of allProfiles()) {
  const w = Math.round(p.viewport.width / p.viewport.zoom);
  const h = Math.round(p.viewport.height / p.viewport.zoom);
  const k = `${w}x${h}`;
  if (!sizes.has(k)) sizes.set(k, { w, h, who: [] });
  sizes.get(k)!.who.push(p.id);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
let fired = 0;
let checked = 0;

console.log("\n발표 중인 사이트에서 덮개 판정이 켜지는가 (모델 무호출)");
console.log("★ 여기서 🔴가 하나라도 나오면 그 사이트의 옛 기록과 조건이 달라진다\n");

for (const [k, v] of sizes) {
  console.log(`── ${k}  (${v.who.join(", ")})`);
  for (const [name, url] of SITES) {
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, locale: "ja-JP", timeZoneId: "Asia/Tokyo" });
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      // 늦게 뜨는 위젯까지 기다린다. F17의 채팅 버튼은 로드 직후에는 없었다
      await page.waitForTimeout(8000);
      const o = (await observe(page, false)).overlay;
      checked++;
      if (o.covering) fired++;
      console.log(`   ${o.covering ? "🔴" : "⚪️"} ${name}${o.covering ? `  ← 덮임 (닫기 ${o.close_by ?? "없음"})` : ""}`);
    } catch (e) {
      console.log(`   ⚠️  ${name} — ${(e as Error).message.split("\n")[0].slice(0, 60)}`);
    }
    await ctx.close();
    await new Promise((r) => setTimeout(r, 4000)); // 절대규칙 6
  }
}

await browser.close();
console.log(`\n${checked}칸 중 켜진 것 ${fired}칸\n`);
process.exit(fired ? 1 : 0);
