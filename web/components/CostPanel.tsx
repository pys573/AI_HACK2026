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
  // 재시도로 버려진 시도는 행이 안 남는다. 스키마 불일치로 버린 건 200이라 과금은 됐다
  const discarded = runs.reduce((a, r) => a + r.discardedCalls, 0);

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
              記録に残っている {calls} 回は、すべて OrcaRouter
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
        {/* 「1呼び出しずつ残っている」は judge 호출에 대해 거짓이다. 행이 없다 — 위치를 정확히 쓴다 */}
        <p className="mt-2 text-xs leading-relaxed text-fg-dim">
          生データは <code className="font-mono">trace.json</code> にあります。各手の判断は{" "}
          <code className="font-mono">steps[].llm_calls[]</code> に1呼び出しずつ。
          実行の最後に1回だけ走る成否判定は手に紐づかないため行が無く、{" "}
          <code className="font-mono">cost.by_step_type.judge</code>{" "}
          に金額だけ入っています。リポジトリで検証できます。
        </p>

        {/*
          ★ 이 블록이 없으면 위의 금액은 방어할 수 없다.
          재시도로 버려진 시도는 행이 안 남는다 — 그런데 스키마 불일치로 버린 건 200이라 과금은 됐다.
          결손 방향이 **우리에게 유리한 쪽**(더 싸 보임)이라 더더욱 우리가 먼저 말해야 한다.
        */}
        {discarded > 0 && (
          <div className="mt-4 rounded-lg border border-blocked/30 bg-blocked/5 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="blocked">記録に残っていない呼び出しが {discarded} 回</Badge>
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-fg-muted">
              実際に叩いたのは<strong className="tnum text-fg">少なくとも {calls + discarded} 回</strong>
              で、上の金額に入っているのは <strong className="tnum text-fg">{calls} 回</strong>
              分です。差は再試行で捨てた分で、
              <strong className="text-fg">返答の形式が違ったので捨てた</strong>ものは HTTP 200
              が返っています。つまり課金はされているはずですが、記録を残す前に捨てているため
              金額が分かりません。
            </p>
            <p className="mt-2 text-xs leading-relaxed text-fg-muted">
              上の実費は<strong className="text-blocked">実際より小さい可能性があります</strong>。
              しかもこれは私たちに都合のいい向きの誤差です。だから先に書いておきます。
              原因は <code className="font-mono">llm/orca.ts</code>{" "}
              の再試行で、既知の不具合として把握しています。
            </p>
          </div>
        )}
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
              <span>
                {r.calls} 呼び出し
                {r.discardedCalls > 0 && (
                  <span className="text-blocked">（ほかに記録なし {r.discardedCalls}）</span>
                )}
              </span>
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
