import type { ProfileCard } from "@/lib/profiles";

/**
 * 프로필 카드 = 사양 + 실측 결과 + 근거.
 *
 * 목업에는 웃는 사람 사진이 있었다. 사진을 지운 이유는 디자인 취향이 아니라
 * **사진 자체가 「この人を再現した」という主張になる**からだ。우리는 그 주장을 하지 않는다.
 * 대신 그 자리에 「무엇을 어떻게 제한했는가」를 둔다 — 이건 검증 가능하다.
 *
 * ★ note_ja가 있는 프로필은 경고를 **결과 숫자 바로 아래**에 붙인다.
 *   각주로 내리면 숫자만 읽고 지나간다.
 */
export function ProfileCards({
  cards,
  byProfile,
  notes,
}: {
  cards: ProfileCard[];
  byProfile: Array<{ id: string; runs: number; reached: number; rate: number }>;
  notes: Array<{ id: string; note_ja: string | null }>;
}) {
  return (
    <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => {
        const r = byProfile.find((p) => p.id === c.id);
        const note = notes.find((n) => n.id === c.id)?.note_ja ?? null;
        const failed = r ? r.runs - r.reached : 0;

        return (
          <article
            key={c.id}
            className={`card flex flex-col p-6 ${c.isControl ? "border-clear/40 bg-clear/[0.04]" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold leading-snug">{c.labelJa}</h3>
                <p className="mt-1 font-mono text-[11px] text-fg-dim">
                  {c.id} v{c.version}
                </p>
              </div>
              {c.isControl && (
                <span className="shrink-0 rounded-full border border-clear/40 bg-clear/10 px-2.5 py-0.5 text-[11px] font-medium text-clear">
                  対照群
                </span>
              )}
            </div>

            {/* 실측 결과 */}
            {r && (
              <div className="mt-4 rounded-xl border border-line bg-surface-2 px-4 py-3">
                <div className="text-[11px] text-fg-dim">たどり着けなかった回数</div>
                <div className="tnum mt-0.5 text-2xl font-bold">
                  <span className={failed > 0 ? "text-blocked" : "text-clear"}>{failed}</span>
                  <span className="text-base font-medium text-fg-dim"> / {r.runs} 回</span>
                </div>
              </div>
            )}

            {note && (
              <p className="mt-3 rounded-lg border border-stumble/40 bg-stumble/[0.08] px-3 py-2 text-[12px] leading-relaxed text-stumble">
                ⚠ {note}
              </p>
            )}

            {/* 사양 */}
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {c.specs.map((s) => (
                <li
                  key={s}
                  className="rounded-md border border-line bg-surface-2 px-2 py-1 text-[11px] text-fg-muted"
                >
                  {s}
                </li>
              ))}
            </ul>

            {c.evidenceJa && (
              <p className="mt-auto pt-4 text-[11px] leading-relaxed text-fg-dim">{c.evidenceJa}</p>
            )}
          </article>
        );
      })}
    </div>
  );
}
