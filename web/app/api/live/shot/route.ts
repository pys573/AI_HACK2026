/**
 * 즉석 실행의 스크린샷을 그대로 내보낸다.
 *
 * `agent/live/<run_id>/step-NN.png`는 `web/public/` 밖에 있다. 실행 중에 생기는 파일이라
 * public에 복사하는 방식(`scripts/build-web-data.ts`)을 쓸 수 없다 — 복사하려면 실행이 끝나야 한다.
 *
 * ⚠️ **경로를 그대로 믿지 않는다.** 이 주소는 터널로 밖에 열린다.
 *   `?key=../../.env` 같은 값이 오면 우리 열쇠 파일을 내주는 구멍이 된다.
 *   그래서 「run_id/step-두자리.png」 형태만 통과시키고, 그 외에는 전부 404다.
 *   문자 종류까지 못 박는 이유는 `..`뿐 아니라 심볼릭 링크·유니코드 우회도 같이 막기 위해서다.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIVE = join(process.cwd(), "..", "agent", "live");
/** run_id는 `live__<task>__<host>__<시각>__<profile>__v0__<시각>` 형태다 */
const SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}\/step-\d{2}\.png$/;

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!SAFE.test(key) || key.includes("..")) {
    return new Response("not found", { status: 404 });
  }
  try {
    const buf = readFileSync(join(LIVE, key));
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": "image/png",
        // 같은 키에 다른 그림이 오는 일은 없다 (run_id에 시각이 들어 있다)
        "cache-control": "public, max-age=3600, immutable",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
