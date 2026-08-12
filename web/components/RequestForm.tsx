"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * 랜딩의 URL 입력창.
 *
 * ★ 이력 (2026-08-12): 한때 이 버튼은 GitHub 이슈를 열었다. 「그 자리에서 못 돌리니
 *   접수만이라도 진짜로 하자」는 타협이었다. **즉석 실행이 되면서 그 타협은 끝났다.**
 *   지금은 눌리면 조건 선택 화면으로 가고, 거기서 진짜로 돈다.
 *
 * ★ 여기서 바로 실행하지 않고 한 화면 더 거치는 이유: 누구의 시점으로 어떤 用事를
 *   시키는지가 이 제품의 절반이다. URL만 받아서 돌리면 「그냥 사이트 검사」가 되고,
 *   그건 우리가 이길 수 없는 싸움터다 (CLAUDE.md 「그래도 안 쓰는 말」).
 */

export function RequestForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");

  const ready = url.trim().length > 0;
  const go = () => {
    if (!ready) return;
    router.push(`/request?url=${encodeURIComponent(url.trim())}`);
  };

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
          onKeyDown={(e) => e.key === "Enter" && go()}
          placeholder="https://www.city.example.lg.jp/"
          className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2.5 text-sm outline-none placeholder:text-fg-dim focus:border-brand"
        />
        <button
          type="button"
          onClick={go}
          disabled={!ready}
          className="shrink-0 rounded-lg px-5 py-2.5 text-center text-sm font-bold text-white transition enabled:bg-brand enabled:hover:opacity-90 disabled:bg-fg-dim/40"
        >
          依頼する
        </button>
      </div>

      {/* ★ 시간이 걸린다는 것을 **누르기 전에** 쓴다. 누른 뒤에 알리면 그건 속인 것이다 */}
      <p className="mt-3 text-xs leading-relaxed text-fg-dim">
        次の画面で「どんなお客様の視点か」「どんな用事か」を選ぶと、その場で実行します（数分かかります）。
        読み取り専用で、ログイン・フォーム送信・電子申請には入りません。
      </p>
    </div>
  );
}
