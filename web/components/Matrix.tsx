import Link from "next/link";
import type { Matrix as M } from "@/lib/matrix";
import { outcomeLabel } from "@/lib/matrix";
import type { ProfileCard } from "@/lib/profiles";

/**
 * サイト × プロファイルの全マス。
 *
 * ★ 결과가 여러 번인 칸은 「2회 중 1회」처럼 **분모를 보여준다.**
 *   같은 칸에 두 결과가 있는데 하나만 그리면, 뒤집힌 실행을 숨긴 것이 된다.
 *
 * ★ error(계측 불능)는 회색이다. ×로 칠하면 「사이트가 어려워서 실패」로 읽히는데,
 *   실제로는 우리 쪽 미구현이다. 색을 나누는 것이 이 표의 정직함이다.
 */
export function Matrix({ matrix, cards }: { matrix: M; cards: ProfileCard[] }) {
  const profiles = matrix.profiles;

  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full min-w-[860px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border-b border-line bg-ink px-3 py-3 text-left text-[11px] font-medium text-fg-dim">
              サイト
            </th>
            {profiles.map((p) => (
              <th key={p.id} className="border-b border-line px-3 py-3 text-left align-bottom">
                <div className="text-[12px] font-bold leading-tight">{p.label_ja}</div>
                <div className="mt-0.5 font-mono text-[10px] font-normal text-fg-dim">
                  {p.id} v{p.version}
                </div>
              </th>
            ))}
            <th className="border-b border-line px-3 py-3 text-right text-[11px] font-medium text-fg-dim">
              到達
            </th>
          </tr>
        </thead>

        <tbody>
          {matrix.sites.map((s) => {
            const reached = s.cells.filter((c) => c.reached).length;
            return (
              <tr key={s.mission_id}>
                <th className="sticky left-0 z-10 border-b border-line-soft bg-ink px-3 py-3 text-left align-top">
                  <div className="font-bold">{s.site_name}</div>
                  {!s.control_reached && (
                    <div className="mt-0.5 text-[10px] font-normal text-stumble">
                      ⚠ 対照群も未到達
                    </div>
                  )}
                </th>

                {profiles.map((p) => {
                  const cs = s.cells.filter((c) => c.profile_id === p.id);
                  return (
                    <td key={p.id} className="border-b border-line-soft px-2 py-2 align-top">
                      <div className="flex flex-col gap-1.5">
                        {cs.map((c) => {
                          const o = outcomeLabel(c.outcome);
                          const tone =
                            o.tone === "clear"
                              ? "border-clear/40 bg-clear/[0.08] text-clear"
                              : o.tone === "blocked"
                                ? "border-blocked/40 bg-blocked/[0.07] text-blocked"
                                : o.tone === "stumble"
                                  ? "border-stumble/40 bg-stumble/[0.08] text-stumble"
                                  : "border-line bg-surface-2 text-fg-dim";
                          const inner = (
                            <>
                              <div className="text-[11px] font-bold">{o.ja}</div>
                              <div className="tnum mt-0.5 text-[10px] font-normal opacity-80">
                                {c.clicks}クリック / {c.seconds}秒
                              </div>
                            </>
                          );
                          return c.replayable ? (
                            <Link
                              key={c.run_id}
                              href={`/replay?run=${encodeURIComponent(c.run_id)}`}
                              className={`block rounded-lg border px-2.5 py-1.5 transition hover:brightness-95 ${tone}`}
                            >
                              {inner}
                            </Link>
                          ) : (
                            <div key={c.run_id} className={`rounded-lg border px-2.5 py-1.5 ${tone}`}>
                              {inner}
                            </div>
                          );
                        })}
                        {cs.length === 0 && <span className="px-1 text-[11px] text-fg-dim">—</span>}
                      </div>
                    </td>
                  );
                })}

                <td className="border-b border-line-soft px-3 py-3 text-right align-top">
                  <span className="tnum font-bold">
                    {reached}
                    <span className="font-normal text-fg-dim">/{s.cells.length}</span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>

        <tfoot>
          <tr>
            <th className="sticky left-0 z-10 bg-ink px-3 py-3 text-left text-[11px] font-medium text-fg-dim">
              プロファイル別 到達
            </th>
            {profiles.map((p) => {
              const r = matrix.by_profile.find((x) => x.id === p.id);
              return (
                <td key={p.id} className="px-3 py-3">
                  {r && (
                    <div className="tnum">
                      <span className="text-base font-bold">{Math.round(r.rate * 100)}%</span>
                      <span className="ml-1.5 text-[11px] text-fg-dim">
                        {r.reached}/{r.runs}
                      </span>
                    </div>
                  )}
                </td>
              );
            })}
            <td />
          </tr>
        </tfoot>
      </table>

      {/* ★ 경고는 표 바로 밑이다. 페이지 맨 아래로 내리면 아무도 안 읽는다 */}
      {matrix.profiles.some((p) => p.note_ja) && (
        <div className="mt-4 space-y-2">
          {matrix.profiles
            .filter((p) => p.note_ja)
            .map((p) => (
              <p
                key={p.id}
                className="rounded-lg border border-stumble/40 bg-stumble/[0.07] px-4 py-2.5 text-[12px] leading-relaxed text-stumble"
              >
                ⚠ <strong>{p.label_ja}</strong>：{p.note_ja}
              </p>
            ))}
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-fg-dim">
        「計測不能」は仕組み側の未実装で止まったもので、サイトの難しさではありません。
        「手数上限」は決めた手数を使い切った状態、「諦めた」はプロファイルの忍耐予算を使い切った状態です。
      </p>
    </div>
  );
}
