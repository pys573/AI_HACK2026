/**
 * 좌우 스크롤(`scroll_side`)의 회귀 테스트.
 *
 * 이 기능은 **에이전트에게 수단을 하나 더 주는** 변경이다. 그래서 위험이 두 방향으로 있다.
 *
 *   1) 열려선 안 될 때 열리면 — 옆으로 잘리지도 않은 페이지에서 옆으로 미는 헛수는
 *      「제약 때문에 헤맸다」로 집계된다. 우리 도구가 만든 잡음이 계측에 섞인다.
 *   2) **조건이 아닐 때 프롬프트가 한 글자라도 달라지면** — 지금까지의 105회와 같은
 *      조건이라고 말할 수 없게 된다. 「전과 같은 에이전트인가」에 답을 못 하면
 *      사이트끼리의 비교(渋谷区 0% ↔ 港区 94%)가 통째로 무효가 된다.
 *
 * 그래서 아래 첫 묶음은 **옛 문자열을 그대로 박아 두고** 비교한다. 계산해서 맞추면
 * 같이 틀리기 때문에 의미가 없다.
 *
 *   node --test agent/test/scroll-side.test.ts
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

/** 옆으로 안 잘린 화면 = 지금까지의 105회와 같은 상태 */
const FLAT = {
  url: "https://example.com/",
  title: "見出し",
  text: "本文",
  elements: [{ index: 0, role: "link", name: "引越し", in_viewport: true }],
  scroll: { y: 0, height: 1000, x: 0, width: 640, overflow_x: false },
} as never;

/** 옆으로 잘린 화면 = 줌 200%로 창이 좁아져 오른쪽 끝이 나간 상태 */
const CUT = {
  ...(FLAT as unknown as Record<string, unknown>),
  scroll: { y: 0, height: 1000, x: 0, width: 1280, overflow_x: true },
} as never;

/** 좌우 스크롤 도입(2026-08-13) 이전의 관측. 세 필드가 아예 없다 */
const OLD = {
  ...(FLAT as unknown as Record<string, unknown>),
  scroll: { y: 0, height: 1000 },
} as never;

const deltaDesc = (obs: never) =>
  ((actionSchema(PROFILE, obs).properties as Record<string, { description: string }>).delta).description;

// ── 조건이 아닐 때는 전과 완전히 같아야 한다 ──────────────────────

test("옆으로 안 잘린 화면에서는 낼 수 있는 수가 예전과 똑같다", () => {
  assert.deepEqual(allowedKinds(PROFILE, FLAT), ["click", "scroll", "give_up", "site_search", "back"]);
});

test("★ obs를 아예 안 넘겨도 예전과 똑같다 — 옛 호출부가 조용히 달라지지 않는다", () => {
  assert.deepEqual(allowedKinds(PROFILE), ["click", "scroll", "give_up", "site_search", "back"]);
});

test("★ 옛 트레이스처럼 overflow_x가 없으면 열지 않는다 — 「안 잘렸다」가 아니라 「안 쟀다」다", () => {
  assert.equal(allowedKinds(PROFILE, OLD).includes("scroll_side"), false);
});

test("옆으로 안 잘린 화면의 delta 설명은 예전 문자열 그대로다", () => {
  assert.equal(deltaDesc(FLAT), "kind=scroll のとき、動かす画面数。1で1画面分下へ、-1で1画面分上へ");
});

test("★ 옆으로 안 잘린 화면의 프롬프트에는 가로 줄이 한 글자도 없다", () => {
  const u = decideUser(MISSION, FLAT, []);
  assert.match(u, /スクロール位置: 0px \/ 全体 1000px\n/);
  assert.equal(u.includes("横"), false);
});

// ── 잘렸을 때만 열린다 ────────────────────────────────────────

test("옆으로 잘린 화면에서만 scroll_side가 후보에 오른다", () => {
  assert.equal(allowedKinds(PROFILE, CUT).includes("scroll_side"), true);
  // 나머지 수는 그대로다. 하나 늘어날 뿐 무엇도 사라지지 않는다
  assert.deepEqual(
    allowedKinds(PROFILE, CUT).filter((k) => k !== "scroll_side"),
    allowedKinds(PROFILE, FLAT),
  );
});

test("잘렸을 때는 delta 설명이 가로도 함께 말한다", () => {
  assert.match(deltaDesc(CUT), /kind=scroll_side のときは横で、1で1画面分右へ、-1で1画面分左へ/);
});

test("★ delta의 형태(enum)는 어느 쪽이든 같다 — 스키마 모양 자체는 안 바뀐다", () => {
  const en = (obs: never) =>
    (actionSchema(PROFILE, obs).properties as Record<string, { enum: unknown[] }>).delta.enum;
  assert.deepEqual(en(CUT), en(FLAT));
});

test("잘렸을 때는 가로 위치가 프롬프트에 실린다 — 가로 막대가 보이는 것과 같은 신호다", () => {
  const u = decideUser(MISSION, CUT, []);
  assert.match(u, /横のスクロール位置: 0px \/ 全体 1280px（このページは画面の幅に収まっていません。/);
});

test("★ 잘린 쪽에 무엇이 있는지는 말하지 않는다 — 말하면 우리가 제약을 풀어준 게 된다", () => {
  const u = decideUser(MISSION, CUT, []);
  // 관측에 없는 요소의 이름이 프롬프트에 새어 나가면 안 된다
  for (const leak of ["お問い合わせ", "リンクがあります", "ボタンがあります"]) {
    assert.equal(u.includes(leak), false, `「${leak}」가 새어 나갔다`);
  }
});

// ── 자기가 한 일을 자기 말로 읽을 수 있어야 한다 ────────────────

test("가로로 민 것은 히스토리에 右／左로 남는다", () => {
  const hist = (delta: number) =>
    decideUser(MISSION, CUT, [
      { n: 1, action: { kind: "scroll_side", delta, reason_ja: "" }, landed_title: "見出し", ok: true, changed: false },
    ]);
  assert.match(hist(1), /1\. 右にスクロールした/);
  assert.match(hist(-1), /1\. 左にスクロールした/);
});

test("모델이 scroll_side를 돌려주면 그대로 살린다", () => {
  const a = toAction({ kind: "scroll_side", index: null, delta: 2, query: null, reason_ja: "右を見る" });
  assert.equal(a.kind, "scroll_side");
  assert.equal(a.delta, 2);
});

// ── 두 번째 자물쇠 ───────────────────────────────────────────

test("★ 스키마를 뚫고 와도 act()가 막는다 — 안 잘린 화면에서는 옆으로 못 민다", async () => {
  // 게이트는 switch 앞에서 걸린다. page에 손이 닿기 전에 돌아오므로 빈 객체로 충분하다.
  const page = {} as never;
  const r = await act(
    page,
    { kind: "scroll_side", delta: 1, reason_ja: "" },
    FLAT,
    [],
    PROFILE,
    "https://example.com",
    new RateLimiter(0),
    0,
  );
  assert.equal(r.ok, false);
  assert.match(r.error!, /옆으로 잘려 있지 않다/);
});
