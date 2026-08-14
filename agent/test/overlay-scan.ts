/**
 * 「보이지 않는 덮개」를 사이트별로 잰다. **LLM 무호출 = 원가 0.**
 *
 * 東京電力EP에서 확인된 것: 로드 60초쯤 뒤 채팅 위젯이 화면 전체를 덮고,
 * observe()는 그걸 못 본다 → 에이전트는 링크를 누른 줄 알지만 덮개를 누르고 있다.
 * 공공 105회가 같은 함정에 빠졌는지가 진짜 문제라서, 같은 조건으로 전 사이트를 훑는다.
 *
 * 조건은 **최악**으로 잡는다: smartphone-novice의 250×445. 화면이 좁을수록 덮개 비율이 크다.
 * 판정: position:fixed/sticky이고 뷰포트의 5% 이상을 덮는 것. **늦게 나타난 것**에 ★를 붙인다.
 * (문턱을 25%로 뒀더니 東京電力EP의 채팅 버튼 225×80=16%가 안 걸렸다. 눌리면 100%가 되는 그 버튼이다)
 */
import { chromium } from "playwright";
import { observe } from "../src/observe.ts";

// 대학 3곳은 배치가 도는 동안 같은 도메인을 두드리지 않기 위해 뺐다 (절대규칙 6).
const SITES: [string, string][] = [
  ["新宿区", "https://www.city.shinjuku.lg.jp/"],
  ["港区", "https://www.city.minato.tokyo.jp/"],
  ["浜松市", "https://www.city.hamamatsu.shizuoka.jp/"],
  ["群馬県大泉町", "https://www.town.oizumi.gunma.jp/"],
  ["渋谷区", "https://www.city.shibuya.tokyo.jp/"],
  ["日本郵便", "https://www.post.japanpost.jp/"],
  ["東京電力EP", "https://www.tepco.co.jp/ep/"],
];
const W = 250, H = 445, AREA = W * H;

const PROBE = `(() => {
  const out = [];
  for (const n of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(n);
    if ((cs.position !== 'fixed' && cs.position !== 'sticky') || cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const r = n.getBoundingClientRect();
    const w = Math.min(innerWidth, r.right) - Math.max(0, r.left);
    const h = Math.min(innerHeight, r.bottom) - Math.max(0, r.top);
    if (w <= 0 || h <= 0) continue;
    const cover = (w * h) / (innerWidth * innerHeight);
    if (cover < 0.05) continue;
    if (out.some(o => n.contains(o.node))) continue;
    out.push({ node: n, tag: n.tagName.toLowerCase() + (typeof n.className === 'string' && n.className.trim() ? '.' + n.className.trim().split(/\\s+/).join('.') : ''),
      cover: Math.round(cover * 100), z: cs.zIndex, pos: cs.position,
      text: (n.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 44) });
  }
  return out.map(o => ({ tag: o.tag, cover: o.cover, z: o.z, pos: o.pos, text: o.text }));
})()`;

const b = await chromium.launch({ channel: "chrome", headless: true });
for (const [name, url] of SITES) {
  const ctx = await b.newContext({ locale: "ja-JP", timeZoneId: "Asia/Tokyo", viewport: { width: W, height: H } });
  const pg = await ctx.newPage();
  try {
    await pg.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await pg.waitForTimeout(4000);
    const early = (await pg.evaluate(PROBE)) as any[];
    await pg.waitForTimeout(62000); // 에이전트가 4手째에 도달하는 시각
    const late = (await pg.evaluate(PROBE)) as any[];
    const raw = await observe(pg, false);
    const names = (raw.elements as any[]).map((e) => (e.name ?? "").replace(/\s+/g, ""));
    console.log(`\n■ ${name}  (요소 ${raw.elements.length}개)`);
    const show = (label: string, arr: any[]) => {
      if (!arr.length) { console.log(`  ${label}: 덮개 없음`); return; }
      for (const o of arr) {
        const key = (o.text || "").replace(/\s+/g, "").slice(0, 10);
        const seen = key.length >= 2 && names.some((n) => n.includes(key));
        console.log(`  ${label}: ${o.late ? "★늦게 나타남 " : ""}${o.tag}  ${o.cover}% z=${o.z} ${o.pos}  「${o.text}」  observe()가 ${seen ? "봄" : "❌ 못 봄"}`);
      }
    };
    const key = (o: any) => o.tag + "|" + o.text;
    const earlyKeys = new Set(early.map(key));
    show("4초 ", early);
    show("66초", late.map((o) => ({ ...o, late: !earlyKeys.has(key(o)) })));
  } catch (e) {
    console.log(`\n■ ${name}  ❌ ${(e as Error).message.split("\n")[0].slice(0, 70)}`);
  }
  await ctx.close();
  await new Promise((r) => setTimeout(r, 4000)); // 절대규칙 6
}
await b.close();
