import type { Matrix } from "@/lib/matrix";

/**
 * 「その差、制約のせいですか。モデルのせいでは？」への答え。
 *
 * 이 반론이 가장 아프다. 평소 배치는 대조군이 auto 1종, 제약측이 라우팅 표의 4종이라
 * **도달률 차이에 모델 차이가 섞여 있다.** 그 데이터만으로는 부정할 수 없다.
 * 그래서 전원을 같은 모델에 못 박고 같은 사이트를 다시 돌렸다.
 *
 * ★ 나란히 놓는 상대는 전체 평균이 아니라 **같은 사이트의 라우팅 실행**이다.
 *   사이트 구성이 다르면 그 차이가 또 섞인다.
 */
export function ModelFixed({ matrix, cards }: { matrix: Matrix; cards: Array<{ id: string; labelJa: string }> }) {
  const f = matrix.model_fixed;
  if (!f) return null;

  const labelOf = (id: string) =>
    cards.find((c) => c.id === id)?.labelJa ??
    matrix.profiles.find((p) => p.id === id)?.label_ja ??
    id;

  const rows = f.by_profile.map((p) => ({
    id: p.id,
    label: labelOf(p.id),
    fixed: p,
    routed: f.routed_same_sites.find((r) => r.id === p.id) ?? null,
  }));

  return (
    <>
      <h2 className="mt-14 text-xl font-bold">その差は、モデルの違いではないのか</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fg-muted">
        ふだんの実行は、対照群と制約側で<strong className="text-fg">別のモデル</strong>が使われています
        （安いモデルへ振り分けているためです）。それだと「差はモデルのせいでは」という問いに
        この数字だけでは答えられません。そこで
        <strong className="text-fg">全員を同じモデル（{f.models.join("・")}）に固定して</strong>
        {f.site_names.join("・")}を回し直しました。{f.runs} 回です。
      </p>

      <div className="card mt-5 overflow-x-auto">
        <table className="w-full min-w-[540px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] text-fg-dim">
              <th className="px-5 py-3 font-medium">制約プロファイル</th>
              <th className="px-5 py-3 text-right font-medium">
                ふだん（モデル振り分けあり）
              </th>
              <th className="px-5 py-3 text-right font-medium">全員同じモデルに固定</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line-soft last:border-0">
                <td className="px-5 py-3">
                  <div className="font-medium">{r.label}</div>
                  <div className="font-mono text-[11px] text-fg-dim">{r.id}</div>
                </td>
                <Cell v={r.routed} />
                <Cell v={r.fixed} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 max-w-3xl text-[11px] leading-relaxed text-fg-dim">
        同じサイト・同じ用事の実行だけを並べています。実行回数は少なく、
        これは「差がモデルだけで説明されるものではなかった」という1回分の確認であって、
        差の大きさを確定させるものではありません。この実行の費用は、
        振り分けによる削減の証拠にはなりません（振り分けを止めているためです）。
      </p>
    </>
  );
}

function Cell({ v }: { v: { runs: number; reached: number; rate: number } | null }) {
  if (!v) return <td className="px-5 py-3 text-right text-fg-dim">—</td>;
  return (
    <td className="px-5 py-3 text-right">
      <span className={`tnum font-bold ${v.rate >= 0.99 ? "text-clear" : v.rate <= 0.5 ? "text-blocked" : "text-fg"}`}>
        {Math.round(v.rate * 100)}%
      </span>
      <span className="tnum ml-1.5 text-[11px] text-fg-dim">
        {v.reached}/{v.runs}
      </span>
    </td>
  );
}
