/**
 * A-6 · agent/runs/ 의 트레이스를 발표용 표 하나로 모은다.
 *
 * 왜 스크립트로 두는가: ⑥ 심사에서 「이 숫자 어디서 나왔나요」에 답해야 한다.
 * 슬라이드에 손으로 옮겨 적은 숫자는 근거가 아니다. 이 파일이 근거다.
 *
 *   npm run report
 *
 * ★ 세 가지를 섞지 않는다. 섞으면 각각의 주장이 전부 무효가 된다.
 *
 *   1) 라우팅이 다른 실행    — auto로 돈 실행은 모델이 다르다. 모델 차이가 제약 차이로 둔갑한다.
 *   2) 도구·인프라가 죽은 실행 — 사이트 탓도 제약 탓도 아니다. 빼되 **화면에 적는다**(절대규칙 3).
 *   3) 성공과 실패           — 실패는 전부 상한(MAX_STEPS)에 걸려 있다. 평균내면 프로필 차이가 아니라
 *                             상한값을 보고하게 된다.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Trace } from "../../core/types.ts";

const RUNS = join(import.meta.dirname, "..", "runs");
const ORDER = ["control", "resident-n3", "senior-70s"];

/** 프로필당 최근 몇 개를 보는가. 계측 코드를 고치기 전 실행이 섞이면 「고치기 전/후」가 평균난다 */
const N = Number(process.env.REPORT_N ?? 4);

type Row = {
  when: string;
  steps: number;
  reached: boolean;
  clicks: number;
  scrolls: number;
  secs: number;
  elPerScreen: number;
  words: number;
  hits: number;
  usd: number;
};

/** 우리 표로 돌았는가. 설정이 아니라 **실제로 청구된 모델명**으로 판정한다 */
function ranOnOurTable(t: Trace): boolean {
  return Object.keys(t.cost.by_model).some((m) => m.includes("gpt-5-mini") || m.includes("gemini-3.6"));
}

/** 미션 실패가 아니라 도구·인프라 고장인가. 이유를 돌려준다(빼는 이유를 화면에 적기 위해) */
function toolFailure(t: Trace): string | null {
  const r = t.verdict.reason_ja ?? "";
  if (r.includes("createTreeWalker")) return "우리 버그(관측 중 body null) — 08/11 수정";
  if (r.includes("429")) return "OrcaRouter 429 무료 한도";
  return null;
}

const by = new Map<string, Row[]>(ORDER.map((p) => [p, []]));
const dropped: Array<{ p: string; when: string; steps: number; why: string }> = [];

for (const d of readdirSync(RUNS)) {
  let t: Trace;
  try {
    t = JSON.parse(readFileSync(join(RUNS, d, "trace.json"), "utf8"));
  } catch {
    continue; // 실행 중이거나 중단된 디렉터리
  }
  if (!by.has(t.profile_id) || !ranOnOurTable(t)) continue;

  const why = toolFailure(t);
  if (why) {
    dropped.push({ p: t.profile_id, when: t.created_at.slice(5, 16).replace("T", " "), steps: t.steps.length, why });
    continue;
  }

  const k = (kind: string) => t.steps.filter((s) => s.action?.kind === kind).length;
  // 가려진 「단어 수」와 「연 횟수」는 다르다 — maskText()가 라벨과 본문에 각각 돌아 같은 말이 두 번 기록된다.
  // 건수를 단어 수라고 부르면 두 배 과대 보고다 (절대규칙 2 — 오차는 과소 쪽으로).
  const hits = t.steps.flatMap((s) => s.constraint.masked);
  by.get(t.profile_id)!.push({
    when: t.created_at.slice(11, 16),
    steps: t.steps.length,
    reached: t.verdict.reached,
    clicks: k("click"),
    // 세로와 가로를 합쳐 센다. 사람 쪽에서 보면 둘 다 「몇 번 밀어야 했나」다.
    // 좌우 스크롤 도입(08-13) 전의 실행에는 scroll_side가 아예 없으므로 기존 수치는 그대로다.
    scrolls: k("scroll") + k("scroll_side"),
    secs: t.verdict.seconds,
    elPerScreen: t.steps.reduce((a, s) => a + s.seen.elements.length, 0) / (t.steps.length || 1),
    words: new Set(hits.map((h) => h.surface)).size,
    hits: hits.length,
    usd: t.cost.total_usd,
  });
}

for (const p of ORDER) by.set(p, by.get(p)!.sort((a, b) => a.when.localeCompare(b.when)).slice(-N));

const med = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN);
const f1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "-");
const list = (a: number[]) => a.join(" / ");

console.log("\n── 到達했을 때의 비용 (성공 실행만) ──");
console.log("프로필         到達   스텝          스크롤        초             화면당요소  가린단어      원가$");
const base = { steps: NaN, scrolls: NaN, secs: NaN };
for (const p of ORDER) {
  const all = by.get(p)!;
  if (!all.length) continue;
  const r = all.filter((x) => x.reached);
  if (p === "control") Object.assign(base, { steps: med(r.map((x) => x.steps)), scrolls: med(r.map((x) => x.scrolls)), secs: med(r.map((x) => x.secs)) });
  console.log(
    p.padEnd(14) +
      `${r.length}/${all.length}`.padEnd(7) +
      list(r.map((x) => x.steps)).padEnd(14) +
      list(r.map((x) => x.scrolls)).padEnd(14) +
      list(r.map((x) => x.secs)).padEnd(15) +
      f1(r.reduce((a, x) => a + x.elPerScreen, 0) / (r.length || 1)).padEnd(12) +
      `${med(r.map((x) => x.words))}단어/연${med(r.map((x) => x.hits))}회`.padEnd(14) +
      (r.reduce((a, x) => a + x.usd, 0) / (r.length || 1)).toFixed(6),
  );
}

console.log("\n── control 대비 (성공 실행 중앙값) ──");
for (const p of ORDER.slice(1)) {
  const r = by.get(p)!.filter((x) => x.reached);
  if (!r.length) continue;
  const sc = med(r.map((x) => x.scrolls));
  console.log(
    `${p.padEnd(14)} 스텝 ${f1(med(r.map((x) => x.steps)) / base.steps)}배   ` +
      // control이 0회면 배수가 무한대다. 0에서 몇 회로 늘었는지를 그대로 쓴다
      `스크롤 ${base.scrolls === 0 ? `0회 → ${sc}회` : `${f1(sc / base.scrolls)}배`}   ` +
      `시간 ${f1(med(r.map((x) => x.secs)) / base.secs)}배`,
  );
}

// ★ 여기가 공공 훅이다 — 제약과 무관하게 실패하는 몫. 사이트 자체의 문제다
console.log("\n── 未到達 (스텝 상한에 걸림) ──");
for (const p of ORDER) {
  const f = by.get(p)!.filter((x) => !x.reached);
  console.log(`${p.padEnd(14)} ${f.length}/${by.get(p)!.length}회` + (f.length ? `   스크롤 ${list(f.map((x) => x.scrolls))}` : ""));
}

console.log("\n── 개별 실행 (검증용) ──");
for (const p of ORDER) {
  for (const x of by.get(p)!) {
    console.log(`  ${p.padEnd(13)} ${x.when}  ${x.reached ? "到達○" : "未到達×"}  ${String(x.steps).padStart(2)}스텝  클릭${x.clicks} 스크롤${x.scrolls}  ${x.secs}초`);
  }
}

if (dropped.length) {
  console.log("\n── 집계에서 뺀 실행 (미션 실패가 아니라 도구·인프라 고장) ──");
  for (const d of dropped) console.log(`  ${d.p.padEnd(13)} ${d.when}  ${String(d.steps).padStart(2)}스텝  ${d.why}`);
}
console.log("");
