import type { ReactNode } from "react";
import type { FindingView, MaskView, RunView } from "@/lib/data";

export function Section({
  id,
  eyebrow,
  title,
  lead,
  children,
}: {
  id?: string;
  eyebrow?: string;
  title?: string;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="border-t border-line-soft">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
        {eyebrow && (
          <p className="mb-3 text-xs font-medium tracking-[0.2em] text-fg-dim uppercase">
            {eyebrow}
          </p>
        )}
        {title && (
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
        )}
        {lead && <div className="mt-4 max-w-3xl text-fg-muted leading-relaxed">{lead}</div>}
        <div className={title || lead ? "mt-10" : ""}>{children}</div>
      </div>
    </section>
  );
}

export function Stat({
  label,
  value,
  unit,
  tone = "neutral",
  sub,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: "neutral" | "clear" | "stumble";
  sub?: ReactNode;
}) {
  const color =
    tone === "clear" ? "text-clear" : tone === "stumble" ? "text-stumble" : "text-fg";
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <div className="text-[11px] text-fg-dim">{label}</div>
      <div className={`tnum mt-1 text-2xl font-bold ${color}`}>
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-fg-muted">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-[11px] text-fg-dim">{sub}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "clear" | "stumble" | "blocked";
}) {
  const map = {
    neutral: "border-line text-fg-muted",
    clear: "border-clear/40 text-clear bg-clear/10",
    stumble: "border-stumble/40 text-stumble bg-stumble/10",
    blocked: "border-blocked/40 text-blocked bg-blocked/10",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${map[tone]}`}
    >
      {children}
    </span>
  );
}

const COHORT_JA: Record<string, string> = {
  senior: "60歳以上",
  overall: "全体",
};

/**
 * ★ 가린 말 1건의 근거. **%가 화면에 나오는 유일한 컴포넌트다.**
 *
 * 근거는 두 종류이고 성질이 다르다 (core/types.ts の MaskRecord):
 *   - 이해율 조사 → 「60歳以上の理解率 8.2%」라고 쓸 수 있다
 *   - 지정 명단 → **조사가 없다.** 「収録語 No.97」까지만 쓴다. %를 붙이면
 *     존재하지 않는 조사를 존재한다고 말하는 것이 된다 (절대규칙 4)
 *
 * 표시가 갈리는 자리를 여기 하나로 모아 둔다. 화면마다 따로 쓰면 언젠가 한 곳에서 섞인다.
 */
export function MaskEvidence({ mask }: { mask: MaskView }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
      <span className="masked font-medium">{mask.surface}</span>

      {/* 이해율 근거 — 숫자를 말할 수 있는 쪽 */}
      {mask.basis === "comprehension_rate" && mask.comprehension !== null && (
        <span className="tnum shrink-0 rounded border border-blocked/40 bg-blocked/10 px-1.5 py-0.5 font-medium text-blocked">
          {mask.cohort ? `${COHORT_JA[mask.cohort] ?? mask.cohort}の` : ""}理解率{" "}
          {mask.comprehension}%
        </span>
      )}

      {/* 명단 근거 — 番号までしか言えない。% は無い */}
      {mask.basis === "designated_list" && mask.listing && (
        <span className="tnum shrink-0 rounded border border-stumble/40 bg-stumble/10 px-1.5 py-0.5 font-medium text-stumble">
          収録語 No.{mask.listing.no}
        </span>
      )}

      {mask.inControl && <Badge tone="blocked">リンクの文字の中</Badge>}

      <span className="text-fg-muted">{mask.evidence}</span>
    </div>
  );
}

/**
 * 「이 명단은 이해율이 아니다」를 화면에서 한 번은 말해 둔다.
 * 「%가 없네」를 심사위원이 먼저 발견하게 두면 누락으로 읽힌다. 우리가 먼저 말하면 규율로 읽힌다.
 */
export function BasisNote({ kind }: { kind: "comprehension_rate" | "designated_list" }) {
  if (kind === "comprehension_rate") {
    return (
      <p className="text-[11px] leading-relaxed text-fg-dim">
        根拠は理解率の調査です。だから「何%の人が分からなかったか」を数字で言えます。
        調査に載っていない語は隠しません。誤差は常に
        <strong className="text-fg-muted">「隠しすぎない」側</strong>に倒します。
      </p>
    );
  }
  return (
    <p className="text-[11px] leading-relaxed text-fg-dim">
      根拠は<strong className="text-fg-muted">理解率の調査ではありません</strong>。
      行政が「この語は書き換えなさい」と指定した名簿です。だから
      <strong className="text-fg-muted">この画面に % は出ません</strong> — 存在しない調査を
      あるかのように書かないためです。名簿に無い行政用語は隠していないので、
      実際の壁はここで測っているより大きいはずです。
    </p>
  );
}

const SEVERITY_JA: Record<string, string> = {
  high: "重い",
  medium: "中くらい",
  low: "軽い",
};

/**
 * 리포트 본문. 「止まった場所」와 「そこを直す文」이 같은 1건으로 나오는 게 상품이다.
 * 목록만 그린다. **0건일 때 무슨 뜻인지는 여기서 정하지 않는다** — `RunReport`가 정한다.
 */
export function FindingsList({ findings }: { findings: FindingView[] }) {
  if (findings.length === 0) return null;
  return (
    <ul className="space-y-3">
      {findings.map((f) => (
        <li
          key={`${f.stepN}-${f.severity}-${f.causeJa.slice(0, 12)}`}
          className="rounded-lg border border-line bg-surface-2 p-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={f.severity === "high" ? "blocked" : "neutral"}>
              {SEVERITY_JA[f.severity] ?? f.severity}
            </Badge>
            <span className="tnum text-[11px] text-fg-dim">{f.stepN} 手目</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-fg-muted">{f.causeJa}</p>
          <div className="mt-3 rounded border border-clear/25 bg-clear/5 p-3">
            <div className="text-[10px] font-bold tracking-[0.18em] text-clear">なおしかた</div>
            <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">{f.fixJa}</p>
          </div>
          {(f.evidence.length > 0 || f.evidenceDropped > 0) && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] text-fg-dim hover:text-fg-muted">
                根拠 {f.evidence.length} 件
                {f.evidenceDropped > 0 && (
                  <span className="text-blocked">（出典が壊れた {f.evidenceDropped} 件は除外）</span>
                )}
              </summary>
              <ul className="mt-2 space-y-1">
                {f.evidence.map((e, i) => (
                  <li key={i} className="text-[11px] leading-relaxed text-fg-dim">
                    ・{e}
                  </li>
                ))}
              </ul>
              {/* 조용히 지우면 「원래 이만큼이었다」가 거짓이 된다. 뺀 것도 화면에 적는다 */}
              {f.evidenceDropped > 0 && (
                <p className="mt-2 border-t border-line-soft pt-2 text-[11px] leading-relaxed text-blocked">
                  出典の付け方が壊れていた根拠を {f.evidenceDropped}{" "}
                  件、表示から外しました。存在しない名簿番号が入っていたためです（
                  <code className="font-mono">agent/src/signals.ts</code>{" "}
                  の既知の不具合）。書き直さずに外しているのは、
                  こちらで直すとそれは私たちが作った根拠になるからです。
                </p>
              )}
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * ★ 한 실행의 리포트. **0건의 뜻이 두 가지라서, 여기가 갈림길이다.**
 *
 * 구분자는 데이터에 이미 있다 — `reached`다:
 *   - 도달 + 0건 → 「막힌 곳이 **없었다**」는 **결과**다. 반드시 그린다.
 *     대조군이 0건이라는 사실 자체가 「제약이 원인이다」의 대조 증거이고, 우리 주장의 절반이다.
 *     숨기면 「실패한 쪽만 보여준다」가 되어 인과가 사라진다.
 *   - 실패 + 0건 → 진단을 **아직 안 돌린** 것이다. 여기서 「0件」이라고 쓰면 위와 같은 화면이
 *     되어 정반대의 뜻으로 읽힌다. 아무것도 그리지 않는다.
 *
 * (근거: `agent/demo/README.md` / `agent/src/diagnose.ts` — 신호가 0건이면 모델을 안 부른다)
 */
export function RunReport({ run }: { run: RunView }) {
  if (run.findings.length === 0 && !run.reached) return null;
  const clean = run.findings.length === 0;

  return (
    <div
      className={`rounded-xl border bg-surface p-5 ${clean ? "border-clear/30" : "border-stumble/30"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={clean ? "clear" : "stumble"}>{run.labelJa}</Badge>
        <code className="font-mono text-[11px] text-fg-dim">
          {run.profileId} v{run.profileVersion}
        </code>
        <span className="tnum ml-auto text-[11px] text-fg-dim">
          {run.steps.length} ステップ・クリック {run.clicks} 回・{run.seconds} 秒
        </span>
      </div>

      {clean ? (
        <>
          <p className="mt-3 text-sm leading-relaxed">
            <strong className="text-clear">詰まりなし — 0件</strong>
            <span className="text-fg-muted">
              。{run.steps.length}ステップでたどり着いて、そこで終わりました。
            </span>
          </p>
          {/* 「아직 안 만들었다」로 읽히면 대조 증거가 통째로 죽는다. 그래서 먼저 못 박는다 */}
          <p className="mt-2 text-xs leading-relaxed text-fg-muted">
            これは「<strong className="text-fg">まだ作っていない</strong>」ではありません。
            <strong className="text-fg">止まった場所が無かった</strong>という結果です。
            検出された信号が0件だったので、原因を書かせるモデルは
            <strong className="text-fg">1回も呼んでいません</strong>。
            同じサイト・同じ用事で、隠す語を足しただけで右のようになります。
            <strong className="text-fg">差の原因はサイトではなく、渡した情報の側にあります。</strong>
          </p>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm leading-relaxed">
            <strong className="text-stumble">{run.findings.length} 件</strong>
            <span className="text-fg-muted">。{run.outcomeJa}地点までの記録から出しました。</span>
          </p>
          <div className="mt-4">
            <FindingsList findings={run.findings} />
          </div>
          {/* 리포트를 만든 호출은 과금됐는데 trace의 원가에 안 들어갔다. 먼저 적는다 (절대규칙 4) */}
          {run.diagnoseUsd === 0 && (
            <p className="mt-4 border-t border-line-soft pt-3 text-[11px] leading-relaxed text-fg-dim">
              ⚠️ この{run.findings.length}件を書かせた呼び出しの費用は、
              <strong className="text-fg-muted">下の金額に入っていません</strong>（
              <code className="font-mono">by_step_type.diagnose</code> が 0 のまま）。
              診断だけをやり直す
              <code className="font-mono">agent/src/rediagnose.ts</code>
              が結果だけを書き戻して費用を書き戻さないためで、既知の不具合として把握しています。
            </p>
          )}
        </>
      )}
    </div>
  );
}

const ACTION_JA: Record<string, string> = {
  click: "リンクを押した",
  scroll: "画面を送った",
  scroll_side: "画面を横に送った",
  back: "前のページに戻った",
  find_in_page: "ページ内を検索した",
  site_search: "サイト内を検索した",
  give_up: "探すのをやめた",
};

/**
 * 에이전트가 낸 수. **클릭만 그릴 수 있으면 안 된다** —
 * 「누를 수 있는 게 화면에 하나도 없어서 스크롤했다」가 그 자체로 증거이기 때문이다.
 */
export function ActionLine({
  action,
  label,
}: {
  action: { kind: string; index: number | null; query: string | null; delta: number | null };
  /** click일 때 실제로 누른 요소의 이름 (가려진 상태 그대로) */
  label?: string | null;
}) {
  const tone = action.kind === "give_up" ? "blocked" : "stumble";
  // 실제 트레이스에는 delta가 1로만 찍힌 스크롤이 있다. 「스크롤했다」는 플래그지 픽셀 수가 아니다.
  // 그대로 「下へ 1px」라고 쓰면 화면 위의 거짓말이 된다 — 방향만 말하고 숫자는 버린다.
  const px = action.delta !== null && Math.abs(action.delta) >= 10 ? Math.abs(action.delta) : null;
  const isSearch = action.kind === "find_in_page" || action.kind === "site_search";

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Badge tone={tone}>{ACTION_JA[action.kind] ?? action.kind}</Badge>
      {action.kind === "click" && action.index !== null && (
        <span className="font-mono text-xs text-fg-muted">
          #{action.index} <MaskedText text={label || "（名前なし）"} />
        </span>
      )}
      {action.kind === "scroll" && action.delta !== null && (
        <span className="tnum font-mono text-xs text-fg-muted">
          {action.delta > 0 ? "下へ" : "上へ"}
          {px !== null && ` ${px}px`}
        </span>
      )}
      {/* query는 검색 때만 질의어다. click 기록에도 값이 들어있는 트레이스가 있어 종류로 막는다 */}
      {isSearch && action.query && (
        <span className="font-mono text-xs text-fg-muted">「{action.query}」</span>
      )}
    </div>
  );
}

/**
 * before 쪽에서 「이 말이 곧 사라진다」를 미리 물들인다.
 * 원문을 그냥 두면 오른쪽의 ◯◯◯가 **어느 글자였는지** 눈으로 이어지지 않는다.
 */
export function HighlightTerms({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>;
  // 긴 것부터 — 「転入届」가 「転入」에 먼저 잘리면 짧게 물든다
  const sorted = [...new Set(terms)].sort((a, b) => b.length - a.length);
  const re = new RegExp(`(${sorted.map(escapeRe).join("|")})`, "g");
  return (
    <>
      {text.split(re).map((p, i) =>
        sorted.includes(p) ? (
          <span
            key={i}
            className="rounded-[3px] bg-stumble/15 px-0.5 font-medium text-stumble underline decoration-stumble/50 decoration-dashed underline-offset-2"
          >
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 마스킹된 글자에 색을 입힌다.
 * 「◯◯◯マップ」가 그냥 텍스트로 지나가면 아무도 눈치채지 못한다.
 */
export function MaskedText({ text }: { text: string }) {
  const parts = text.split(/(◯+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^◯+$/.test(p) ? (
          <span key={i} className="masked">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
