"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PERSONA } from "@/lib/persona";

/**
 * 즉석 실행 진행 화면 (`website design/play_screen.png`의 라이브판).
 *
 * ★ 왜 도중 화면이 필요한가: 1회 실행이 5분 넘게 걸린다. 끝나야 결과를 주면
 *   그 5분 동안 화면이 죽어 보이고, **제일 볼 만한 부분(헤매는 과정)이 통째로 안 보인다.**
 *   우리 제품의 주장은 「어디서 멈추는가」인데, 멈추는 순간은 도중에만 보인다.
 *
 * ★ 여기 나오는 것은 전부 **그 순간 실제로 일어난 일**이다. 미리 녹화한 것이 아니다.
 *   그림은 그 스텝에서 찍은 스크린샷 파일이고, 이유는 모델이 그 자리에서 쓴 문장이다.
 *
 * ★ 이 화면이 하는 일은 **「지금 무엇을 하고 있는가」 하나뿐이다** (2026-08-14 정리).
 *   예전에는 여기에 判定・見つかったツマヅキ까지 다 그렸다. 그런데 그 둘은 바로 다음 화면
 *   (`/live/result`)에 다시 나온다 — 같은 결론이 두 번 나오면 「分析結果を見る」 버튼이
 *   누를 이유를 잃고, 심사위원은 어느 쪽이 결론인지 모른다.
 *   여기는 **과정**, 다음이 **결론**. 판정 이벤트는 계속 받지만 그리지는 않는다.
 *
 * ⚠️ 「도달 판정이 AI 하나뿐」이라는 고지는 여기서 뺐다. 사라진 게 아니라 결론이 나오는
 *   화면(`ResultReport.tsx` 맨 아래)으로 옮겼다 — 판정이 실제로 표시되는 자리에 붙어 있어야
 *   고지로서 뜻이 있다. 과정 화면에는 아직 판정이 없다.
 */

type Start = {
  kind: "start";
  run_id: string;
  site_name: string;
  start_url: string;
  goal_ja: string;
  profile_id: string;
  profile_label_ja: string;
  max_steps: number;
  key_available: boolean;
};
type StepEv = {
  kind: "step";
  n: number;
  url: string;
  title: string;
  action: string | null;
  detail: string;
  reason_ja: string;
  ok: boolean;
  error: string | null;
  screenshot_key: string | null;
  masked: string[];
  elements_total: number;
  elements_in_viewport: number;
  clicks_left: number;
  seconds_left: number;
  threats: number;
};
type VerdictEv = { kind: "verdict"; outcome: string; reached: boolean; reason_ja: string; key_available: boolean };
type FindingEv = { kind: "finding"; step_n: number; severity: string; cause_ja: string; fix_ja: string; evidence: string[] };
type DoneEv = { kind: "done"; run_id: string; trace_path: string; cost_usd: number; steps: number };
type Ev = Start | StepEv | VerdictEv | FindingEv | DoneEv | { kind: "failed"; message: string } | { kind: "end" };

const ACTION_JA: Record<string, string> = {
  click: "クリック",
  scroll: "スクロール",
  // 横スクロールは「画面が横に切れている」ときだけ出る。出ていること自体が所見だ
  scroll_side: "横スクロール",
  close_overlay: "重なりを閉じる",
  back: "前のページへ戻る",
  find_in_page: "ページ内を検索",
  site_search: "サイト内検索",
  give_up: "諦めた",
};

export function LiveRun({
  url,
  task,
  profile,
  taskLabelJa,
  screenJa,
}: {
  url: string;
  task: string;
  profile: string;
  /** 「用事」의 짧은 이름. goal_ja는 한 문장이라 상태 줄에 못 들어간다 */
  taskLabelJa: string;
  /** 화면 조건 한 줄. 이게 없으면 좁은 사진이 전부 「스마트폰」으로 읽힌다 */
  screenJa: string;
}) {
  const [start, setStart] = useState<Start | null>(null);
  const [steps, setSteps] = useState<StepEv[]>([]);
  /** 그리지는 않는다. 「끝났는데 판정을 못 받았다」를 구별하는 데만 쓴다 */
  const [verdict, setVerdict] = useState<VerdictEv | null>(null);
  const [done, setDone] = useState<DoneEv | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  /** null이면 최신 스텝을 따라간다. 고르면 그 스텝에서 멈춘다 */
  const [pinned, setPinned] = useState<number | null>(null);

  const logRef = useRef<HTMLOListElement>(null);
  /**
   * 열려 있는 연결과 그 조건. **연결을 화면 수명보다 오래 살린다.**
   *
   * dev 서버는 같은 화면을 올렸다 내렸다 한 번 더 올린다(StrictMode). 그 가짜 언마운트에
   * 연결을 끊으면 서버가 「사람이 화면을 닫았다」로 보고 자식 프로세스를 죽인다. 그러면
   * 브라우저가 뜨다 만 채로 0스텝 `error`가 남는다 — 실측 20건 중 6건이 이 모양이었다.
   * 사이트가 아니라 우리 사정으로 실패한 것이라 계측값이 오염된다.
   */
  const esRef = useRef<EventSource | null>(null);
  const keyRef = useRef("");
  /** 「떠난 것 같다」와 「정말 떠났다」를 가르는 유예. 곧 다시 붙으면 취소된다 */
  const killRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ★ 실행은 이 화면이 열릴 때 시작한다. 접수 화면에서 시작하지 않는 이유는,
  //   주소만 있으면 같은 조건을 그대로 다시 돌릴 수 있게 하기 위해서다.
  useEffect(() => {
    const q = new URLSearchParams({ url, task, profile }).toString();

    // 떠나는 줄 알고 예약해 둔 끊기를 취소한다
    if (killRef.current) {
      clearTimeout(killRef.current);
      killRef.current = null;
    }
    // 조건이 그대로면 이미 붙어 있는 연결을 계속 쓴다. 새로 열면 실행이 두 번 돈다
    if (!esRef.current || keyRef.current !== q) {
      esRef.current?.close();
      keyRef.current = q;
      esRef.current = new EventSource(`/api/live?${q}`);
    }
    const es = esRef.current;

    es.onmessage = (e) => {
      const ev = JSON.parse(e.data) as Ev;
      if (ev.kind === "start") setStart(ev);
      else if (ev.kind === "step") setSteps((s) => [...s, ev]);
      else if (ev.kind === "verdict") setVerdict(ev);
      // finding은 받되 여기서는 그리지 않는다. 결론은 다음 화면의 몫이다 (파일 머리말 참조)
      else if (ev.kind === "done") setDone(ev);
      else if (ev.kind === "failed") setFailed(ev.message);
      else if (ev.kind === "end") {
        setEnded(true);
        es.close();
        if (esRef.current === es) esRef.current = null;
      }
    };
    // 서버가 끊으면 EventSource는 자동으로 다시 붙는다 → 실행이 두 번 돈다.
    // 그래서 에러가 나면 명시적으로 닫는다.
    es.onerror = () => {
      es.close();
      if (esRef.current === es) esRef.current = null;
      setEnded(true);
    };

    // 진짜로 떠났다면 잠시 뒤에도 아무도 다시 붙지 않는다. 그때 끊는다.
    // 곧바로 끊으면 StrictMode의 두 번째 마운트가 오기 전에 서버가 자식을 죽인다
    return () => {
      killRef.current = setTimeout(() => {
        es.close();
        if (esRef.current === es) esRef.current = null;
      }, 500);
    };
  }, [url, task, profile]);

  // 경과 시간. 「멈춘 게 아니라 돌고 있다」를 보여주는 최소한의 신호다
  useEffect(() => {
    if (ended) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [ended]);

  // 새 기록이 오면 아래로 따라 내려간다. 단, 사람이 앞 스텝을 보고 있으면 끌고 가지 않는다
  useEffect(() => {
    if (pinned !== null) return;
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [steps.length, pinned]);

  // ★ 실행 중에도 앞 스텝을 다시 볼 수 있어야 한다. 헤매는 순간은 지나가 버리는데,
  //   그 순간이 이 제품이 보여주려는 것 자체다
  const shown = pinned === null ? steps[steps.length - 1] : steps.find((s) => s.n === pinned);
  const last = shown;
  const running = !ended && !failed;
  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  // start 이벤트를 기다리지 않는다. 프로필은 주소에 이미 있으므로 접속 중에도 얼굴이 떠 있다
  const photo = PERSONA[profile]?.photo ?? null;

  if (failed) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-line bg-surface p-8 text-center">
        <p className="text-lg font-bold text-blocked">実行できませんでした</p>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">{failed}</p>
        <Link
          href="/request"
          className="mt-6 inline-block rounded-full bg-brand px-8 py-3 text-sm font-bold text-white"
        >
          条件を変えてもう一度
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      {/* ── 상태 줄 ──────────────────────────────────────────────────────
          ★ 이 박스 하나에 「누가 · 어디를 · 무슨 用事로」가 전부 들어간다.
            예전에는 밑에 박스를 두 개 더 달았는데, 스크린샷이 시작되기도 전에
            읽을 것이 세 덩이라 정작 봐야 할 화면이 아래로 밀렸다.
          ★ 얼굴 옆에 프로필 id가 **반드시 같이** 있어야 한다. 얼굴만 있으면
            「이 사람을 재현했다」로 읽힌다 — 우리가 하지 않는 주장이다
            (`web/public/img/persona/README.md`). */}
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 rounded-2xl border border-line bg-surface px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          {photo ? (
            <Image
              src={photo}
              alt=""
              width={120}
              height={120}
              className="size-14 shrink-0 rounded-full object-cover ring-1 ring-line"
            />
          ) : (
            // 대조군은 사람이 아니라 기준선이다. 빈 얼굴을 지어내지 않는다
            <span className="grid size-14 shrink-0 place-items-center rounded-full bg-surface-2 text-[10px] font-bold text-fg-dim ring-1 ring-line">
              対照
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold sm:text-base">
              {start ? start.site_name : "接続中…"}
              <span className="ml-2 text-xs font-normal text-fg-dim">{url}</span>
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
              <span>{start ? `${start.profile_label_ja}（${start.profile_id}）` : "準備しています"}</span>
              <span className="rounded-md bg-surface-2 px-2 py-0.5 ring-1 ring-line">用事：{taskLabelJa}</span>
              {screenJa && (
                <span className="rounded-md bg-surface-2 px-2 py-0.5 ring-1 ring-line">
                  画面：{screenJa}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {running && (
            <span className="flex items-center gap-2 text-sm font-medium text-brand">
              <span className="size-2.5 animate-pulse rounded-full bg-brand" />
              実行中
            </span>
          )}
          <span className="tnum text-sm text-fg-muted">{mmss}</span>
          <span className="tnum text-sm text-fg-muted">
            {steps.length}
            {start ? ` / ${start.max_steps}` : ""} 手
          </span>
        </div>
      </div>

      {/* ── 화면 + 操作ログ ──────────────────────────────── */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* 그 스텝에서 실제로 찍은 스크린샷 */}
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          {last?.screenshot_key ? (
            // next/image는 실행 중에 생기는 파일을 미리 알 수 없다. 그대로 내보낸다
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={last.screenshot_key}
              src={`/api/live/shot?key=${encodeURIComponent(last.screenshot_key)}`}
              alt={`${last.n}手目の画面`}
              className="w-full"
            />
          ) : (
            <div className="grid aspect-[4/3] place-items-center text-sm text-fg-dim">
              {running ? "最初のページを読み込んでいます…" : "画面はありません"}
            </div>
          )}
          {last && (
            <div className="border-t border-line px-5 py-4">
              <p className="truncate text-xs text-fg-dim">{last.url}</p>
              <p className="mt-1 text-sm font-bold">{last.title}</p>
              {/* 실제로 가린 말. 이 목록이 「演じさせていない」의 증거다.
                  전부 늘어놓으면 화면이 무너지므로 앞 12개만 보이고 **나머지 수를 밝힌다** */}
              {last.masked.length > 0 && (
                <p className="mt-3 flex flex-wrap items-center gap-1.5">
                  {last.masked.slice(0, 12).map((m, i) => (
                    <span key={`${m}-${i}`} className="masked text-xs">
                      {m}
                    </span>
                  ))}
                  {last.masked.length > 12 && (
                    <span className="tnum text-xs text-fg-dim">ほか{last.masked.length - 12}語</span>
                  )}
                  <span className="text-xs text-fg-dim">← この画面で伏せた語</span>
                </p>
              )}
            </div>
          )}
        </div>

        {/* 操作ログ */}
        <div className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-bold">操作ログ</h2>
            {pinned !== null && (
              <button
                type="button"
                onClick={() => setPinned(null)}
                className="text-xs font-medium text-brand hover:underline"
              >
                最新に戻る
              </button>
            )}
          </div>
          <ol ref={logRef} className="mt-4 max-h-[26rem] space-y-1 overflow-y-auto pr-1">
            {steps.map((s) => {
              const on = last?.n === s.n;
              return (
                <li key={s.n}>
                  {/* 스텝을 누르면 그때 화면으로 되돌아간다 */}
                  <button
                    type="button"
                    onClick={() => setPinned(s.n)}
                    className={`w-full border-l-2 py-2 pl-4 pr-2 text-left transition ${
                      on ? "border-brand bg-[#eef3fd]" : "border-line hover:bg-surface-2"
                    }`}
                  >
                    <p className="flex items-baseline gap-2">
                      <span className="tnum text-xs font-bold text-brand">{String(s.n).padStart(2, "0")}</span>
                      <span className="text-sm font-bold">
                        {s.action ? (ACTION_JA[s.action] ?? s.action) : "判断できなかった"}
                      </span>
                    </p>
                    {s.detail && <p className="mt-0.5 text-sm">{s.detail}</p>}
                    {s.reason_ja && <p className="mt-1 text-xs leading-relaxed text-fg-muted">{s.reason_ja}</p>}
                    {!s.ok && s.error && <p className="mt-1 text-xs text-blocked">⚠ {s.error}</p>}
                    <p className="tnum mt-1.5 text-[11px] text-fg-dim">
                      {/* 스크롤처럼 화면을 다시 읽지 않는 수는 요소 수가 0이다.
                          그걸 「0個しか見えていない」로 읽히게 두면 없는 제약을 주장한 것이 된다 */}
                      {s.elements_total > 0 && (
                        <>
                          画面の要素 {s.elements_in_viewport}/{s.elements_total}・
                        </>
                      )}
                      残り {s.clicks_left}クリック / {s.seconds_left}秒
                      {s.threats > 0 && <span className="ml-2 text-blocked">脅威検査 {s.threats}件</span>}
                    </p>
                  </button>
                </li>
              );
            })}
            {running && (
              <li className="border-l-2 border-brand/40 py-2 pl-4 text-sm text-fg-dim">考えています…</li>
            )}
          </ol>
        </div>
      </div>

      {/* ── 終わり ──────────────────────────────────────────────────────
          ★ 判定도 원가도 ツマヅキ 목록도 여기서 말하지 않는다. 전부 다음 화면의 몫이다.
            같은 결론을 두 화면에 흩어 두면 「어느 쪽이 결론인가」를 심사위원이 판단해야 한다.
            이 판 하나가 하는 일은 **다음 화면으로 넘기는 것**뿐이다.
            run_id도 뺐다 — 결과 화면 맨 아래에 같은 것이 있고, 거기가 그걸 쓸 자리다 */}
      {done && (
        <div className="mt-6 rounded-2xl border border-brand/25 bg-surface p-8 text-center">
          <p className="text-lg font-bold">操作が終わりました</p>
          <Link
            href={`/live/result?run=${encodeURIComponent(done.run_id)}`}
            className="mt-6 inline-block rounded-full bg-brand px-10 py-3.5 text-base font-bold text-white transition hover:opacity-90"
          >
            分析結果を見る
          </Link>
        </div>
      )}

      {ended && !done && !verdict && (
        <p className="mt-6 rounded-2xl bg-surface-2 p-6 text-sm text-fg-muted ring-1 ring-line">
          実行が終わりましたが、判定を受け取れませんでした。ここまでの操作ログは上のとおりです。
        </p>
      )}
    </div>
  );
}
