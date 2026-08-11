/**
 * decide()의 재질문 루프 회귀 테스트.
 *
 * 예전 코드는 **첫 응답의 kind만** 검사했다. 재질문의 답은 검사 없이 그대로 돌려줬다.
 * 그래서 재질문도 빈 kind를 주면 `{kind:""}`가 run.ts까지 흘러가 act()에서 죽었고,
 * 그 스텝은 「알 수 없는 액션」으로 낭비됐다. **버려진 스텝은 「제약 때문에 헤맸다」로
 * 집계되므로, 우리 도구가 만든 잡음이 측정 결과에 섞였다.**
 *   실측: 2026-08-11 shinjuku-tennyu / resident-n3, 8스텝 중 2스텝(1·3)이 이렇게 날아갔다.
 *
 * 두 번째 버그: 재질문이 JSON 에러로 던지면 catch가 세 번째 호출을 하고
 * **그 호출의 원가만** 돌려줬다. 앞의 두 번은 과금됐는데 장부에서 사라졌다 (절대규칙 4).
 *
 *   node --test --experimental-test-module-mocks agent/test/decide-retry.test.ts
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import type { CostRecord } from "../../core/types.ts";

/** 호출 1회분의 가짜 원가. 액수는 의미 없다 — 「몇 건이 장부에 남았는가」만 본다 */
function cost(n: number): CostRecord {
  return {
    step_type: "decide",
    model: `stub-${n}`,
    prompt_tokens: 100,
    completion_tokens: 10,
    cached_tokens: 0,
    cost_usd: 0.0001,
    cost_source: "table",
    latency_ms: 1,
    route: null,
    mode: "balanced",
    retries: 0,
  };
}

// complete()를 대본대로 움직이게 바꾼다. 대본 한 칸 = 호출 한 번.
// Error면 던지고, 아니면 그 값을 parsed로 돌려준다.
// ★ mock.module은 모듈당 한 번만 걸린다. 그래서 대본만 테스트마다 갈아 끼운다.
let script: unknown[] = [];
let calls = 0;

mock.module("../../llm/orca.ts", {
  namedExports: {
    complete: async () => {
      const item = script[calls];
      calls++;
      if (item instanceof Error) throw item;
      return { text: JSON.stringify(item ?? null), parsed: item, cost: cost(calls) };
    },
    // decide.ts는 안 쓰지만 같은 모듈에 있어 로드 시 필요하다
    prices: () => ({}),
    ensureLivePrices: async () => {},
  },
});

function scripted(s: unknown[]) {
  script = s;
  calls = 0;
}

const MISSION = { id: "m", max_steps: 10, start_url: "https://example.com" } as never;
const OBS = { url: "u", title: "t", text: "本文", elements: [{ index: 0, role: "link", name: "引越し", in_viewport: true }], scroll: { y: 0, height: 100 } } as never;
const PROFILE = {
  id: "test", version: "1.0",
  tools: { find_in_page: false, site_search: true, back_limit: 5 },
} as never;

const OK = { kind: "click", index: 0, delta: null, query: null, reason_ja: "押す" };

test("재질문의 답도 검증한다 — 1회차 빈 kind, 2회차 정상", async () => {
  scripted([{ kind: "", reason_ja: "理由だけある" }, OK]);
  const { decide } = await import("../src/decide.ts");

  const d = await decide(MISSION, OBS, PROFILE, []);
  assert.equal(d.action.kind, "click");
  assert.equal(d.costs.length, 2, "두 번 불렀으면 장부도 2건이어야 한다");
});

test("★ 끝까지 못 알아들으면 지어내지 않고 던진다 — 원가는 들고 나온다", async () => {
  scripted([{ kind: "", reason_ja: "a" }, { kind: "", reason_ja: "" }, { kind: "クリック", reason_ja: "c" }]);
  const { decide, isDecideFailure } = await import("../src/decide.ts");

  await assert.rejects(
    () => decide(MISSION, OBS, PROFILE, []),
    (e: unknown) => {
      // 예전 버그: 여기서 던지지 않고 {kind:""}를 조용히 돌려줬다
      assert.ok(isDecideFailure(e), "DecideFailure여야 원가를 run.ts가 회수할 수 있다");
      assert.equal(e.costs.length, 3, "3번 물었으면 3번 다 과금됐다");
      return true;
    },
  );
});

test("빈 응답(parsed undefined)도 재질문 대상이다", async () => {
  // orca.ts는 본문이 빈 문자열이면 parsed를 채우지 않고 그냥 성공으로 돌려준다
  scripted([undefined, OK]);
  const { decide } = await import("../src/decide.ts");

  const d = await decide(MISSION, OBS, PROFILE, []);
  assert.equal(d.action.kind, "click");
  assert.equal(d.costs.length, 2);
});

test("JSON 형식 에러는 다시 묻는다 — 던진 호출은 과금이 없으므로 장부에 없다", async () => {
  scripted([new Error("schema를 요구했으나 JSON이 아니다: kind: click"), OK]);
  const { decide } = await import("../src/decide.ts");

  const d = await decide(MISSION, OBS, PROFILE, []);
  assert.equal(d.action.kind, "click");
  assert.equal(d.costs.length, 1);
});

test("4xx·키 없음은 다시 묻지 않는다 — 같은 답이 오고 돈만 쓴다", async () => {
  scripted([new Error("OrcaRouter 401: invalid api key"), OK]);
  const { decide } = await import("../src/decide.ts");

  await assert.rejects(() => decide(MISSION, OBS, PROFILE, []), /401/);
  assert.equal(calls, 1, "재질문하면 안 된다");
});

test("허용 목록 밖의 kind는 거부한다 — find_in_page를 못 쓰는 프로필", async () => {
  scripted([{ kind: "find_in_page", query: "転入", reason_ja: "探す" }, OK]);
  const { decide } = await import("../src/decide.ts");

  const d = await decide(MISSION, OBS, PROFILE, []);
  assert.equal(d.action.kind, "click", "프로필이 금지한 도구는 재질문으로 되돌려야 한다");
  assert.equal(d.costs.length, 2);
});
