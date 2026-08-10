import type { RunView } from "@/lib/data";
import { Badge } from "./ui";

/**
 * 한계를 **먼저** 말한다. 감추면 質疑에서 무너진다 (CLAUDE.md「표현의 선」).
 *
 * ⚠️ profiles/*.json 의 claims / does_not_claim 는 아직 한국어 필드가 섞여 있다.
 *    일본어인 senior-70s.claims 만 그대로 인용하고, 나머지는 여기서 일본어로 쓴다.
 *    E(profiles 소유)가 ja 필드를 넣어주면 그대로 갈아끼운다.
 */
export function Honesty({ control, senior }: { control: RunView; senior: RunView }) {
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
            <strong className="text-fg">忍耐の予算は同じではありません。</strong>
            対照群は {control.patience.clicks} クリック /{" "}
            {control.patience.seconds} 秒、制約側は {senior.patience.clicks} クリック /{" "}
            {senior.patience.seconds} 秒。
            「制約のせいで失敗した」と「予算が短くて失敗した」を分けるには、
            予算をそろえた実行が別に要ります。
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
