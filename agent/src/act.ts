/**
 * A-3 · act() — 액션을 실제 조작으로 바꾼다.
 *
 * 두 가지를 여기서 강제한다. 문서가 아니라 코드로 강제한다.
 *
 *   1) **도구 제약** — 프로필이 허용하지 않은 종류는 실행하지 않는다.
 *      스키마에서 이미 뺐지만 여기서 한 번 더 막는다. 우회로가 생기면 제품이 사라지기 때문에
 *      「스키마를 고쳤더니 뚫렸다」가 일어나면 안 된다.
 *
 *   2) **읽기 전용** — 공개 www 밖으로 못 나간다. 전자신청 SaaS·로그인·회원가입 금지.
 *      ToS 위반과 업무방해 리스크가 전부 거기서 발생한다.
 */

import type { Page } from "playwright";
import type { Action } from "../../core/types.ts";
import type { Element, RawObservation } from "./observe.ts";
import type { Profile } from "./constrain.ts";

export type ActResult = {
  ok: boolean;
  error: string | null;
  navigated: boolean;
  /** 도구가 돌려준 정보 (find_in_page의 히트 수 등). 다음 스텝 히스토리에 실린다 */
  tool_note: string | null;
  /** 가드가 막은 경우의 기록. 트레이스에 남겨 화면에 띄운다 */
  blocked: { reason: string; target: string } | null;
};

const ok = (navigated = false, tool_note: string | null = null): ActResult => ({
  ok: true,
  error: null,
  navigated,
  tool_note,
  blocked: null,
});
const fail = (error: string): ActResult => ({ ok: false, error, navigated: false, tool_note: null, blocked: null });
const guard = (reason: string, target: string): ActResult => ({
  ok: false,
  error: `guard: ${reason}`,
  navigated: false,
  tool_note: null,
  blocked: { reason, target },
});

/**
 * 전자신청 SaaS·인증 기반 서비스. 여기 들어가는 순간 읽기 전용이 아니게 된다.
 * 区 사이트에서 링크로 연결돼 있으므로 반드시 막아야 한다.
 */
const BANNED_HOST_PATTERNS = [
  /(^|\.)myna\.go\.jp$/, // ぴったりサービス / マイナポータル
  /(^|\.)graffer\.jp$/,
  /(^|\.)logoform\.jp$/,
  /(^|\.)e-shinsei\./,
  /(^|\.)shinsei\./,
  /(^|\.)elg-front\.jp$/, // 電子申請 共同利用
];

const BANNED_SCHEMES = ["mailto:", "tel:", "javascript:"];

/** 도메인당 4초 이상 간격. 공공 사이트에 부하를 주지 않는다 (절대규칙 6). */
export class RateLimiter {
  readonly minMs: number;
  last = 0;

  constructor(minMs: number) {
    this.minMs = minMs;
  }

  async wait(page: Page): Promise<void> {
    const gap = Date.now() - this.last;
    if (this.last > 0 && gap < this.minMs) {
      await page.waitForTimeout(this.minMs - gap);
    }
    this.last = Date.now();
  }
}

function hostAllowed(target: string, allowedOrigin: string): { allowed: boolean; reason: string } {
  let u: URL;
  try {
    u = new URL(target, allowedOrigin);
  } catch {
    return { allowed: false, reason: "URL로 해석되지 않음" };
  }
  if (BANNED_SCHEMES.some((s) => u.protocol === s.replace(":", "") + ":")) {
    return { allowed: false, reason: `허용되지 않는 스킴 (${u.protocol})` };
  }
  if (BANNED_HOST_PATTERNS.some((re) => re.test(u.hostname))) {
    return { allowed: false, reason: "電子申請サービス — 읽기 전용 범위 밖" };
  }
  if (u.origin !== new URL(allowedOrigin).origin) {
    return { allowed: false, reason: `외부 사이트 (${u.hostname})` };
  }
  return { allowed: true, reason: "" };
}

/**
 * target=_blank를 없앤다. **우리 브라우저의 DOM만 건드리며 사이트에는 아무 영향이 없다.**
 * 새 탭이 열리면 뒤로가기 이력이 끊겨 「헤맨 경로」를 추적할 수 없게 된다.
 */
const DEFANG_TARGETS = `() => {
  for (const a of document.querySelectorAll('[target]')) a.removeAttribute('target');
  return true;
}`;

async function settle(page: Page, rl: RateLimiter): Promise<void> {
  try {
    await page.waitForLoadState("domcontentloaded", { timeout: 20_000 });
  } catch {
    /* 느린 페이지도 있는 그대로 관측한다. 타임아웃 자체가 사용성 데이터다 */
  }
  await page.waitForTimeout(1200);
  await page.evaluate(`(${DEFANG_TARGETS})()`).catch(() => {});
  await rl.wait(page);
}

export async function act(
  page: Page,
  action: Action,
  raw: RawObservation,
  /** 에이전트에게 실제로 보여준 요소들. `Observation.elements`와 같은 순서다 */
  visible: Element[],
  profile: Profile,
  allowedOrigin: string,
  rl: RateLimiter,
  backsUsed: number,
): Promise<ActResult> {
  const t = profile.tools;

  // ── 도구 제약. 스키마 뒤의 두 번째 자물쇠 ────────────────────────
  if (action.kind === "find_in_page" && !t.find_in_page) return fail("이 프로필에 find_in_page 없음");
  if (action.kind === "site_search" && !t.site_search) return fail("이 프로필에 site_search 없음");
  if (action.kind === "back" && t.back_limit !== null && backsUsed >= t.back_limit) {
    return fail(`back 한도 초과 (${t.back_limit})`);
  }
  // 좌우 스크롤만 조건이 다르다. 프로필이 아니라 **화면이** 허락한다.
  // 옆으로 잘리지도 않은 페이지에서 옆으로 밀면 아무 일도 안 일어나고, 그 빈 수가
  // 「제약 때문에 헤맸다」로 집계된다. 스키마에서 이미 뺐지만 여기서 한 번 더 막는다.
  if (action.kind === "scroll_side" && !raw.scroll.overflow_x) {
    return fail("이 화면은 옆으로 잘려 있지 않다");
  }

  switch (action.kind) {
    case "give_up":
      return ok();

    case "scroll": {
      // ★ 단위는 px가 아니라 「화면 몇 개분」이다.
      //   px로 물으면 모델은 0·3·10 같은 값을 낸다. 그건 스크롤이 아니라 제자리걸음이고,
      //   그 제자리걸음이 「제약 때문에 헤맸다」로 집계되면 측정이 거짓이 된다.
      //   사람도 픽셀로 스크롤하지 않는다 — 한 화면씩 넘긴다.
      const vp = page.viewportSize();
      const h = vp?.height ?? 400;
      const asked = action.delta ?? 1;
      const screens = asked === 0 ? 1 : Math.max(-3, Math.min(3, asked));
      // 0.85배. 사람은 한 화면을 꽉 채워 넘기지 않고 몇 줄을 겹쳐 남긴다.
      await page.mouse.wheel(0, Math.round(screens * h * 0.85));
      await page.waitForTimeout(600);
      // 실제로 움직인 양을 돌려준다. 모델이 요청한 값과 다를 수 있고,
      // 「끝까지 내려갔다」고 착각한 채 다음 수를 두면 안 된다.
      return ok(false, `${screens > 0 ? "下" : "上"}に${Math.abs(screens)}画面分動いた`);
    }

    case "scroll_side": {
      // 줌 200%는 창을 좁히는 것과 같다. 좁아진 창에 맞춰 다시 배치되지 않는 사이트에서는
      // 오른쪽 끝(検索・お問い合わせ 같은 것들)이 화면 밖으로 나가고, 브라우저는 아래에
      // 가로 막대를 띄운다. 그 막대를 끄는 동작이 여기다.
      const vp = page.viewportSize();
      const w = vp?.width ?? 400;
      const asked = action.delta ?? 1;
      const screens = asked === 0 ? 1 : Math.max(-3, Math.min(3, asked));
      const dx = Math.round(screens * w * 0.85); // 세로와 같은 0.85배. 몇 글자를 겹쳐 남긴다

      const before = (await page.evaluate("window.scrollX")) as number;
      await page.mouse.wheel(dx, 0);
      await page.waitForTimeout(600);
      let after = (await page.evaluate("window.scrollX")) as number;

      // 휠은 **커서 밑에 있는 것**을 굴린다. 커서 자리에 가로로 안 움직이는 요소(고정 헤더 등)가
      // 있으면 문서는 그대로다. 사람은 그럴 때 아래 가로 막대를 끌면 그만이다 —
      // 없는 능력을 주는 게 아니라, 있는 능력이 커서 위치 때문에 안 닿은 것을 잇는 것이다.
      if (after === before) {
        await page.evaluate(`window.scrollBy(${dx}, 0)`).catch(() => {});
        await page.waitForTimeout(400);
        after = (await page.evaluate("window.scrollX")) as number;
      }

      // ★ 요청한 값이 아니라 **실제로 움직인 양**을 돌려준다.
      //   끝에 닿았는데 「움직였다」고 하면 모델은 같은 방향으로 계속 밀고,
      //   그 헛수고가 「제약 때문에 헤맸다」로 집계된다. 우리 쪽 잡음을 측정에 섞지 않는다.
      const moved = after - before;
      return ok(
        false,
        moved === 0
          ? `これ以上${screens > 0 ? "右" : "左"}には動かなかった`
          : `${moved > 0 ? "右" : "左"}に${Math.abs(moved)}px動いた`,
      );
    }

    case "back": {
      await page.goBack({ waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => null);
      await settle(page, rl);
      return ok(true);
    }

    case "click": {
      // ★ 화면에 보여준 목록에서만 찾는다. raw에서 찾으면 화면 밖 요소를 눌러버린다 —
      //   그 순간 이 도구는 사람이 겪을 수 없는 경로를 발견하게 된다.
      const el = typeof action.index === "number" ? visible[action.index] : undefined;
      if (!el) return fail(`画面にない番号: ${action.index}`);

      if (el.href) {
        const g = hostAllowed(el.href, allowedOrigin);
        if (!g.allowed) return guard(g.reason, el.href);
      }

      // box.y는 문서 좌표(스크롤 포함)다. 뷰포트 좌표로 되돌린다.
      const vp = page.viewportSize();
      if (!vp) return fail("뷰포트 없음");

      // 요소가 화면보다 클 수 있다 (긴 컨테이너에 tabindex가 붙은 경우 등).
      // 중심점을 그대로 쓰면 화면 밖이 되어 「보이는데 못 누른다」가 된다.
      // 사람은 보이는 부분을 누르므로, 요소와 뷰포트가 겹치는 영역의 중심을 노린다.
      const top = el.box.y - raw.scroll.y;
      const y0 = Math.max(0, top);
      const y1 = Math.min(vp.height, top + el.box.h);
      const x0 = Math.max(0, el.box.x);
      const x1 = Math.min(vp.width, el.box.x + el.box.w);
      if (y1 <= y0 || x1 <= x0) return fail("화면 밖 좌표 — 클릭 불가");
      const x = (x0 + x1) / 2;
      const y = (y0 + y1) / 2;

      const before = page.url();
      // 위에 다른 요소가 덮여 있으면 그것이 눌린다. 그건 버그가 아니라 사용성 데이터다.
      await page.mouse.click(x, y).catch(() => null);
      await settle(page, rl);

      const after = page.url();
      const g = hostAllowed(after, allowedOrigin);
      if (!g.allowed) {
        // 이미 나가버렸으면 되돌린다. 나간 사실 자체는 기록한다.
        await page.goBack({ waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => null);
        await settle(page, rl);
        return guard(g.reason, after);
      }
      return ok(after !== before);
    }

    case "find_in_page": {
      const q = (action.query ?? "").trim();
      if (!q) return fail("검색어 없음");
      // 브라우저의 Ctrl+F는 자동화로 조작할 수 없다. 그 도구가 사람에게 주는 것
      // ―「そこにあるか / どこにあるか」― 만 그대로 돌려준다.
      const hits = (await page.evaluate(
        `((q) => {
          const t = document.body.innerText || '';
          let n = 0, i = 0;
          while ((i = t.indexOf(q, i)) !== -1) { n++; i += q.length; }
          if (n > 0) {
            const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = w.nextNode())) {
              if (node.nodeValue && node.nodeValue.includes(q)) {
                node.parentElement?.scrollIntoView({ block: 'center' });
                break;
              }
            }
          }
          return n;
        })(${JSON.stringify(q)})`,
      )) as number;
      await page.waitForTimeout(400);
      return ok(false, hits > 0 ? `ページ内に「${q}」が ${hits} 件` : `ページ内に「${q}」は見つからなかった`);
    }

    case "site_search": {
      const q = (action.query ?? "").trim();
      if (!q) return fail("검색어 없음");

      // ★ 폼을 제출하지 않는다. GET 검색만 URL로 조립해서 이동한다.
      //   POST 폼은 「제출」이므로 읽기 전용 범위 밖이다 (절대규칙 5).
      const form = (await page.evaluate(
        `(() => {
          const input = document.querySelector('input[type=search], [role=search] input[type=text], form input[name=q], form input[name=keyword], form input[name=search], form input[name=key]');
          if (!input) return null;
          const f = input.closest('form');
          if (!f) return null;
          const method = (f.getAttribute('method') || 'get').toLowerCase();
          const extras = [];
          for (const el of f.querySelectorAll('input[type=hidden]')) {
            if (el.name) extras.push([el.name, el.value || '']);
          }
          return { action: f.action || location.href, method, name: input.getAttribute('name') || 'q', extras };
        })()`,
      )) as { action: string; method: string; name: string; extras: [string, string][] } | null;

      if (!form) return fail("이 페이지에 사이트 검색창 없음");
      if (form.method !== "get") return guard("POST 검색 폼 — 제출은 읽기 전용 범위 밖", form.action);

      const g = hostAllowed(form.action, allowedOrigin);
      if (!g.allowed) return guard(g.reason, form.action);

      const u = new URL(form.action, page.url());
      for (const [k, v] of form.extras) u.searchParams.set(k, v);
      u.searchParams.set(form.name, q);

      await page.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null);
      await settle(page, rl);
      return ok(true, `サイト内検索で「${q}」を調べた`);
    }

    default:
      return fail(`알 수 없는 액션: ${action.kind}`);
  }
}

export { settle };
