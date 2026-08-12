import type { SiteBlock } from "@/lib/matrix";

/**
 * **この製品でいちばん強い1枚。** 同じ制約・同じ用事を5つのサイトに通した結果を、
 * 横棒5本だけで出す。
 *
 * ★ 2026-08-12 전면 개편. 원래는 히어로 옆의 작은 패널이었다(h-2 막대·11px 글자).
 *   결과 화면의 주역으로 올리면서 크게 다시 그렸다.
 *
 * ★ なぜこの1枚が効くのか — **反論を1枚で潰すから。**
 *   「AIだからできないだけでは？」への答えがここにある。もしAIの限界なら5本とも同じ長さになる。
 *   実際には0%の行と94%の行が並ぶ。変えたのはサイトだけなので、**これはサイトを測った値**だ。
 *   そして0%が実在することが、「どんなサイトでも悪く出る装置」ではない証拠にもなる。
 *
 * ★ 대조군이 못 간 사이트에는 경고가 붙는다. 거기서는 「제약이 원인」이라고 말할 수 없다.
 *   현재 비교축 5사이트는 전부 대조군 도달이지만, 다른 用事를 넣으면 걸린다.
 */
export function SiteBars({ sites }: { sites: SiteBlock[] }) {
  const ordered = [...sites].sort((a, b) => (a.dropout_rate ?? 0) - (b.dropout_rate ?? 0));
  const best = ordered[0];
  const worst = ordered[ordered.length - 1];

  return (
    <div>
      <ul className="space-y-5">
        {ordered.map((s) => {
          const rate = s.dropout_rate ?? 0;
          const n = s.cells.filter((c) => c.profile_id !== "control");
          const failed = n.filter((c) => !c.reached).length;
          const zero = rate === 0;
          return (
            <li key={s.mission_id} className="sm:grid sm:grid-cols-[9rem_1fr] sm:items-center sm:gap-5">
              <div className="flex items-baseline justify-between gap-3 sm:block">
                <span className="block text-base font-bold">{s.site_name}</span>
                <span className="tnum block text-[11px] text-fg-dim sm:mt-0.5">
                  {failed} / {n.length} 回
                </span>
              </div>

              <div className="mt-2 flex items-center gap-3 sm:mt-0">
                {/* 트랙을 항상 그린다. 0%일 때 막대가 없으면 「측정 안 했다」로 읽힌다 */}
                <div className="h-7 flex-1 overflow-hidden rounded-lg bg-line-soft">
                  <div
                    className={`h-full rounded-lg ${zero ? "bg-clear" : "bg-blocked"}`}
                    /* 0%도 눈에 보이는 최소 폭을 준다 — 「끝까지 갔다」도 결과다 */
                    style={{ width: `${Math.max(rate * 100, 1.5)}%` }}
                  />
                </div>
                <span
                  className={`tnum w-[3.6rem] shrink-0 text-right text-2xl font-bold ${
                    zero ? "text-clear" : "text-blocked"
                  }`}
                >
                  {Math.round(rate * 100)}
                  <span className="ml-0.5 text-sm font-medium">%</span>
                </span>
              </div>

              {!s.control_reached && (
                <p className="mt-1 text-[11px] text-stumble sm:col-start-2">
                  ⚠ 対照群も到達していません。この行では「制約が原因」とは言えません。
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {/* ★ 사이트 이름을 손으로 쓰지 않는다. 실행을 다시 돌려 순위가 바뀌면 이 문장도 따라 바뀐다 */}
      {best && worst && best !== worst && (
        <p className="mt-7 border-t border-line-soft pt-5 text-sm leading-relaxed text-fg-muted">
          同じ用事（{best.task_ja}）を、同じ制約セットで通しました。
          <strong className="text-fg">
            {best.site_name}では {Math.round((best.dropout_rate ?? 0) * 100)}%、
            {worst.site_name}では {Math.round((worst.dropout_rate ?? 0) * 100)}%
          </strong>
          。AIも用事も制約も同じで、違うのはサイトだけです。
        </p>
      )}
    </div>
  );
}
