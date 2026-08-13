import Image from "next/image";
import { Page } from "@/components/Chrome";
import { loadMatrix } from "@/lib/matrix";
import { loadProfileCards } from "@/lib/profiles";
import { Personas } from "@/components/Personas";
import { RequestForm } from "@/components/RequestForm";
import { ArtReduce, ArtCompare, ArtRewrite } from "@/components/StepArt";

/**
 * ランディング。
 *
 * ★ 2026-08-12. **이 화면에는 계측 숫자를 두지 않는다.**
 *   원래는 히어로에 matrix.json에서 뽑은 「◯人に試させた / ◯人がたどり着けなかった」가
 *   있었고, 프로필 카드마다 제약 사양·실측·출처가 붙어 있었다. 전부 뺐다.
 *   숫자가 먼저 읽히면 **무슨 물건인지가 나중에 읽힌다.** 랜딩에서 그건 손해다
 *   (③完成度・デモ의 채점 관점이 「触れて数十秒で価値がわかる」이다).
 *
 *   그래서 역할을 3단으로 나눴다 —
 *   · **여기(/)**            : 무엇을 하는 물건인지. 사람 4명, 세 줄 카피, URL 접수
 *   · **`/report`**          : 결과를 20초에. 큰 숫자 3개 + 그래프 2개뿐
 *   · **`/report/detail`**   : 전부. 제약 사양·전 실행 표·원가·보안·한계 고지
 *   랜딩에서 결과로 가는 길은 **머리/발의 「結果」 링크**다. 절 안에는 링크를 두지 않는다
 *   — 여기서 링크를 밟게 하면 아직 무슨 물건인지 모르는 채로 숫자 화면에 떨어진다.
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
      {/* overflow-hidden — 아래 이미지의 lg:scale-[1.12]가 1024px에서 화면 밖으로 4px 삐져나가
          가로 스크롤바가 생긴다. 데모를 띄우는 노트북 폭이 딱 여기다 */}
      <section className="brand-wash overflow-hidden border-b border-line">
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
              改善策まで提案する。
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
            多様なタイプのユーザーの視点から試す。
          </h2>
          {/* ★ 이 두 줄이 제품의 정의다. 카테고리(「ユーザーの視点」)를 크게 말한 바로 밑에서
              **그 시점을 어떻게 만드는가**를 못 박는다 — 연기가 아니라 접근 제한이다.
              같은 화면 안에 있어야 위의 h2가 「연기하는 AI」로 읽히지 않는다.
              주어를 제품명으로 둔다 — 「AIは演じない」가 아니라 「ツマヅキが演じさせない」다.
              일반론이 아니라 **우리가 한 설계 선택**이라는 게 여기서 갈린다 */}
          <p className="mx-auto mt-4 max-w-xl text-center text-sm leading-relaxed text-fg-muted sm:text-base">
            ツマヅキはAIにペルソナを演じさせない。
            <br />
            情報のアクセスを実際に制約してテストする。
          </p>
          <Personas cards={cards} />
        </div>
      </section>

      {/* ── できること ───────────────────────────────────── */}
      <section className="border-b border-line">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            ツマヅキがすること
          </h2>
          {/* ★ 2026-08-12. 가운데를 「記録する」에서 「比べる」로 바꿨다.
              앞뒤만 있으면 세 장을 다 읽고 나오는 질문이 「わざと見えなくして、
              できないと言っているだけでは」다. 우리는 그 답을 이미 갖고 있는데
              (制約なしは全部到達する) 랜딩에 없었다. 記録は3枚目に畳んだ。
              ⚠️ 여기에 実測値는 쓰지 않는다 — 랜딩은 「무엇인가」의 자리다 (CLAUDE.md).
              대조군 도달률도 사이트별 이탈률도 /report에 있다 */}
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              {
                t: "見えるものを実際に減らす",
                d: "調査に基づいて語を伏せる。画面を拡大する。検索を使わせない。プロファイルごとに削るものが違います。「そのつもりで動いて」と頼むのではなく、渡すデータ自体を削ります。",
                art: <ArtReduce />,
              },
              {
                t: "制約なしと並べて走らせる",
                d: "同じ用事を、制約ありとなしで走らせます。制約なしなら最後まで行けたのに、削ったとたん止まった — その差が出た場所だけを、ツマヅキとして数えます。",
                art: <ArtCompare />,
              },
              {
                t: "止まった1手を、直す文にする",
                d: "クリック・ページ遷移・滞在時間・その場の理由を1手ずつ残し、何が止めたのかと、どう書きかえるのかを対にして出します。根拠の数字が必ず付きます。",
                art: <ArtRewrite />,
              },
            ].map((s) => (
              <li key={s.t} className="card flex flex-col items-center px-7 py-10 text-center">
                {/* 원형 판 — 그림이 카드 위에서 떠 보이지 않게 받침을 깐다 */}
                <div className="grid size-36 shrink-0 place-items-center rounded-full bg-[#eaf0fc] ring-1 ring-line">
                  {s.art}
                </div>
                <h3 className="mt-7 text-lg font-bold leading-snug">{s.t}</h3>
                <p className="mt-3 text-sm leading-relaxed text-fg-muted">{s.d}</p>
              </li>
            ))}
          </ol>

          {/* ★ 2026-08-12. 「大規模に」를 뺐다. 105회는 大規模가 아니다 —
              말할 수 있는 것보다 크게 말한 자리였다. 우리가 실제로 하는 것은
              **같은 기준으로 몇 번이고 재고, 보이게 하는 것**이다 (절대규칙 4). */}
          {/* ★ 끊는 위치를 폭마다 바꾼다. 글자를 줄여서 맞추면 「3포인트 크게」가 무너지므로,
              크기는 고정하고 **줄 수**로 맞춘다. 그대로 두면 「使いにくさ」/ を、처럼
              조사만 다음 줄로 떨어진다 — 히어로 h1과 같은 문제다.
                폰(<640)      5줄 — 한 줄에 최대 9자
                태블릿(<1024) 4줄 — 27px로 커지므로 긴 줄은 여전히 못 넣는다
                데스크톱      2줄 — 여기서만 문장이 통째로 들어간다 */}
          <p className="mx-auto mt-12 max-w-4xl text-center text-[23px] font-bold leading-relaxed tracking-tight sm:text-[27px]">
            主観的だった
            <br className="sm:hidden" />
            「使いにくさ」を、
            <br />
            同じ基準で何度も
            <br className="lg:hidden" />
            測定・可視化して、
            <br className="lg:hidden" />
            日本の<span className="text-brand">DX化</span>を加速する。
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
