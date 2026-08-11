/**
 * detectSignals()의 회귀 테스트.
 *
 * 이 파일이 지키는 것은 코드가 아니라 **주장**이다.
 * 리포트에 실리는 숫자·심각도·제외 판정은 전부 signals.ts가 만든다.
 * 여기가 조용히 바뀌면 「이 숫자 어디서 나왔나요」에 답할 수 없다 (절대규칙 4).
 *
 * 아래 케이스는 전부 **실제 트레이스에서 관측된 상황**을 최소 형태로 줄인 것이다.
 *   npm run agent:test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectSignals, MAX_SIGNALS } from "../src/signals.ts";
import type { RunTrace, Step } from "../../core/types.ts";

const URL_A = "https://example.jp/a";
const URL_B = "https://example.jp/b";

function step(n: number, o: Partial<Step> & { url?: string; total?: number; inView?: number } = {}): Step {
  const { url = URL_A, total = 100, inView = 50, ...rest } = o;
  return {
    n,
    seen: { url, title: "t", text: "", elements: [], scroll: { y: 0, height: 1000 } },
    constraint: { elements_total: total, elements_in_viewport: inView, chars_before: 0, chars_after: 0, masked: [], masked_in_controls: 0 },
    action: null,
    action_ok: true,
    action_error: null,
    ...rest,
  } as Step;
}

const scroll = (n: number, delta: number, o: Parameters<typeof step>[1] = {}) =>
  step(n, { ...o, action: { kind: "scroll", delta, index: null, query: null, reason_ja: "" } } as never);

const click = (n: number, index: number, o: Parameters<typeof step>[1] = {}) =>
  step(n, { ...o, action: { kind: "click", delta: null, index, query: null, reason_ja: "" } } as never);

function trace(steps: Step[], v: Partial<RunTrace["verdict"]> = {}): RunTrace {
  return {
    run_id: "r",
    profile_id: "p",
    profile_version: "v0",
    created_at: "2026-08-11T00:00:00.000Z",
    mission: { id: "m", intent_ja: "用事", start_url: URL_A, success_ja: "" },
    steps,
    verdict: { reached: true, outcome: "reached", clicks: 0, seconds: 10, reason_ja: "ok", ...v },
    findings: [],
    cost: { total_usd: 0, by_model: {}, calls: 0 },
  } as unknown as RunTrace;
}

const kinds = (t: RunTrace) => detectSignals(t).signals.map((s) => s.kind);
const find = (t: RunTrace, k: string) => detectSignals(t).signals.find((s) => s.kind === k);

// ── revisit ─────────────────────────────────────────────────
// 연속 체류를 주회로 세면 스크롤한 모든 페이지가 「돌아왔다」가 된다

test("같은 URL에 연속으로 머문 것은 주회가 아니다", () => {
  assert.deepEqual(kinds(trace([step(1), step(2), step(3)])), []);
});

test("떠났다가 돌아오면 주회다. 첫 방문은 낭비에 넣지 않는다", () => {
  const s = find(trace([step(1), step(2, { url: URL_B }), step(3), step(4)]), "revisit")!;
  assert.equal(s.wasted_steps, 2); // 3·4만. 1은 첫 방문이다
  assert.equal(s.severity, "medium");
});

// ── scroll_run ──────────────────────────────────────────────

test("스크롤 2회는 신호가 아니다 (내려보는 중이다)", () => {
  assert.equal(kinds(trace([scroll(1, 1), scroll(2, 1)])).includes("scroll_run"), false);
});

test("스크롤 6회 이상이면 그 페이지에 찾는 것이 없다 → high", () => {
  const t = trace([1, 2, 3, 4, 5, 6].map((n) => scroll(n, 1)));
  assert.equal(find(t, "scroll_run")!.severity, "high");
});

test("페이지가 바뀌면 스크롤 연속이 끊긴다", () => {
  const t = trace([scroll(1, 1), scroll(2, 1), scroll(3, 1, { url: URL_B })]);
  assert.equal(kinds(t).includes("scroll_run"), false);
});

test("위로 되돌아간 스크롤은 「지나쳤다」로 근거에 남는다", () => {
  const t = trace([scroll(1, 1), scroll(2, 1), scroll(3, -1)]);
  assert.match(find(t, "scroll_run")!.evidence.join(), /通り過ぎた/);
});

// ── viewport_starved ────────────────────────────────────────

test("스크롤이 없었던 페이지는 화면 부족으로 세지 않는다", () => {
  // 화면에 안 들어왔어도 스크롤 없이 끝났다면 그건 걸림이 아니다
  assert.equal(kinds(trace([step(1, { total: 100, inView: 3 })])).includes("viewport_starved"), false);
});

test("심각도는 낭비 스텝이 아니라 차단 비율로 낸다", () => {
  const mk = (inView: number) => trace([scroll(1, 1, { total: 100, inView }), scroll(2, 1), scroll(3, 1)]);
  assert.equal(find(mk(3), "viewport_starved")!.severity, "high"); // 3%
  assert.equal(find(mk(8), "viewport_starved")!.severity, "medium"); // 8%
  assert.equal(find(mk(50), "viewport_starved"), undefined); // 50% — 걸림이 아니다
});

test("화면 부족은 실행당 가장 심한 곳 하나만 낸다", () => {
  const t = trace([scroll(1, 1, { inView: 3 }), scroll(2, 1, { inView: 5 }), scroll(3, 1, { inView: 4 })]);
  const only = detectSignals(t).signals.filter((s) => s.kind === "viewport_starved");
  assert.equal(only.length, 1);
  assert.equal(only[0].step_n, 1);
});

// ── masked_control ──────────────────────────────────────────

const masked = (surface: string) => ({
  surface,
  in_control: true,
  basis: "comprehension_rate" as const,
  comprehension: 7.8,
  cohort: "senior" as const,
});

test("같은 말이 여러 화면에 걸쳐도 신호는 하나다", () => {
  // 실측: 스텝마다 내면 「サイト」 4줄이 리포트를 채우고 진짜 신호가 잘려나갔다
  const m = { constraint: { elements_total: 100, elements_in_viewport: 50, chars_before: 0, chars_after: 0, masked: [masked("サイト")], masked_in_controls: 1 } };
  const t = trace([step(1, m as never), step(2, m as never), step(3, m as never)]);
  const only = detectSignals(t).signals.filter((s) => s.kind === "masked_control");
  assert.equal(only.length, 1);
  assert.match(only[0].evidence[0], /3画面/);
});

test("가려진 라벨을 그대로 눌렀으면 그 화면은 세지 않는다 — 장벽이 아니라 반증이다", () => {
  const s = click(1, 0, {
    constraint: { elements_total: 100, elements_in_viewport: 50, chars_before: 0, chars_after: 0, masked: [masked("サイト")], masked_in_controls: 1 },
  } as never);
  s.seen.elements = [{ index: 0, tag: "a", name: "◯◯◯マップ", role: null }] as never;
  assert.equal(kinds(trace([s])).includes("masked_control"), false);
});

test("어휘는 인과를 주장하지 않는다 → high로 올라가지 않는다", () => {
  const m = { constraint: { elements_total: 100, elements_in_viewport: 50, chars_before: 0, chars_after: 0, masked: [masked("サイト")], masked_in_controls: 1 } };
  const t = trace([step(1, m as never), step(2, m as never), step(3, m as never), step(4, m as never)]);
  assert.equal(find(t, "masked_control")!.severity, "medium");
});

// ── 계측 고장 분리 ───────────────────────────────────────────
// 여기가 이 파일에서 제일 중요하다. 우리 고장을 사이트 탓으로 실으면 페이크다 (절대규칙 3)

test("우리 파서가 낸 실패는 리포트에서 빠지고, 뺐다는 사실은 남는다", () => {
  const t = trace([step(1, { action: { kind: "", delta: null, index: null, query: null, reason_ja: "" }, action_ok: false, action_error: "알 수 없는 액션: " } as never)]);
  const r = detectSignals(t);
  assert.deepEqual(r.signals, []);
  assert.equal(r.ours.length, 1);
  assert.equal(r.ours[0].ours, "모델이 스키마 밖 action을 냈다");
});

test("우리 크래시로 끊긴 실행은 「到達できなかった」로 세지 않는다", () => {
  // 未到達率은 발표 슬라이드에 그대로 올라간다. 우리가 못 잰 것을 섞으면 그 숫자가 부푼다
  const t = trace([step(1)], { reached: false, outcome: "error", reason_ja: "実行が中断した: page.evaluate: TypeError: Failed to execute 'createTreeWalker'" });
  const r = detectSignals(t);
  assert.equal(r.signals.length, 0);
  assert.equal(r.ours[0].kind, "unreached");
});

test("사이트 때문에 도달 못 한 것은 그대로 high로 남는다", () => {
  const t = trace([step(1)], { reached: false, outcome: "max_steps", reason_ja: "一覧ページであり詳細に到達していない" });
  assert.equal(find(t, "unreached")!.severity, "high");
});

test("심판 사유가 길면 자르되 잘랐다고 적는다", () => {
  const t = trace([step(1)], { reached: false, outcome: "max_steps", reason_ja: "あ".repeat(500) });
  const e = find(t, "unreached")!.evidence.join();
  assert.match(e, /以下略/);
  assert.equal(e.length < 400, true);
});

// ── 정렬·상한 ────────────────────────────────────────────────

test("심각한 순으로 나온다 — 앞에서 잘려도 중요한 게 남는다", () => {
  const t = trace(
    [scroll(1, 1, { inView: 3 }), scroll(2, 1), scroll(3, 1)],
    { reached: false, outcome: "max_steps", reason_ja: "詳細に到達していない" },
  );
  const s = detectSignals(t).signals;
  assert.equal(s[0].kind, "unreached"); // high
  assert.equal(s.every((x, i) => i === 0 || x.severity !== "high" || s[i - 1].severity === "high"), true);
});

test("상한을 넘으면 개수를 돌려준다 — 조용히 자르지 않는다", () => {
  const many = Array.from({ length: MAX_SIGNALS + 3 }, (_, i) => ({
    surface: `語${i}`,
    in_control: true,
    basis: "comprehension_rate" as const,
    comprehension: 5,
    cohort: "senior" as const,
  }));
  const t = trace([step(1, { constraint: { elements_total: 100, elements_in_viewport: 50, chars_before: 0, chars_after: 0, masked: many, masked_in_controls: many.length } } as never)]);
  const r = detectSignals(t);
  assert.equal(r.signals.length, MAX_SIGNALS);
  assert.equal(r.dropped, 3);
});

test("같은 트레이스는 몇 번을 돌려도 같은 결과다", () => {
  // 실행 간 비교가 성립하려면 검출이 결정적이어야 한다. LLM을 부르지 않는 이유가 이것이다
  const t = trace([scroll(1, 1, { inView: 3 }), scroll(2, 1), scroll(3, 1), step(4, { url: URL_B }), step(5)]);
  assert.equal(JSON.stringify(detectSignals(t)), JSON.stringify(detectSignals(t)));
});
