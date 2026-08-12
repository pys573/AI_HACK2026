import Image from "next/image";
import type { ProfileCard } from "@/lib/profiles";

/**
 * 랜딩의 인물 줄 — **사진과 이름만.** 목업(`website design/landingpage.png`) 그대로다.
 *
 * ★ 2026-08-12. 이 자리에는 원래 제약 사양·실측 숫자·근거 출처가 전부 들어 있었다.
 *   전부 뺐다. 랜딩은 「무슨 물건인지」를 몇 초에 전달하는 자리이고,
 *   카드 하나에 6줄씩 붙어 있으면 그 몇 초를 다 쓴다.
 *
 *   **뺀 것이 사라진 것은 아니다** — 전부 `/report`에 있다:
 *   · 제약 사양·근거·출처 → `Matrix.tsx` / `profiles/README.md`
 *   · 프로필별 실측 결과 → `/report` 상단
 *   · ⚠ smartphone-novice의 한계 고지 → `Matrix.tsx` 하단 (여기서 빠져도 거기 남는다)
 *   그래서 줄 밑에 `/report`로 가는 링크 한 줄만 남겼다. 이게 없으면 랜딩에서
 *   근거로 가는 길이 끊긴다.
 *
 * 대조군(`control`)은 여기 없다. 사람이 아니라 기준선이고, 비교는 `/report`에서 한다.
 */

/** 목업의 배열 순서. m.profiles의 사전순에 맡기면 순서가 바뀐다 */
const ORDER = ["senior-70s", "busy-worker", "resident-n3", "smartphone-novice"];

export function Personas({ cards }: { cards: ProfileCard[] }) {
  const people = ORDER.map((id) => cards.find((c) => c.id === id)).filter(
    (c): c is ProfileCard => Boolean(c?.photo && c?.personaJa),
  );

  return (
    <div className="mt-10 grid grid-cols-2 gap-5 md:grid-cols-4">
      {people.map((c) => (
        <article key={c.id} className="card p-4">
          <Image
            src={c.photo as string}
            alt=""
            width={560}
            height={468}
            className="aspect-[4/3] w-full rounded-xl object-cover"
          />
          <h3 className="mt-4 text-center text-base font-bold">{c.personaJa}</h3>
        </article>
      ))}
    </div>
  );
}
