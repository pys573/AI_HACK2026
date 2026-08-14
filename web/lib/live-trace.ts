/**
 * 즉석 실행 1회의 기록(`agent/live/<run_id>/trace.json`)을 결과 화면용으로 읽는다.
 *
 * ★ 왜 SSE 스트림이 아니라 저장된 파일을 읽는가:
 *   ① 스트림의 `done` 이벤트에는 `baseline_usd`가 없다. 절감률을 화면에 낼 수 없다.
 *   ② 화면 상태로만 들고 있으면 **새로고침 한 번에 결과가 사라진다.** 무대에서 결과 화면을
 *      다시 열 수 없다는 뜻이고, 그건 절대규칙 7(라이브에 의존하지 않는다)에 정면으로 걸린다.
 *
 * ⚠️ run_id를 그대로 믿지 않는다. 이 주소는 터널로 밖에 열린다 —
 *   `?run=../../.env` 같은 값이 오면 우리 열쇠 파일을 읽는 구멍이 된다.
 *   `/api/live/shot`과 **같은 규율**로 문자 종류까지 못 박는다.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadTasks } from "./tasks";

const LIVE = join(process.cwd(), "..", "agent", "live");
/** run_id는 `live__<task>__<host>__<시각>__<profile>__v0__<시각>` 형태다 */
const SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/;

/** 화면에서 지우는 줄. 원문(트레이스)은 손대지 않는다 — 기록은 기록이다 */
const NOTICE = "※";

/**
 * ※ 이후를 통째로 잘라낸다.
 *
 * 판정문에서는 고지가 제 줄에 있지만, 근거 줄을 만들 때 `brief()`가 줄바꿈을 공백으로
 * 접어버려서(`agent/src/signals.ts`) 문장 한가운데로 딸려 들어온다. 그래서 줄 단위가
 * 아니라 글자 위치로 자른다.
 *
 * 고지 자체를 없애는 게 아니라 **한 번만 내는 것**이다 — 화면 맨 아래 회색 줄에 있다.
 * 근거마다 같은 문장이 붙으면 그건 성실함이 아니라 잡음이고, 정작 읽어야 할 실측값이 묻힌다.
 */
function stripNotice(s: string): string {
  const i = s.indexOf(NOTICE);
  return (i < 0 ? s : s.slice(0, i)).trim();
}

export type MaskedWord = {
  surface: string;
  hits: number;
  /** `comprehension_rate`면 %를 붙일 수 있고, `designated_list`면 붙일 수 없다 */
  basis: string;
  comprehension: number | null;
  evidenceJa: string;
};

export type ResultFinding = {
  stepN: number;
  /** 걸림의 종류. **08-14 이전 트레이스에는 없다** → 빈 문자열로 온다 (core/types.ts 참조) */
  kind: string;
  severity: string;
  causeJa: string;
  fixJa: string;
  evidence: string[];
};

export type ResultData = {
  runId: string;
  createdAt: string;
  siteName: string;
  siteHost: string;
  startUrl: string;
  taskLabelJa: string;
  goalJa: string;
  profileId: string;
  profileVersion: string;
  reached: boolean;
  outcome: string;
  /** ※ 고지를 걷어낸 판정문. 고지는 화면 아래에서 한 번만 낸다 */
  reasonJa: string;
  clicks: number;
  seconds: number;
  steps: number;
  maxSteps: number;
  /** 첫 화면에서 실제로 보였던 조작 요소 / 그 페이지에 있던 전부 */
  firstSeen: number;
  firstTotal: number;
  maskedWords: MaskedWord[];
  maskedHits: number;
  findings: ResultFinding[];
  threats: number;
  costUsd: number;
  /** 전부 최상위 모델로 돌렸다면. **가격표에서 나온 계산치다** (절대규칙 4) */
  baselineUsd: number;
  calls: number;
  lastShotKey: string | null;
};

type RawMask = {
  surface?: string;
  basis?: string;
  comprehension?: number | null;
  evidence_ja?: string;
};

type RawStep = {
  n: number;
  seen?: { screenshot_key?: string | null };
  constraint?: {
    masked?: RawMask[];
    elements_total?: number;
    elements_in_viewport?: number;
  };
  threats?: unknown[];
};

export function loadLiveResult(runId: string): ResultData | null {
  if (!SAFE.test(runId) || runId.includes("..")) return null;

  let t: Record<string, any>;
  try {
    t = JSON.parse(readFileSync(join(LIVE, runId, "trace.json"), "utf8"));
  } catch {
    return null;
  }
  if (!t?.verdict || !Array.isArray(t.steps)) return null;

  const steps = t.steps as RawStep[];
  const first = steps[0]?.constraint;

  // 같은 말이 여러 번 걸린다. 화면에는 **말의 종류**를 세서 보여주고, 횟수는 따로 센다
  const byWord = new Map<string, MaskedWord>();
  let maskedHits = 0;
  for (const s of steps) {
    for (const h of s.constraint?.masked ?? []) {
      const w = h.surface ?? "";
      if (!w) continue;
      maskedHits++;
      const prev = byWord.get(w);
      if (prev) prev.hits++;
      else
        byWord.set(w, {
          surface: w,
          hits: 1,
          basis: h.basis ?? "",
          comprehension: typeof h.comprehension === "number" ? h.comprehension : null,
          evidenceJa: h.evidence_ja ?? "",
        });
    }
  }
  // 이해율이 낮은 말이 앞. 이해율이 없는 말(지정 명단)은 걸린 횟수 순
  const maskedWords = [...byWord.values()].sort((a, b) => {
    if (a.comprehension !== null && b.comprehension !== null) return a.comprehension - b.comprehension;
    if (a.comprehension !== null) return -1;
    if (b.comprehension !== null) return 1;
    return b.hits - a.hits;
  });

  const missionId = String(t.mission?.id ?? "");
  const taskId = missionId.split("__")[1] ?? "";
  const taskLabelJa = loadTasks().find((x) => x.id === taskId)?.label_ja ?? taskId;

  let siteHost = "";
  try {
    siteHost = new URL(String(t.mission?.start_url ?? "")).host;
  } catch {
    siteHost = String(t.mission?.site_id ?? "");
  }

  const reasonJa = String(t.verdict.reason_ja ?? "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith(NOTICE))
    .map(stripNotice)
    .join("\n")
    .trim();

  const lastShot = [...steps].reverse().find((s) => s.seen?.screenshot_key)?.seen?.screenshot_key;

  return {
    runId: String(t.run_id ?? runId),
    createdAt: String(t.created_at ?? ""),
    siteName: String(t.mission?.site_name ?? siteHost),
    siteHost,
    startUrl: String(t.mission?.start_url ?? ""),
    taskLabelJa,
    goalJa: String(t.mission?.goal_ja ?? ""),
    profileId: String(t.profile_id ?? ""),
    profileVersion: String(t.profile_version ?? ""),
    reached: Boolean(t.verdict.reached),
    outcome: String(t.verdict.outcome ?? ""),
    reasonJa,
    clicks: Number(t.verdict.clicks ?? 0),
    seconds: Number(t.verdict.seconds ?? 0),
    steps: steps.length,
    maxSteps: Number(t.mission?.max_steps ?? 0),
    firstSeen: Number(first?.elements_in_viewport ?? 0),
    firstTotal: Number(first?.elements_total ?? 0),
    maskedWords,
    maskedHits,
    findings: (t.findings ?? []).map((f: Record<string, any>) => ({
      stepN: Number(f.step_n ?? 0),
      kind: String(f.kind ?? ""),
      severity: String(f.severity ?? ""),
      causeJa: String(f.cause_ja ?? ""),
      fixJa: String(f.fix_ja ?? ""),
      evidence: Array.isArray(f.evidence) ? f.evidence.map((e: unknown) => stripNotice(String(e))) : [],
    })),
    threats: steps.reduce((n, s) => n + (s.threats?.length ?? 0), 0),
    costUsd: Number(t.cost?.total_usd ?? 0),
    baselineUsd: Number(t.cost?.baseline_usd ?? 0),
    calls: Number(t.cost?.calls ?? 0),
    lastShotKey: lastShot ?? null,
  };
}
