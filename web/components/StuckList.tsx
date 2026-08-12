import type { Matrix, FindingRow } from "@/lib/matrix";

/**
 * 「離脱地点ランキング」と「改善提案」を1つにした節。
 *
 * 목업은 이 둘을 나눠 놓았지만 나누면 안 된다 —
 * 「71%가 여기서 이탈」과 「입구 동선을 명확히 하자」가 떨어져 있으면,
 * 받은 쪽은 **어느 제안이 어느 이탈에 대한 것인지 모른다.**
 * 원인과 고칠 문장은 같은 카드 안에 붙어 있어야 쓸 수 있는 리포트가 된다.
 *
 * ★ 개선 제안을 우리가 쓰지 않는다. 전부 실행이 남긴 findings의 fix_ja다.
 *   보기 좋은 3줄을 손으로 채우면 그건 목업이지 리포트가 아니다 (절대규칙 3).
 */
export function StuckList({ matrix }: { matrix: Matrix }) {
  const bySite = matrix.sites.filter((s) => s.findings.length > 0);
  const total = matrix.sites.reduce((a, s) => a + s.findings.length, 0);

  if (total === 0) {
    return (
      <div className="card mt-14 p-6">
        <h2 className="text-xl font-bold">止まった場所</h2>
        <p className="mt-2 text-sm text-fg-muted">
          この実行では記録されていません。<strong className="text-fg">0件は「まだ作っていない」ではなく
          「詰まりが記録されなかった」という結果</strong>です。
        </p>
      </div>
    );
  }

  return (
    <section className="mt-14">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xl font-bold">止まった場所と、そこを直す文</h2>
        <span className="tnum text-sm text-fg-dim">全 {total} 件</span>
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fg-muted">
        止まった1件ごとに、<strong className="text-fg">何が止めたのか</strong>と
        <strong className="text-fg">どう書きかえるのか</strong>を対にしています。
        文はすべて実行が残した記録そのもので、こちらで書き足したものはありません。
      </p>

      <div className="mt-6 space-y-8">
        {bySite.map((s) => (
          <div key={s.mission_id}>
            <h3 className="flex items-baseline gap-2 text-base font-bold">
              {s.site_name}
              <span className="tnum text-xs font-normal text-fg-dim">{s.findings.length} 件</span>
            </h3>
            <ul className="mt-3 space-y-3">
              {s.findings.slice(0, 6).map((f, i) => (
                <Card key={`${f.run_id}-${f.step_n}-${i}`} f={f} rank={i + 1} />
              ))}
            </ul>
            {s.findings.length > 6 && (
              <p className="mt-2 text-[11px] text-fg-dim">
                ほか {s.findings.length - 6} 件（生の記録は agent/runs/ にあります）
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Card({ f, rank }: { f: FindingRow; rank: number }) {
  const tone =
    f.severity === "high"
      ? "border-blocked/40 bg-blocked/[0.05]"
      : f.severity === "medium"
        ? "border-stumble/40 bg-stumble/[0.05]"
        : "border-line bg-surface";
  const sev = f.severity === "high" ? "大きい" : f.severity === "medium" ? "中くらい" : "小さい";

  return (
    <li className={`rounded-2xl border p-5 ${tone}`}>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-fg-dim">
        <span className="tnum text-base font-bold text-fg">{String(rank).padStart(2, "0")}</span>
        <span className="rounded-md border border-line bg-surface px-2 py-0.5 font-mono">
          {f.profile_id}
        </span>
        <span className="tnum">{f.step_n} 手目</span>
        <span className="rounded-md border border-line bg-surface px-2 py-0.5">影響 {sev}</span>
      </div>

      <p className="mt-3 font-bold leading-relaxed">{f.cause_ja}</p>

      <div className="mt-3 rounded-xl border border-line bg-surface px-4 py-3">
        <div className="text-[11px] font-medium text-brand">こう直す</div>
        <p className="mt-1 text-sm leading-relaxed">{f.fix_ja}</p>
      </div>

      {/* ★ 근거 없는 지적은 버그다. 있으면 반드시 같이 뜬다 */}
      {f.evidence.length > 0 && (
        <ul className="mt-3 space-y-1">
          {f.evidence.map((e) => (
            <li key={e} className="text-[11px] leading-relaxed text-fg-dim">
              ・{e}
            </li>
          ))}
        </ul>
      )}

      <a
        href={f.url}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-3 block truncate font-mono text-[11px] text-fg-dim hover:text-brand"
      >
        {f.url}
      </a>
    </li>
  );
}
