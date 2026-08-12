import type { SiteBlock } from "@/lib/matrix";

/**
 * 히어로 옆의 패널. 목업에는 「分析進捗 68%」라는 도는 척하는 원이 있었다.
 * 돌지 않는 진행률은 페이크다(절대규칙 3). 같은 자리에 **이미 나온 결과**를 둔다 —
 * 이쪽이 「wow」도 더 크다. 진행률은 아무것도 말하지 않지만 이 표는 말한다.
 *
 * ★ 대조군이 못 간 사이트에는 경고가 붙는다. 그런 사이트에서는
 *   「제약이 원인이다」라고 말할 수 없다.
 */
export function SiteBars({ sites }: { sites: SiteBlock[] }) {
  const ordered = [...sites].sort((a, b) => (b.dropout_rate ?? 0) - (a.dropout_rate ?? 0));

  return (
    <div className="card p-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold">サイト別・たどり着けなかった割合</h2>
        <span className="text-[11px] text-fg-dim">対照群を除く</span>
      </div>

      <ul className="mt-5 space-y-4">
        {ordered.map((s) => {
          const rate = s.dropout_rate ?? 0;
          const n = s.cells.filter((c) => c.profile_id !== "control");
          const failed = n.filter((c) => !c.reached).length;
          return (
            <li key={s.mission_id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium">{s.site_name}</span>
                <span className="tnum text-sm font-bold text-fg-muted">
                  <span className={rate > 0 ? "text-blocked" : "text-clear"}>
                    {Math.round(rate * 100)}%
                  </span>
                  <span className="ml-1.5 text-[11px] font-normal text-fg-dim">
                    {failed}/{n.length}
                  </span>
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line-soft">
                <div
                  className={`h-full rounded-full ${rate > 0 ? "bg-blocked" : "bg-clear"}`}
                  style={{ width: `${Math.max(rate * 100, 2)}%` }}
                />
              </div>
              {!s.control_reached && (
                <p className="mt-1 text-[11px] text-stumble">
                  ⚠ 対照群も到達していません。この行では「制約が原因」とは言えません。
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {/* 用事の名前を手で書かない。別の用事を回した日に、この行だけ古いまま残る */}
      <p className="mt-5 border-t border-line-soft pt-4 text-[11px] leading-relaxed text-fg-dim">
        同じ用事（{ordered[0]?.task_ja}）を、同じ制約セットで各サイトに通した結果です。
        1マスあたりの実行回数は少なく、実行ごとに結果が変わることを確認しています。
      </p>
    </div>
  );
}
