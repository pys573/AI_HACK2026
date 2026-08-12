/**
 * 즉석 URL 사전 검사 — **모르는 주소를 받기 전에 통과해야 하는 문.**
 *
 * 준비된 5사이트는 우리가 손으로 확인했다. 그런데 화면에서 URL을 받는 순간
 * 대상은 **아무 주소나**가 되고, 손 확인이라는 방어가 통째로 사라진다.
 * 그래서 손으로 하던 확인을 코드로 옮긴다. 여기를 통과하지 않으면 브라우저가 뜨지 않는다.
 *
 *   1. 형태      — http/https만. 그 외 스킴은 전부 거절
 *   2. 목적지    — 사설망·로컬 주소 금지 (**DNS를 실제로 풀어서** 확인한다)
 *   3. robots    — 그 경로를 긁어도 되는지 (절대규칙 6)
 *   4. 도달      — 살아 있는지. 죽은 주소로 5분을 태우지 않는다
 *
 * ★ 2번이 왜 여기 있는가: 이 서비스는 터널로 **밖에서 접근 가능**해진다.
 *   그때 `http://192.168.0.1/` 이나 `http://localhost:3000/` 을 넣으면
 *   우리 노트북·집 공유기 안쪽을 대신 열어보는 도구가 된다. 그건 웹 감사가 아니라 침입이다.
 *   호스트 이름만 보면 못 막는다 — 남의 도메인이 사설 IP를 가리킬 수 있어서,
 *   **주소를 실제로 풀어서** 나온 IP를 본다.
 *
 * ⚠️ robots 해석은 완전하지 않다. `User-agent: *`의 Allow/Disallow를 최장 일치로 볼 뿐이고,
 *   와일드카드(`*`, `$`)는 앞부분만 본다. 애매하면 **막는 쪽으로** 접는다 —
 *   여기서의 오차는 「덜 긁는다」 방향이어야 한다.
 */

import { lookup } from "node:dns/promises";

export type Preflight =
  | { ok: true; url: string; origin: string; status: number; title: string; crawlDelayMs: number }
  | { ok: false; reason_ja: string; detail: string };

/** 절대규칙 6의 하한. robots가 더 길게 요구하면 그쪽을 쓴다 */
const MIN_DELAY_MS = 4000;

/**
 * 우리가 누구인지 밝힌다. 숨기면 그 순간 「탐지 회피」가 되고, 그건 우리가 하는 일이 아니다.
 * 실제 브라우저 조작은 시스템 Chrome이 자기 UA로 하고, 이 UA는 robots.txt·도달 확인 요청에만 쓴다.
 */
const UA = "TsumazukiBot/0.1 (+https://github.com/pys573/AI_HACK2026) read-only";

/**
 * 사설·예약 대역. 여기로 풀리는 주소는 전부 거절한다.
 * 목록은 IANA의 특수 목적 주소 등록부를 따른다 —
 * https://www.iana.org/assignments/iana-ipv4-special-registry/
 * https://www.iana.org/assignments/iana-ipv6-special-registry/
 */
function isPrivateAddress(ip: string, family: number): boolean {
  if (family === 6) {
    const v = ip.toLowerCase();
    // ::1 루프백 / fc00::/7 유니크 로컬 / fe80::/10 링크 로컬 / :: 미지정
    if (v === "::1" || v === "::") return true;
    if (/^f[cd]/.test(v)) return true;
    if (/^fe[89ab]/.test(v)) return true;
    // ::ffff:192.168.0.1 같은 v4 매핑은 v4 규칙으로 다시 본다
    const m = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return isPrivateAddress(m[1], 4);
    return false;
  }

  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true; // 못 읽으면 막는다
  const [a, b] = p;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 사설
  if (a === 127) return true; // 루프백
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 169 && b === 254) return true; // 링크 로컬 (클라우드 메타데이터가 여기 있다)
  if (a === 172 && b >= 16 && b <= 31) return true; // 사설
  if (a === 192 && b === 168) return true; // 사설
  if (a === 192 && b === 0) return true; // 192.0.0/24, 192.0.2/24
  if (a === 198 && (b === 18 || b === 19)) return true; // 벤치마크
  if (a >= 224) return true; // 멀티캐스트·예약
  return false;
}

/**
 * robots.txt 한 장을 읽어 「이 경로를 긁어도 되는가」와 「몇 초 쉬라는가」를 돌려준다.
 * 못 읽으면 **허용**으로 본다 — robots가 없는 사이트가 훨씬 많고,
 * 「파일이 없으니 금지」로 접으면 정상적인 공개 페이지를 대부분 거절하게 된다.
 */
async function readRobots(origin: string, path: string): Promise<{ allowed: boolean; delayMs: number }> {
  let body: string;
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": UA },
    });
    if (!res.ok) return { allowed: true, delayMs: 0 };
    body = await res.text();
  } catch {
    return { allowed: true, delayMs: 0 };
  }

  // `User-agent: *` 그룹만 모은다. 우리 UA를 따로 지정한 사이트는 없다고 보고,
  // 있으면 그건 `*`보다 좁으므로 여기서 놓친 만큼 우리가 손해 보는 방향이다.
  let inStar = false;
  const rules: { allow: boolean; path: string }[] = [];
  let delaySec = 0;

  for (const line of body.split(/\r?\n/)) {
    const s = line.replace(/#.*$/, "").trim();
    if (!s) continue;
    const i = s.indexOf(":");
    if (i < 0) continue;
    const key = s.slice(0, i).trim().toLowerCase();
    const val = s.slice(i + 1).trim();

    if (key === "user-agent") {
      inStar = val === "*";
      continue;
    }
    if (!inStar) continue;
    if (key === "disallow" && val) rules.push({ allow: false, path: val });
    else if (key === "allow" && val) rules.push({ allow: true, path: val });
    else if (key === "crawl-delay") {
      const n = Number(val);
      if (Number.isFinite(n) && n > delaySec) delaySec = n;
    }
  }

  // 최장 일치가 이긴다. 같은 길이면 Allow가 이긴다 (구글·bing 공통 관례)
  let best: { allow: boolean; len: number } | null = null;
  for (const r of rules) {
    // 와일드카드는 앞부분만 본다. `*` 뒤는 무시 = 더 넓게 잡힌다 = 더 자주 막힌다 = 안전한 쪽
    const head = r.path.split("*")[0].replace(/\$$/, "");
    if (!path.startsWith(head)) continue;
    if (!best || head.length > best.len || (head.length === best.len && r.allow)) {
      best = { allow: r.allow, len: head.length };
    }
  }

  return { allowed: best ? best.allow : true, delayMs: Math.round(delaySec * 1000) };
}

export async function preflight(input: string): Promise<Preflight> {
  // ── 1. 형태 ────────────────────────────────────────────
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return { ok: false, reason_ja: "URLの形式が正しくありません。", detail: input };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, reason_ja: "http / https のページだけを対象にしています。", detail: u.protocol };
  }
  if (u.username || u.password) {
    return { ok: false, reason_ja: "認証情報付きのURLは受け付けません。", detail: "user:pass@" };
  }

  // ── 2. 목적지 ──────────────────────────────────────────
  let addrs: { address: string; family: number }[];
  try {
    addrs = await lookup(u.hostname, { all: true });
  } catch (e) {
    return {
      ok: false,
      reason_ja: "このドメインが見つかりませんでした。",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
  // 하나라도 사설이면 막는다. 「공개 IP도 있으니 괜찮다」로 접으면 우회로가 생긴다
  const bad = addrs.find((a) => isPrivateAddress(a.address, a.family));
  if (bad) {
    return {
      ok: false,
      reason_ja: "社内ネットワークやローカル環境のアドレスは対象にできません。公開されているページのみ実行します。",
      detail: `${u.hostname} → ${bad.address}`,
    };
  }

  // ── 3. robots ─────────────────────────────────────────
  const robots = await readRobots(u.origin, u.pathname);
  if (!robots.allowed) {
    return {
      ok: false,
      reason_ja: "このページは robots.txt で自動アクセスが禁止されています。ルールに従って実行しません。",
      detail: `${u.origin}/robots.txt disallows ${u.pathname}`,
    };
  }

  // ── 4. 도달 ───────────────────────────────────────────
  // ★ 여기서 GET을 1회 쓴다. HEAD만 보내는 사이트는 405를 주는 곳이 많아서,
  //   「죽었다」와 「HEAD를 안 받는다」가 구별되지 않는다.
  let status: number;
  let title = "";
  try {
    const res = await fetch(u.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: { "user-agent": UA, "accept-language": "ja-JP,ja;q=0.9" },
    });
    status = res.status;
    const html = (await res.text()).slice(0, 20_000);
    title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim().slice(0, 120) ?? "";
  } catch (e) {
    return {
      ok: false,
      reason_ja: "ページに接続できませんでした。URLをご確認ください。",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
  if (status >= 400) {
    return {
      ok: false,
      reason_ja: `ページが開けませんでした（HTTP ${status}）。`,
      detail: `${status} ${u.toString()}`,
    };
  }

  return {
    ok: true,
    url: u.toString(),
    origin: u.origin,
    status,
    title,
    crawlDelayMs: Math.max(MIN_DELAY_MS, robots.delayMs),
  };
}

// ── CLI ──────────────────────────────────────────────────────
// node agent/src/preflight.ts https://www.city.shibuya.tokyo.jp/
if (import.meta.main) {
  const target = process.argv[2];
  if (!target) {
    console.error("사용법: node agent/src/preflight.ts <url>");
    process.exit(1);
  }
  const r = await preflight(target);
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}
