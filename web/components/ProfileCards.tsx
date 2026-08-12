import Image from "next/image";
import type { ProfileCard } from "@/lib/profiles";

/**
 * 프로필 카드 = **사람** + 사양 + 실측 결과 + 근거.
 *
 * ★ 2026-08-12 되돌림. 한때 사진을 전부 뺐다 — 사진이 「この人を再現した」는 주장으로
 *   읽힐까 봐서다. 과잉이었다. 사진이 그 주장이 되려면 **옆에 재현했다는 문장이 있어야 한다.**
 *   사진 밑에 「外来語を伏せて試す」와 프로필 id·version이 붙어 있으면,
 *   그건 재현 주장이 아니라 **누구를 위한 계측인지의 설명**이다.
 *   자세한 판단 근거는 저장소 루트 「심사위원 예상 반박과 대응.md」 §7.
 *
 * 그래서 카드는 위에서 아래로 이 순서다 —
 *   사진 → 사람 이름 → 상태 태그 → **실측 결과** → 제약 사양 → 근거·출처
 *   위쪽이 1초에 이해시키는 층이고, 아래쪽이 찔렸을 때 답하는 층이다.
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
            {/* 사진이 있는 카드는 사진이 먼저.
                대조군은 사람이 아니라 기준선이라 사진 대신 같은 크기의 빈 자리를 둔다 —
                자리를 안 두면 카드 하나만 키가 달라져서 「빠뜨린 칸」처럼 보인다 */}
            {c.photo ? (
              <Image
                src={c.photo}
                alt=""
                width={560}
                height={468}
                className="mb-4 aspect-[4/3] w-full rounded-xl object-cover"
              />
            ) : (
              <div className="mb-4 flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-dashed border-clear/40 bg-clear/[0.06]">
                <span className="text-sm font-medium text-clear">制約なし（基準線）</span>
              </div>
            )}

            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold leading-snug">{c.personaJa ?? c.labelJa}</h3>
                {/* ★ 사람 이름 바로 밑에 사양 이름과 버전이 붙는다. 이 두 줄이 붙어 있는 한
                    카드는 「이 사람을 재현했다」가 아니라 「이 조건으로 돌렸다」로 읽힌다 */}
                <p className="mt-1 text-[11px] leading-relaxed text-fg-dim">
                  {c.personaJa ? `${c.labelJa} ` : ""}
                  <span className="font-mono">
                    {c.id} v{c.version}
                  </span>
                </p>
              </div>
              {c.isControl && (
                <span className="shrink-0 rounded-full border border-clear/40 bg-clear/10 px-2.5 py-0.5 text-[11px] font-medium text-clear">
                  対照群
                </span>
              )}
            </div>

            {c.personaTags.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {c.personaTags.map((t) => (
                  <li
                    key={t}
                    className="rounded-full bg-brand/[0.08] px-2.5 py-1 text-[11px] font-medium text-brand"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            )}

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

            {/* 사양 — 여기부터가 「찔렸을 때 답하는 층」이다 */}
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
