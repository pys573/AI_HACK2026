# web — ツマヅキ のデモ画面

実行トレースを読み込んで、制約プロファイルごとの探索結果を並べて表示します。

> ⚠️ **この画面は仮のものです。** デザイン確定後に差し替えます。
> 差し替えても残すべきなのは、以下の並び順です:
> Hero → 急所（同じページに立っていた瞬間）→ 再生 → 観測 → 判定 → 原価 → 限界。

## 起動

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
```

Node 25 / Next.js 16 / React 19 / Tailwind CSS v4。

## データ

画面の数値・スクリーンショット・AIの発言は、すべて `public/demo/` に置いた
**実際の実行記録**です。モックではありません。出典と再現手順は
[`public/demo/README.md`](./public/demo/README.md) にあります。

| ファイル | 中身 |
|---|---|
| `public/demo/control.json` | 対照群（制約なし）の実行トレース |
| `public/demo/senior-70s.json` | 高齢者制約プロファイルの実行トレース |
| `public/demo/shots/<profile>/step-NN.png` | 各ステップの実行時スクリーンショット |

`lib/data.ts` はトレースを画面用に間引くだけで、**数値を作りません**。
表示される値はすべて `trace.json` に同じ値が存在します。

## 構成

```
app/page.tsx        セクションの並び順。ここが構成の全部
lib/data.ts         RunTrace → RunView への射影（サーバー専用）
components/
  Hero.tsx          見出しと結果の数字
  Moment.tsx        ★ 2実行が同じURLに立っていた瞬間の対比
  SplitReplay.tsx   ★ 2実行のステップ同期再生
  BeforeAfter.tsx   ページにあったもの / AIに届いたもの
  Verdict.tsx       到達判定（事前の鍵 + AI審判）
  CostPanel.tsx     実測原価と出典
  Honesty.tsx       主張すること / 主張しないこと
  ui.tsx            Section / Stat / Badge / MaskedText
```

`Moment.tsx` が参照する「2実行が共通で踏んだページ」は `lib/data.ts` の
`findMoment()` がトレースから探します。ミッションを変えても成立します。
