/**
 * 이미 있는 트레이스에 진단만 다시 붙인다. 브라우저를 열지 않는다.
 *
 *   npm run diagnose                     # 신호만 본다 (LLM 안 부름 · 원가 0)
 *   npm run diagnose -- <run_id>         # 그 실행 하나를 진단하고 trace.json에 써넣는다
 *   npm run diagnose -- <run_id> --dry   # 모델에게 보낼 입력만 찍어본다
 *
 * 왜 따로 두는가: 계측(브라우저 조작)은 다시 못 돌리지만 진단은 몇 번이고 다시 돌릴 수 있다.
 * 프롬프트를 고칠 때마다 사이트를 다시 긁으면 레이트 리밋(절대규칙 6)에 걸리고 시간도 없다.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CostRecord, RunTrace } from "../../core/types.ts";
import { ensureLivePrices, prices } from "../../llm/orca.ts";
import { BASELINE_MODEL, estimateCost } from "../../llm/pricing.ts";
import { diagnose, diagnoseUser, DIAGNOSE_SYSTEM } from "./diagnose.ts";
import { detectSignals } from "./signals.ts";

const RUNS = join(import.meta.dirname, "..", "runs");
const load = (id: string): RunTrace => JSON.parse(readFileSync(join(RUNS, id, "trace.json"), "utf8"));

const [runId, ...flags] = process.argv.slice(2);

// 인자가 없으면 전 실행의 신호만 훑는다. LLM을 부르지 않으므로 몇 번을 돌려도 공짜다
if (!runId) {
  for (const d of readdirSync(RUNS).sort()) {
    let t: RunTrace;
    try {
      t = load(d);
    } catch {
      continue;
    }
    const { signals, ours, dropped } = detectSignals(t);
    console.log(`\n▶ ${t.profile_id.padEnd(12)} ${t.verdict.outcome.padEnd(10)} ${String(t.steps.length).padStart(2)}스텝  ${d}`);
    for (const s of signals) {
      console.log(`   [${s.severity.padEnd(6)}] ${s.kind.padEnd(17)} step${String(s.step_n).padStart(3)}  낭비${String(s.wasted_steps).padStart(2)}`);
      for (const e of s.evidence) console.log(`             · ${e}`);
    }
    // 뺀 것도 화면에 적는다. 조용히 지우면 「사이트에 이만큼만 문제가 있었다」가 거짓이 된다
    for (const s of ours) console.log(`   [제외  ] ${s.kind.padEnd(17)} step${String(s.step_n).padStart(3)}  계측 고장: ${s.ours}`);
    if (dropped) console.log(`   ⚠️ ${dropped}건은 상한을 넘어 잘림`);
  }
  process.exit(0);
}

const trace = load(runId);

if (flags.includes("--dry")) {
  const { signals } = detectSignals(trace);
  console.log("=== system ===\n" + DIAGNOSE_SYSTEM);
  console.log("\n=== user ===\n" + diagnoseUser(trace, signals));
  process.exit(0);
}

await ensureLivePrices();
const { findings, costs, dropped, ours } = await diagnose(trace);

for (const f of findings) {
  console.log(`\n[${f.severity}] step ${f.step_n}  ${f.url}`);
  console.log(`  原因 : ${f.cause_ja}`);
  console.log(`  改善 : ${f.fix_ja}`);
  for (const e of f.evidence) console.log(`  根拠 · ${e}`);
}
for (const s of ours) console.log(`\n[제외] ${s.kind} step ${s.step_n} — 사이트가 아니라 계측 고장: ${s.ours}`);
if (dropped) console.log(`\n⚠️ 신호 ${dropped}건은 상한을 넘어 뺐다`);

trace.findings = findings;
mergeDiagnoseCost(trace, costs);
writeFileSync(join(RUNS, runId, "trace.json"), JSON.stringify(trace, null, 2));
console.log(
  `\n원가 진단 $${costs.reduce((a, c) => a + c.cost_usd, 0).toFixed(6)} (${costs.map((c) => c.model).join(", ") || "호출 없음"})` +
    ` · 실행 전체 $${trace.cost.total_usd.toFixed(6)}`,
);
console.log(`→ ${runId}/trace.json 에 써넣었다`);

/**
 * 진단 원가를 실행 전체 원가에 합친다.
 *
 * ★ 이걸 안 하면 화면의 금액이 「계측만의 값」이 되고, 리포트를 만든 값은 어디에도 없다.
 *   우리가 파는 것은 리포트다. 그 제작비를 빼고 「우리 도구는 싸다」고 하면
 *   그건 추정치를 실측이라고 부르는 것과 같은 종류의 거짓이다 (절대규칙 4).
 *   run.ts는 이미 하고 있었다 — 여기만 빠져 있었다(08-11, D 지적).
 *
 * ⚠️ 두 번 진단하면 두 번 더해진다. findings는 **교체**되므로 원가도 교체해야 한다.
 *   직전 진단분은 `by_step_type.diagnose`가 알고 있으니 그만큼 먼저 뺀다.
 *   다만 `by_model`은 어느 모델이 그 몫이었는지를 기록해두지 않는다(집계만 남는다).
 *   같은 모델이면 조용히 되감고, 라우팅이 바뀌어 되감을 수 없으면 **화면에 적는다.**
 *   말없이 틀린 숫자를 남기는 것보다 「여기는 못 되감았다」가 낫다.
 */
/** CostRecord의 모델명은 벤더 접두사가 없을 수 있다 (claude-opus-5 vs anthropic/claude-opus-5) */
function isBaselineModel(m: string | undefined): boolean {
  return !!m && (m === BASELINE_MODEL || BASELINE_MODEL.endsWith(`/${m}`));
}

function mergeDiagnoseCost(t: RunTrace, added: CostRecord[]): void {
  const c = t.cost;
  const prev = c.by_step_type.diagnose ?? 0;

  if (prev > 0) {
    c.total_usd -= prev;
    c.by_step_type.diagnose = 0;
    // ⚠️ diagnose()는 빈손으로 오면 한 번 더 묻는다 (2026-08-13). 「정확히 1회」가 아니다.
    //    호출 수를 따로 기록해두지는 않지만, **스텝에 달린 호출은 전부 스텝이 갖고 있으므로**
    //    남는 몫이 곧 진단분이다. 1로 고정하면 재진단할 때마다 calls가 하나씩 어긋난다
    const inSteps = t.steps.reduce((a, s) => a + (s.llm_calls?.length ?? 0), 0);
    c.calls = Math.max(0, inSteps);
    const m = added[0]?.model;
    if (m && (c.by_model[m] ?? 0) >= prev - 1e-12) c.by_model[m] -= prev;
    else console.log(`⚠️ 이전 진단분 $${prev.toFixed(6)}을 by_model에서 되감지 못했다 (모델이 바뀌었다). by_model만 과대 계상이다`);

    // baseline은 「라우팅 안 했으면 얼마였나」다. diagnose는 BASELINE_MODEL 자신으로 돈다
    // (llm/routing.ts:55 — 의도적으로 그렇게 골랐다). 같은 모델·같은 토큰·같은 가격표이므로
    // 그 호출의 baseline 기여분은 실원가와 같은 값이고, prev를 그대로 되감을 수 있다.
    // 되감지 않으면 다시 진단할 때마다 baseline만 늘어 「절감률」이 부풀어 오른다.
    if (c.baseline_usd !== null && isBaselineModel(m)) c.baseline_usd = Math.max(0, c.baseline_usd - prev);
    else if (c.baseline_usd !== null) console.log(`⚠️ 이전 진단분을 baseline에서 되감지 못했다 (${m} ≠ ${BASELINE_MODEL}). 절감률이 과소 표시된다`);
  }

  const table = prices();
  for (const r of added) {
    c.total_usd += r.cost_usd;
    c.by_step_type.diagnose = (c.by_step_type.diagnose ?? 0) + r.cost_usd;
    c.by_model[r.model] = (c.by_model[r.model] ?? 0) + r.cost_usd;
    c.calls += 1;
    c.cached_tokens += r.cached_tokens;

    // 「라우팅 안 했으면 얼마였나」의 기준선에도 이 호출이 들어가야 비교가 성립한다
    const b = estimateCost(BASELINE_MODEL, r.prompt_tokens, r.completion_tokens, table);
    if (b === null) c.baseline_usd = null;
    else if (c.baseline_usd !== null) c.baseline_usd += b;
  }
}
