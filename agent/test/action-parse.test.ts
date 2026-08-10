/**
 * toAction()의 회귀 테스트.
 *
 * 이 파서가 조용히 실패하면 그 스텝은 「알 수 없는 액션」으로 버려지고,
 * 버려진 스텝은 「제약 때문에 헤맸다」로 집계된다. **측정이 오염된다.**
 * 실제로 한 번 일어났다 (2026-08-10, senior-70s-patient 20스텝 중 3회).
 *
 * 아래 입력은 전부 **실행 중 라우터가 실제로 돌려준 응답**이다. 지어낸 것이 없다.
 *   node --test agent/test/action-parse.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toAction } from "../src/decide.ts";

test("스키마를 지킨 응답 (qwen3.7-plus)", () => {
  const a = toAction({ delta: 1, index: 5, kind: "click", query: "x", reason_ja: "b" });
  assert.equal(a.kind, "click");
  assert.equal(a.index, 5);
});

test("kind 대신 action, index 대신 target 배열로 오는 응답 (glm-5.2)", () => {
  const a = toAction({ action: "click", target: [0], reason_ja: "a" });
  assert.equal(a.kind, "click");
  assert.equal(a.index, 0); // 0은 falsy다. `||`로 쓰면 여기서 사라진다
});

test("scroll에 index가 섞여 와도 kind는 살린다", () => {
  const a = toAction({ delta: 1, index: 1, kind: "scroll", query: "", reason_ja: "c" });
  assert.equal(a.kind, "scroll");
  assert.equal(a.delta, 1);
  assert.equal(a.query, undefined); // 빈 문자열은 검색어가 아니다
});

test("정말 비어 있으면 비어 있는 채로 둔다 — 재질문은 decide()가 한다", () => {
  assert.equal(toAction({ kind: "", reason_ja: "d" }).kind, "");
  assert.equal(toAction(null).kind, "");
});
