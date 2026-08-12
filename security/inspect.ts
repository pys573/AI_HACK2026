/**
 * C-2 · 위협 검사 — **LLM에게 가기 전의 마지막 관문**.
 *
 *   ページ → observe() → 【inspect / shield】 → constrain() → LLM
 *                              ↑ 여기
 *
 * 이 위치가 핵심이다. 우리는 관측 파이프라인을 직접 들고 있으므로
 * 상류 모델에 보내기 **전에** 검사할 수 있다. 프레임워크를 썼다면 이 자리가 없다.
 *
 * ── 검사 대상은 「실제로 올라가는 바이트」다 ────────────────
 *
 * `raw.text`(페이지 전체)가 아니라 `raw.text_viewport`(지금 화면) + 요소 라벨 + 제목만 본다.
 * 전체 본문을 검사하면 **에이전트에게 간 적도 없는 문자열**이 위협으로 기록된다.
 * 그건 「막았다」가 아니라 「거기 있었다」일 뿐인데, 트레이스에서는 구별이 안 된다.
 * 검사 범위와 송신 범위를 일치시켜야 「우리가 막은 것」이라고 말할 수 있다.
 *
 * (화면 밖·CSS로 숨긴 인젝션은 observe()가 애초에 걷어낸다 —
 *  그건 이 파일이 아니라 관측 설계가 막는다. 증명은 `security/honeypot.ts`에서 한다.)
 */

import type { ThreatRecord } from "../core/types.ts";
import type { RawObservation } from "../agent/src/observe.ts";
import { PATTERNS, verifyCard, verdictFor } from "./patterns.ts";

/** 1스텝에 남기는 위협 기록의 상한. 넘으면 개수를 밝히고 자른다 — 조용히 자르지 않는다 */
export const MAX_THREATS = 20;

/** excerpt에 남기는 원문 길이. 앞뒤 문맥을 조금 붙인다 — 사람이 읽어야 검증이 된다 */
const EXCERPT_PAD = 40;
const EXCERPT_MAX = 240;

/**
 * 차단된 자리에 남기는 표식.
 *
 * 통째로 지우고 아무 말도 안 하면, 나중에 트레이스를 볼 때
 * 「원래 짧은 페이지였다」와 「지워서 짧아졌다」가 구별되지 않는다.
 * 에이전트에게도 「뭔가 있었는데 없앴다」까지는 알려준다 — 내용은 주지 않는다.
 */
const REDACTED = "［セキュリティ検査により除去］";

function excerpt(hay: string, at: number, len: number): string {
  const s = Math.max(0, at - EXCERPT_PAD);
  const e = Math.min(hay.length, at + len + EXCERPT_PAD);
  const body = hay.slice(s, e).replace(/\s+/g, " ").trim();
  return (s > 0 ? "…" : "") + body.slice(0, EXCERPT_MAX) + (e < hay.length ? "…" : "");
}

type Hit = { start: number; end: number; rec: ThreatRecord };

/** 한 덩어리의 문자열을 패턴표 전체에 건다. location은 호출자가 정한다 */
function scan(text: string, location: string): Hit[] {
  if (!text) return [];
  const hits: Hit[] = [];

  for (const p of PATTERNS) {
    // matchAll은 정규식을 복제해서 돌므로 모듈 전역 패턴을 공유해도 lastIndex가 오염되지 않는다
    for (const m of text.matchAll(p.re)) {
      const at = m.index ?? 0;
      // 숫자열은 Luhn을 통과한 것만 카드번호로 본다. 안 그러면 통계표에서 수십 건이 뜬다
      if (p.id === "pii.card" && !verifyCard(m[0])) continue;

      hits.push({
        start: at,
        end: at + m[0].length,
        rec: {
          kind: p.kind,
          severity: p.severity,
          location,
          excerpt: excerpt(text, at, m[0].length),
          verdict: verdictFor(p.severity),
          detector: "local",
          // 어느 패턴이 물었는지를 남긴다. 「왜 이게 위협이냐」에 표 한 줄로 답하기 위한 것이다
          note_ja: `[${p.id}] ${p.why_ja}`,
        },
      });
    }
  }
  return hits;
}

/**
 * 관측 1건을 검사한다. **부작용 없음** — 판정만 돌려준다.
 * 실제로 바이트를 지우는 것은 `shield()`다.
 */
export function inspect(raw: RawObservation): ThreatRecord[] {
  const all = [
    ...scan(raw.title, "title"),
    ...scan(raw.text_viewport, "body"),
    ...raw.elements.flatMap((e) => (e.in_viewport ? scan(e.name, `element:${e.index}`) : [])),
  ];

  // 심각한 것부터. 화면이 20건에서 잘려도 block이 먼저 보여야 한다
  const rank = { block: 0, warn: 1, info: 2 };
  all.sort((a, b) => rank[a.rec.severity] - rank[b.rec.severity]);

  const out = all.slice(0, MAX_THREATS).map((h) => h.rec);
  if (all.length > MAX_THREATS) {
    // 잘랐다는 사실 자체를 기록에 남긴다. 안 남기면 「이 페이지엔 20건뿐이었다」로 읽힌다 (절대규칙 3)
    out.push({
      kind: "prompt_injection",
      severity: "info",
      location: "body",
      excerpt: "",
      verdict: "allow",
      detector: "local",
      note_ja: `検出が上限 ${MAX_THREATS} 件を超えたため、${all.length - MAX_THREATS} 件を記録から省きました。`,
    });
  }
  return out;
}

/**
 * 검사 + 차단. `constrain()`에 넘기기 **전에** 부른다.
 *
 * 돌려주는 관측은 block 판정분이 지워진 사본이다.
 * ★ 원본(`raw`)은 호출자가 그대로 들고 있어야 한다 — 트레이스의 `steps[].raw`는
 *   증거이므로 지워진 것이 아니라 **지우기 전**을 남긴다. 지운 뒤를 남기면
 *   「무엇을 막았는가」를 사후에 아무도 확인할 수 없다.
 */
export function shield(raw: RawObservation): { safe: RawObservation; threats: ThreatRecord[] } {
  const threats = inspect(raw);
  const blocked = threats.filter((t) => t.verdict === "block");
  if (blocked.length === 0) return { safe: raw, threats };

  // 차단 대상 자리를 표식으로 갈아끼운다. 다시 스캔해서 지우는 이유:
  // inspect()가 돌려준 excerpt에는 문맥(…앞뒤 40자)이 붙어 있어 그대로는 자를 수 없다.
  const strip = (s: string): string => {
    if (!s) return s;
    let out = s;
    for (const p of PATTERNS) {
      if (p.severity !== "block") continue;
      out = out.replace(p.re, (m) => (p.id === "pii.card" && !verifyCard(m) ? m : REDACTED));
    }
    return out;
  };

  return {
    safe: {
      ...raw,
      title: strip(raw.title),
      text_viewport: strip(raw.text_viewport),
      // 본문 전체는 judge()가 도달 판정에 쓴다. 여기도 지운다 —
      // 「인젝션 페이지에 도달했다」를 성공으로 세지 않기 위해서다
      text: strip(raw.text),
      elements: raw.elements.map((e) => ({ ...e, name: strip(e.name) })),
    },
    threats,
  };
}

/**
 * act()가 거부한 이동을 위협 기록으로 바꾼다.
 *
 * 이 가드(C-5)는 이미 `agent/src/act.ts`에 있다 — 외부 도메인·電子申請·mailto를 막는다.
 * 없던 것은 「막았다는 사실이 트레이스에 남는 것」이었다.
 * 조용히 막으면 방어한 증거가 어디에도 안 남는다 (docs/SECURITY.md).
 */
export function blockedNavigationThreat(
  blocked: { reason: string; target: string },
  location: string,
): ThreatRecord {
  const isTool = /스킴|電子申請/.test(blocked.reason);
  return {
    kind: isTool ? "tool_abuse" : "offsite_navigation",
    severity: "block",
    location,
    excerpt: blocked.target.slice(0, EXCERPT_MAX),
    verdict: "block",
    detector: "local",
    note_ja: isTool
      ? `読み取り専用の範囲外への遷移を拒否しました（${blocked.reason}）。`
      : `対象ドメイン外への遷移を拒否しました（${blocked.reason}）。`,
  };
}
