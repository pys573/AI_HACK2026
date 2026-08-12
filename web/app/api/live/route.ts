/**
 * 즉석 실행 API — **화면과 에이전트를 잇는 유일한 통로.**
 *
 * 왜 자식 프로세스인가: `web/`는 별도 패키지라 `playwright`도 `.env`도 없다.
 * 여기서 `agent/src/live.ts`를 띄우고, 그 stdout을 그대로 브라우저로 흘린다.
 * 덕분에 화면은 브라우저 조작을 모르고, 에이전트는 화면을 모른다.
 *
 * 왜 SSE(EventSource)인가: 1회 실행이 5분 넘게 걸린다. 다 끝나고 한 번에 주면
 * 그동안 화면이 죽어 보이고, 제일 볼 만한 부분(헤매는 과정)이 통째로 안 보인다.
 *
 * ⚠️ 동시 실행은 1개로 막는다. 절대규칙 6(도메인당 동시성 1)도 있지만,
 *   더 큰 이유는 원가다 — 이 주소는 터널로 밖에 열린다. 누가 새로고침을 연타하면
 *   그만큼 모델 호출이 나간다. 문을 좁게 열어둔다.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROOT = join(process.cwd(), "..");
/** agent/src/live.ts가 붙이는 접두사. 사람이 읽는 로그와 섞이지 않게 한다 */
const LINE_PREFIX = "@@TZ@@";

/**
 * 실행 중인 프로세스 1개. dev 서버는 모듈을 다시 불러오므로 globalThis에 둔다 —
 * 모듈 스코프에 두면 리로드 때마다 자물쇠가 풀려서 잠금이 되지 않는다.
 */
const slot = globalThis as unknown as { __tzLive?: { pid: number; startedAt: number } | null };

/** 죽은 프로세스가 자물쇠를 쥔 채 남지 않게 한다. 넉넉하게 15분 */
const STALE_MS = 15 * 60 * 1000;

function busy(): boolean {
  const cur = slot.__tzLive;
  if (!cur) return false;
  if (Date.now() - cur.startedAt > STALE_MS) {
    slot.__tzLive = null;
    return false;
  }
  try {
    process.kill(cur.pid, 0); // 살아 있는지만 본다
    return true;
  } catch {
    slot.__tzLive = null;
    return false;
  }
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const target = q.get("url")?.trim() ?? "";
  const task = q.get("task") ?? "tennyu";
  const profile = q.get("profile") ?? "senior-70s";

  const enc = new TextEncoder();
  const sse = (obj: unknown) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);

  if (!target) {
    return new Response(sse({ kind: "failed", message: "URLが指定されていません。" }), {
      headers: { "content-type": "text/event-stream" },
    });
  }
  if (busy()) {
    return new Response(
      sse({
        kind: "failed",
        message: "いま別の実行が動いています。1回の実行に数分かかるため、同時には1件だけ受け付けています。少し待ってからもう一度お試しください。",
      }),
      { headers: { "content-type": "text/event-stream" } },
    );
  }

  // 인자는 배열로 넘긴다. 문자열로 조립하면 URL 안의 따옴표가 셸 명령이 된다
  const args: string[] = [];
  if (existsSync(join(ROOT, ".env"))) args.push("--env-file=.env");
  args.push("agent/src/live.ts", "--url", target, "--task", task, "--profile", profile);

  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  slot.__tzLive = { pid: child.pid ?? -1, startedAt: Date.now() };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let buf = "";
      let closed = false;
      // 자식이 이미 사람이 읽을 수 있는 이유를 보냈는지. 안 그러면 「robots가 막았습니다」가
      // 「コード 1で終了しました」로 덮어써진다 — 사람에게 쓸모없는 쪽이 이긴다
      let toldWhy = false;
      const close = () => {
        if (closed) return;
        closed = true;
        slot.__tzLive = null;
        try {
          controller.close();
        } catch {
          /* 이미 닫힌 스트림 */
        }
      };

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        buf += chunk;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith(LINE_PREFIX)) continue; // 사람이 읽는 로그는 터미널에만 남는다
          try {
            const ev = JSON.parse(line.slice(LINE_PREFIX.length)) as { kind?: string };
            if (ev.kind === "failed") toldWhy = true;
            controller.enqueue(sse(ev));
          } catch {
            /* 깨진 줄 하나로 실행을 죽이지 않는다 */
          }
        }
      });

      // 자식의 에러 로그는 서버 터미널에 남긴다. 화면에 그대로 흘리면 내부 경로가 밖으로 나간다
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (c: string) => process.stderr.write(c));

      child.on("error", (e) => {
        controller.enqueue(sse({ kind: "failed", message: `実行を開始できませんでした: ${e.message}` }));
        toldWhy = true;
        close();
      });

      child.on("close", (code) => {
        // 정상 종료(0)면 done이 이미 나갔다. 이유를 이미 말했으면 덧붙이지 않는다
        if (code !== 0 && !toldWhy) {
          controller.enqueue(
            sse({
              kind: "failed",
              message: "実行が途中で終了しました。時間をおいてもう一度お試しください。",
            }),
          );
        }
        controller.enqueue(sse({ kind: "end" }));
        close();
      });

      // 화면을 닫았는데 브라우저가 계속 돌면 돈만 태운다
      req.signal.addEventListener("abort", () => {
        child.kill("SIGTERM");
        close();
      });
    },
    cancel() {
      child.kill("SIGTERM");
      slot.__tzLive = null;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // 프록시가 버퍼링하면 실시간이 아니게 된다
      "x-accel-buffering": "no",
    },
  });
}
