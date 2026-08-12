import Image from "next/image";
import Link from "next/link";
import { Page } from "@/components/Chrome";
import { loadMatrix } from "@/lib/matrix";
import { loadProfileCards } from "@/lib/profiles";
import { Personas } from "@/components/Personas";
import { RequestForm } from "@/components/RequestForm";

/**
 * ランディング。
 *
 * ★ 2026-08-12. **이 화면에는 계측 숫자를 두지 않는다.**
 *   원래는 히어로에 matrix.json에서 뽑은 「◯人に試させた / ◯人がたどり着けなかった」가
 *   있었고, 프로필 카드마다 제약 사양·실측·출처가 붙어 있었다. 전부 뺐다.
 *   숫자가 먼저 읽히면 **무슨 물건인지가 나중에 읽힌다.** 랜딩에서 그건 손해다
 *   (③完成度・デモ의 채점 관점이 「触れて数十秒で価値がわかる」이다).
 *
 *   그래서 역할을 나눴다 —
 *   · **여기(/)**       : 무엇을 하는 물건인지. 사람 4명, 세 줄 카피, URL 접수
 *   · **`/report`**     : 계측. 숫자·제약 사양·근거·출처·한계 고지가 전부 거기 있다
 *   두 번째 절 밑의 링크 한 줄이 그 둘을 잇는다. 그 링크는 지우지 않는다.
 *
 * ★ 남아 있는 유일한 숫자는 CTA의 離脱率이고, 그것도 matrix.json에서 온다.
 *   **숫자를 손으로 쓰지 않는다**는 규칙은 그대로다 — 실행을 다시 돌리면 같이 바뀐다.
 *
 * ★ 여전히 안 쓰는 말: 「監査」「アクセシビリティ検査」.
 *   이유는 오해가 아니라 불리한 비교다 (예산 프레임 / Lighthouse). `CLAUDE.md` 참조.
 */

export default function Home() {
  const m = loadMatrix();
  const cards = loadProfileCards(m?.profiles.map((p) => p.id) ?? []);

  return (
    <Page>
      {/* ── ヒーロー ─────────────────────────────────────── */}
      <section className="brand-wash border-b border-line">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-16 sm:py-24 lg:grid-cols-2 lg:items-center">
          <div>
            {/* ★ 2026-08-12. 여기 있던 「◯人に試させた / ◯人がたどり着けなかった」와
                그 정의 각주를 뺐다. 실측 숫자를 첫 화면에 세우면 무슨 물건인지보다
                숫자가 먼저 읽혀서, 3초 안에 전달되지 않았다.
                숫자는 사라진 게 아니라 `/report`에 있다 — 거기가 계측의 자리다. */}
            {/* ★ 줄바꿈 위치를 폭에 따라 바꾼다. 글자 크기만 줄이는 방식으로는 안 됐다 —
                가장 긴 줄이 18자라 폰에서 그걸 넣으려면 h1이 18px까지 작아진다.
                그래서 폰에서는 「見つけ、」를 아래로 내려 가장 긴 줄을 14자로 만들고,
                대신 글자를 키웠다. 일본어는 어디서든 줄이 끊겨서, 두면 「見つ / け、」가 된다.
                lg에서 2단 그리드가 걸려 폭이 절반이 되므로 거기서 한 번 줄이고 xl에서 되돌린다 */}
            <h1 className="text-[1.35rem] font-bold leading-[1.5] tracking-tight sm:text-[2rem] lg:text-[1.5rem] xl:text-[1.8rem]">
              特定ユーザーを再現するAIが
              <br />
              ウェブサイトの「つまずき」を
              <br className="sm:hidden" />
              見つけ、
              <br className="hidden sm:inline" />
              改善策まで提案する
            </h1>
          </div>

          {/* 목업의 「분석 진척 68%」 자리. 이건 제품 이미지이지 계측값이 아니다 —
              그래서 여기에 숫자를 붙이지 않는다. 실측은 전부 /report에 있다 */}
          <Image
            src="/img/hero-visual.png"
            alt=""
            width={1288}
            height={860}
            priority
            /* 원본 PNG에 투명 여백이 넉넉히 들어 있어서, 그대로 두면 실제 그림이 작아 보인다.
               자르는 대신 조금 키워서 목업의 비율에 맞춘다 */
            className="h-auto w-full max-w-xl justify-self-center lg:max-w-none lg:scale-[1.12]"
          />
        </div>
      </section>


      {/* ── 制約プロファイル ─────────────────────────────── */}
      <section className="border-b border-line bg-surface-2">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            さまざまな人の視点で試します
          </h2>
          {/* ★ 여기 있던 「ただし、人物を演じさせてはいません…」 단락을 뺐다.
              아직 무슨 물건인지 모르는 사람에게 부정문부터 들이밀고 있었다.
              같은 내용은 `profiles/README.md`와 `/report`에 남아 있다 */}
          <Personas cards={cards} />

          {/* 근거로 가는 길 한 줄. 이게 없으면 랜딩에서 계측으로 갈 방법이 없다 */}
          <p className="mt-8 text-center text-sm">
            <Link href="/report" className="text-brand hover:underline">
              それぞれに何を制限したか・実際にどうなったか →
            </Link>
          </p>
        </div>
      </section>

      {/* ── できること ───────────────────────────────────── */}
      <section className="border-b border-line">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            ツマヅキがすること
          </h2>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              {
                n: "01",
                t: "見えるものを実際に減らす",
                d: "調査に基づいて語を伏せ、画面を拡大し、検索を無効にします。「そのつもりで動いて」と頼むのではなく、渡すデータ自体を削ります。",
              },
              {
                n: "02",
                t: "止まった場所を記録する",
                d: "クリック・ページ遷移・滞在時間・AIがその場で書いた理由を、1手ずつ残します。あとから誰でも同じ記録を読み直せます。",
              },
              {
                n: "03",
                t: "直す文を出す",
                d: "止まった1件ごとに、何が止めたのかと、どう書きかえるのかを対にして出します。根拠の数字が必ず付きます。",
              },
            ].map((s) => (
              <li key={s.n} className="card p-6">
                <div className="tnum text-lg font-bold text-brand">{s.n}</div>
                <h3 className="mt-2 font-bold">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{s.d}</p>
              </li>
            ))}
          </ol>

          <p className="mx-auto mt-12 max-w-3xl text-center text-xl font-bold leading-relaxed sm:text-2xl">
            主観だった「使いにくさ」を、
            <br />
            大規模に同一基準で計測する。
            <br />
            日本の <span className="text-brand">DX化</span> を前に進めます。
          </p>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────── */}
      <section className="brand-solid">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-14 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div className="text-white">
            <h2 className="text-2xl font-bold leading-snug sm:text-3xl">
              あなたのサイトでも
              <br />
              試してみませんか？
            </h2>
            <p className="mt-3 text-sm text-white/75">
              URLを入力するだけで、依頼できます。
            </p>

            {/* 실제로 돌린 5곳. 「今はこの5サイトを公開中」을 링크로 보여준다 */}
            <p className="mt-6 text-xs font-medium text-white/60">実際に試した 5 サイト</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {(m?.sites ?? []).map((s) => (
                <li key={s.mission_id}>
                  <a
                    href={s.start_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-2 rounded-full border border-white/25 px-3 py-1.5 text-xs text-white/90 transition hover:border-white/60"
                  >
                    <span className="font-medium">{s.site_name}</span>
                    {s.dropout_rate !== null && (
                      <span className="tnum text-white/60">
                        離脱 {Math.round(s.dropout_rate * 100)}%
                      </span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <RequestForm />
        </div>
      </section>
    </Page>
  );
}
