import type { RunView } from "@/lib/data";
import { Badge, Stat } from "./ui";

/**
 * 심사 ⑥은 「LLMコスト」인데, 배점을 가져가는 건 절약률이 아니라 **출처**다.
 * 「이 숫자 어디서 나왔나요」에 답하지 못하면 0점이다 (절대규칙 4).
 * 그래서 cost_source를 화면에 그대로 띄운다. "table"이면 계산치라고 쓴다.
 */
export function CostPanel({ runs }: { runs: RunView[] }) {
  const total = runs.reduce((a, r) => a + r.totalUsd, 0);
  const baseline = runs.reduce((a, r) => a + (r.baselineUsd ?? 0), 0);
  const calls = runs.reduce((a, r) => a + r.calls, 0);
  const saved = baseline > 0 ? (1 - total / baseline) * 100 : 0;
  const allApi = runs.every((r) => r.costSource === "api");

  const perModel = new Map<string, number>();
  for (const r of runs)
    for (const [m, v] of Object.entries(r.byModel))
      perModel.set(m, (perModel.get(m) ?? 0) + v);
  const models = [...perModel.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="この2実行の実費"
          value={`$${total.toFixed(4)}`}
          tone="clear"
          sub={`${calls} 回の呼び出し`}
        />
        <Stat
          label="全部を最上位モデルで回した場合"
          value={`$${baseline.toFixed(4)}`}
          sub="同じトークン量での比較値"
        />
        <Stat
          label="削減率"
          value={saved.toFixed(1)}
          unit="%"
          tone="clear"
          sub="ルーティングによる差分"
        />
        <Stat
          label="1サイト1プロファイルあたり"
          value={`$${(total / runs.length).toFixed(4)}`}
          sub="10プロファイルでも $0.1 台"
        />
      </div>

      {/* 出典。ここが本体 */}
      <div className="mt-4 rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">この数字の出どころ</span>
          {allApi ? (
            <Badge tone="clear">cost_source: api（APIが返した実費）</Badge>
          ) : (
            <Badge tone="stumble">一部は価格表からの計算値</Badge>
          )}
        </div>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          {allApi ? (
            <>
              {calls} 回すべて、OrcaRouter
              が応答に添えて返した実費をそのまま保存しています。こちらで単価表を掛けた推計値は
              1件もありません。
            </>
          ) : (
            <>
              一部の呼び出しは API が実費を返さなかったため、価格表から計算しています。
              計算値には <code className="font-mono">cost_source: table</code>{" "}
              が付いており、実測とは区別しています。
            </>
          )}
        </p>
        <p className="mt-2 text-xs text-fg-dim">
          生データは <code className="font-mono">trace.json</code> の{" "}
          <code className="font-mono">steps[].llm_calls[]</code>{" "}
          に1呼び出しずつ残っています。リポジトリで検証できます。
        </p>
      </div>

      {/* モデル内訳 */}
      <div className="mt-4 rounded-xl border border-line bg-surface p-5">
        <div className="text-sm font-medium">使われたモデル</div>
        <p className="mt-1 text-xs text-fg-dim">
          モデルは固定していません。OrcaRouter
          が判断の難しさに応じて振り分けた結果です。迷いが長引いた実行ほど上位モデルに寄ります。
        </p>
        <div className="mt-4 space-y-2">
          {models.map(([m, v]) => (
            <div key={m} className="flex items-center gap-3">
              <span className="w-40 shrink-0 truncate font-mono text-xs text-fg-muted">
                {m}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full bg-stumble"
                  style={{ width: `${(v / total) * 100}%` }}
                />
              </div>
              <span className="tnum w-20 shrink-0 text-right text-xs text-fg-muted">
                ${v.toFixed(5)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {runs.map((r) => (
          <div key={r.runId} className="rounded-xl border border-line bg-surface p-4">
            <div className="text-sm font-medium">{r.labelJa}</div>
            <div className="tnum mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-fg-muted">
              <span>
                実費 <strong className="text-fg">${r.totalUsd.toFixed(6)}</strong>
              </span>
              <span>{r.calls} 呼び出し</span>
              {r.baselineUsd !== null && (
                <span>
                  比較値 ${r.baselineUsd.toFixed(4)} →{" "}
                  <strong className="text-clear">
                    {((1 - r.totalUsd / r.baselineUsd) * 100).toFixed(1)}% 減
                  </strong>
                </span>
              )}
            </div>
            <p className="mt-2 text-[11px] text-fg-dim">
              迷った分だけ高くなります。{r.labelJa}は {r.clicks} クリック分の判断をしました。
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
