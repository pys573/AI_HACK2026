/**
 * orca.ts 재시도·원가 원장 테스트 (B).
 *
 * 왜 가짜 fetch인가: 429는 무료 한도에 실제로 걸려야 나온다. 그걸 무대에서 처음 만나면
 * 데모가 죽는다(절대규칙 7과 같은 이유다). 서버 응답을 우리가 만들어서 경로를 강제한다.
 *
 *   npm run router:test
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

process.env.ORCAROUTER_API_KEY ??= "test-key";
process.env.ORCAROUTER_BASE_URL ??= "https://example.invalid/v1";

const { complete, onBilledCost, OrcaError } = await import("./orca.ts");
const { FALLBACK_PRICES } = await import("./pricing.ts");
const { routingTable } = await import("./routing.ts");

type Call = { body: Record<string, any> };
const realFetch = globalThis.fetch;

/** 정해진 순서대로 응답을 뱉는 가짜 서버. 보낸 요청도 기록한다 */
function stub(responses: Array<() => Response>): { calls: Call[]; restore: () => void } {
  const calls: Call[] = [];
  let i = 0;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    calls.push({ body: JSON.parse(String(init.body)) });
    const make = responses[Math.min(i, responses.length - 1)];
    i++;
    return make();
  }) as typeof fetch;
  return { calls, restore: () => void (globalThis.fetch = realFetch) };
}

const ok = (content: string, model = "gemini-3.1-flash-lite", pt = 100, ct = 20) =>
  new Response(
    JSON.stringify({
      model,
      choices: [{ message: { content } }],
      usage: { prompt_tokens: pt, completion_tokens: ct },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

const err = (status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: { message: "nope" } }), { status, headers });

const SCHEMA = {
  type: "object",
  properties: { kind: { type: "string" }, items: { type: "array", items: { type: "string" }, maxItems: 3 } },
  required: ["kind"],
  additionalProperties: false,
};

const REQ = { step_type: "perceive" as const, system: "s", user: "u" };

test("429는 재시도한다 — 4xx라고 즉시 포기하면 한도에 한 번 걸린 순간 실행 전체가 죽는다", async () => {
  const s = stub([() => err(429, { "retry-after": "0" }), () => ok("やあ")]);
  try {
    const r = await complete(REQ, { retries: 2 });
    assert.equal(r.text, "やあ");
    assert.equal(s.calls.length, 2, "429 후에 한 번 더 시도해야 한다");
    assert.equal(r.cost.retries, 1, "몇 번째 시도에서 성공했는지 기록돼야 한다");
  } finally {
    s.restore();
  }
});

test("Retry-After를 지킨다 — 우리 추측보다 서버가 옳다", async () => {
  const s = stub([() => err(429, { "retry-after": "1" }), () => ok("ok")]);
  const t0 = Date.now();
  try {
    await complete(REQ, { retries: 1 });
    const waited = Date.now() - t0;
    assert.ok(waited >= 900, `1초는 기다려야 한다 (실제 ${waited}ms)`);
    assert.ok(waited < 5000, `헤더를 무시하고 과하게 기다리면 안 된다 (실제 ${waited}ms)`);
  } finally {
    s.restore();
  }
});

test("400은 재시도하지 않는다 — PII Shield 차단도 400이고, 그건 정상 동작이라 삼키면 안 된다", async () => {
  const s = stub([() => err(400)]);
  try {
    await assert.rejects(() => complete(REQ, { retries: 3 }), (e: unknown) => e instanceof OrcaError && e.status === 400);
    assert.equal(s.calls.length, 1, "400에 재시도하면 같은 답을 받으며 돈만 쓴다");
  } finally {
    s.restore();
  }
});

test("빈 본문은 실패다 — 성공으로 돌려주면 A가 에러도 없이 빈손을 받는다", async () => {
  const s = stub([() => ok(""), () => ok(JSON.stringify({ kind: "index" }))]);
  try {
    const r = await complete({ ...REQ, schema: SCHEMA }, { retries: 2 });
    assert.deepEqual(r.parsed, { kind: "index" });
    assert.equal(s.calls.length, 2, "빈 본문이면 다시 물어야 한다");
  } finally {
    s.restore();
  }
});

test("JSON이지만 딴 모양이면 실패다 — qwen3.7-flash가 실제로 이렇게 준다 (2026-08-11 실측)", async () => {
  const wrong = JSON.stringify({ classification: { primary_category: "行政手続き" } });
  const s = stub([() => ok(wrong)]);
  try {
    await assert.rejects(
      () => complete({ ...REQ, schema: SCHEMA }, { retries: 0 }),
      (e: unknown) => e instanceof Error && e.message.includes("필수 필드가 없다"),
    );
  } finally {
    s.restore();
  }
});

test("버려진 시도의 원가도 원장에 남는다 — 안 세면 합계가 실제보다 적게 나온다 (절대규칙 4)", async () => {
  const wrong = JSON.stringify({ nope: 1 });
  const M = "qwen/qwen3.7-flash"; // 폴백 표에 있는 모델이라야 원가가 숫자로 나온다
  const s = stub([
    () => ok(wrong, "qwen3.7-flash", 1000, 100),
    () => ok(JSON.stringify({ kind: "index" }), "qwen3.7-flash", 1000, 100),
  ]);
  const seen: Array<{ kept: boolean; usd: number }> = [];
  const off = onBilledCost((c, kept) => seen.push({ kept, usd: c.cost_usd }));
  try {
    const r = await complete({ ...REQ, schema: SCHEMA, force_model: M }, { retries: 2 });
    assert.deepEqual(r.parsed, { kind: "index" });
    assert.equal(seen.length, 2, "과금된 건 전부 원장에 와야 한다");
    assert.equal(seen.filter((x) => !x.kept).length, 1, "버려진 1건이 기록돼야 한다");
    assert.ok(seen[0].usd > 0, "버려진 시도도 원가가 0이 아니다 — 토큰은 이미 탔다");
  } finally {
    off();
    s.restore();
  }
});

test("라우팅 표의 모델은 폴백 가격표에도 있어야 한다 — 없으면 라이브 취득 실패 시 원가가 NaN이 된다", () => {
  for (const { step_type, model } of routingTable()) {
    assert.ok(FALLBACK_PRICES[model], `${step_type} 담당 ${model}의 폴백 가격이 없다 (pricing.ts에 추가할 것)`);
  }
});

test("모르는 모델은 0원이 아니라 NaN이다 — 0으로 세면 절감률이 거짓말이 된다", async () => {
  const s = stub([() => ok("x", "존재하지-않는-모델")]);
  try {
    const r = await complete({ ...REQ, force_model: "vendor/없는모델" }, { retries: 0 });
    assert.ok(Number.isNaN(r.cost.cost_usd), "모르면 모른다고 해야 한다");
  } finally {
    s.restore();
  }
});

test("호출이 끝내 실패해도 그때까지의 과금은 원장에 남는다", async () => {
  const s = stub([() => ok(JSON.stringify({ nope: 1 }), "m", 500, 50)]);
  const seen: number[] = [];
  const off = onBilledCost((c) => seen.push(c.cost_usd));
  try {
    await assert.rejects(() => complete({ ...REQ, schema: SCHEMA }, { retries: 1 }));
    assert.equal(seen.length, 2, "실패로 끝나도 시도한 만큼 과금됐다");
  } finally {
    off();
    s.restore();
  }
});

test("step_type이 모델을 정한다 — 기본이 auto면 절감은 우리 시책이 아니다", async () => {
  const s = stub([() => ok("x")]);
  try {
    await complete({ ...REQ, step_type: "judge" }, { retries: 0 });
    assert.equal(s.calls[0].body.model, "google/gemini-3.6-flash");
  } finally {
    s.restore();
  }
});

test("resolveModel:null이면 라우팅을 끈다 — 이 호출만", async () => {
  const s = stub([() => ok("x")]);
  try {
    await complete(REQ, { retries: 0, resolveModel: null });
    assert.equal(s.calls[0].body.model, "orcarouter/auto");
  } finally {
    s.restore();
  }
});

test("ORCA_NO_ROUTING=1은 호출부가 뭘 넘기든 이긴다 — 대조군이 조용히 섞이면 원가 비교가 무의미해진다", async () => {
  const s = stub([() => ok("x"), () => ok("x")]);
  process.env.ORCA_NO_ROUTING = "1";
  try {
    // 호출부가 스위치를 모르고 자기 resolver를 넘긴 상황. 그래도 라우팅은 꺼져야 한다
    await complete(REQ, { retries: 0, resolveModel: () => "google/gemini-3.6-flash" });
    assert.equal(s.calls[0].body.model, "orcarouter/auto");
    // 표도 같이 auto라고 말해야 한다. 설정값을 읊으면 리포트가 돌지도 않은 모델을 주장한다
    const t = routingTable();
    assert.ok(t.every((r) => r.model === "orcarouter/auto" && r.source === "disabled"), JSON.stringify(t));
  } finally {
    delete process.env.ORCA_NO_ROUTING;
    s.restore();
  }
});

test("force_model은 ORCA_NO_ROUTING보다 강하다 — 「전량 opus-5였다면」 기준선을 재려면 필요하다", async () => {
  const s = stub([() => ok("x")]);
  process.env.ORCA_NO_ROUTING = "1";
  try {
    await complete({ ...REQ, force_model: "anthropic/claude-opus-5" }, { retries: 0 });
    assert.equal(s.calls[0].body.model, "anthropic/claude-opus-5");
  } finally {
    delete process.env.ORCA_NO_ROUTING;
    s.restore();
  }
});

test("anthropic으로 갈 때만 maxItems를 뗀다 — 남기면 HTTP 400이다 (2026-08-11 실측)", async () => {
  const s = stub([() => ok(JSON.stringify({ kind: "a" }))]);
  try {
    await complete({ ...REQ, schema: SCHEMA, force_model: "anthropic/claude-opus-5" }, { retries: 0 });
    const sent = JSON.stringify(s.calls[0].body.response_format);
    assert.ok(!sent.includes("maxItems"), "anthropic에는 maxItems를 보내면 안 된다");
    assert.ok(sent.includes("kind"), "필드 구성까지 지우면 안 된다 — 범위 제한만 뗀다");
  } finally {
    s.restore();
  }
});

test("anthropic이 아니면 스키마를 그대로 보낸다", async () => {
  const s = stub([() => ok(JSON.stringify({ kind: "a" }))]);
  try {
    await complete({ ...REQ, schema: SCHEMA, force_model: "openai/gpt-5-mini" }, { retries: 0 });
    assert.ok(JSON.stringify(s.calls[0].body.response_format).includes("maxItems"));
  } finally {
    s.restore();
  }
});
