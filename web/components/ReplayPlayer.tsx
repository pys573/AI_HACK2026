"use client";

import { useEffect, useState, useCallback } from "react";
import type { Replay } from "@/lib/replay";

/**
 * website design/play_screen.png の再生画面。
 *
 * 목업과 다른 곳 두 군데:
 *   1) 클릭 위치의 원은 **트레이스의 좌표**에서 나온다. 좌표가 없는 스텝에는 안 찍는다.
 *      「대충 이쯤」으로 찍으면 그건 실행 기록이 아니라 우리가 그린 그림이다.
 *   2) 시간은 실제 걸린 초다. 목업의 03:24 같은 고정값은 쓰지 않는다.
 *
 * 재생은 **스크린샷 넘기기**다. 동영상이 아니다 — 무대에서 네트워크가 죽어도 돈다(절대규칙 7).
 */
export function ReplayPlayer({ replay }: { replay: Replay }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const steps = replay.steps;
  const cur = steps[i];
  const last = steps.length - 1;

  const next = useCallback(() => {
    setI((v) => {
      if (v >= last) {
        setPlaying(false);
        return v;
      }
      return v + 1;
    });
  }, [last]);

  useEffect(() => {
    if (!playing) return;
    // 실제 스텝 간격을 재생 속도로 나눈다. 다만 1.2초 이상은 기다리지 않는다 —
    // 진짜 간격대로 틀면 705초짜리 실행은 아무도 끝까지 안 본다.
    const gap = i < last ? Math.min(Math.max(steps[i + 1].t - steps[i].t, 1), 4) : 1;
    const id = setTimeout(next, (gap * 1000) / speed / 3);
    return () => clearTimeout(id);
  }, [playing, i, last, speed, steps, next]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      {/* ── 画面 ─────────────────────────────────── */}
      <div>
        <div className="card overflow-hidden p-0">
          {/* ブラウザ枠 */}
          <div className="flex items-center gap-3 border-b border-line bg-surface-2 px-4 py-2.5">
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            </div>
            <div className="min-w-0 flex-1 truncate rounded-md border border-line bg-surface px-3 py-1 text-center font-mono text-[11px] text-fg-muted">
              {cur?.url}
            </div>
          </div>

          <div className="relative bg-surface-2">
            {cur?.shot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/demo/shots/${cur.shot}`}
                alt={`${cur.n}手目の画面`}
                className="block w-full"
              />
            ) : (
              <div className="grid h-80 place-items-center text-sm text-fg-dim">
                この手のスクリーンショットは残っていません
              </div>
            )}

            {/* 押した場所 */}
            {cur?.hit && (
              <>
                <div
                  className="pointer-events-none absolute rounded-md border-2 border-brand bg-brand/15"
                  style={{
                    left: `${cur.hit.xPct}%`,
                    top: `${cur.hit.yPct}%`,
                    width: `${cur.hit.wPct}%`,
                    height: `${cur.hit.hPct}%`,
                  }}
                />
                <div
                  className="pulse-ring pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-stumble ring-4 ring-stumble/30"
                  style={{
                    left: `${cur.hit.xPct + cur.hit.wPct / 2}%`,
                    top: `${cur.hit.yPct + cur.hit.hPct / 2}%`,
                  }}
                />
              </>
            )}

            {/* 最後の手 = ここで終わった */}
            {i === last && !replay.reached && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-blocked/85 to-transparent px-4 py-6 text-center">
                <span className="rounded-full bg-blocked px-4 py-1.5 text-sm font-bold text-white">
                  ここで終わり — たどり着けませんでした
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── 操作バー ───────────────────────────── */}
        <div className="card mt-4 flex flex-wrap items-center gap-4 px-5 py-3.5">
          <button
            type="button"
            onClick={() => {
              if (i >= last) setI(0);
              setPlaying((p) => !p);
            }}
            className="brand-solid grid h-10 w-10 place-items-center rounded-full text-white"
            aria-label={playing ? "一時停止" : "再生"}
          >
            {playing ? "❚❚" : "▶"}
          </button>

          <span className="tnum text-sm font-medium text-fg-muted">
            {fmt(cur?.t ?? 0)}
          </span>

          <input
            type="range"
            min={0}
            max={last}
            value={i}
            onChange={(e) => {
              setPlaying(false);
              setI(Number(e.target.value));
            }}
            className="h-1.5 flex-1 min-w-40 accent-[var(--color-brand)]"
            aria-label="再生位置"
          />

          <span className="tnum text-sm text-fg-dim">{fmt(replay.seconds)}</span>

          <button
            type="button"
            onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))}
            className="rounded-full border border-line px-3 py-1 text-xs font-medium text-fg-muted hover:border-brand hover:text-brand"
          >
            {speed}.0x
          </button>

          <span className="tnum text-xs text-fg-dim">
            {i + 1} / {steps.length} 手
          </span>
        </div>

        {/* この手の説明 */}
        {cur && (
          <div className="card mt-4 p-5">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-fg-dim">
              <span className="rounded-md border border-line bg-surface-2 px-2 py-0.5 font-mono">
                {cur.kind}
              </span>
              {cur.hit && <span>「{cur.hit.nameJa}」を押した</span>}
              {!cur.ok && <span className="text-blocked">この操作は失敗した</span>}
            </div>
            <p className="mt-2.5 leading-relaxed">{cur.reasonJa || "（理由の記録なし）"}</p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-fg-dim">
              <span className="tnum">
                画面に出した操作要素 <strong className="text-fg">{cur.shown}</strong> / {cur.total}
              </span>
              {cur.maskedCount > 0 && (
                <span className="tnum text-blocked">この画面で伏せた語 {cur.maskedCount}</span>
              )}
              {cur.clicksLeft !== null && (
                <span className="tnum">残りクリック {cur.clicksLeft}</span>
              )}
              {cur.secondsLeft !== null && <span className="tnum">残り {cur.secondsLeft}秒</span>}
            </div>
          </div>
        )}
      </div>

      {/* ── 操作ログ ─────────────────────────────── */}
      <div className="space-y-4">
        <div className="card p-5">
          <h2 className="font-bold">操作ログ</h2>
          <ol className="mt-4 space-y-0.5">
            {steps.map((s, k) => {
              const on = k === i;
              return (
                <li key={s.n}>
                  <button
                    type="button"
                    onClick={() => {
                      setPlaying(false);
                      setI(k);
                    }}
                    className={`flex w-full gap-3 rounded-lg px-2.5 py-2 text-left transition ${
                      on ? "bg-brand/[0.08]" : "hover:bg-surface-2"
                    }`}
                  >
                    <span
                      className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${
                        k === last && !replay.reached
                          ? "bg-blocked"
                          : s.kind === "back"
                            ? "bg-fg-dim"
                            : on
                              ? "bg-brand"
                              : "bg-fg-dim/60"
                      }`}
                    >
                      {k === last && !replay.reached ? "✕" : s.n}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`tnum text-xs font-bold ${on ? "text-brand" : "text-fg-muted"}`}>
                        {fmt(s.t)}
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-fg-muted">
                        {actionJa(s.kind)}
                        {s.hit ? `「${s.hit.nameJa}」` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        {/* 止まった理由 — 実行が書いた文だけ */}
        {replay.findings.length > 0 && (
          <div className="rounded-2xl border border-blocked/40 bg-blocked/[0.05] p-5">
            <h2 className="font-bold text-blocked">止まった理由</h2>
            <ul className="mt-3 space-y-3">
              {replay.findings.slice(0, 4).map((f, k) => (
                <li key={k} className="text-sm leading-relaxed">
                  <p className="font-medium">{f.cause_ja}</p>
                  <p className="mt-1 text-[13px] text-fg-muted">→ {f.fix_ja}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function actionJa(kind: string): string {
  const map: Record<string, string> = {
    click: "押した ",
    scroll: "画面をスクロールした",
    scroll_side: "画面を横にスクロールした",
    close_overlay: "重なっていたものを閉じようとした",
    back: "前のページへ戻った",
    site_search: "サイト内検索を使った",
    find_in_page: "ページ内を探した",
    give_up: "諦めた",
    done: "たどり着いたと判断した",
  };
  return map[kind] ?? kind;
}
