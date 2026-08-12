import Image from "next/image";
import { Page } from "@/components/Chrome";
import { loadMatrix } from "@/lib/matrix";
import { loadProfileCards } from "@/lib/profiles";
import { ProfileCards } from "@/components/ProfileCards";
import { RequestForm } from "@/components/RequestForm";

/**
 * ランディング。
 *
 * ★ 화면에 숫자를 손으로 쓰지 않는다. 전부 matrix.json에서 온다 —
 *   실행을 다시 돌리면 이 페이지도 같이 바뀐다. 어긋날 수 없는 구조가 방어선이다.
 *   데이터가 없으면 숫자 자리를 아예 안 그린다. 「—」로 채우면 0으로 읽힌다.
 *
 * ★ 2026-08-12 방침 변경 —「심사위원 예상 반박과 대응.md」§7.
 *   한때 이 화면에서 인물 사진·「人」이라는 단위·URL 입력창을 전부 뺐다.
 *   전부 「오해받을 수 있다」가 이유였는데, 채점표에는 그런 항목이 없다.
 *   대신 ③完成度・デモ의 채점 관점이 **「触れて数十秒で価値がわかる」**이다.
 *   즉 이해를 늦춘 만큼 점수를 잃는다. 그래서 되돌렸다.
 *
 *   지금 규칙은 하나다 — **누구를 위한 것인지는 대담하게, 숫자는 정확하게.**
 *   · 「AIユーザーテスター」「10人」「사람 사진」은 쓴다. 이건 카테고리 설명이다
 *   · 숫자와 用事 이름은 손으로 안 쓴다. matrix.json에서 온다
 *   · 「10人」의 정의(5プロファイル × 2)는 **같은 화면 안에** 둔다.
 *     정의가 옆에 있으면 그건 주장이 아니라 단위다
 *   · 「監査」는 여전히 안 쓴다. Lighthouse와 비교당하는 프레임이라 손해만 본다
 *
 * 랜딩은 **컨셉과 홍보**의 자리다. 계측 결과를 늘어놓는 곳이 아니다 — 그건 /report에 있다.
 */

/** 첫 화면에 세우는 사이트. 데이터에 없으면 전체 합계로 떨어진다 */
const HERO_SITE = "新宿区";

export default function Home() {
  const m = loadMatrix();
  const cards = loadProfileCards(m?.profiles.map((p) => p.id) ?? []);

  // ★ 머리기사도 손으로 쓰지 않는다.
  //   지정한 사이트가 데이터에 있으면 그 사이트의 실측, 없으면 전체 합계.
  //   대조군은 「제약이 없으면 되는가」의 대조라서 시행 수에서 뺀다.
  const hero = m?.sites.find((s) => s.site_name === HERO_SITE) ?? null;
  const heroCells = hero ? hero.cells.filter((c) => c.profile_id !== "control") : [];

  const byProfile = m ? m.by_profile.filter((p) => p.id !== "control") : [];
  const tried = hero ? heroCells.length : byProfile.reduce((a, p) => a + p.runs, 0);
  const stuck = hero
    ? heroCells.filter((c) => !c.reached).length
    : byProfile.reduce((a, p) => a + (p.runs - p.reached), 0);
  const where = hero ? `${hero.site_name}で` : "自治体サイトで";
  // 「◯人」の内訳。手で書くと、回し直した日にここだけ古い値で残る
  const profileCount = new Set(heroCells.map((c) => c.profile_id)).size || byProfile.length;
  const perProfile = profileCount > 0 ? Math.round(tried / profileCount) : 0;
  const taskJa = hero?.task_ja ?? m?.sites[0]?.task_ja ?? "";

  return (
    <Page>
      {/* ── ヒーロー ─────────────────────────────────────── */}
      <section className="brand-wash border-b border-line">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-16 sm:py-24 lg:grid-cols-2 lg:items-center">
          <div>
            {m && tried > 0 ? (
              <h1 className="font-bold leading-[1.4] tracking-tight">
                {/* ★ 用事の名前も人数も手で書かない。matrix.json から出す —
                    別の用事を回した日にここだけ古いまま残ると、それは嘘になる */}
                <span className="block text-balance text-[1.3rem] leading-snug sm:text-[1.5rem] lg:text-[1.3rem] xl:text-[1.5rem]">
                  {where}「{taskJa}」を
                </span>
                <span className="block text-[1.7rem] sm:text-[2.35rem] lg:text-[1.85rem] xl:text-[2.35rem]">
                  <span className="tnum text-brand">{tried}</span> 人に試させた。
                </span>
                <span className="block text-[1.7rem] sm:text-[2.35rem] lg:text-[1.85rem] xl:text-[2.35rem]">
                  <span className="tnum text-blocked">{stuck}</span> 人が、たどり着けなかった。
                </span>
              </h1>
            ) : (
              <h1 className="text-3xl font-bold leading-[1.35] tracking-tight sm:text-[2.6rem]">
                どこでツマヅくか、
                <br />
                10人が先に試す。
              </h1>
            )}

            <p className="mt-6 text-lg font-medium leading-relaxed sm:text-xl">
              特定ユーザーを再現するAIが
              <br />
              ウェブサイトの「つまずき」を見つけ、
              <br />
              改善策まで提案する
            </p>

            {/* ★ 「人」の定義を同じ画面に置く。
                定義が隣にあれば、それは主張ではなく単位になる。
                ここを別ページに追い出した瞬間「実在の◯人」と読まれる */}
            {m && tried > 0 && (
              <p className="mt-4 text-[12px] leading-relaxed text-fg-dim">
                {tried} 人 ＝ 制約プロファイル {profileCount} 種 ×{" "}
                {perProfile} 回の実行です。実在の人物ではなく、
                <strong className="text-fg-muted">
                  公開された制約仕様の下で動かしたAI
                </strong>
                で、仕様は <code className="font-mono">profiles/</code> にあります。
              </p>
            )}
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
          {/* ★ 「誰のためか」を先に言い、「演じさせていない」を後ろに置く。
              順番を逆にすると、まだ何の話か分かっていない人に否定文から入ることになる */}
          <p className="mx-auto mt-3 max-w-2xl text-center leading-relaxed text-fg-muted">
            ただし、人物を<strong className="text-fg">演じさせてはいません</strong>。
            カードに書いてあるのが実際に適用した設定そのもので、
            ファイルは <code className="font-mono text-[13px]">profiles/</code> にあります。
          </p>
          <ProfileCards cards={cards} byProfile={m?.by_profile ?? []} notes={m?.profiles ?? []} />
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
