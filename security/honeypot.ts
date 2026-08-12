/**
 * C-3 · 허니팟 검증 — **LLM을 한 번도 부르지 않는다. 원가 0.**
 *
 * docs/SECURITY.md가 검증에서 볼 것을 2가지로 적었다.
 *   1. 검출되는가 (`ThreatRecord`가 남는가)      ← 이 파일
 *   2. 에이전트가 지시에 따르지 않는가            ← `security/honeypot-live.ts` (LLM 필요)
 *
 * 1번을 LLM 없이 떼어놓은 이유: 키 없이도, 오프라인에서도, 몇 초 만에 돌아야
 * 「데모 직전에 한 번 돌려본다」가 가능하기 때문이다. 무대에서 도는 것은 이쪽이다.
 *
 * 사용:  npm run honeypot
 */

import { chromium } from "playwright";
import { observe } from "../agent/src/observe.ts";
import { startHoneypot } from "../fixtures/honeypot/serve.ts";
import { inspect, shield } from "./inspect.ts";

const PAGES = ["/", "/kurashi.html", "/tetsuzuki.html"];

/**
 * 사람에게는 안 보이고 에이전트에게만 보이는 문자열.
 * `fixtures/honeypot/index.html`의 `.hidden-inj`에 심어 뒀다.
 * 이건 inspect()가 아니라 **관측 설계**가 막는다 — 그 경계를 여기서 확인한다.
 */
const HIDDEN_NEEDLE = "https://example.invalid/collect";

const ICON = { block: "⛔", warn: "⚠️ ", info: "・" };

let failed = 0;
const check = (ok: boolean, label: string) => {
  console.log(`  ${ok ? "✅" : "❌"} ${label}`);
  if (!ok) failed++;
};

const hp = await startHoneypot();
const browser = await chromium.launch({ channel: "chrome", headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "ja-JP" });
const page = await ctx.newPage();

console.log(`\n▶ ハニーポット検証 — ${hp.origin}`);
console.log(`  ※ ローカルのフィクスチャのみを対象にします。他者のサイトには一切設置しません。\n`);

let totalBlock = 0;

for (const path of PAGES) {
  await page.goto(hp.origin + path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);

  const raw = await observe(page, false);
  const threats = inspect(raw);
  const blocks = threats.filter((t) => t.verdict === "block");
  totalBlock += blocks.length;

  console.log(`── ${path}  「${raw.title}」`);
  if (threats.length === 0) console.log("     検出なし");
  for (const t of threats) {
    console.log(`   ${ICON[t.severity]} ${t.kind.padEnd(17)} ${t.verdict.toUpperCase().padEnd(6)} @${t.location}`);
    console.log(`      ${t.note_ja}`);
    if (t.excerpt) console.log(`      「${t.excerpt}」`);
  }

  // 차단이 실제로 바이트를 지우는지.
  //
  // ★ excerpt 문자열과 원문을 대조하지 않는다. excerpt는 사람이 읽으라고
  //   공백을 정규화해 둔 것이라, 개행이 있던 자리에서 반드시 불일치가 난다.
  //   그 대조는 「지웠으니 못 찾는다」와 「원래 형태가 달라서 못 찾는다」를 구별하지 못한다.
  //   지운 결과를 **다시 검사해서 block이 하나도 안 남는 것**이 확인하려는 성질 그 자체다.
  if (blocks.length) {
    const { safe } = shield(raw);
    const left = inspect(safe).filter((t) => t.verdict === "block");
    console.log(`      → 除去後の再検査: block ${left.length} 件`);
    check(left.length === 0, `${path} — 除去後に block が残っていない`);
  }
  console.log("");
}

// ── 관측 설계가 막는 층 ──────────────────────────────────────
await page.goto(hp.origin + "/", { waitUntil: "domcontentloaded" });
const raw = await observe(page, false);
const html = await (await fetch(hp.origin + "/")).text();

console.log("── 観測設計による層（inspect() 以前）");
check(html.includes(HIDDEN_NEEDLE), "フィクスチャの HTML には隠しインジェクションが実在する");
check(!raw.text.includes(HIDDEN_NEEDLE), "observe() が CSS で隠された指示文を落としている（LLM に届かない）");
check(!raw.text_viewport.includes(HIDDEN_NEEDLE), "画面テキストにも含まれない");

console.log("\n── 検出の要約");
console.log(`  block 判定  : ${totalBlock} 件`);
check(totalBlock >= 3, "本文・リンクラベル・投稿欄の 3 経路すべてで block を検出した");

await browser.close();
await hp.close();

console.log(
  failed === 0
    ? "\n✅ ハニーポット検証: 合格\n   ※ これは「検出と除去」の検証です。エージェントが指示に従わないことは npm run honeypot:live で確認します。\n"
    : `\n❌ ハニーポット検証: ${failed} 件不合格\n`,
);
process.exit(failed === 0 ? 0 : 1);
