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
import type { RunTrace } from "../../core/types.ts";
import { ensureLivePrices } from "../../llm/orca.ts";
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
console.log(`\n원가 $${costs.reduce((a, c) => a + c.cost_usd, 0).toFixed(6)} (${costs.map((c) => c.model).join(", ")})`);

trace.findings = findings;
writeFileSync(join(RUNS, runId, "trace.json"), JSON.stringify(trace, null, 2));
console.log(`→ ${runId}/trace.json 에 써넣었다`);
