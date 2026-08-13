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

/** 출처 링크. CC BY는 링크가 없으면 표시 의무를 채운 게 아니라서 밑줄을 지우지 않는다 */
function Cite({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="underline underline-offset-2 hover:text-fg"
    >
      {children}
    </a>
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
        {/*
          CC BY 4.0은 표시 의무가 있다 — 저작자·원자료 링크·라이선스 링크가 다 있어야 성립한다.
          그래서 발에 고정으로 둔다.

          ★ 2026-08-13. 이전 문구에는 두 가지 문제가 있었다.
            ① 이름이 저장소 안에서 갈렸다. 여기만 「外来語」言い換え提案 定着度調査(구분자 없음)였고
               README·LICENSE·기사는 「外来語」言い換え提案／外来語定着度調査(병기)였다.
               둘은 같은 자료를 가리키지만 — 우리가 인용하는 수치는 定着度調査의 理解率이고,
               言い換え提案은 그 理解率을 쓰는 쪽이다(`vendor/ninjal_readme.txt`) — 표기가 갈리면
               저장소를 grep 한 사람이 서로 다른 자료로 읽는다. 병기형으로 통일한다.
            ② 書き換え例을 「調査」로 묶어 불렀다. 그건 이해율 조사가 아니라 행정이 지정한
               용어 명단이고, 그 사실이 곧 **화면에 %를 안 붙이는 근거**다.
               우리 규율과 정반대되는 말이 발에 걸려 있었던 셈이다.
          링크·라이선스 문자열은 손으로 치지 않는다 — `lexicon/data/*.manifest.json`이 원본이다.
        */}
        <div className="mt-6 flex flex-col gap-1.5 text-xs leading-relaxed text-fg-dim">
          <p>
            語彙データの出典：
            <Cite href="https://mmsrv.ninjal.ac.jp/gairaigo_yoron/">
              国立国語研究所「外来語」言い換え提案／外来語定着度調査
            </Cite>
            （2002年11月〜2004年8月・
            <Cite href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Cite>）／
            <Cite href="https://www.bunka.go.jp/seisaku/kokugo_nihongo/kyoiku/92484001.html">
              出入国在留管理庁・文化庁『やさしい日本語 書き換え例』
            </Cite>
            （2020年8月）。出典：文化庁ウェブサイト（
            <Cite href="https://www.bunka.go.jp/">https://www.bunka.go.jp/</Cite>）
          </p>
          <p>
            前者は当時の調査であり、現在の利用者とは一致しません。
            後者は理解率の調査ではなく、行政が「そのまま使うと伝わらない」と判定して
            書き換えを指定した用語の一覧です——この語に%を出していないのはこのためです。
          </p>
        </div>
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
