import type { RunView } from "@/lib/data";
import {
  ActionLine,
  Badge,
  BasisNote,
  HighlightTerms,
  MaskedText,
  MaskEvidence,
  Stat,
} from "./ui";

/**
 * ★ 두 번째 벽 — 行政の漢語.
 *
 * senior-70s는 카타카나(「ダウンロード」)에서 막힌다. 하지만 행정 사이트의 진짜 장벽은
 * 「転入届」쪽이다. 그래서 프로필을 하나 더 돌린다.
 *
 * ⚠️ 근거의 **성질이 다르다**. 이해율 조사가 아니라 「이 말은 바꿔 써라」는 지정 명단이다.
 *    조사가 아니므로 %가 존재하지 않는다 → 이 화면에는 % 를 한 글자도 쓰지 않는다.
 *    대신 명단이 지정한 「대신 이렇게 쓰세요」 문장이 붙는다. 그게 리포트의 상품 부분이다.
 *    (표시 분기는 ui.tsx の MaskEvidence 한 곳에 모아 두었다)
 */
export function N3Case({ run }: { run: RunView }) {
  const money = moneyStep(run);
  const changed = money?.pairs.filter((p) => p.changed) ?? [];
  const terms = [...new Set(money?.masked.map((m) => m.surface) ?? [])];
  const uniqMasks = dedupe(money?.masked ?? []);

  return (
    <div className="space-y-4">
      {/* ── 実行の条件 ─────────────────────────── */}
      <div className="rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="stumble">{run.labelJa}</Badge>
          <code className="font-mono text-[11px] text-fg-dim">
            {run.profileId} v{run.profileVersion}
          </code>
          <span className="text-[11px] text-fg-dim">
            画面 {run.viewport.width}×{run.viewport.height}（スマートフォン）
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          用事は先ほどと同じ「{run.missionIntentJa}」です。変えたのは
          <strong className="text-fg">隠す語の根拠</strong>だけ —
          行政が「書き換えなさい」と指定した語を伏せました。
        </p>
        {/* 프로필이 스스로 무엇을 주장하는지. id·version과 떨어지는 순간 검증 불가능한 주장이 된다 */}
        <p className="mt-2 text-[11px] leading-relaxed text-fg-dim">{run.claimsJa}</p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="結果" value={run.outcomeJa} tone={run.reached ? "clear" : "stumble"} />
          <Stat label="クリック" value={run.clicks} unit="回" tone="stumble" />
          <Stat label="かかった時間" value={run.seconds} unit="秒" />
          <Stat
            label="この実行の費用"
            value={`$${run.totalUsd.toFixed(5)}`}
            sub="価格表からの計算値"
          />
        </div>

        {/* 手の並び — click 以外も起きる。1手目はスクロールだった */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {run.steps.map((s) => (
            <div
              key={s.n}
              className="flex items-center gap-2 rounded-lg border border-line-soft bg-surface-2 px-2.5 py-1.5"
            >
              <span className="tnum text-[11px] font-bold text-fg-dim">{s.n}</span>
              {s.action && (
                <ActionLine
                  action={s.action}
                  label={s.seenElements.find((e) => e.index === s.action!.index)?.name}
                />
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-fg-dim">
          1手目は<strong className="text-fg-muted">スクロール</strong>です。最初の画面に押せる候補が
          1つも無かったためで、押さなかったこと自体が記録になっています。
        </p>
      </div>

      {/* ── 급소: 같은 화면의 3본이 동시에 사라진다 ───── */}
      {money && changed.length > 0 && (
        <div className="rounded-xl border border-stumble/35 bg-surface p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="text-[10px] font-bold tracking-[0.18em] text-stumble">
                {money.n} 手目
              </div>
              <div className="mt-1 text-sm font-medium">
                同じ画面に並ぶリンクが、そろって読めなくなりました
              </div>
            </div>
            <Badge tone="blocked">リンクのラベル {money.maskedInControls} 件</Badge>
          </div>
          <div className="mt-1 font-mono text-[11px] text-fg-dim">{money.url}</div>

          <div className="mt-4 overflow-hidden rounded-lg border border-line">
            <div className="grid grid-cols-2 border-b border-line bg-surface-2 text-[10px] font-bold tracking-[0.18em]">
              <div className="px-3 py-2 text-fg-dim">ページにあった文字</div>
              <div className="border-l border-line px-3 py-2 text-stumble">AIに届いた文字</div>
            </div>
            {changed.map((p) => (
              <div key={p.index} className="grid grid-cols-2 border-b border-line-soft last:border-b-0">
                <div className="px-3 py-2 text-xs leading-relaxed">
                  <HighlightTerms text={p.raw} terms={terms} />
                </div>
                <div className="border-l border-line-soft px-3 py-2 text-xs leading-relaxed">
                  <MaskedText text={p.seen} />
                </div>
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs leading-relaxed text-fg-muted">
            残ったのは括弧の中の補足だけです。
            {money.action && (
              <>
                {" "}
                この画面でAIが書いた理由は「{money.action.reason}」でした。
              </>
            )}
          </p>
        </div>
      )}

      {/* ── 根拠。ここに % は出ない ───────────────── */}
      {money && uniqMasks.length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">隠した語の根拠</span>
            <Badge tone="blocked">{uniqMasks.length} 語</Badge>
          </div>
          <ul className="mt-3 space-y-2">
            {uniqMasks.map((m) => (
              <li key={m.surface}>
                <MaskEvidence mask={m} />
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-line-soft pt-3">
            <BasisNote kind="designated_list" />
          </div>
        </div>
      )}

      {/* ── ★ 商品になる部分：言い換え ─────────────── */}
      {run.rewrites.length > 0 && (
        <div className="rounded-xl border border-clear/30 bg-surface p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="clear">直し方まで出る</Badge>
            <span className="text-sm font-medium">{run.rewrites.length} 語の書き換え案</span>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-fg-muted">
            この文は<strong className="text-fg">私たちの意見ではありません</strong>。
            隠す根拠にした名簿そのものに、行政が示した言い換えが載っています。
            止まった場所と、そこを直す文が、同じ1件として出てきます。
          </p>
          <ul className="mt-4 space-y-2">
            {run.rewrites.map((r) => (
              <li key={r.term} className="rounded-lg border border-line bg-surface-2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-fg">{r.term}</span>
                  {r.inControl && <Badge tone="blocked">リンクの文字の中</Badge>}
                  <span className="tnum ml-auto font-mono text-[10px] text-fg-dim">No.{r.no}</span>
                </div>
                <div className="mt-2 border-l-2 border-clear/40 pl-3">
                  <div className="text-[10px] font-bold tracking-[0.18em] text-clear">
                    こう書きかえる
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-fg-muted">{r.meaning}</p>
                </div>
              </li>
            ))}
          </ul>
          {run.lexiconSourceJa && (
            <p className="mt-3 text-[11px] leading-relaxed text-fg-dim">
              出典: {run.lexiconSourceJa}
            </p>
          )}
        </div>
      )}

      {/* ── レポート本文 ───────────────────────── */}
      {run.findings.length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-5">
          <div className="text-sm font-medium">この実行から出たレポート</div>
          <ul className="mt-4 space-y-3">
            {run.findings.map((f) => (
              <li key={`${f.stepN}-${f.severity}`} className="rounded-lg border border-line bg-surface-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={f.severity === "high" ? "blocked" : "neutral"}>
                    {f.severity === "high" ? "重い" : f.severity === "medium" ? "中くらい" : "軽い"}
                  </Badge>
                  <span className="tnum text-[11px] text-fg-dim">{f.stepN} 手目</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-fg-muted">{f.causeJa}</p>
                <div className="mt-3 rounded border border-clear/25 bg-clear/5 p-3">
                  <div className="text-[10px] font-bold tracking-[0.18em] text-clear">なおしかた</div>
                  <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">{f.fixJa}</p>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] text-fg-dim hover:text-fg-muted">
                    根拠 {f.evidence.length} 件
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {f.evidence.map((e, i) => (
                      <li key={i} className="text-[11px] leading-relaxed text-fg-dim">
                        ・{e}
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── どこまでが実測か。混ぜたら全部が疑われる ─── */}
      <div className="rounded-xl border border-blocked/30 bg-surface p-5">
        <Badge tone="blocked">この実行だけ、実測の範囲が違います</Badge>
        <ul className="mt-3 space-y-2 text-xs leading-relaxed text-fg-muted">
          <li>
            <strong className="text-fg">実測:</strong> 3画面ぶんのページ（URL・見出し・本文・操作要素・
            スクロール位置）。2026-08-11 に読み取り専用で取得したものです。
          </li>
          <li>
            <strong className="text-fg">実測:</strong> 上の
            <strong className="text-fg">マスク結果と根拠</strong>。マスキング処理を実際に走らせた
            出力で、手書きの記録は1件もありません。語彙データを直せばこの画面も変わります。
          </li>
          <li>
            <strong className="text-blocked">作った値:</strong>{" "}
            手の進み方・AIの発言・トークン数・所要時間。制約を受けたAIが本当にこう迷うかは、
            この実行では確かめていません。
          </li>
          <li>
            <strong className="text-blocked">計算値:</strong>{" "}
            費用。APIが返した実費ではなく価格表からの計算です。
          </li>
        </ul>
        <p className="mt-3 text-[11px] text-fg-dim">
          生データ: <code className="font-mono">core/fixtures/sample-run-n3.json</code>
        </p>
      </div>
    </div>
  );
}

/**
 * 「어디를 보여줄 것인가」를 하드코딩하지 않는다.
 * 링크 라벨이 가장 많이 사라진 스텝 — 탐색이 실제로 막힌 지점이다.
 */
function moneyStep(run: RunView) {
  return run.steps.reduce<RunView["steps"][number] | null>(
    (best, s) => (!best || s.maskedInControls > best.maskedInControls ? s : best),
    null,
  );
}

function dedupe(masked: RunView["steps"][number]["masked"]) {
  const m = new Map<string, (typeof masked)[number]>();
  for (const x of masked) {
    const prev = m.get(x.surface);
    if (!prev || (!prev.inControl && x.inControl)) m.set(x.surface, x);
  }
  return [...m.values()];
}
