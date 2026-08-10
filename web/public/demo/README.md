# demo/ — 実測データ（モックではない）

このディレクトリの JSON と PNG は、**実際に新宿区の公開サイトに対して実行した記録**である。
手で書き換えたものは一つもない。

| ファイル | 実行 ID | 結果 |
|---|---|---|
| `control.json` | `shinjuku-tennyu__control__v0__1786292690911` | 到達 ○ / 5 クリック / 121 秒 |
| `senior-70s.json` | `shinjuku-tennyu__senior-70s__v0__1786292322408` | 到達 × / 15 クリック / 354 秒 |
| `senior-70s-patient.json` | `shinjuku-tennyu__senior-70s-patient__v0__1786370501903` | 到達 × / 30 クリック / 705 秒 |

- 実行日: 2026-08-10
- ミッション: `shinjuku-tennyu`（来月引っ越すので、転入手続きと当日の持ち物を知りたい）
- 対象: https://www.city.shinjuku.lg.jp/ （公開 www のみ・読み取り専用）
- スクリーンショットは各ステップで実際にブラウザが表示していた画面である

## `senior-70s-patient.json` について

「制約のせいで失敗した」と「予算が短くて失敗したのでは」を分けるための実行である。
`senior-70s` との違いは **忍耐予算だけ**で、それを対照群と同じ 30 クリック / 900 秒にそろえてある。
表示倍率・ページ内検索の不可・語のマスクは `senior-70s` と同一。

結果は `gave_up_clicks` — つまり **30 クリックを使い切って**到達しなかった。
手数の上限（この実行では 40）に先に当たったのではない。

正直に書いておくこと:

- 34 手のうち **1 手**は、AIの応答が形式を満たさずこちらが操作に変換できなかった。
  サイトのせいではなくツール側のノイズである。除外せず数に入れてある。
- この実行のスクリーンショットはここに置いていない。画面の再生に使うのは `senior-70s` の方である。
- n=1 である。

再現方法:

```bash
npm run run -- shinjuku-tennyu control
npm run run -- shinjuku-tennyu senior-70s
MAX_STEPS=40 npm run run -- shinjuku-tennyu senior-70s-patient
```

> ⚠️ `senior-70s-patient.json` プロファイルは `profiles/` にある。
> 無い場合は E（`feat/lexicon`）が追加するまで最後の1行は実行できない。

`agent/runs/<run_id>/trace.json` が生成される。ここに置いてあるのはそれをコピーしただけである。

> モックデータを使う場合は、必ずそのファイルに「モックである」と書くこと（絶対規則 3）。
> このディレクトリにモックは無い。
