/**
 * scripts/build-web-data.ts가 만든 집계를 읽는다. **서버에서만 돈다.**
 *
 * 여기서도 숫자를 만들지 않는다. 만드는 곳은 build-web-data.ts 한 곳이다.
 * 이 파일은 읽고 라벨을 붙일 뿐이다 (절대규칙 3·4).
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DEMO = join(process.cwd(), "public", "demo");

export type Cell = {
  run_id: string;
  profile_id: string;
  profile_version: string;
  reached: boolean;
  outcome: string;
  clicks: number;
  seconds: number;
  steps: number;
  findings: number;
  masked_words: number;
  masked_in_controls: number;
  cost_usd: number;
  replayable: boolean;
};

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
  /** 用事の種類. 사이트 비교는 같은 task_id 안에서만 성립한다 */
  task_id: string;
  task_ja: string;
  site_name: string;
  start_url: string;
  goal_ja: string;
  cells: Cell[];
  findings: FindingRow[];
  dropout_rate: number | null;
  control_reached: boolean;
};

/** 모델을 못 박고 다시 돌린 결과. 「差는 制約인가 モデル인가」를 가르는 실험 */
export type FixedModelBlock = {
  models: string[];
  runs: number;
  site_names: string[];
  by_profile: Array<{ id: string; runs: number; reached: number; rate: number }>;
  /** 같은 사이트의 라우팅 실행. 이것과 나란히 놓아야 비교가 성립한다 */
  routed_same_sites: Array<{ id: string; runs: number; reached: number; rate: number }>;
};

export type Matrix = {
  generated_at: string;
  profiles: Array<{ id: string; version: string; label_ja: string; note_ja: string | null }>;
  /** 비교축(같은 用事)의 사이트들 */
  sites: SiteBlock[];
  /** 비교축 밖의 用事. 없으면 빈 배열 */
  other_tasks: SiteBlock[];
  totals: {
    runs: number;
    reached: number;
    cost_usd: number;
    baseline_usd: number | null;
    findings: number;
    masked_words: number;
  };
  by_profile: Array<{ id: string; runs: number; reached: number; rate: number }>;
  model_fixed: FixedModelBlock | null;
};

export function loadMatrix(): Matrix | null {
  const p = join(DEMO, "matrix.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as Matrix;
}

/**
 * 왜 멈췄는가를 일본어 한 마디로.
 * ★ error는 「제약이 세서 실패」가 **아니다.** 우리 쪽 미구현이다.
 *   같은 ×로 칠하면 사이트 탓으로 읽힌다 — 그러면 거짓말이 된다.
 */
export function outcomeLabel(o: string): { ja: string; tone: "clear" | "stumble" | "blocked" | "neutral" } {
  if (o === "reached") return { ja: "到達", tone: "clear" };
  if (o.startsWith("gave_up")) return { ja: "諦めた", tone: "blocked" };
  if (o === "max_steps") return { ja: "手数上限", tone: "stumble" };
  if (o === "error") return { ja: "計測不能", tone: "neutral" };
  return { ja: o, tone: "neutral" };
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}`;
}

export function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}分${String(s).padStart(2, "0")}秒` : `${s}秒`;
}
