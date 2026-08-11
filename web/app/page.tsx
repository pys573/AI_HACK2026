import { loadDemo } from "@/lib/data";
import { Section } from "@/components/ui";
import { Hero } from "@/components/Hero";
import { Moment } from "@/components/Moment";
import { SplitReplay } from "@/components/SplitReplay";
import { BeforeAfter } from "@/components/BeforeAfter";
import { Verdict } from "@/components/Verdict";
import { CostPanel } from "@/components/CostPanel";
import { Honesty } from "@/components/Honesty";
import { N3Case } from "@/components/N3Case";

/**
 * ⚠️ 이 페이지는 **가디자인**이다. 디자이너 작업이 끝나면 통째로 교체한다.
 *    교체해도 살아남아야 하는 것은 아래 순서다:
 *      Hero → 급소(Moment) → 재생 → 관측 → 두 번째 벽(N3) → 판정 → 원가 → 한계
 *    심사 ③은 「触れて数十秒で価値がわかる」다. 설명보다 사건을 먼저 보여준다.
 *
 * 데이터 출처가 두 곳이고 **성격이 다르다.** 섞으면 어느 쪽이 실측인지 알 수 없게 된다:
 *   - public/demo/*.json      실제 실행 결과 (public/demo/README.md)
 *   - core/fixtures/sample-run-n3.json  관측·마스킹은 실측, 진행·발화는 만든 값
 */
export default function Page() {
  const { control, senior, n3, matched, moment, mission } = loadDemo();

  return (
    <main className="min-h-dvh">
      <Hero control={control} senior={senior} mission={mission} />

      <Section
        id="moment"
        eyebrow="the moment"
        title="2人とも、同じページに立っていました。"
        lead={
          <>
            片方はそこで終わり、もう片方はそこから
            {moment?.seniorClicksAfter ?? senior.clicks}
            クリック迷って、二度と戻れませんでした。
            違いは1つだけです — <strong className="text-fg">画面に何が入ったか</strong>。
          </>
        }
      >
        <Moment moment={moment} control={control} senior={senior} />
      </Section>

      <Section
        id="replay"
        eyebrow="replay"
        title="2人の探索を、はじめから並べて見る"
        lead={
          <>
            同じサイト、同じ用事、同じ判断プロンプト。
            実行時のスクリーンショットと、AIがその場で書いた理由をそのまま再生します。
            ステップをそろえて並べているので、右がまだ迷っている間に左は終わります。
          </>
        }
      >
        <SplitReplay control={control} senior={senior} />
      </Section>

      <Section
        id="beforeafter"
        eyebrow="observation"
        title="AIに、何が届いていたのか"
        lead={
          <>
            ここが製品の中身です。「見えないふりをして」と頼むのではなく、
            <strong className="text-fg">見えないものを渡さない</strong>。
            ページにあった操作要素と、実際にAIへ渡した選択肢を、同じ瞬間で並べます。
          </>
        }
      >
        <BeforeAfter run={senior} />
      </Section>

      {/* ★ 근거의 종류가 바뀌면 화면에 쓸 수 있는 말도 바뀐다.
          이해율 조사에는 %가 있고, 지정 명단에는 없다. 없는 쪽에 %를 붙이지 않는 것이
          이 섹션의 존재 이유이자, 質疑에서 무너지지 않는 이유다 (절대규칙 4). */}
      {n3 && (
        <Section
          id="n3"
          eyebrow="another wall"
          title="カタカナだけが壁ではありません"
          lead={
            <>
              役所のサイトで実際に人を止めているのは「ダウンロード」より
              <strong className="text-fg">「転入届」</strong>の側です。
              そこで、行政自身が「書き換えなさい」と指定した語を伏せて、もう1回歩かせました。
              根拠が変わると、<strong className="text-fg">言えることも変わります</strong>。
            </>
          }
        >
          <N3Case run={n3} />
        </Section>
      )}

      <Section
        id="verdict"
        eyebrow="verdict"
        title="「たどり着いた」は誰が決めたのか"
        lead={
          <>
            事前に用意した正解ページとの一致と、AI審判の判定。
            2つを別々に走らせ、割れたときは割れたと表示します。
          </>
        }
      >
        <Verdict runs={[control, senior]} goalJa={mission.goalJa} />
      </Section>

      <Section
        id="cost"
        eyebrow="cost"
        title="1回いくらかかったのか"
        lead={
          <>
            10プロファイル × 数サイトを毎晩回して成立する原価かどうか。
            推計ではなく、APIが返した実費を1呼び出しずつ保存しています。
          </>
        }
      >
        <CostPanel runs={[control, senior]} />
      </Section>

      <Section
        id="honest"
        eyebrow="limits"
        title="先に、言っておくこと"
        lead={
          <>
            この種のものは、盛った瞬間に価値がゼロになります。
            できないことを先に置きます。
          </>
        }
      >
        <Honesty control={control} senior={senior} matched={matched} />
      </Section>

      <footer className="border-t border-line-soft">
        <div className="mx-auto w-full max-w-6xl px-6 py-10 text-xs leading-relaxed text-fg-dim">
          <div className="font-medium text-fg-muted">ツマヅキ / Tsumazuki</div>
          <p className="mt-2 max-w-3xl">
            このページの数値・スクリーンショット・AIの発言は、すべて
            {mission.siteName}に対する実際の実行記録です。作り込んだ画面ではありません。
            生の記録は <code className="font-mono">web/public/demo/</code> にあります。
            {n3 && (
              <>
                {" "}
                ただし「{n3.labelJa}」の節だけは実測の範囲が違います —
                その節の中に何が実測で何が作った値かを書いてあります。
              </>
            )}
          </p>
          <p className="mt-2">
            語彙データ: 国立国語研究所「外来語定着度調査」（CC BY 4.0）
            {n3?.lexiconSourceJa && <> ／ {n3.lexiconSourceJa}</>}
          </p>
          <p className="mt-4 text-fg-dim/70">
            画面は仮のものです。デザイン確定後に差し替えます。
          </p>
        </div>
      </footer>
    </main>
  );
}
