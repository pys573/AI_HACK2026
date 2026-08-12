/**
 * リプレイ用にトレースを削る。**サーバーでのみ動く。**
 *
 * 트레이스 1건이 최대 900KB다. 리플레이가 쓰는 것은
 * 「스크린샷 · 누른 요소의 좌표 · 그때 쓴 이유 · 남은 인내」 네 가지뿐이라
 * 나머지(관측 본문 전량·마스킹 원장·위협 기록)는 보내지 않는다.
 *
 * ★ 좌표가 없는 스텝은 표시만 하고 점을 안 찍는다. 「대충 여기쯤」으로 찍으면
 *   그건 우리가 만든 위치이지 실행이 남긴 위치가 아니다 (절대규칙 3).
 */

import { readFileSync, existsSync, openSync, readSync, closeSync } from "node:fs";
import { join } from "node:path";

const SHOTS = join(process.cwd(), "public", "demo", "shots");

/**
 * 스크린샷의 실제 픽셀 크기 = **그때의 화면 크기**다.
 *
 * `page.screenshot()`은 fullPage가 아니라 뷰포트만 찍고, 배율 1로 저장된다.
 * 그래서 PNG의 250x445는 「375px 화면을 1.5배로 확대한 상태의 CSS 화면」과 정확히 같다
 * (375/1.5=250, 667/1.5≈445). 요소 좌표도 같은 좌표계에서 잡혀 있으므로,
 * 나눌 값을 여기서 얻으면 근사가 아니라 **정확한 위치**가 된다.
 *
 * PNG는 앞 24바이트에 크기가 있다 — 8바이트 서명 + 길이 4 + "IHDR" 4 + 가로 4 + 세로 4.
 */
function pngSize(file: string): { w: number; h: number } | null {
  if (!existsSync(file)) return null;
  const fd = openSync(file, "r");
  try {
    const b = Buffer.alloc(24);
    if (readSync(fd, b, 0, 24, 0) < 24) return null;
    if (b.toString("ascii", 12, 16) !== "IHDR") return null;
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  } finally {
    closeSync(fd);
  }
}

export type ReplayStep = {
  n: number;
  /** 시작으로부터 몇 초 */
  t: number;
  kind: string;
  reasonJa: string;
  /** 눌린 요소의 화면 안 위치(%). 스크롤 보정 후. 좌표가 없으면 null */
  hit: { xPct: number; yPct: number; wPct: number; hPct: number; nameJa: string } | null;
  shot: string | null;
  url: string;
  title: string;
  /** 화면에 실제로 보였던 조작요소 수 / 페이지 전체 */
  shown: number;
  total: number;
  maskedCount: number;
  clicksLeft: number | null;
  secondsLeft: number | null;
  ok: boolean;
};

export type Replay = {
  runId: string;
  siteName: string;
  goalJa: string;
  profileId: string;
  profileVersion: string;
  reached: boolean;
  outcome: string;
  reasonJa: string;
  clicks: number;
  seconds: number;
  viewport: { w: number; h: number };
  steps: ReplayStep[];
  findings: Array<{ cause_ja: string; fix_ja: string }>;
};

export function listReplays(): string[] {
  const p = join(process.cwd(), "public", "demo", "replays.json");
  if (!existsSync(p)) return [];
  return JSON.parse(readFileSync(p, "utf8")) as string[];
}

export function loadReplay(runId: string): Replay | null {
  const p = join(SHOTS, runId, "trace.json");
  if (!existsSync(p)) return null;
  // 트레이스 형태는 core/types.ts가 계약이지만, 여기서는 화면이 쓰는 필드만 좁게 읽는다.
  const t = JSON.parse(readFileSync(p, "utf8")) as any;

  const steps: ReplayStep[] = [];
  const t0 = t.steps?.[0] ? new Date(t.steps[0].ts).getTime() : 0;

  let vw = 0;
  let vh = 0;

  for (const s of t.steps ?? []) {
    const scrollY = s.seen?.scroll?.y ?? 0;
    const el =
      typeof s.action?.index === "number" ? s.seen?.elements?.[s.action.index] : undefined;

    // screenshot_key는 이미 run_id를 앞에 달고 있다("<run_id>/step-01.png").
    // 옛 트레이스에는 파일명만 있을 수 있어서 둘 다 받는다.
    const shot: string | null = s.seen?.screenshot_key ?? null;
    const size = shot ? pngSize(shot.includes("/") ? join(SHOTS, shot) : join(SHOTS, runId, shot)) : null;
    if (size) {
      vw = size.w;
      vh = size.h;
    }

    // 스크린샷이 없으면 나눌 기준이 없다. 그러면 안 찍는다 —
    // 기준을 추측해서 찍으면 그건 실행이 남긴 위치가 아니다 (절대규칙 3).
    const hit =
      el?.box && size && s.action?.kind === "click"
        ? {
            xPct: (el.box.x / size.w) * 100,
            yPct: ((el.box.y - scrollY) / size.h) * 100,
            wPct: (el.box.w / size.w) * 100,
            hPct: (el.box.h / size.h) * 100,
            nameJa: el.name || "(名前なし)",
          }
        : null;

    steps.push({
      n: s.n,
      t: t0 ? Math.round((new Date(s.ts).getTime() - t0) / 1000) : 0,
      kind: s.action?.kind ?? "—",
      reasonJa: s.action?.reason_ja ?? "",
      hit,
      shot,
      url: s.seen?.url ?? "",
      title: s.seen?.title ?? "",
      shown: s.constraint?.elements_in_viewport ?? 0,
      total: s.constraint?.elements_total ?? 0,
      maskedCount: s.constraint?.masked?.length ?? 0,
      clicksLeft: s.patience?.clicks_left ?? null,
      secondsLeft: s.patience?.seconds_left ?? null,
      ok: s.action_ok !== false,
    });
  }

  return {
    runId,
    siteName: t.mission?.site_name ?? "",
    goalJa: t.mission?.goal_ja ?? "",
    profileId: t.profile_id,
    profileVersion: t.profile_version,
    reached: t.verdict?.reached ?? false,
    outcome: t.verdict?.outcome ?? "",
    reasonJa: t.verdict?.reason_ja ?? "",
    clicks: t.verdict?.clicks ?? 0,
    seconds: t.verdict?.seconds ?? 0,
    viewport: { w: vw, h: vh },
    steps,
    findings: (t.findings ?? []).map((f: any) => ({ cause_ja: f.cause_ja, fix_ja: f.fix_ja })),
  };
}
