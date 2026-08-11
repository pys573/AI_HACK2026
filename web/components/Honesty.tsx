import type { MatchedView, RunView } from "@/lib/data";
import { Badge } from "./ui";

/**
 * 한계를 **먼저** 말한다. 감추면 質疑에서 무너진다 (CLAUDE.md「표현의 선」).
 *
 * ⚠️ profiles/*.json 의 claims / does_not_claim 는 아직 한국어 필드가 섞여 있다.
 *    일본어인 senior-70s.claims 만 그대로 인용하고, 나머지는 여기서 일본어로 쓴다.
 *    E(profiles 소유)가 ja 필드를 넣어주면 그대로 갈아끼운다.
 */
export function Honesty({
  control,
  senior,
  matched,
}: {
  control: RunView;
  senior: RunView;
  matched: MatchedView;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* 主張すること */}
      <div className="rounded-xl border border-clear/30 bg-surface p-5">
        <Badge tone="clear">主張すること</Badge>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-fg-muted">
          <li>
            <strong className="text-fg">宣言した制約の下で、実際にタスクが失敗した</strong>
            という記録です。制約の中身は
            <code className="mx-1 font-mono text-xs">
              {senior.profileId}.json v{senior.profileVersion}
            </code>
            に全部書いてあり、同じファイルで誰でも再現できます。
          </li>
          {/* ★ 이 항목은 원래 「主張しないこと」에 있었다. 실험을 돌려서 옮겨왔다 */}
          {matched && !matched.reached && (
            <li>
              <strong className="text-fg">
                「予算が短かったから失敗した」のではありません。
              </strong>
              忍耐の予算だけを対照群とそろえた実行（
              <code className="mx-1 font-mono text-xs">
                {matched.profileId} v{matched.profileVersion}
              </code>
              ）を別に行いました。
              <span className="mt-1.5 block rounded-lg border border-line bg-surface-2 p-3 text-xs leading-relaxed">
                対照群と同じ {matched.clicks} クリックを
                <strong className="text-fg">1回も残さず使い切って</strong>、
                {matched.seconds} 秒かけても届きませんでした（{matched.steps} 手／上限
                {matched.maxSteps} 手）。
                <br />
                対照群は同じ予算のうち {control.clicks} クリック・{control.seconds} 秒で
                <strong className="text-clear">終わっています</strong>。
              </span>
            </li>
          )}
          <li>
            隠した語には必ず根拠の数字と出典が付きます。
            <span className="mt-1 block text-xs text-fg-dim">{senior.claimsJa}</span>
          </li>
          <li>
            <strong className="text-fg">主観を同一基準の計測に変えます。</strong>
            「なんとなく使いにくい」ではなく、
            「この条件では{control.clicks}クリックで終わり、この条件では{senior.clicks}
            クリック使って届かなかった」と言えます。
          </li>
        </ul>
      </div>

      {/* 主張しないこと */}
      <div className="rounded-xl border border-blocked/30 bg-surface p-5">
        <Badge tone="blocked">主張しないこと</Badge>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-fg-muted">
          <li>
            <strong className="text-fg">「70代の人を再現した」とは言いません。</strong>
            根拠にした国立国語研究所の調査は 2002〜2004 年の実施で、
            当時の60歳以上コホートを反映します。今の70代とは一致しません。
          </li>
          <li>
            <strong className="text-fg">この数字が母集団を代表するとも言いません。</strong>
            ここにあるのは各プロファイル 1 実行（n=1）です。
            実行ごとに迷い方は変わります。
          </li>
          <li>
            <strong className="text-fg">この2実行だけで比べると予算が違います。</strong>
            左の対照群は {control.patience.clicks} クリック / {control.patience.seconds} 秒、
            制約側は {senior.patience.clicks} クリック / {senior.patience.seconds} 秒です。
            予算をそろえた実行は別に行っていますが（左の項目）、
            <strong className="text-fg">この画面の再生とスクリーンショットはそろえる前のもの</strong>
            です。
          </li>
          {matched && matched.discardedSteps > 0 && (
            <li>
              <strong className="text-fg">こちら側の取りこぼしもゼロではありません。</strong>
              予算をそろえた実行の {matched.steps} 手のうち {matched.discardedSteps} 手は、
              AIの応答が形式を満たさず、こちらが操作に変換できませんでした。
              サイトのせいではなくツールのノイズです。数に入れたまま公開しています。
            </li>
          )}
          {/*
            ★ 「制約のせい」と「モデルのせい」를 아직 분리하지 못했다.
            OrcaRouter가 난이도에 따라 모델을 고르는데, 제약이 바꾸는 게 바로 그 난이도다.
            즉 라우터를 쓰는 한 자동으로 따라오는 교락(交絡)이다. 우리가 먼저 말한다.
          */}
          <li>
            <strong className="text-fg">2つの実行でモデルをそろえていません。</strong>
            対照群は {Object.keys(control.byModel).length} 種類（
            {Object.keys(control.byModel).join("・")}）だけで終わり、制約側は{" "}
            {Object.keys(senior.byModel).length} 種類（{Object.keys(senior.byModel).join("・")}
            ）に振り分けられました。
            <span className="mt-1.5 block rounded-lg border border-line bg-surface-2 p-3 text-xs leading-relaxed">
              モデルは固定していません。OrcaRouter
              が判断の難しさに応じて選ぶからです。そして制約が変えているのは、まさにその
              <strong className="text-fg">難しさ</strong>です。
              つまり「制約のせいで失敗した」の中に
              <strong className="text-fg">「モデルが違ったせい」が混ざっている可能性</strong>
              を、この2実行では否定できません。
              <br />
              分け方は分かっています —{" "}
              <code className="font-mono">force_model</code> で固定して回せば分離できます。
              <strong className="text-blocked">まだやっていません。</strong>
            </span>
          </li>
          <li>
            <strong className="text-fg">
              「このモデルが読めなかった」以上のことは言えません。
            </strong>
            別のモデルなら同じ制約でも届くかもしれません。だから私たちが出すのは絶対値ではなく、
            <strong className="text-fg">規格を固定したときのサイト同士の差</strong>です。
            燃費表示と同じで、値は試験条件で動きますが、条件を公開して固定してあるかぎり
            比較は成り立ちます。どのモデルが使われたかは記録に残っています —
            残っていない呼び出しがあることも含めて、原価の節に書いてあります。
          </li>
          <li>
            <strong className="text-fg">サイトの品質評価ではありません。</strong>
            アクセシビリティの合否判定でも、監査でもありません。
            「どの条件の人が、どこで止まったか」だけを出します。
          </li>
        </ul>
      </div>

      {/* 手口。これを隠すと「演技させただけ」と同じに見える */}
      <div className="rounded-xl border border-line bg-surface p-5 lg:col-span-2">
        <div className="text-sm font-medium">なぜ「演技」ではないと言えるのか</div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Step
            n="1"
            title="判断のプロンプトは1種類だけ"
            body="どのプロファイルでも、AIに渡す指示文は同一の定数です。年齢・属性・「〜のふりをして」は一文字も入りません。プロファイルごとに分岐しません。"
          />
          <Step
            n="2"
            title="変えるのは道具と、届く情報"
            body="画面の外にあるものを渡さない。使えない道具を渡さない。理解率の低い語を伏せる。AIに届く前の観測そのものを削ります。"
          />
          <Step
            n="3"
            title="だから「できない」が本物になる"
            body="プロンプトは能力を足すことしかできません。「見えないふりをして」と頼めば演技になり、演技は漏れます。最初から渡さなければ、漏れようがありません。"
          />
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-line-soft bg-surface-2 p-4">
      <div className="tnum text-xs font-bold text-stumble">{n}</div>
      <div className="mt-1.5 text-sm font-medium">{title}</div>
      <p className="mt-2 text-xs leading-relaxed text-fg-muted">{body}</p>
    </div>
  );
}
