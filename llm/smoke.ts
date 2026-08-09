/**
 * OrcaRouter 접속 확인 (W0-4).
 *
 * 키를 받으면 **가장 먼저 이걸 돌린다.** 여기서 나오는 실제 응답 형태에 맞춰
 * orca.ts의 파싱을 확정한다. 추측한 채로 A와 B를 진행시키면 하루를 잃는다.
 *
 *   node llm/smoke.ts
 */

import { complete, listModels, OrcaError } from "./orca.ts";

const line = (s: string) => console.log(s);

line("── 1. GET /models ─────────────────────────────");
try {
  const models = (await listModels()) as { data?: Array<Record<string, unknown>> };
  const list = models.data ?? [];
  line(`✓ ${list.length}개 모델`);
  // 가격 필드가 있는지 확인한다. 있으면 ⑥의 「実測原価」를 라이브 가격으로 계산할 수 있다.
  const sample = list[0];
  if (sample) line(`  샘플 키: ${Object.keys(sample).join(", ")}`);
  const priced = list.filter((m) => JSON.stringify(m).match(/pric|cost/i));
  line(`  가격 정보를 가진 모델: ${priced.length}개 ${priced.length ? "← 라이브 가격표 사용 가능" : "← 폴백 표 사용"}`);
} catch (e) {
  line(`✗ ${e instanceof Error ? e.message : String(e)}`);
}

line("\n── 2. POST /chat/completions (orcarouter/auto) ─");
try {
  const r = await complete({
    step_type: "perceive",
    system: "あなたは簡潔に答えるアシスタントです。",
    user: "「テスト」とだけ返してください。",
  });
  line(`✓ text     : ${JSON.stringify(r.text.slice(0, 60))}`);
  line(`  model    : ${r.cost.model}`);
  line(`  tokens   : in ${r.cost.prompt_tokens} / out ${r.cost.completion_tokens} / cached ${r.cost.cached_tokens}`);
  line(`  cost     : $${r.cost.cost_usd} (${r.cost.cost_source})  ${r.cost.cost_source === "table" ? "← ⚠️ API가 원가를 안 준다. 실측이라 부르지 말 것" : "← 実測原価"}`);
  line(`  latency  : ${r.cost.latency_ms}ms`);
  line(`  route    : ${r.cost.route ?? "(응답에 없음)"}`);
} catch (e) {
  if (e instanceof OrcaError) line(`✗ ${e.status}\n${e.body.slice(0, 500)}`);
  else line(`✗ ${e instanceof Error ? e.message : String(e)}`);
}

line("\n── 3. structured output ────────────────────────");
try {
  const r = await complete({
    step_type: "decide",
    system: "JSONだけを返してください。",
    user: "リンク一覧: [0] 住民票 [1] 税金。「住民票がほしい」人はどれを押すか。",
    schema: {
      type: "object",
      properties: { index: { type: "integer" }, reason_ja: { type: "string" } },
      required: ["index", "reason_ja"],
      additionalProperties: false,
    },
  });
  line(`✓ parsed   : ${JSON.stringify(r.parsed)}`);
  line(`  model    : ${r.cost.model} / $${r.cost.cost_usd} (${r.cost.cost_source})`);
} catch (e) {
  if (e instanceof OrcaError) line(`✗ ${e.status}\n${e.body.slice(0, 500)}`);
  else line(`✗ ${e instanceof Error ? e.message : String(e)}`);
}

line("\n── 4. 명시 모델 지정 (A/B 기준선용) ────────────");
for (const m of ["qwen/qwen3.7-flash", "anthropic/claude-opus-5"]) {
  try {
    const r = await complete({ step_type: "perceive", system: "簡潔に。", user: "1+1は?", force_model: m });
    line(`✓ ${m.padEnd(28)} → ${r.cost.model} / $${r.cost.cost_usd} (${r.cost.cost_source}) / ${r.cost.latency_ms}ms`);
  } catch (e) {
    line(`✗ ${m.padEnd(28)} → ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
  }
}
