"use client";

import { useState } from "react";

/**
 * URL 입력창 — 목업에 있던 것을 되돌렸다 (2026-08-12).
 *
 * ★ 한때 이 입력창을 통째로 뺐다. 「URL을 받아도 그 자리에서 못 돌리니 페이크다」가 이유였다.
 *   절반만 맞았다. 페이크는 **아무 일도 안 일어나는 버튼**이지, 입력창 자체가 아니다.
 *   그래서 입력창은 되살리되, **실제로 일어나는 일**을 붙였다 —
 *   눌리면 GitHub 이슈가 내용까지 채워진 상태로 새 탭에 열린다.
 *   즉 이 버튼은 「신청을 접수한다」를 진짜로 한다. 접수처가 이슈 트래커일 뿐이다.
 *   (절대규칙 3 — 화면에 나오는 것은 실제로 동작해야 한다)
 *
 * ★ 그 자리에서 돌지 **않는다는 사실도 화면에 쓴다.** 1회 5분 걸리는 실행이라
 *   「今すぐ結果が出る」처럼 보이게 두면 그건 눌러본 사람이 바로 아는 거짓말이 된다.
 */

const REPO = "https://github.com/pys573/AI_HACK2026";

export function RequestForm() {
  const [url, setUrl] = useState("");

  // 이슈 본문을 미리 채운다. 받는 쪽이 되묻지 않아도 되게 최소 항목만 넣는다
  const href =
    `${REPO}/issues/new?labels=request` +
    `&title=${encodeURIComponent(`試したいサイト: ${url}`)}` +
    `&body=${encodeURIComponent(
      [
        `- 対象URL: ${url}`,
        "- 用事（例: 転入届の持ち物を調べたい）: ",
        "- 試したいプロファイル: 高齢者 / 外国人住民 / デジタル初心者 / 時間がない人",
        "",
        "※ 公開されているページのみ・読み取り専用で実行します。",
        "　 ログイン・フォーム送信・電子申請には入りません。",
      ].join("\n"),
    )}`;

  const ready = url.trim().length > 0;

  return (
    <div className="rounded-2xl bg-white p-6 shadow-2xl">
      <label htmlFor="site-url" className="block text-sm font-bold">
        試したいサイトのURL
      </label>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          id="site-url"
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.city.example.lg.jp/"
          className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2.5 text-sm outline-none placeholder:text-fg-dim focus:border-brand"
        />
        <a
          href={ready ? href : undefined}
          target="_blank"
          rel="noreferrer noopener"
          aria-disabled={!ready}
          className={`shrink-0 rounded-lg px-5 py-2.5 text-center text-sm font-bold text-white transition ${
            ready
              ? "bg-brand hover:opacity-90"
              : "pointer-events-none bg-fg-dim/40"
          }`}
        >
          依頼する
        </a>
      </div>

      {/* ★ 이 자리에서 즉시 돌지 않는다는 것을 먼저 쓴다. 1回あたり数分かかる実行である */}
      <p className="mt-3 text-xs leading-relaxed text-fg-dim">
        押すとGitHubの受付フォームが開きます（その場では実行しません。1回の実行に数分かかるためです）。
        読み取り専用で、ログイン・フォーム送信・電子申請には入りません。
      </p>
    </div>
  );
}
