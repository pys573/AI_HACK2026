# demo/ — 実測データ（モックではない）

このディレクトリの JSON と PNG は、**実際に新宿区の公開サイトに対して実行した記録**である。
手で書き換えたものは一つもない。

| ファイル | 実行 ID | 結果 |
|---|---|---|
| `control.json` | `shinjuku-tennyu__control__v0__1786292690911` | 到達 ○ / 5 クリック / 121 秒 |
| `senior-70s.json` | `shinjuku-tennyu__senior-70s__v0__1786292322408` | 到達 × / 15 クリック / 354 秒 |

- 実行日: 2026-08-10
- ミッション: `shinjuku-tennyu`（来月引っ越すので、転入手続きと当日の持ち物を知りたい）
- 対象: https://www.city.shinjuku.lg.jp/ （公開 www のみ・読み取り専用）
- スクリーンショットは各ステップで実際にブラウザが表示していた画面である

再現方法:

```bash
npm run run -- shinjuku-tennyu control
npm run run -- shinjuku-tennyu senior-70s
```

`agent/runs/<run_id>/trace.json` が生成される。ここに置いてあるのはそれをコピーしただけである。

> モックデータを使う場合は、必ずそのファイルに「モックである」と書くこと（絶対規則 3）。
> このディレクトリにモックは無い。
