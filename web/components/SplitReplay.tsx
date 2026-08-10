"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { RunView, StepView } from "@/lib/data";
import { Badge, MaskedText } from "./ui";

const TICK_MS = 2200;

/**
 * ★ D-5 分割画面 — 데모의 중심.
 *
 * 두 실행을 **스텝 기준**으로 나란히 재생한다. 시간 기준이 아니라 스텝 기준인 이유는,
 * 「한쪽이 먼저 끝나고 다른 쪽은 계속 헤맨다」가 눈으로 보여야 하기 때문이다.
 * 실제 소요 시간은 각 열의 예산 게이지에 따로 표시한다 — 숫자를 감추지 않는다.
 */
export function SplitReplay({ control, senior }: { control: RunView; senior: RunView }) {
  const maxStep = Math.max(control.steps.length, senior.steps.length);
  const [cursor, setCursor] = useState(1);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setPlaying(false);
  }, []);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setCursor((c) => {
        if (c >= maxStep) {
          setPlaying(false);
          return c;
        }
        return c + 1;
      });
    }, TICK_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, maxStep]);

  const toggle = () => {
    if (playing) return stop();
    if (cursor >= maxStep) setCursor(1);
    setPlaying(true);
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button
          onClick={toggle}
          className={`rounded-lg px-5 py-2.5 text-sm font-bold transition ${
            playing
              ? "border border-line bg-surface text-fg-muted hover:text-fg"
              : "bg-stumble text-ink hover:bg-stumble/85"
          }`}
        >
          {playing ? "⏸ 停止" : cursor >= maxStep ? "↺ もう一度" : "▶ 再生"}
        </button>

        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={maxStep}
            value={cursor}
            onChange={(e) => {
              stop();
              setCursor(Number(e.target.value));
            }}
            className="h-1 w-48 cursor-pointer appearance-none rounded-full bg-line accent-stumble"
          />
          <span className="tnum text-xs text-fg-dim">
            ステップ {cursor} / {maxStep}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Lane run={control} cursor={cursor} tone="clear" />
        <Lane run={senior} cursor={cursor} tone="stumble" />
      </div>
    </div>
  );
}

function Lane({
  run,
  cursor,
  tone,
}: {
  run: RunView;
  cursor: number;
  tone: "clear" | "stumble";
}) {
  const done = cursor > run.steps.length;
  const idx = Math.min(cursor, run.steps.length) - 1;
  const step: StepView = run.steps[idx];
  const accent = tone === "clear" ? "text-clear" : "text-stumble";
  const ring = tone === "clear" ? "border-clear/35" : "border-stumble/35";

  return (
    <div className={`flex flex-col rounded-xl border bg-surface ${ring}`}>
      {/* ── ヘッダ ── */}
      <div className="border-b border-line-soft p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{run.labelJa}</div>
            <div className="mt-0.5 font-mono text-[11px] text-fg-dim">
              {run.profileId} v{run.profileVersion}
            </div>
          </div>
          {done && (
            <Badge tone={run.reached ? "clear" : "stumble"}>
              {run.reached ? "到達 ○" : "諦めた"}
            </Badge>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip>
            画面 {run.viewport.width / run.viewport.zoom}×
            {run.viewport.height / run.viewport.zoom}
            {run.viewport.zoom !== 1 && `（拡大 ${run.viewport.zoom * 100}%）`}
          </Chip>
          {run.toolsJa.map((t) => (
            <Chip key={t}>{t}</Chip>
          ))}
        </div>
      </div>

      {/* ── 画面 ── */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-ink">
        {step.shot ? (
          <Image
            src={step.shot}
            alt={`${run.profileId} ステップ ${step.n}`}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-contain object-top"
            unoptimized
            priority={step.n === 1}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-fg-dim">
            スクリーンショットなし
          </div>
        )}

        {done && (
          <div className="absolute inset-0 flex items-center justify-center bg-ink/80 backdrop-blur-[2px]">
            <div className="px-6 text-center">
              <div className={`text-3xl font-bold ${accent}`}>
                {run.reached ? "たどり着いた" : "たどり着けなかった"}
              </div>
              <div className="tnum mt-2 text-sm text-fg-muted">
                {run.clicks} クリック / {run.seconds} 秒
              </div>
              <p className="mx-auto mt-3 max-w-sm text-xs leading-relaxed text-fg-dim">
                {run.reached ? run.reasonJa : run.outcomeJa}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── いま何をしたか ── */}
      <div className="flex-1 border-t border-line-soft p-4">
        <div className="flex items-center gap-2">
          <span className="tnum rounded bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-fg-dim">
            {String(step.n).padStart(2, "0")}
          </span>
          {step.action && <Badge tone={tone}>{step.action.kind}</Badge>}
          {step.action?.index !== null && step.action && (
            <span className="truncate font-mono text-[11px] text-fg-muted">
              #{step.action.index}{" "}
              <MaskedText
                text={
                  step.seenElements.find((e) => e.index === step.action!.index)?.name ||
                  "（名前なし）"
                }
              />
            </span>
          )}
          {!step.actionOk && step.actionError && (
            <Badge tone="blocked">{step.actionError}</Badge>
          )}
        </div>

        <p className="mt-3 min-h-[3.5rem] text-sm leading-relaxed text-fg-muted">
          {step.action ? `「${step.action.reason}」` : "—"}
        </p>

        {/* 画面に届いた量。これが制約の実体 */}
        <div className="mt-4 flex items-center gap-2 text-[11px] text-fg-dim">
          <span>画面の選択肢</span>
          <span className={`tnum font-bold ${accent}`}>{step.seenTotal}</span>
          <span>/ ページ全体 {step.rawTotal}</span>
          {step.maskedInControls > 0 && (
            <Badge tone="blocked">リンクの文字が隠れています</Badge>
          )}
        </div>

        {/* 忍耐予算 */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] text-fg-dim">
            <span>のこりクリック {Math.max(0, step.clicksLeft)}</span>
            <span>のこり時間 {Math.max(0, step.secondsLeft)}秒</span>
          </div>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-line">
            <div
              className={`h-full ${tone === "clear" ? "bg-clear" : "bg-stumble"}`}
              style={{
                width: `${Math.max(0, (step.clicksLeft / run.patience.clicks) * 100)}%`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] text-fg-dim">
      {children}
    </span>
  );
}
