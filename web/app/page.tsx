import Image from "next/image";
import { Page } from "@/components/Chrome";
import { loadMatrix } from "@/lib/matrix";
import { loadProfileCards } from "@/lib/profiles";
import { ProfileCards } from "@/components/ProfileCards";

/**
 * ランディング。
 *
 * ★ 화면에 숫자를 손으로 쓰지 않는다. 전부 matrix.json에서 온다 —
 *   실행을 다시 돌리면 이 페이지도 같이 바뀐다. 어긋날 수 없는 구조가 방어선이다.
 *   데이터가 없으면 숫자 자리를 아예 안 그린다. 「—」로 채우면 0으로 읽힌다.
 *
 * 디자인(website design/landingpage.png)의 배치·색·흐름은 그대로 두고,
 * **문구와 숫자만** 실제로 말할 수 있는 것으로 바꿨다:
 *   「AIユーザーテスター」→ 制約プロファイル   (재현 주장을 안 한다)
 *   「実在のペルソナ視点で検証」→ 明示された制約スペックの下で
 *   「ペルソナ条件を再現」→ 見えるものを実際に減らす
 *   「監査したいサイト」→ 試したいサイト        (감사 프레임을 안 쓴다)
 *   인물 사진 → 제약 사양 그 자체              (사진은 그 자체로 「재현했다」가 된다)
 *
 * 랜딩은 **컨셉과 홍보**의 자리다. 숫자를 늘어놓는 곳이 아니다.
 * 첫 화면에는 한 사이트의 한 문장만 두고, 나머지 계측은 /report로 보낸다.
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
  const taskJa = hero?.task_ja ?? m?.sites[0]?.task_ja ?? "";

  return (
    <Page>
      {/* ── ヒーロー ─────────────────────────────────────── */}
      <section className="brand-wash border-b border-line">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-16 sm:py-24 lg:grid-cols-2 lg:items-center">
          <div>
            {m && tried > 0 ? (
              <h1 className="font-bold leading-[1.4] tracking-tight">
                {/* ★ 用事の名前も回数も手で書かない。matrix.json から出す —
                    別の用事を回した日にここだけ古いまま残ると、それは嘘になる。
                    1行目だけ小さいのは、長くて折れても数字の2行が崩れないようにするため */}
                {/* 1行目だけ小さいのは、用事の名前が長いからだ。数字の2行と同じ大きさにすると
                    「を」だけ次の行に落ちて、下の数字の対比まで読みにくくなる */}
                <span className="block text-balance text-[1.3rem] leading-snug sm:text-[1.5rem] lg:text-[1.3rem] xl:text-[1.5rem]">
                  {where}「{taskJa}」を
                </span>
                <span className="block text-[1.7rem] sm:text-[2.35rem] lg:text-[1.85rem] xl:text-[2.35rem]">
                  <span className="tnum text-brand">{tried}</span> 回、試させた。
                </span>
                <span className="block text-[1.7rem] sm:text-[2.35rem] lg:text-[1.85rem] xl:text-[2.35rem]">
                  <span className="tnum text-blocked">{stuck}</span> 回、たどり着けなかった。
                </span>
              </h1>
            ) : (
              <h1 className="text-3xl font-bold leading-[1.35] tracking-tight sm:text-[2.6rem]">
                どこでツマヅくか、
                <br />
                10人が先に試す。
              </h1>
            )}

            {/* ★ 「特定ユーザーを再現するAI」とは書かない。
                それは検証できない主張で、発表禁止語そのものだ (CLAUDE.md 表現の線)。
                言えるのは「明示された制約の下で動いた」までである */}
            <p className="mt-6 text-lg font-medium leading-relaxed sm:text-xl">
              明示された制約の下で動くAIが
              <br />
              ウェブサイトの「つまずき」を見つけ、
              <br />
              改善策まで提案する
            </p>
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
            さまざまな制約の下で試します
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center leading-relaxed text-fg-muted">
            人物を演じさせているのではありません。カードに書いてあるのが
            <strong className="text-fg">実際に適用した設定そのもの</strong>で、
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
              いまはデモ期間のため、この 5 サイトの実行結果を公開しています。
            </p>
          </div>

          {/* ★ 입력창을 놓지 않는다. 지금 URL을 받아도 그 자리에서 돌릴 수 없다.
              누를 수 있는데 아무 일도 안 일어나는 화면은 페이크다 (절대규칙 3). */}
          <div className="rounded-2xl bg-white p-6 shadow-2xl">
            <p className="text-center text-sm font-bold">実際に試した 5 サイト</p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {(m?.sites ?? []).map((s) => (
                <li key={s.mission_id}>
                  <a
                    href={s.start_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5 text-sm transition hover:border-brand"
                  >
                    <span className="font-medium">{s.site_name}</span>
                    <span className="tnum text-xs text-fg-dim">
                      {s.dropout_rate !== null ? `離脱 ${Math.round(s.dropout_rate * 100)}%` : ""}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-center text-xs text-fg-dim">
              読み取り専用です。フォーム送信・ログイン・電子申請には一切入りません。
            </p>
          </div>
        </div>
      </section>
    </Page>
  );
}
