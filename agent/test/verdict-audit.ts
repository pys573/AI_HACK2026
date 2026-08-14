/**
 * 판정이 얼마나 흔들리는가를 센다. **LLM 무호출 = 원가 0.**
 *
 * 到達 판정은 「사람이 만든 정답키」와 「AI 심판」이 **둘 다 맞을 때만** true다
 * (`judge.ts` — 관대한 쪽에 맞추면 到達率이 부풀기 때문). 그래서 둘이 갈린 실행은
 * **우리 계측의 불확실성 그 자체**이고, 그 건수와 **방향**을 숨기지 않고 세는 것이 이 파일이다.
 *
 * 방향이 중요한 이유: 키○·AI× 는 到達을 깎으므로 **이탈률을 과대**로 만든다.
 * 즉 우리 주장을 좋아 보이게 하는 방향이다. 그래서 먼저 말한다 (FINDINGS F19).
 *
 *   node agent/test/verdict-audit.ts
 */
import fs from "node:fs";
import path from "node:path";

const RUNS = path.join(import.meta.dirname, "..", "runs");

type Row = { gen: string; mission: string; profile: string; variant: number; key: boolean; llm: boolean; reason: string };

const gens = new Map<string, { n: number; reached: number; rows: Row[] }>();

for (const d of fs.readdirSync(RUNS)) {
  const bp = path.join(RUNS, d, "batch.json");
  if (!d.startsWith("batch") || !fs.existsSync(bp)) continue;
  // 세대 태그(`batchv2__`·`batchcat__`…)로 가른다. 섞으면 공개 집계가 오염된다
  const gen = d.slice(0, d.indexOf("__") + 2);
  if (gen.includes("_INVALID")) continue;
  const b = JSON.parse(fs.readFileSync(bp, "utf8"));
  const g = gens.get(gen) ?? { n: 0, reached: 0, rows: [] };
  gens.set(gen, g);

  for (const rid of b.run_ids as string[]) {
    const tp = path.join(RUNS, rid, "trace.json");
    if (!fs.existsSync(tp)) continue;
    const t = JSON.parse(fs.readFileSync(tp, "utf8"));
    const v = t.verdict;
    g.n++;
    if (v.reached) g.reached++;
    if (v.disagreed) {
      g.rows.push({
        gen,
        mission: b.mission_id,
        profile: t.profile_id,
        variant: t.variant,
        key: v.key_match,
        llm: v.llm_match,
        reason: String(v.reason_ja ?? "").replace(/\s+/g, " ").slice(0, 90),
      });
    }
  }
}

let bad = 0;
for (const [gen, g] of [...gens].sort()) {
  const down = g.rows.filter((r) => r.key && !r.llm).length; // 到達을 깎는 방향
  const up = g.rows.filter((r) => !r.key && r.llm).length;
  const pct = g.n ? ((g.rows.length / g.n) * 100).toFixed(1) : "0.0";
  console.log(`\n■ ${gen}  ${g.n}런 · 到達 ${g.reached} · 불일치 ${g.rows.length}건 (${pct}%)`);
  console.log(`   키○AI× ${down}건 → 到達을 깎는다(이탈률 과대) / 키×AI○ ${up}건 → 반대`);
  for (const r of g.rows) {
    console.log(`   ${r.key ? "키○AI×" : "키×AI○"}  ${r.mission} ${r.profile} v${r.variant}`);
    console.log(`      ${r.reason}`);
  }
  // 불일치가 10%를 넘으면 그건 「가끔 흔들린다」가 아니라 정답키나 用事 정의가 잘못된 것이다
  if (g.n >= 10 && g.rows.length / g.n > 0.1) {
    console.log(`   ⚠️ 불일치 10% 초과 — 정답키 또는 用事 정의를 의심할 것`);
    bad++;
  }
}

console.log(`\n판정: ${bad === 0 ? "✅ 모든 세대에서 불일치 10% 이하" : `⚠️ ${bad}개 세대가 10%를 넘는다`}`);
process.exit(bad === 0 ? 0 : 1);
