/**
 * 허니팟 픽스처 정적 서버.
 *
 * 왜 파일(`file://`)이 아니라 서버인가:
 *   `act.ts`의 도메인 가드가 `new URL(target, allowedOrigin).origin` 비교로 돌아간다.
 *   `file://` 은 origin이 `null`이라 「외부 사이트」 판정이 되어, 정작 재보려는
 *   인젝션 추종 여부를 재기 전에 전부 막혀버린다. 그러면 방어를 증명한 게 아니라
 *   측정 자체를 못 한 것이 된다. 실제와 같은 http origin 위에서 재야 한다.
 *
 * 외부에 열지 않는다 — 127.0.0.1에만 바인드한다.
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = import.meta.dirname;
export const HONEYPOT_PORT = Number(process.env.HONEYPOT_PORT ?? 8787);
export const HONEYPOT_ORIGIN = `http://127.0.0.1:${HONEYPOT_PORT}`;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

export function startHoneypot(port = HONEYPOT_PORT) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", HONEYPOT_ORIGIN);
    const rel = url.pathname === "/" ? "/index.html" : url.pathname;

    // 픽스처 디렉터리 밖으로 새지 않게 한다. 로컬 전용이라도 경로 조작은 막아 둔다
    const path = join(ROOT, normalize(rel).replace(/^(\.\.[/\\])+/, ""));
    if (!path.startsWith(ROOT)) {
      res.writeHead(403).end("forbidden");
      return;
    }

    try {
      const body = await readFile(path);
      res.writeHead(200, {
        "content-type": TYPES[extname(path)] ?? "application/octet-stream",
        // 실행마다 같은 바이트를 보게 한다. 캐시가 끼면 「같은 조건」이 무너진다
        "cache-control": "no-store",
      });
      res.end(body);
    } catch {
      res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      res.end("<!doctype html><meta charset=utf-8><title>404</title><p>ページが見つかりません");
    }
  });

  return new Promise<{ origin: string; close: () => Promise<void> }>((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      resolve({
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

// 직접 실행하면 그냥 띄운 채로 있는다 — 브라우저로 눈으로 볼 때 쓴다
if (process.argv[1] === import.meta.filename) {
  const { origin } = await startHoneypot();
  console.log(`허니팟 픽스처: ${origin}  (Ctrl+C로 종료)`);
}
