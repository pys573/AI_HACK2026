/**
 * 덮개 검출기의 실물 확인. **모델을 부르지 않는다 = 원가 0.**
 *
 *   npm run overlay:test
 *
 * `close-overlay.test.ts`가 잠그는 것은 「덮였다고 하면 무슨 일이 일어나는가」다.
 * 여기서 잠그는 것은 그 앞 — **「무엇을 덮였다고 말하는가」** 자체다.
 * 판정은 실제 브라우저 안에서만 나오므로(getComputedStyle·elementFromPoint) 가짜로 못 만든다.
 *
 * 원래는 東京電力 톱으로 확인하려 했다. 그런데 문제의 안내 채팅이 제3자 스크립트라
 * 2026-08-15 그 시각에는 실리지 않았다. **남의 사이트 상태에 검증이 걸려 있으면
 * 무대에서 재현되지 않는다**(절대규칙 7). 그래서 우리 손 안으로 가져왔다 —
 * 다만 `flow-menu`의 수치는 그날 그 페이지에서 실제로 읽은 값 그대로다.
 */
import { chromium } from "playwright";
import { join } from "node:path";
import { observe } from "../src/observe.ts";
import { act, RateLimiter } from "../src/act.ts";
import { constrain, loadProfile } from "../src/constrain.ts";

const DIR = join(import.meta.dirname, "..", "..", "fixtures", "overlay");

type Case = {
  file: string;
  covering: boolean;
  close_by: string | null;
  why: string;
};

const CASES: Case[] = [
  { file: "chat-open.html", covering: true, close_by: "named", why: "채팅이 열려 화면을 덮었다 — 실행에서 실제로 일어난 것" },
  { file: "glyph.html", covering: true, close_by: "glyph", why: "✕가 글자 하나로만 있다" },
  { file: "nameless.html", covering: true, close_by: "corner", why: "이름도 글자도 없고 오른쪽 위에 있다는 것뿐" },
  { file: "no-close.html", covering: true, close_by: null, why: "★ 닫는 수단이 없다 — 우리 실패가 아니라 사이트에 대한 발견이다" },
  { file: "dead-x.html", covering: true, close_by: "named", why: "✕는 있는데 눌러도 안 닫힌다 — 찾는 것과 닫히는 것은 별개다" },
  { file: "sticky-header.html", covering: false, close_by: null, why: "★ 머리띠는 가리지만 막지 않는다. 켜지면 105회가 오염된다" },
  { file: "flow-menu.html", covering: false, close_by: null, why: "★ 東京電力의 실제 메뉴 구조 — 얹힌 게 아니라 페이지가 바뀐 것" },
];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, locale: "ja-JP" });
const page = await ctx.newPage();

let failed = 0;
console.log("\n화면에 얹히는 것 — 검출기 확인 (375x667, 모델 무호출)\n");

for (const c of CASES) {
  await page.goto(`file://${join(DIR, c.file)}`, { waitUntil: "load" });
  const o = (await observe(page, false)).overlay;

  const okCover = o.covering === c.covering;
  const okBy = o.close_by === c.close_by;
  // 「닫기를 찾았다」와 「좌표가 있다」는 항상 같이 가야 한다. 어긋나면 act()가 헛클릭한다
  const okPair = (o.close !== null) === (o.close_by !== null);
  const pass = okCover && okBy && okPair;
  if (!pass) failed++;

  const got = o.covering ? `덮임 · 닫기 ${o.close_by ?? "없음"}` : "안 덮임";
  const want = c.covering ? `덮임 · 닫기 ${c.close_by ?? "없음"}` : "안 덮임";
  console.log(`  ${pass ? "✓" : "✗"} ${c.file.padEnd(20)} ${got.padEnd(18)}${pass ? "" : ` ← 기대: ${want}`}`);
  console.log(`    ${c.why}`);
}

// ── 손까지 대 본다 ──────────────────────────────────────────────
//
// 위 6장은 「무엇을 덮였다고 말하는가」만 봤다. 실제로 **눌러서 없어지는지**는
// 브라우저 안에서 마우스가 움직여야만 확인된다. 단위 테스트는 문지기 앞에서 끝나므로
// 여기가 아니면 이 경로는 한 번도 안 돈 채로 제출된다.
console.log("실제로 눌러서 닫히는가\n");

const PROFILE = loadProfile("senior-70s");
const rl = new RateLimiter(0); // 우리 파일이라 기다릴 이유가 없다

await page.goto(`file://${join(DIR, "chat-open.html")}`, { waitUntil: "load" });
const before = await observe(page, false);
const { visible } = constrain(before, PROFILE);

const r = await act(
  page,
  { kind: "close_overlay", reason_ja: "画面が隠れているので閉じる" },
  before,
  visible,
  PROFILE,
  "file://",
  rl,
  0,
);
const after = await observe(page, false);

// 세 가지가 동시에 맞아야 한다:
//   ① 우리 도구의 오류로 기록되지 않았다 (ok)
//   ② 실제로 덮개가 사라졌다 (브라우저가 답한다)
//   ③ 남긴 말이 실제 결과와 일치한다 — 여기가 어긋나면 트레이스가 거짓말을 한다
const closed = r.ok && !after.overlay.covering && !/まだ/.test(r.tool_note ?? "");
if (!closed) failed++;
console.log(`  ${closed ? "✓" : "✗"} chat-open.html       ok=${r.ok} 덮개=${after.overlay.covering ? "남음" : "사라짐"}  「${r.tool_note ?? r.error}」`);
console.log(`    화면 안 요소 ${before.elements.filter((e) => e.in_viewport).length}개 → ${after.elements.filter((e) => e.in_viewport).length}개`);

// ★ 닫을 것이 없을 때. 「못 찾았다」는 우리 실패가 아니므로 ok로 남아야 한다 —
//   ok:false로 만들면 `signals.ts`가 action_failed로 세고, 사이트의 문제가 우리 문제로 뒤바뀐다
await page.goto(`file://${join(DIR, "no-close.html")}`, { waitUntil: "load" });
const nc = await observe(page, false);
const rn = await act(page, { kind: "close_overlay", reason_ja: "" }, nc, constrain(nc, PROFILE).visible, PROFILE, "file://", rl, 0);
const ncOk = rn.ok && /見つからなかった/.test(rn.tool_note ?? "");
if (!ncOk) failed++;
console.log(`  ${ncOk ? "✓" : "✗"} no-close.html        ok=${rn.ok}  「${rn.tool_note ?? rn.error}」`);
console.log(`    ★ 닫는 것이 없다는 사실이 사이트에 대한 발견으로 남는다 (우리 도구의 오류가 아니다)`);

// ★ ✕를 제대로 찾아 눌렀는데도 안 닫히는 경우. **성공했다고 말하면 안 된다.**
//   여기서 거짓말을 하면 트레이스가 「닫았다」고 적히고, 그 뒤의 헛클릭이 설명 불가능해진다
await page.goto(`file://${join(DIR, "dead-x.html")}`, { waitUntil: "load" });
const dx = await observe(page, false);
const rd = await act(page, { kind: "close_overlay", reason_ja: "" }, dx, constrain(dx, PROFILE).visible, PROFILE, "file://", rl, 0);
const dxOk = rd.ok && /まだ/.test(rd.tool_note ?? "") && (await observe(page, false)).overlay.covering;
if (!dxOk) failed++;
console.log(`  ${dxOk ? "✓" : "✗"} dead-x.html          ok=${rd.ok}  「${rd.tool_note ?? rd.error}」`);
console.log(`    ★ 눌러 본 뒤 다시 재서 사실대로 적는다 — 성공했다고 단정하지 않는다`);

await browser.close();
const total = CASES.length + 3;
console.log(`\n${total - failed}/${total} 통과\n`);
process.exit(failed ? 1 : 0);
