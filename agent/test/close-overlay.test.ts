/**
 * 덮개 닫기(`close_overlay`)의 회귀 테스트.
 *
 * `scroll_side`와 같은 종류의 변경이다 — **에이전트에게 수단을 하나 더 준다.**
 * 그래서 위험도 같은 두 방향이다.
 *
 *   1) 열려선 안 될 때 열리면 — 덮이지도 않은 페이지에서 「닫는」 헛수가 나오고,
 *      그게 「제약 때문에 헤맸다」로 집계된다. 우리 도구가 만든 잡음이 계측에 섞인다.
 *   2) **조건이 아닐 때 프롬프트가 한 글자라도 달라지면** — 지금까지의 125회와 같은
 *      조건이라고 말할 수 없게 된다. 사이트끼리의 비교(渋谷区 4% ↔ 港区 95%)가 통째로 무효가 된다.
 *
 * 그래서 아래 첫 묶음은 **옛 문자열을 그대로 박아 두고** 비교한다. 계산해서 맞추면
 * 같이 틀리기 때문에 의미가 없다.
 *
 *   node --test agent/test/close-overlay.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { act, RateLimiter } from "../src/act.ts";
import { allowedKinds, actionSchema, decideUser } from "../src/prompts.ts";
import { toAction } from "../src/decide.ts";

const PROFILE = {
  id: "test",
  version: "1.0",
  tools: { find_in_page: false, site_search: true, back_limit: 5 },
} as never;

const MISSION = { id: "m", intent_ja: "問い合わせ先を知りたい" } as never;

/** 아무것도 안 덮인 화면 = 지금까지의 125회와 같은 상태 */
const CLEAR = {
  url: "https://example.com/",
  title: "見出し",
  text: "本文",
  elements: [{ index: 0, role: "link", name: "引越し", in_viewport: true }],
  scroll: { y: 0, height: 1000, x: 0, width: 640, overflow_x: false },
  overlay: { covering: false, close: null, close_by: null },
} as never;

/** 덮개가 있고 ✕도 찾은 화면 */
const COVERED = {
  ...(CLEAR as unknown as Record<string, unknown>),
  overlay: { covering: true, close: { x: 340, y: 20 }, close_by: "named" },
} as never;

/** 덮개는 있는데 ✕를 못 찾은 화면 — 이것 자체가 사이트에 대한 발견이다 */
const COVERED_NO_X = {
  ...(CLEAR as unknown as Record<string, unknown>),
  overlay: { covering: true, close: null, close_by: null },
} as never;

/** 덮개 판정 도입(2026-08-15) 이전의 관측. 필드가 아예 없다 */
const OLD = {
  ...(CLEAR as unknown as Record<string, unknown>),
  overlay: undefined,
} as never;

// ── 조건이 아닐 때는 전과 완전히 같아야 한다 ──────────────────────

test("안 덮인 화면에서는 낼 수 있는 수가 예전과 똑같다", () => {
  assert.deepEqual(allowedKinds(PROFILE, CLEAR), ["click", "scroll", "give_up", "site_search", "back"]);
});

test("★ obs를 아예 안 넘겨도 예전과 똑같다 — 옛 호출부가 조용히 달라지지 않는다", () => {
  assert.deepEqual(allowedKinds(PROFILE), ["click", "scroll", "give_up", "site_search", "back"]);
});

test("★ 옛 트레이스처럼 overlay가 없으면 열지 않는다 — 「안 덮였다」가 아니라 「안 쟀다」다", () => {
  assert.equal(allowedKinds(PROFILE, OLD).includes("close_overlay"), false);
});

test("★ 안 덮인 화면의 프롬프트에는 겹침에 관한 글자가 하나도 없다", () => {
  const u = decideUser(MISSION, CLEAR, []);
  assert.match(u, /スクロール位置: 0px \/ 全体 1000px\n/);
  assert.equal(u.includes("重な"), false);
});

test("★ 스키마 모양은 덮이든 안 덮이든 완전히 같다 — 칸을 새로 만들지 않았다", () => {
  const shape = (obs: never) => {
    const s = actionSchema(PROFILE, obs) as { properties: Record<string, unknown>; required: string[] };
    return { keys: Object.keys(s.properties).sort(), required: [...s.required].sort() };
  };
  assert.deepEqual(shape(COVERED), shape(CLEAR));
});

test("★ delta 설명은 덮개와 무관하다 — 세로 스크롤 문구가 오염되지 않는다", () => {
  const d = (obs: never) =>
    ((actionSchema(PROFILE, obs).properties as Record<string, { description: string }>).delta).description;
  assert.equal(d(COVERED), "kind=scroll のとき、動かす画面数。1で1画面分下へ、-1で1画面分上へ");
  assert.equal(d(COVERED), d(CLEAR));
});

// ── 덮였을 때만 열린다 ────────────────────────────────────────

test("덮인 화면에서만 close_overlay가 후보에 오른다", () => {
  assert.equal(allowedKinds(PROFILE, COVERED).includes("close_overlay"), true);
  // 나머지 수는 그대로다. 하나 늘어날 뿐 무엇도 사라지지 않는다
  assert.deepEqual(
    allowedKinds(PROFILE, COVERED).filter((k) => k !== "close_overlay"),
    allowedKinds(PROFILE, CLEAR),
  );
});

test("★ ✕를 못 찾아도 수는 연다 — 「닫는 게 없는 사이트」와 「우리가 못 찾은 것」을 구별하려면 눌러 본 기록이 필요하다", () => {
  assert.equal(allowedKinds(PROFILE, COVERED_NO_X).includes("close_overlay"), true);
});

test("덮였을 때는 겹쳐 있다는 사실이 프롬프트에 실린다 — 사람이 눈으로 보는 것과 같은 신호다", () => {
  const u = decideUser(MISSION, COVERED, []);
  assert.match(u, /\n画面に何かが重なっていて、その下のページには触れません\n/);
});

test("★ 무엇이 덮고 있는지·밑에 무엇이 있는지는 말하지 않는다 — 말하면 우리가 제약을 풀어준 게 된다", () => {
  const u = decideUser(MISSION, COVERED, []);
  for (const leak of ["チャット", "モーダル", "ポップアップ", "閉じる", "×", "ボタンがあります"]) {
    assert.equal(u.includes(leak), false, `「${leak}」가 새어 나갔다`);
  }
});

test("★ 덮개의 좌표는 프롬프트에 실리지 않는다 — 좌표를 주면 시각 정보를 준 것이 된다", () => {
  const u = decideUser(MISSION, COVERED, []);
  assert.equal(u.includes("340"), false);
});

// ── 자기가 한 일을 자기 말로 읽을 수 있어야 한다 ────────────────

test("닫으려 한 것은 히스토리에 사람 말로 남는다", () => {
  const u = decideUser(MISSION, COVERED, [
    {
      n: 1,
      action: { kind: "close_overlay", reason_ja: "" },
      landed_title: "画面に重なっていたものを閉じた",
      ok: true,
      changed: false,
    },
  ]);
  assert.match(u, /1\. 画面に重なっていたものを閉じようとした → 画面に重なっていたものを閉じた/);
});

test("모델이 close_overlay를 돌려주면 그대로 살린다", () => {
  const a = toAction({ kind: "close_overlay", index: null, delta: null, query: null, reason_ja: "邪魔なので閉じる" });
  assert.equal(a.kind, "close_overlay");
});

// ── 두 번째 자물쇠 ───────────────────────────────────────────

test("★ 스키마를 뚫고 와도 act()가 막는다 — 안 덮인 화면에서는 닫을 수 없다", async () => {
  // 게이트는 switch 앞에서 걸린다. page에 손이 닿기 전에 돌아오므로 빈 객체로 충분하다.
  const r = await act(
    {} as never,
    { kind: "close_overlay", reason_ja: "" },
    CLEAR,
    [],
    PROFILE,
    "https://example.com",
    new RateLimiter(0),
    0,
  );
  assert.equal(r.ok, false);
  assert.match(r.error!, /덮여 있지 않다/);
});

test("★ 옛 트레이스(overlay 없음)에서도 act()가 막는다", async () => {
  const r = await act(
    {} as never,
    { kind: "close_overlay", reason_ja: "" },
    OLD,
    [],
    PROFILE,
    "https://example.com",
    new RateLimiter(0),
    0,
  );
  assert.equal(r.ok, false);
});

test("★ ✕를 못 찾았으면 실패가 아니라 결과로 남는다 — 우리 도구의 오류로 집계되면 안 된다", async () => {
  const r = await act(
    {} as never,
    { kind: "close_overlay", reason_ja: "" },
    COVERED_NO_X,
    [],
    PROFILE,
    "https://example.com",
    new RateLimiter(0),
    0,
  );
  assert.equal(r.ok, true);
  assert.equal(r.navigated, false);
  assert.match(r.tool_note!, /見つからなかった/);
});
