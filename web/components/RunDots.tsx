import Image from "next/image";
import type { Matrix } from "@/lib/matrix";
import type { ProfileCard } from "@/lib/profiles";

/**
 * **1つの点が、1回の実行。** プロファイルごとに横1列に並べる。
 *
 * ★ なぜ棒グラフではなく点なのか。棒だと「74%」が何回中の話か分からず、
 *   必ず「n はいくつ？」と聞かれる。点なら**数えられる**ので、その質問が起きない。
 *   いちばん上の行が全部みどりであること（制約がなければ5サイトとも終わる）が、
 *   下の行を読むための前提になる。それを1画面で見せるのがこの図の役目だ。
 *
 * ★ 色は3つに分ける。**「計測不能」を失敗と同じ赤で塗らない。**
 *   error はサイトが難しかったのではなく、こちらの未実装（画像入力）で落ちた回だ。
 *   同じ色にした瞬間、こちらのバグをサイトのせいにしたことになる (`lib/matrix.ts` 참조).
 *
 * ★ note_ja（プロファイル自身の限界）はこの図のすぐ下に出す。
 *   数字と離すと、都合の悪い注記だけ読まれない置き方になる。
 */

type Row = {
  id: string;
  name: string;
  photo: string | null;
  isControl: boolean;
  reached: number;
  failed: number;
  error: number;
  total: number;
  note: string | null;
};

export function RunDots({ matrix, cards }: { matrix: Matrix; cards: ProfileCard[] }) {
  const cells = matrix.sites.flatMap((s) => s.cells);

  const rows: Row[] = matrix.profiles.map((p) => {
    const mine = cells.filter((c) => c.profile_id === p.id);
    const card = cards.find((c) => c.id === p.id);
    const error = mine.filter((c) => c.outcome === "error").length;
    const reached = mine.filter((c) => c.reached).length;
    return {
      id: p.id,
      name: card?.personaJa ?? p.label_ja,
      photo: card?.photo ?? null,
      isControl: p.id === "control",
      reached,
      failed: mine.length - reached - error,
      error,
      total: mine.length,
      note: p.note_ja,
    };
  });

  // 対照群を先頭に。残りは到達が多い順 — 「どこから崩れるか」が上から読める
  rows.sort((a, b) => {
    if (a.isControl !== b.isControl) return a.isControl ? -1 : 1;
    return b.reached / b.total - a.reached / a.total;
  });

  return (
    <div>
      <ul className="space-y-5">
        {rows.map((r) => (
          <li
            key={r.id}
            className={r.isControl ? "border-b border-line-soft pb-5" : undefined}
          >
            <div className="flex items-start gap-3 sm:gap-4">
              {r.photo ? (
                <Image
                  src={r.photo}
                  alt=""
                  width={112}
                  height={112}
                  className="h-10 w-10 shrink-0 rounded-full object-cover sm:h-12 sm:w-12"
                />
              ) : (
                /* 대조군에는 사람이 없다. 사람이 아니라 기준선이라서 사진을 안 붙인다 */
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-line text-fg-dim sm:h-12 sm:w-12">
                  —
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-bold">
                    {r.name}
                    {r.isControl && (
                      <span className="ml-2 text-[11px] font-medium text-fg-dim">基準線</span>
                    )}
                  </span>
                  <span className="tnum text-sm text-fg-dim">
                    <strong
                      className={`text-lg font-bold ${
                        r.isControl ? "text-clear" : r.reached * 2 >= r.total ? "text-fg" : "text-blocked"
                      }`}
                    >
                      {r.reached}
                    </strong>
                    <span className="mx-0.5">/</span>
                    {r.total} 回 到達
                  </span>
                </div>

                {/* ★ 폰에서 19개가 반드시 **한 줄**에 들어가야 한다.
                    두 줄로 접히는 순간 「길이를 비교하는 그림」이 아니게 된다 */}
                <div className="mt-2 flex flex-wrap gap-[3px] sm:gap-1">
                  {dots(r).map((tone, i) => (
                    <span
                      key={i}
                      className={`h-2 w-2 rounded-full sm:h-3 sm:w-3 ${
                        tone === "reached"
                          ? "bg-clear"
                          : tone === "failed"
                            ? "bg-blocked"
                            : "bg-line border border-fg-dim/50"
                      }`}
                    />
                  ))}
                </div>

                {/* ★ 프로필 자신의 한계. 숫자 바로 밑을 떠나지 않는다 */}
                {r.note && (
                  <p className="mt-2 text-[11px] leading-relaxed text-stumble">⚠ {r.note}</p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-line-soft pt-5 text-[11px] text-fg-muted">
        <Legend className="bg-clear">用事を終えた</Legend>
        <Legend className="bg-blocked">たどり着けなかった</Legend>
        <Legend className="bg-line border border-fg-dim/50">計測不能（こちらの未実装）</Legend>
        <li className="text-fg-dim">点1つ = 1回の実行</li>
      </ul>
    </div>
  );
}

/** 到達を先に、計測不能を最後に。実行の順序に意味はないので、読める順に並べ替える */
function dots(r: Row): Array<"reached" | "failed" | "error"> {
  return [
    ...Array<"reached">(r.reached).fill("reached"),
    ...Array<"failed">(r.failed).fill("failed"),
    ...Array<"error">(r.error).fill("error"),
  ];
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${className}`} />
      {children}
    </li>
  );
}
