"use client";

import { useState } from "react";
import type { RunView } from "@/lib/data";
import { Badge, MaskedText } from "./ui";

/**
 * ★ 이 화면이 제품의 주장 그 자체다.
 *
 * 「연기시켰다」가 아니라 「실제로 지웠다」를 보여주는 유일한 방법은,
 * 같은 순간의 before/after를 나란히 놓는 것이다.
 * 그래서 트레이스는 관측을 두 벌 저장한다 (core/types.ts の Step.raw / Step.seen).
 */
export function BeforeAfter({ run }: { run: RunView }) {
  const [n, setN] = useState(1);
  const step = run.steps.find((s) => s.n === n) ?? run.steps[0];
  const hidden = step.rawTotal - step.seenTotal;
  const uniqMasks = dedupeMasks(step.masked);

  return (
    <div>
      {/* ステップ選択 */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs text-fg-dim">ステップ</span>
        {run.steps.map((s) => {
          const active = s.n === n;
          const hasLabelMask = s.maskedInControls > 0;
          return (
            <button
              key={s.n}
              onClick={() => setN(s.n)}
              title={hasLabelMask ? "リンクの文字が隠れているステップ" : undefined}
              className={`tnum relative h-8 w-8 rounded-md border text-xs font-medium transition ${
                active
                  ? "border-stumble bg-stumble text-ink"
                  : "border-line bg-surface text-fg-muted hover:border-fg-dim hover:text-fg"
              }`}
            >
              {s.n}
              {hasLabelMask && !active && (
                <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-blocked" />
              )}
            </button>
          );
        })}
        <span className="ml-2 inline-flex items-center gap-1.5 text-[11px] text-fg-dim">
          <span className="h-1.5 w-1.5 rounded-full bg-blocked" />
          リンクの文字が隠れたステップ
        </span>
      </div>

      <div className="mb-5 rounded-lg border border-line bg-surface px-4 py-3">
        <div className="font-mono text-[11px] text-fg-dim">{step.url}</div>
        <div className="mt-1 text-sm">{step.title}</div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── BEFORE ───────────────────────────── */}
        <Panel
          kicker="BEFORE"
          title="このページにあるもの"
          count={step.rawTotal}
          note="ブラウザが読み取れた操作要素の全部"
          tone="neutral"
        >
          <div className="flex max-h-72 flex-wrap content-start gap-1 overflow-y-auto pr-1">
            {step.rawElements.map((e) => (
              <span
                key={e.index}
                className={`max-w-full truncate rounded border px-1.5 py-0.5 text-[10px] leading-4 ${
                  e.inViewport
                    ? "border-fg-dim/60 bg-surface-2 text-fg"
                    : "border-line-soft bg-surface-2/40 text-fg-dim/60"
                }`}
              >
                {e.name || "（名前なし）"}
              </span>
            ))}
            {step.rawTruncated > 0 && (
              <span className="rounded border border-line-soft px-1.5 py-0.5 text-[10px] text-fg-dim">
                ほか {step.rawTruncated} 件
              </span>
            )}
          </div>
          <p className="mt-3 text-[11px] text-fg-dim">
            薄い文字は<strong className="text-fg-muted">画面の外</strong>にあるもの。
            人はスクロールしないと押せません。
          </p>
        </Panel>

        {/* ── AFTER ────────────────────────────── */}
        <Panel
          kicker="AFTER"
          title="この人に届いたもの"
          count={step.seenTotal}
          note="AIが実際に受け取った選択肢の全部"
          tone="stumble"
        >
          <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {step.seenElements.map((e) => (
              <li
                key={e.index}
                className="flex items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-xs"
              >
                <span className="tnum shrink-0 rounded bg-ink px-1.5 py-0.5 font-mono text-[10px] text-fg-dim">
                  {e.index}
                </span>
                <span className="truncate">
                  <MaskedText text={e.name || "（名前なし）"} />
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-fg-dim">
            <strong className="text-stumble">{hidden} 件</strong>
            が画面の外にあり、選択肢として渡していません。
          </p>
        </Panel>
      </div>

      {/* 隠した語の根拠 */}
      <div className="mt-4 rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium">隠した語の根拠</span>
          {uniqMasks.length === 0 ? (
            <Badge>このステップでは 0 件</Badge>
          ) : (
            <Badge tone="blocked">{uniqMasks.length} 語</Badge>
          )}
        </div>

        {uniqMasks.length === 0 ? (
          <p className="mt-2 text-xs leading-relaxed text-fg-dim">
            調査に載っていない語は隠しません。誤差は常に
            <strong className="text-fg-muted">「隠しすぎない」側</strong>に倒します。
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {uniqMasks.map((m) => (
              <li key={m.surface} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="masked font-medium">{m.surface}</span>
                <span className="text-fg-muted">{m.evidence}</span>
                {m.inControl && <Badge tone="blocked">リンクの文字の中</Badge>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* この観測で何をしたか */}
      {step.action && (
        <div className="mt-4 rounded-lg border border-line bg-surface p-4">
          <div className="text-xs font-medium text-fg-dim">この画面を見て、AIがしたこと</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="stumble">{step.action.kind}</Badge>
            {step.action.index !== null && (
              <span className="font-mono text-xs text-fg-muted">
                #{step.action.index}{" "}
                <MaskedText
                  text={
                    step.seenElements.find((e) => e.index === step.action!.index)?.name ||
                    "（名前なし）"
                  }
                />
              </span>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            「{step.action.reason}」
          </p>
        </div>
      )}
    </div>
  );
}

function Panel({
  kicker,
  title,
  count,
  note,
  tone,
  children,
}: {
  kicker: string;
  title: string;
  count: number;
  note: string;
  tone: "neutral" | "stumble";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border bg-surface p-4 ${
        tone === "stumble" ? "border-stumble/35" : "border-line"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div
            className={`text-[10px] font-bold tracking-[0.18em] ${
              tone === "stumble" ? "text-stumble" : "text-fg-dim"
            }`}
          >
            {kicker}
          </div>
          <div className="mt-1 text-sm font-medium">{title}</div>
          <div className="mt-0.5 text-[11px] text-fg-dim">{note}</div>
        </div>
        <div
          className={`tnum shrink-0 text-3xl font-bold ${
            tone === "stumble" ? "text-stumble" : "text-fg"
          }`}
        >
          {count}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function dedupeMasks(masked: { surface: string; evidence: string; inControl: boolean }[]) {
  const m = new Map<string, { surface: string; evidence: string; inControl: boolean }>();
  for (const x of masked) {
    const prev = m.get(x.surface);
    // 링크 라벨 안에서 한 번이라도 걸렸으면 그쪽을 남긴다. 무게가 다르다.
    if (!prev || (!prev.inControl && x.inControl)) m.set(x.surface, x);
  }
  return [...m.values()];
}
