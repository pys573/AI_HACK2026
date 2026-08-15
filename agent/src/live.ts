/**
 * 즉석 실행 — **그 자리에서 받은 URL을 실제로 돌린다.**
 *
 * 지금까지의 실행은 전부 `missions/public.json`에 미리 적힌 9건이었다.
 * 심사위원은 자기가 아는 사이트를 넣어본다. 그때 아무 일도 안 일어나면
 * 「미리 준비한 것만 되는 도구」가 되고, 실측 105회의 신뢰도까지 같이 떨어진다.
 *
 * 이 파일이 하는 일:
 *   1. `preflight()`로 문을 통과시킨다 (형태·사설망·robots·도달)
 *   2. URL + 용무 → **즉석 미션**을 만든다 (정답 키는 없다)
 *   3. `runOnce()`를 돌리고, 진행 상황을 **한 줄 하나의 JSON**으로 흘린다
 *
 * ★ 왜 CLI인가: `web/`은 별도 패키지라 `playwright`도 `.env`도 없다.
 *   화면 쪽에서 이 프로세스를 자식으로 띄우고 stdout을 읽는다.
 *   그래서 웹은 브라우저를 몰라도 되고, 에이전트는 웹을 몰라도 된다.
 *
 * ★ 왜 접두사(`@@TZ@@`)를 붙이는가: 같은 stdout에 사람이 읽는 로그도 흐른다.
 *   접두사가 없으면 화면이 로그 한 줄에 JSON 파싱으로 죽는다.
 *   로그를 없애는 선택지는 안 쓴다 — 터미널에서 무슨 일이 일어나는지 보이는 편이 낫다.
 *
 * 사용:
 *   node --env-file=.env agent/src/live.ts --url https://... --task tennyu --profile senior-70s
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Mission } from "../../core/types.ts";
import { preflight } from "./preflight.ts";
import { runOnce, type Progress } from "./run.ts";

const ROOT = join(import.meta.dirname, "..", "..");
/** 즉석 실행은 절대 `agent/runs/`에 쓰지 않는다 — 이유는 run.ts의 outDir 주석 */
const LIVE_DIR = join(ROOT, "agent", "live");

export type Task = {
  id: string;
  label_ja: string;
  goal_ja: string;
  intent_ja: string;
  /**
   * 이 용무가 나오는 사이트가 **몇 수짜리인가.** 없으면 20.
   *
   * 자치체 사이트는 20수로 충분하다(`missions/public.json`의 9건 전부 20).
   * 은행·통신·대학은 원래부터 30이었다 — `japanpost-*`·`keio-grad`·`aoyama-grad`가 그렇다.
   * 즉석 실행만 전부 20으로 굳어 있어서, 실측으로 **대조군이 목적지 한 칸 앞에서 잘렸다**
   * (慶應 `/admissions/fee/faculty/`·青学 `/life/expenses/` 도착이 20수째였다).
   * 그러면 화면에는 「사이트가 어렵다」가 아니라 **「우리 도구가 못 한다」**로 보인다.
   */
  max_steps?: number;
};

export function loadTasks(): Task[] {
  return JSON.parse(readFileSync(join(ROOT, "missions", "tasks.json"), "utf8")) as Task[];
}

/** 한 줄 하나의 JSON. 접두사가 붙은 줄만 화면이 읽는다 */
export const LINE_PREFIX = "@@TZ@@";
function send(p: Progress) {
  process.stdout.write(`${LINE_PREFIX}${JSON.stringify(p)}\n`);
}

/**
 * `<title>`에서 사이트 이름만 뽑는다.
 * 「渋谷区公式サイト | 渋谷区ポータル」처럼 구분자 뒤에 캐치프레이즈가 붙는 곳이 많아서,
 * 그대로 두면 화면의 사이트 이름이 한 줄을 넘어간다. 못 뽑으면 호스트 이름을 쓴다.
 */
export function siteNameFrom(title: string, host: string): string {
  const head = title.split(/[|｜\-–—:：]/)[0].trim();
  return head.length >= 2 && head.length <= 30 ? head : host;
}

/**
 * URL + 용무 → 즉석 미션.
 *
 * `id`가 `live__`로 시작하는 이유는 두 가지다:
 *   · `missions/keys/`에 이 id가 있을 리 없다 → `hasKey()`가 false → 판정이 AI 하나임이 자동으로 기록된다
 *   · 나중에 파일 이름만 보고 「이건 즉석 실행」임을 구별할 수 있다
 */
export function adhocMission(url: string, task: Task, title: string, maxSteps: number): Mission {
  const host = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, "");
  return {
    id: `live__${task.id}__${host}__${Date.now()}`,
    track: "public",
    site_id: host,
    site_name: siteNameFrom(title, host),
    start_url: url,
    goal_ja: task.goal_ja,
    intent_ja: task.intent_ja,
    max_steps: maxSteps,
  };
}

// ── CLI ──────────────────────────────────────────────────────
if (import.meta.main) {
  const argv = process.argv.slice(2);
  const arg = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const url = arg("url");
  const taskId = arg("task") ?? "tennyu";
  const profileId = arg("profile") ?? "senior-70s";
  const maxStepsArg = arg("max-steps");

  // never를 명시해야 아래에서 「여기를 지났으면 값이 있다」로 좁혀진다
  const fail = (message: string): never => {
    send({ kind: "failed", message });
    process.exit(1);
  };

  if (!url) fail("URLが指定されていません。");

  const task = loadTasks().find((t) => t.id === taskId);
  if (!task) fail(`用事が見つかりません: ${taskId}`);

  // ── 1. 문 ──────────────────────────────────────────────
  console.log(`\n▶ 사전 검사: ${url}`);
  const pf = await preflight(url);
  if (!pf.ok) {
    console.log(`  ✗ ${pf.reason_ja} (${pf.detail})`);
    fail(pf.reason_ja);
  }
  console.log(`  ✓ ${pf.status} ${pf.title}  간격 ${pf.crawlDelayMs}ms`);

  // ── 2. 즉석 미션 ────────────────────────────────────────
  // 손으로 준 값 > 용무에 적힌 값 > 20. 손으로 준 값이 이겨야 검증용으로 짧게 돌릴 수 있다
  const mission = adhocMission(pf.url, task, pf.title, Number(maxStepsArg ?? task.max_steps ?? 20));

  // ── 3. 실행 ────────────────────────────────────────────
  try {
    await runOnce({
      mission,
      profileId,
      outDir: LIVE_DIR,
      // robots가 더 긴 간격을 요구하면 그쪽을 따른다. 절대규칙 6의 4초는 하한이다
      delayMs: pf.crawlDelayMs,
      headless: process.env.HEADED !== "1",
      onProgress: send,
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.error(`  ⚠️ 실행 실패: ${m}`);
    send({ kind: "failed", message: `実行に失敗しました: ${m.slice(0, 200)}` });
    process.exit(1);
  }
}
