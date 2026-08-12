"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProfileCard } from "@/lib/profiles";
import type { Task } from "@/lib/tasks";

/**
 * 즉석 실행 접수 화면 — 목업 `website design/mainpage.png` 그대로.
 *
 * ★ 목업의 제목은 「監査したいウェブサイトのURLを入力」이었다. 「監査」는 쓰지 않는다.
 *   이유는 오해가 아니라 **불리한 비교**다 — 감사라고 부르는 순간 예산 항목이 되고
 *   Lighthouse와 같은 줄에 세워진다 (CLAUDE.md 「그래도 안 쓰는 말」).
 *
 * ★ 인물은 사진과 이름으로 크게, **제약 사양은 고른 카드 옆에 그대로** 붙는다.
 *   사진만 있으면 「연기시키는 AI」로 읽히고, 사양만 있으면 무슨 물건인지 늦게 읽힌다.
 *   둘이 같은 화면에 있어야 「연기가 아니라 이 조건으로 돌린다」가 전달된다.
 *
 * ★ 여기서 하는 일은 화면 이동뿐이다. 실제 실행은 `/live`가 `/api/live`를 열면서 시작한다.
 *   그래야 새로고침해도 같은 조건으로 다시 돌릴 수 있고, 주소를 그대로 남길 수 있다.
 */

/** 목업의 배열 순서. 대조군은 사람이 아니므로 맨 끝에 따로 둔다 */
const ORDER = ["senior-70s", "resident-n3", "smartphone-novice", "busy-worker", "control"];

export function LiveForm({
  cards,
  tasks,
  initialUrl = "",
}: {
  cards: ProfileCard[];
  tasks: Task[];
  initialUrl?: string;
}) {
  const router = useRouter();
  const people = ORDER.map((id) => cards.find((c) => c.id === id)).filter(
    (c): c is ProfileCard => Boolean(c),
  );

  const [url, setUrl] = useState(initialUrl);
  const [profile, setProfile] = useState(people[0]?.id ?? "senior-70s");
  const [task, setTask] = useState(tasks[0]?.id ?? "tennyu");
  const [going, setGoing] = useState(false);

  const ready = /^https?:\/\/.+\..+/.test(url.trim());
  const picked = people.find((p) => p.id === profile);

  const start = () => {
    if (!ready || going) return;
    setGoing(true);
    const q = new URLSearchParams({ url: url.trim(), task, profile });
    router.push(`/live?${q}`);
  };

  return (
    <div className="mx-auto w-full max-w-4xl">
      {/* ── 01 URL ─────────────────────────────────────── */}
      <section>
        <h2 className="flex items-baseline gap-3 text-lg font-bold">
          <span className="tnum text-brand">01</span>
          試したいウェブサイトのURLを入力してください
        </h2>
        <input
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && start()}
          placeholder="https://www.city.example.lg.jp/"
          className="mt-4 w-full rounded-xl border border-line bg-surface px-5 py-4 text-base outline-none placeholder:text-fg-dim focus:border-brand"
        />
        <p className="mt-2 text-xs leading-relaxed text-fg-dim">
          公開されているページのみ・読み取り専用で動きます。ログイン・フォーム送信・電子申請には入りません。
          robots.txt で自動アクセスが禁止されているページは実行しません。
        </p>
      </section>

      {/* ── 02 ペルソナ ─────────────────────────────────── */}
      <section className="mt-14">
        <h2 className="flex items-baseline gap-3 text-lg font-bold">
          <span className="tnum text-brand">02</span>
          どんなお客様の視点で試しますか？
        </h2>
        <p className="mt-1 pl-10 text-sm text-fg-muted">
          選んだ条件のぶんだけ、AIに渡すデータを実際に削ります。
        </p>

        <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-5">
          {people.map((p) => {
            const on = p.id === profile;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setProfile(p.id)}
                aria-pressed={on}
                className={`rounded-xl border p-3 text-center transition ${
                  on ? "border-brand bg-[#eef3fd] ring-2 ring-brand/30" : "border-line bg-surface hover:border-brand/50"
                }`}
              >
                {p.photo ? (
                  <Image
                    src={p.photo}
                    alt=""
                    width={280}
                    height={280}
                    className="mx-auto aspect-square w-16 rounded-full object-cover"
                  />
                ) : (
                  // 대조군은 사람이 아니라 기준선이다. 얼굴을 주면 없는 사람을 만든 것이 된다
                  <div className="mx-auto grid aspect-square w-16 place-items-center rounded-full bg-surface-2 text-xs font-bold text-fg-muted ring-1 ring-line">
                    基準
                  </div>
                )}
                <span className="mt-2 block text-xs font-bold leading-tight">
                  {p.personaJa ?? "制約なし"}
                </span>
              </button>
            );
          })}
        </div>

        {/* 고른 것의 사양. 「演じさせる」가 아니라는 증거가 여기다 */}
        {picked && (
          <div className="mt-4 rounded-xl bg-surface-2 p-5 ring-1 ring-line">
            <p className="text-xs font-medium text-fg-dim">
              {picked.labelJa} <span className="tnum">v{picked.version}</span>
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {picked.specs.map((s) => (
                <li key={s} className="flex gap-2 text-sm">
                  <span className="text-brand">•</span>
                  {s}
                </li>
              ))}
            </ul>
            {picked.evidenceJa && (
              <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-fg-dim">
                {picked.evidenceJa}
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── 03 用事 ─────────────────────────────────────── */}
      <section className="mt-14">
        <h2 className="flex items-baseline gap-3 text-lg font-bold">
          <span className="tnum text-brand">03</span>
          実行してもらう用事を選んでください
        </h2>
        <p className="mt-1 pl-10 text-sm text-fg-muted">
          このサイトの中で、その情報にたどり着けるかを見ます。
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {tasks.map((t) => {
            const on = t.id === task;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTask(t.id)}
                aria-pressed={on}
                className={`rounded-full border px-4 py-2 text-sm transition ${
                  on
                    ? "border-brand bg-brand font-bold text-white"
                    : "border-brand/40 text-brand hover:bg-[#eef3fd]"
                }`}
              >
                {t.label_ja}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── 開始 ────────────────────────────────────────── */}
      <div className="mt-14 text-center">
        <button
          type="button"
          onClick={start}
          disabled={!ready || going}
          className="rounded-full bg-brand px-12 py-4 text-base font-bold text-white shadow-lg transition enabled:hover:opacity-90 disabled:bg-fg-dim/40 disabled:shadow-none"
        >
          {going ? "準備中…" : "この条件で分析を開始する"}
        </button>
        {/* 5분이 걸린다는 것을 **누르기 전에** 쓴다. 누른 뒤에 알리면 그건 속인 것이다 */}
        <p className="mt-4 text-xs leading-relaxed text-fg-dim">
          実行には数分かかります。画面を開いたまま、AIが1手ずつ進む様子をご覧ください。
          <br />
          サイトへの負荷を避けるため、1回の操作ごとに間隔をあけ、同時には1件だけ実行します。
        </p>
      </div>
    </div>
  );
}
