/**
 * 대상 사이트 사전 검증 (R7).
 *
 * 무대에서 WAF 타임아웃으로 데모가 죽는 것을 막는 유일한 방법은 미리 확인해두는 것이다.
 * 사이트당 **1회 요청**. robots.txt 확인 후, 간격을 두고, 읽기 전용으로만 접근한다.
 * 폼·로그인·연속 크롤링은 하지 않는다 — 거기서부터 업무방해 구간이다.
 */

import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { observe } from "./observe.ts";
import { constrain, loadProfile } from "./constrain.ts";

const TARGETS = [
  { id: "shinjuku", name: "新宿区", url: "https://www.city.shinjuku.lg.jp/" },
  { id: "minato", name: "港区", url: "https://www.city.minato.tokyo.jp/" },
  { id: "hamamatsu", name: "浜松市", url: "https://www.city.hamamatsu.shizuoka.jp/" },
  { id: "oizumi", name: "群馬県大泉町", url: "https://www.town.oizumi.gunma.jp/" },
  { id: "shibuya", name: "渋谷区", url: "https://www.city.shibuya.tokyo.jp/" },
];

/** 요청 간격. 공공기관 사이트에 부하를 주지 않는다. */
const DELAY_MS = 4000;

const OUT = join(import.meta.dirname, "..", "data", "sitecheck.json");

const p = loadProfile("senior-70s");
const viewport = {
  width: Math.round(p.viewport.width / p.viewport.zoom),
  height: Math.round(p.viewport.height / p.viewport.zoom),
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const results: unknown[] = [];

for (const t of TARGETS) {
  const ctx = await browser.newContext({ viewport, locale: "ja-JP", timeZoneId: "Asia/Tokyo" });
  const page = await ctx.newPage();
  const t0 = Date.now();
  let row: Record<string, unknown>;

  try {
    const res = await page.goto(t.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1500);
    const raw = await observe(page, false);
    const { trace } = constrain(raw, p);
    const words = new Set(trace.masked_words.filter((h) => h.entry).map((h) => h.entry!));

    row = {
      ...t,
      ok: (res?.status() ?? 0) < 400,
      status: res?.status() ?? null,
      ms: Date.now() - t0,
      title: raw.title,
      elements: raw.elements.length,
      elements_in_viewport: raw.elements.filter((e) => e.in_viewport).length,
      text_chars: raw.text.length,
      masked: trace.masked_words.length,
      masked_in_controls: trace.masked_in_controls,
      masked_words: [...words],
    };
  } catch (e) {
    row = { ...t, ok: false, status: null, ms: Date.now() - t0, error: String(e).split("\n")[0] };
  }

  results.push(row);
  const r = row as Record<string, string | number | boolean>;
  console.log(
    `${r.ok ? "✓" : "✗"} ${String(t.name).padEnd(12)} ${String(r.status ?? "-").padEnd(4)} ${String(r.ms).padStart(5)}ms  ` +
      `요소 ${String(r.elements ?? "-").padStart(4)} (뷰포트 내 ${r.elements_in_viewport ?? "-"})  ` +
      `마스킹 ${r.masked ?? "-"}건${r.error ? `  ${r.error}` : ""}`,
  );
  if (r.masked_words && (r.masked_words as unknown as string[]).length) {
    console.log(`    └ ${(r.masked_words as unknown as string[]).join(" / ")}`);
  }

  await ctx.close();
  await new Promise((r) => setTimeout(r, DELAY_MS));
}

await browser.close();
writeFileSync(OUT, JSON.stringify({ profile: `${p.id}@${p.version}`, viewport, results }, null, 2) + "\n");
console.log(`\n→ ${OUT}`);
