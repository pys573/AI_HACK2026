/**
 * 배치 집계는 우리가 무대에서 말할 숫자(「10人中◯人が離脱」)를 직접 만든다.
 * 여기가 틀리면 절대규칙 4를 어기는 게 아니라 **그냥 거짓말**이 된다. 그래서 셈만 따로 검사한다.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { Outcome, RunTrace } from "../../core/types.ts";
import { DEFAULT_ROSTER, summarize } from "../src/batch.ts";

/** 집계가 보는 필드만 채운 최소 트레이스. 나머지는 셈에 영향을 주지 않는다 */
function fake(outcome: Outcome, cost: number, baseline: number | null): RunTrace {
  return {
    verdict: { outcome, reached: outcome === "reached" },
    cost: { total_usd: cost, baseline_usd: baseline },
  } as unknown as RunTrace;
}

test("이탈률 = 諦め / 전체", () => {
  const s = summarize([
    fake("reached", 0.01, 0.1),
    fake("gave_up_clicks", 0.02, 0.2),
    fake("gave_up_time", 0.03, 0.3),
    fake("gave_up_self", 0.04, 0.4),
  ]);
  assert.equal(s.total_runs, 4);
  assert.equal(s.reached, 1);
  assert.equal(s.gave_up, 3);
  assert.equal(s.dropout_rate, 0.75);
});

test("max_steps와 error는 到達에도 諦め에도 넣지 않는다", () => {
  // 스텝 상한은 우리 계측 장치가 만든 결과이고, error는 우리 고장이다.
  // 어느 쪽을 사이트 탓으로 세도 근거 없는 인과가 된다
  const s = summarize([fake("reached", 0, 0), fake("max_steps", 0, 0), fake("error", 0, 0)]);
  assert.equal(s.total_runs, 3);
  assert.equal(s.reached, 1);
  assert.equal(s.gave_up, 0);
  // 3건 중 2건이 어느 통에도 없다 → 이탈률은 0%로 **과소** 표시된다 (절대규칙 2가 요구하는 방향)
  assert.equal(s.dropout_rate, 0);
  assert.equal(s.total_runs - s.reached - s.gave_up, 2);
});

test("기준선을 모르는 런이 하나라도 있으면 합계도 null", () => {
  // 0으로 때우면 「기준선이 그만큼 쌌다」가 되어 절감률이 부풀어 오른다
  const s = summarize([fake("reached", 0.01, 0.1), fake("gave_up_clicks", 0.02, null)]);
  assert.equal(s.baseline_cost_usd, null);
  assert.equal(s.total_cost_usd, 0.03);
});

test("전원 기준선을 알면 합산한다", () => {
  const s = summarize([fake("reached", 0.01, 0.1), fake("gave_up_clicks", 0.02, 0.2)]);
  assert.ok(s.baseline_cost_usd !== null);
  assert.ok(Math.abs(s.baseline_cost_usd - 0.3) < 1e-9);
});

test("빈 배치에서 0으로 나누지 않는다", () => {
  const s = summarize([]);
  assert.equal(s.total_runs, 0);
  assert.equal(s.dropout_rate, 0);
  assert.equal(s.baseline_cost_usd, 0);
});

test("기본 명단에 senior-70s-patient는 없다", () => {
  // 저건 페르소나가 아니라 「인내 예산이 원인이었나」 대조 실험용 변종이다.
  // 명단에 섞이면 senior-70s를 두 번 센 것이 되고 이탈률이 오염된다
  assert.ok(!DEFAULT_ROSTER.includes("senior-70s-patient"));
  assert.ok(DEFAULT_ROSTER.includes("control"));
  assert.equal(new Set(DEFAULT_ROSTER).size, DEFAULT_ROSTER.length);
});
