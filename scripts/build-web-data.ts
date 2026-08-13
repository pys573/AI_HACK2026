/**
 * 배치 실행 결과 → 웹이 읽는 한 개의 파일.
 *
 * 왜 화면에서 직접 트레이스를 읽지 않는가:
 *   `agent/runs/`는 35런 × 최대 900KB다. 화면이 이걸 직접 훑으면 첫 화면이 늦고,
 *   더 나쁜 것은 **집계 로직이 화면에 흩어진다**는 점이다. 그러면 리포트 화면의 「60%」와
 *   랜딩의 「60%」가 다른 코드로 계산되고, 언젠가 반드시 어긋난다.
 *   숫자를 만드는 곳은 여기 한 곳이다 (절대규칙 3·4).
 *
 * 이 스크립트는 **아무것도 추정하지 않는다.** trace.json에 있는 값만 세고 나눈다.
 * 없는 값(예: 사람의 소요시간)은 null로 두고, 화면은 null이면 그 칸을 그리지 않는다.
 *
 *   npm run web:data
 */

import {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import type { RunTrace } from "../core/types.ts";

const ROOT = join(import.meta.dirname, "..");
const RUNS = join(ROOT, "agent", "runs");
const OUT_DIR = join(ROOT, "web", "public", "demo");
const SHOTS_DIR = join(OUT_DIR, "shots");

// ─────────────────────────────────────────────────────────────
// 형태
// ─────────────────────────────────────────────────────────────

/** 표의 한 칸 = 한 프로필이 한 사이트를 한 번 돈 결과 */
export type Cell = {
  run_id: string;
  profile_id: string;
  profile_version: string;
  reached: boolean;
  /** reached / gave_up_clicks / gave_up_seconds / max_steps / error */
  outcome: string;
  clicks: number;
  seconds: number;
  steps: number;
  findings: number;
  masked_words: number;
  masked_in_controls: number;
  /** 이 런이 실제로 태운 돈. 추정이 아니라 트레이스의 llm_calls 합계 */
  cost_usd: number;
  /** 리플레이 화면을 열 수 있는가 — 좌표가 실린 트레이스만 열린다 */
  replayable: boolean;
};

/**
 * 막힌 1건. **cause와 fix가 항상 쌍이다.**
 * 실패만 늘어놓으면 받은 쪽이 할 수 있는 게 없다 — 그건 리포트가 아니라 비난이다.
 */
export type FindingRow = {
  run_id: string;
  profile_id: string;
  step_n: number;
  url: string;
  cause_ja: string;
  fix_ja: string;
  evidence: string[];
  severity: "high" | "medium" | "low";
};

export type SiteBlock = {
  mission_id: string;
  /** 用事の種類. `shinjuku-tennyu` → `tennyu`. 사이트 비교는 **같은 用事 안에서만** 성립한다 */
  task_id: string;
  task_ja: string;
  site_name: string;
  start_url: string;
  goal_ja: string;
  cells: Cell[];
  findings: FindingRow[];
  /** 대조군을 뺀 이탈률. 대조군은 「사이트가 정상이다」의 확인용이지 이용자가 아니다 */
  dropout_rate: number | null;
  control_reached: boolean;
};

/**
 * 「差は制約のせいか、モデルのせいか」を切るための実験。
 *
 * 평소 배치는 대조군이 auto, 제약측이 라우팅 표(4종)다. 그래서 도달률 차이에
 * 「모델이 달라서 아니냐」가 섞여 있고, **그 데이터만으로는 부정할 수 없다.**
 * 전원을 한 모델에 못 박고 같은 차이가 남으면 그 반론이 닫힌다.
 *
 * ★ model은 설정값이 아니라 **트레이스에 실제로 남은 모델**을 읽는다.
 *   설정을 읊으면 「돌지도 않은 모델」을 주장하게 된다 (절대규칙 4).
 */
export type FixedModelBlock = {
  models: string[];
  runs: number;
  site_names: string[];
  by_profile: Array<{ id: string; runs: number; reached: number; rate: number }>;
  /**
   * 비교 상대. **같은 사이트의** 라우팅 실행만 골라서 센다.
   * 전체 평균과 나란히 두면 사이트 구성이 달라서 차이가 생기고, 그러면
   * 모델을 고정한 효과인지 사이트가 달라서인지 또 모르게 된다.
   */
  routed_same_sites: Array<{ id: string; runs: number; reached: number; rate: number }>;
};

export type Matrix = {
  generated_at: string;
  /** 이 표에 들어간 프로필 순서 — 제약이 약한 쪽부터 */
  profiles: Array<{ id: string; version: string; label_ja: string; note_ja: string | null }>;
  /** 사이트끼리 비교할 수 있는 블록 = 가장 많은 사이트를 덮은 用事 하나 */
  sites: SiteBlock[];
  /** 그 밖의 用事. 사이트 비교에는 못 넣지만 「用事가 바뀌어도 같은가」의 답이다 */
  other_tasks: SiteBlock[];
  totals: {
    runs: number;
    reached: number;
    cost_usd: number;
    baseline_usd: number | null;
    findings: number;
    masked_words: number;
  };
  /** 프로필별 도달 — 랜딩의 머리기사가 여기서 나온다 */
  by_profile: Array<{ id: string; runs: number; reached: number; rate: number }>;
  /** 모델을 못 박고 다시 돌린 결과. 안 돌렸으면 null */
  model_fixed: FixedModelBlock | null;
};

// ─────────────────────────────────────────────────────────────
// 화면에 붙는 이름과 단서
// ─────────────────────────────────────────────────────────────

/**
 * ★ note_ja는 「이 줄을 그대로 믿지 말라」는 경고다. 있으면 화면이 반드시 같이 띄운다.
 *   smartphone-novice는 설계상 화면 그림만 보는 프로필인데 vision 미지원이라
 *   실제로는 「본문 없이 링크 이름만」으로 돌았다. 그걸 안 쓰면 거짓 주장이 된다.
 */
const LABELS: Record<string, { label_ja: string; note_ja: string | null }> = {
  control: { label_ja: "制約なし（対照群）", note_ja: null },
  "busy-worker": { label_ja: "時間がない人", note_ja: null },
  "resident-n3": { label_ja: "日本語が母語でない人", note_ja: null },
  "senior-70s": { label_ja: "高齢者", note_ja: null },
  "smartphone-novice": {
    label_ja: "スマホに不慣れな人",
    note_ja:
      "このプロファイルは画面の見た目だけで判断する設計ですが、画像入力が未対応のため、実際には「本文なし・リンク名のみ」で動いています。数値はプロファイル通りの結果ではありません。",
  },
};

const ORDER = ["control", "busy-worker", "resident-n3", "senior-70s", "smartphone-novice"];

/**
 * 用事の短い名前。goal_ja는 화면에 그대로 넣기엔 길다.
 * ★ 여기 없는 用事는 goal_ja를 그대로 쓴다 — 없는 이름을 지어내지 않는다.
 *   Mission 타입(core/types.ts)에 필드를 늘리지 않은 이유는, 그게 전 워크트리의
 *   리베이스를 부르는 계약 변경이기 때문이다. 이건 표시용 이름일 뿐이다.
 */
const TASK_JA: Record<string, string> = {
  tennyu: "転入届の持ち物と窓口を探す",
  juminhyo: "住民票をコンビニで取る方法を探す",
  sodaigomi: "粗大ごみの出し方と手数料を探す",
  kokuho: "国民健康保険の加入手続きを探す",
  hoikuen: "認可保育園の申込受付期間を探す",
};

// ─────────────────────────────────────────────────────────────

type BatchFile = {
  batch_id: string;
  mission_id: string;
  site_name: string;
  run_ids: string[];
  control_run_id: string | null;
  summary: {
    total_runs: number;
    reached: number;
    gave_up: number;
    dropout_rate: number;
    total_cost_usd: number;
    baseline_cost_usd: number | null;
  };
};

function loadTrace(runId: string): RunTrace | null {
  const p = join(RUNS, runId, "trace.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as RunTrace;
}

function cellOf(t: RunTrace, runId: string): Cell {
  const steps = t.steps ?? [];
  // 좌표는 2026-08-12에 붙였다. 그 이전 트레이스에는 없고, 없으면 리플레이를 그릴 수 없다.
  const replayable = steps.some((s) => s.seen?.elements?.some((e) => e.box));
  return {
    run_id: runId,
    profile_id: t.profile_id,
    profile_version: t.profile_version,
    reached: t.verdict.reached,
    outcome: t.verdict.outcome,
    // clicks·seconds도 트레이스가 이미 세어 둔 값이다. 여기서 다시 세지 않는다.
    clicks: t.verdict.clicks,
    seconds: t.verdict.seconds,
    steps: steps.length,
    findings: (t.findings ?? []).length,
    masked_words: steps.reduce((a, s) => a + (s.constraint?.masked?.length ?? 0), 0),
    masked_in_controls: steps.reduce((a, s) => a + (s.constraint?.masked_in_controls ?? 0), 0),
    // 트레이스가 이미 합쳐 둔 값을 쓴다. 여기서 다시 더하면 「어느 쪽이 맞는가」가 생긴다.
    cost_usd: t.cost?.total_usd ?? 0,
    replayable,
  };
}

function main() {
  const missions = JSON.parse(readFileSync(join(ROOT, "missions", "public.json"), "utf8")) as Array<{
    id: string;
    site_name: string;
    start_url: string;
    goal_ja: string;
  }>;

  const dirs = readdirSync(RUNS).filter((d) => d.startsWith("batch__"));
  const bySite = new Map<string, SiteBlock>();

  for (const d of dirs) {
    const b = JSON.parse(readFileSync(join(RUNS, d, "batch.json"), "utf8")) as BatchFile;
    // ★ 중단된 배치는 버린다. 1런짜리 배치는 「키가 없어서 죽은 것」이지 결과가 아니다.
    //   집계에 넣으면 이탈률이 우리에게 유리하게든 불리하게든 오염된다.
    if (b.run_ids.length <= 1) continue;

    const m = missions.find((x) => x.id === b.mission_id);
    // `shinjuku-tennyu` → `tennyu`. 사이트 이름이 앞, 用事가 뒤라는 규칙이 mission id에 있다.
    const taskId = b.mission_id.split("-").slice(1).join("-") || b.mission_id;
    const block =
      bySite.get(b.mission_id) ??
      ({
        mission_id: b.mission_id,
        task_id: taskId,
        task_ja: TASK_JA[taskId] ?? m?.goal_ja ?? taskId,
        site_name: b.site_name,
        start_url: m?.start_url ?? "",
        goal_ja: m?.goal_ja ?? "",
        cells: [],
        findings: [],
        dropout_rate: null,
        control_reached: false,
      } satisfies SiteBlock);

    for (const rid of b.run_ids) {
      const t = loadTrace(rid);
      if (!t) continue;
      // ★ 실험용 프로필(`-exp`)은 공표 집계에 넣지 않는다. 아래 dropout_rate가
      //   「control이 아닌 것 = 제약을 받은 것」으로 세기 때문에, 여기를 통과시키면
      //   control-mobile(=제약 없음) 같은 것이 제약측으로 계산되어 이탈률이 오염된다.
      //   senior-70s-patient도 같은 이유로 이미 `-exp`다. 실험 결과는 FINDINGS.md에 쓴다.
      if (t.profile_version?.endsWith("-exp")) continue;
      block.cells.push(cellOf(t, rid));
      for (const f of t.findings ?? []) {
        block.findings.push({
          run_id: rid,
          profile_id: t.profile_id,
          step_n: f.step_n,
          url: f.url,
          cause_ja: f.cause_ja,
          fix_ja: f.fix_ja,
          evidence: f.evidence ?? [],
          severity: f.severity,
        });
      }
    }
    bySite.set(b.mission_id, block);
  }

  // 실험 배치만 있는 사이트는 칸이 0개로 남는다. 빈 막대가 표에 서면
  // 「0%였다」로 읽히므로 아예 내보내지 않는다 — 재지 않은 것과 0%는 다르다.
  const blocks = [...bySite.values()].filter((s) => s.cells.length > 0);
  for (const s of blocks) {
    // 심각한 것부터. 같은 등급 안에서는 먼저 막힌 쪽이 위다 —
    // 앞 스텝에서 막히면 뒤의 문제는 아예 만나지도 못한다.
    const rank = { high: 0, medium: 1, low: 2 } as const;
    s.findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.step_n - b.step_n);
    s.cells.sort(
      (a, b) => ORDER.indexOf(a.profile_id) - ORDER.indexOf(b.profile_id) || a.run_id.localeCompare(b.run_id),
    );
    const controls = s.cells.filter((c) => c.profile_id === "control");
    // ★ 대조군이 한 번이라도 도달했는가. 전부 실패했다면 그 사이트에서는
    //   「제약이 원인이다」라고 말할 수 없다 — 화면이 이 플래그로 경고를 띄운다.
    s.control_reached = controls.some((c) => c.reached);
    const constrained = s.cells.filter((c) => c.profile_id !== "control");
    s.dropout_rate = constrained.length
      ? constrained.filter((c) => !c.reached).length / constrained.length
      : null;
  }
  blocks.sort((a, b) => (a.dropout_rate ?? 0) - (b.dropout_rate ?? 0));

  // ★ 사이트끼리 비교하려면 用事가 같아야 한다. 「転入届」와 「住民票」를 한 표에 섞으면
  //   막대의 차이가 사이트 탓인지 用事 탓인지 구별되지 않는다 — 그러면 계측이 아니다.
  //   기준선을 손으로 정하지 않는다. **가장 많은 사이트를 덮은 用事**가 비교축이 된다.
  const coverage = new Map<string, number>();
  for (const s of blocks) coverage.set(s.task_id, (coverage.get(s.task_id) ?? 0) + 1);
  const primary = [...coverage.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const sites = blocks.filter((s) => s.task_id === primary);
  const other_tasks = blocks.filter((s) => s.task_id !== primary);

  // 랜딩의 머리기사는 여기서 나온다 — **비교축 안에서만** 센다.
  // 다른 用事를 섞으면 「同じ用事を44回」가 거짓이 된다.
  const all = sites.flatMap((s) => s.cells);
  const everything = blocks.flatMap((s) => s.cells);
  const by_profile = ORDER.map((id) => {
    const cs = all.filter((c) => c.profile_id === id);
    return { id, runs: cs.length, reached: cs.filter((c) => c.reached).length, rate: cs.length ? cs.filter((c) => c.reached).length / cs.length : 0 };
  }).filter((p) => p.runs > 0);

  // 기준선은 배치 파일이 들고 있다. 하나라도 모르면 전체를 null로 둔다 —
  // 모르는 걸 0으로 채우면 절감률이 부풀려진다.
  let baseline: number | null = 0;
  for (const d of dirs) {
    const b = JSON.parse(readFileSync(join(RUNS, d, "batch.json"), "utf8")) as BatchFile;
    if (b.run_ids.length <= 1) continue;
    if (b.summary.baseline_cost_usd == null) baseline = null;
    else if (baseline !== null) baseline += b.summary.baseline_cost_usd;
  }

  // ── 모델 고정 실험 ────────────────────────────────────────────
  // `batchfixed__`는 위 집계에 **일부러 안 들어간다.** 라우팅 조건이 다르므로
  // 도달률도 원가도 같은 표에 놓을 수 없다. 여기서 따로 센다.
  const fixedDirs = readdirSync(RUNS).filter((d) => d.startsWith("batchfixed__"));
  const fixedCells: Array<Cell & { site_name: string }> = [];
  const fixedModels = new Set<string>();
  for (const d of fixedDirs) {
    const b = JSON.parse(readFileSync(join(RUNS, d, "batch.json"), "utf8")) as BatchFile;
    if (b.run_ids.length <= 1) continue;
    for (const rid of b.run_ids) {
      const t = loadTrace(rid);
      if (!t) continue;
      fixedCells.push({ ...cellOf(t, rid), site_name: b.site_name });
      // 실제로 나간 모델을 트레이스에서 읽는다. 설정을 읊지 않는다
      for (const s of t.steps ?? []) for (const c of s.llm_calls ?? []) fixedModels.add(c.model);
    }
  }
  const fixedSites = [...new Set(fixedCells.map((c) => c.site_name))];
  const rateBy = (cells: Cell[]) =>
    ORDER.map((id) => {
      const cs = cells.filter((c) => c.profile_id === id);
      return {
        id,
        runs: cs.length,
        reached: cs.filter((c) => c.reached).length,
        rate: cs.length ? cs.filter((c) => c.reached).length / cs.length : 0,
      };
    }).filter((p) => p.runs > 0);

  const model_fixed: FixedModelBlock | null = fixedCells.length
    ? {
        models: [...fixedModels].sort(),
        runs: fixedCells.length,
        site_names: fixedSites,
        by_profile: rateBy(fixedCells),
        routed_same_sites: rateBy(
          blocks.filter((s) => fixedSites.includes(s.site_name)).flatMap((s) => s.cells),
        ),
      }
    : null;

  const matrix: Matrix = {
    generated_at: new Date().toISOString(),
    profiles: ORDER.filter((id) => everything.some((c) => c.profile_id === id)).map((id) => ({
      id,
      version: everything.find((c) => c.profile_id === id)?.profile_version ?? "?",
      ...LABELS[id],
    })),
    sites,
    other_tasks,
    // ★ 여기만 **전부**를 센다. 실제로 태운 돈은 비교축 밖의 실행에서도 나갔다 —
    //   비교축만 세면 원가가 작아 보인다 (절대규칙 4).
    totals: {
      runs: everything.length,
      reached: everything.filter((c) => c.reached).length,
      cost_usd: everything.reduce((a, c) => a + c.cost_usd, 0),
      baseline_usd: baseline,
      findings: everything.reduce((a, c) => a + c.findings, 0),
      masked_words: everything.reduce((a, c) => a + c.masked_words, 0),
    },
    by_profile,
    model_fixed,
  };

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "matrix.json"), JSON.stringify(matrix, null, 1));

  // ── 리플레이용 트레이스와 스크린샷을 옮긴다 ────────────────────
  // 전부 옮기면 수백 MB다. 「좌표가 있고 + 막힌」 런만 고른다 — 리플레이의 목적이
  // 「헤매는 모습」이므로 도달한 런은 볼 것이 적다. 대조군은 대비용으로 1건만 남긴다.
  // 비교축 밖의 用事도 재생할 수 있어야 한다 — 「転入届だけの話ではない」의 증거가 그쪽이다.
  const picks: Cell[] = [];
  for (const s of blocks) {
    const stuck = s.cells.filter((c) => c.replayable && !c.reached && c.profile_id !== "control");
    const best = stuck.sort((a, b) => b.clicks - a.clicks)[0];
    if (best) picks.push(best);
  }
  // 가장 많이 헤맨 실행을 맨 앞에 둔다 — 리플레이 화면의 기본 표시가 이 순서의 첫 건이다.
  // 사이트 순서대로 두면 「어느 사이트가 먼저냐」라는 무관한 이유로 첫 화면이 정해진다.
  picks.sort((a, b) => b.clicks - a.clicks);
  const ctrl = everything.find((c) => c.replayable && c.profile_id === "control");
  if (ctrl) picks.push(ctrl); // 대조군은 항상 마지막 — 대비용이지 본론이 아니다

  // 이전 회차에서 뽑혔다가 이번에 안 뽑힌 실행은 지운다. 남겨 두면 저장소에
  // 「화면에 안 나오는 스크린샷 수백 장」이 쌓이고, 어느 것이 지금 쓰이는지 알 수 없게 된다.
  // 단, 지우는 것은 **이 스크립트가 만든 것**뿐이다. run_id 형태(`__` 포함)가 아닌
  // 디렉터리는 예전 화면(BeforeAfter·N3Case)이 web/lib/data.ts에서 직접 참조한다.
  const keep = new Set(picks.map((c) => c.run_id));
  if (existsSync(SHOTS_DIR)) {
    for (const d of readdirSync(SHOTS_DIR)) {
      if (d.includes("__") && !keep.has(d)) rmSync(join(SHOTS_DIR, d), { recursive: true, force: true });
    }
  }

  let copied = 0;
  for (const c of picks) {
    const src = join(RUNS, c.run_id);
    const dst = join(SHOTS_DIR, c.run_id);
    if (!existsSync(dst)) mkdirSync(dst, { recursive: true });
    copyFileSync(join(src, "trace.json"), join(dst, "trace.json"));
    for (const f of readdirSync(src).filter((f) => f.endsWith(".png"))) {
      copyFileSync(join(src, f), join(dst, f));
      copied++;
    }
  }
  writeFileSync(join(OUT_DIR, "replays.json"), JSON.stringify(picks.map((c) => c.run_id), null, 1));

  console.log(`matrix.json  : 비교축 [${primary}] ${sites.length}사이트 / ${all.length}런`);
  for (const p of by_profile) console.log(`  ${p.id.padEnd(18)} ${p.reached}/${p.runs}  ${(p.rate * 100).toFixed(0)}%`);
  for (const s of other_tasks) {
    const c = s.cells.filter((x) => x.profile_id !== "control");
    console.log(
      `  [다른 用事] ${s.mission_id.padEnd(20)} ${c.filter((x) => !x.reached).length}/${c.length} 이탈` +
        (s.control_reached ? "" : "  ⚠️ 대조군 미도달 — 제약 탓이라고 말할 수 없다"),
    );
  }
  if (model_fixed) {
    console.log(`모델 고정     : ${model_fixed.models.join(", ")} / ${model_fixed.runs}런 (${model_fixed.site_names.join("・")})`);
    for (const p of model_fixed.by_profile) console.log(`  ${p.id.padEnd(18)} ${p.reached}/${p.runs}  ${(p.rate * 100).toFixed(0)}%`);
  }
  console.log(`replays.json : ${picks.length}런 (스크린샷 ${copied}장 복사)`);
  const b = matrix.totals.baseline_usd;
  console.log(
    `원가         : $${matrix.totals.cost_usd.toFixed(4)}` +
      (b ? `  (기준선 $${b.toFixed(4)} → ${((1 - matrix.totals.cost_usd / b) * 100).toFixed(1)}% 절감)` : "  (기준선 불명 — 표시하지 않는다)"),
  );
}

main();
