import { loadDemo } from "@/lib/data";
import { Section } from "@/components/ui";
import { Hero } from "@/components/Hero";
import { Moment } from "@/components/Moment";
import { SplitReplay } from "@/components/SplitReplay";
import { BeforeAfter } from "@/components/BeforeAfter";
import { Verdict } from "@/components/Verdict";
import { CostPanel } from "@/components/CostPanel";
import { Honesty } from "@/components/Honesty";

/**
 * ⚠️ 이 페이지는 **가디자인**이다. 디자이너 작업이 끝나면 통째로 교체한다.
 *    교체해도 살아남아야 하는 것은 아래 순서다:
 *      Hero → 급소(Moment) → 재생 → 관측 → 판정 → 원가 → 한계
 *    심사 ③은 「触れて数十秒で価値がわかる」다. 설명보다 사건을 먼저 보여준다.
 *
 * 데이터는 전부 public/demo/*.json — 실제 실행 결과다 (public/demo/README.md 참조).
 */
export default function Page() {
  const { control, senior, moment, mission } = loadDemo();

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
        <Honesty control={control} senior={senior} />
      </Section>

      <footer className="border-t border-line-soft">
        <div className="mx-auto w-full max-w-6xl px-6 py-10 text-xs leading-relaxed text-fg-dim">
          <div className="font-medium text-fg-muted">ツマヅキ / Tsumazuki</div>
          <p className="mt-2 max-w-3xl">
            このページの数値・スクリーンショット・AIの発言は、すべて
            {mission.siteName}に対する実際の実行記録です。作り込んだ画面ではありません。
            生の記録は <code className="font-mono">web/public/demo/</code> にあります。
          </p>
          <p className="mt-2">
            語彙データ: 国立国語研究所「外来語定着度調査」（CC BY 4.0）
          </p>
          <p className="mt-4 text-fg-dim/70">
            画面は仮のものです。デザイン確定後に差し替えます。
          </p>
        </div>
      </footer>
    </main>
  );
}
