import Link from "next/link";
import type { ReactNode } from "react";

/**
 * 모든 화면의 머리와 발.
 *
 * ★ 로그인 자리는 비워 둔다. 디자인에는 계정 아이콘이 있지만 로그인은 구현하지 않았다.
 *   누를 수 있는데 아무 일도 안 일어나면 그건 페이크다 (절대규칙 3).
 */
export function Header({ back }: { back?: { href: string; label: string } }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          {/* 표식 = 「평평하게 가다가 한 단 떨어지고, 거기서 멈춘다」. 제품 이름 그대로다 */}
          <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden>
            <path
              d="M2 8h8v8h8"
              fill="none"
              stroke="var(--color-brand)"
              strokeWidth="2.4"
              strokeLinecap="square"
            />
            <circle cx="18" cy="16" r="3" fill="var(--color-stumble)" />
          </svg>
          <span className="text-sm font-bold tracking-tight">
            ツマヅキ <span className="font-medium text-fg-dim">/ AI HACK 2026</span>
          </span>
        </Link>
        <div className="flex items-center gap-5">
          {back && (
            <Link href={back.href} className="text-sm font-medium text-brand hover:underline">
              {back.label}
            </Link>
          )}
          {/* ★ 심사위원은 자기가 아는 URL을 넣어보고 싶어 한다. 그 문이 어느 화면에서도
              한 번에 보여야 한다. 안 보이면 「미리 준비한 것만 되는 도구」로 읽힌다 */}
          <Link
            href="/request"
            className="rounded-full bg-brand px-4 py-1.5 text-sm font-bold text-white transition hover:opacity-90"
          >
            試してみる
          </Link>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span className="text-sm font-bold">ツマヅキ / AI HACK 2026</span>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-fg-muted">
            <Link href="/report" className="hover:text-fg">結果</Link>
            <Link href="/report/detail" className="hover:text-fg">全データ</Link>
            <Link href="/replay" className="hover:text-fg">リプレイ</Link>
            <Link href="/report/detail#honesty" className="hover:text-fg">この数値の限界</Link>
            <a
              href="https://github.com/pys573/AI_HACK2026"
              className="hover:text-fg"
              target="_blank"
              rel="noreferrer noopener"
            >
              GitHub
            </a>
          </nav>
        </div>
        {/* CC BY 4.0은 표시 의무가 있다. 발에 고정으로 둔다 */}
        <p className="mt-6 text-xs leading-relaxed text-fg-dim">
          語彙データ：国立国語研究所「外来語」言い換え提案 定着度調査（2002–2004, CC BY 4.0）/
          出入国在留管理庁・文化庁『やさしい日本語 書き換え例』（2020）。
          いずれも当時の調査であり、現在の利用者と一致しません。
        </p>
      </div>
    </footer>
  );
}

export function Page({ children, back }: { children: ReactNode; back?: { href: string; label: string } }) {
  return (
    <>
      <Header back={back} />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
