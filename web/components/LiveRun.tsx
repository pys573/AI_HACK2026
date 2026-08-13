"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

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
 * ⚠️ 즉석 실행에는 사람이 만든 정답 키가 없다 → 도달 판정이 **AI 하나뿐**이다.
 *   그 사실을 화면 위쪽에 계속 띄워둔다. 결과만 보고 105회 실측과 같은 급으로
 *   읽히면 그건 우리가 속인 것이 된다 (절대규칙 4).
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
  back: "前のページへ戻る",
  find_in_page: "ページ内を検索",
  site_search: "サイト内検索",
  give_up: "諦めた",
};

const OUTCOME_JA: Record<string, string> = {
  reached: "たどり着けた",
  gave_up_clicks: "クリック予算を使い切った",
  gave_up_time: "時間予算を使い切った",
  gave_up_self: "本人が諦めた",
  max_steps: "手数の上限に達した",
  error: "実行が中断した",
};

export function LiveRun({ url, task, profile }: { url: string; task: string; profile: string }) {
  const [start, setStart] = useState<Start | null>(null);
  const [steps, setSteps] = useState<StepEv[]>([]);
  const [verdict, setVerdict] = useState<VerdictEv | null>(null);
  const [findings, setFindings] = useState<FindingEv[]>([]);
  const [done, setDone] = useState<DoneEv | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  /** null이면 최신 스텝을 따라간다. 고르면 그 스텝에서 멈춘다 */
  const [pinned, setPinned] = useState<number | null>(null);

  const logRef = useRef<HTMLOListElement>(null);

  // ★ 실행은 이 화면이 열릴 때 시작한다. 접수 화면에서 시작하지 않는 이유는,
  //   주소만 있으면 같은 조건을 그대로 다시 돌릴 수 있게 하기 위해서다.
  useEffect(() => {
    const q = new URLSearchParams({ url, task, profile });
    const es = new EventSource(`/api/live?${q}`);

    es.onmessage = (e) => {
      const ev = JSON.parse(e.data) as Ev;
      if (ev.kind === "start") setStart(ev);
      else if (ev.kind === "step") setSteps((s) => [...s, ev]);
      else if (ev.kind === "verdict") setVerdict(ev);
      else if (ev.kind === "finding") setFindings((f) => [...f, ev]);
      else if (ev.kind === "done") setDone(ev);
      else if (ev.kind === "failed") setFailed(ev.message);
      else if (ev.kind === "end") {
        setEnded(true);
        es.close();
      }
    };
    // 서버가 끊으면 EventSource는 자동으로 다시 붙는다 → 실행이 두 번 돈다.
    // 그래서 에러가 나면 명시적으로 닫는다.
    es.onerror = () => {
      es.close();
      setEnded(true);
    };
    return () => es.close();
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
      {/* ── 상태 줄 ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-6 py-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">
            {start ? start.site_name : "接続中…"}
            <span className="ml-2 font-normal text-fg-dim">{url}</span>
          </p>
          <p className="mt-1 text-xs text-fg-muted">
            {start ? `${start.profile_label_ja}（${start.profile_id}）` : "準備しています"}
          </p>
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

      {/* ⚠️ 판정이 한 겹 얇다는 고지. 결과가 나오기 **전부터** 띄워둔다 */}
      {start && !start.key_available && (
        <p className="mt-3 rounded-xl bg-[#fdf6e9] px-5 py-3 text-xs leading-relaxed text-stumble ring-1 ring-stumble/25">
          このURLには、人が用意した正解ページの一覧がありません。そのため到達判定は
          <strong className="font-bold">AIのみ</strong>で行います（公開している125ランの計測は、人が作ったキーとAIの2段判定です）。
        </p>
      )}

      {start && (
        <p className="mt-3 rounded-xl bg-surface-2 px-5 py-3 text-sm leading-relaxed text-fg-muted ring-1 ring-line">
          <span className="font-bold text-fg">用事：</span>
          {start.goal_ja}
        </p>
      )}

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

      {/* ── 判定 ────────────────────────────────────────── */}
      {verdict && (
        <div
          className={`mt-6 rounded-2xl border p-6 ${
            verdict.reached ? "border-clear/30 bg-clear/5" : "border-stumble/30 bg-stumble/5"
          }`}
        >
          <p className={`text-lg font-bold ${verdict.reached ? "text-clear" : "text-stumble"}`}>
            {verdict.reached ? "○ " : "× "}
            {OUTCOME_JA[verdict.outcome] ?? verdict.outcome}
          </p>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-fg-muted">{verdict.reason_ja}</p>
        </div>
      )}

      {/* ── ツマヅキ ────────────────────────────────────── */}
      {findings.length > 0 && (
        <div className="mt-6 rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-base font-bold">見つかったツマヅキ {findings.length}件</h2>
          <ul className="mt-4 space-y-5">
            {findings.map((f, i) => (
              <li key={`${f.step_n}-${i}`} className="border-l-2 border-stumble pl-4">
                <p className="tnum text-xs text-fg-dim">
                  {f.step_n}手目・{f.severity}
                </p>
                <p className="mt-1 text-sm font-bold">{f.cause_ja}</p>
                <p className="mt-1 text-sm text-brand">→ {f.fix_ja}</p>
                {/* 근거 없는 지적은 리포트가 아니라 비난이다. 반드시 같이 낸다 */}
                {f.evidence.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {f.evidence.map((e, j) => (
                      <li key={j} className="text-xs text-fg-dim">
                        · {e}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── 終わり ──────────────────────────────────────── */}
      {done && (
        <div className="mt-6 rounded-2xl bg-surface-2 p-6 text-sm ring-1 ring-line">
          <p className="tnum">
            この1回の実費 <strong className="text-base">${done.cost_usd.toFixed(4)}</strong>
            <span className="ml-2 text-fg-dim">（捨てた再試行も含む実測値）</span>
          </p>
          <p className="mt-2 text-xs text-fg-dim">
            記録は <code className="font-mono">{done.run_id}</code> として保存しました。
            この実行は、公開している125ランの集計には含めません（条件が違うためです）。
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/request" className="rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white">
              別の条件で試す
            </Link>
            <Link
              href="/report"
              className="rounded-full border border-brand/40 px-6 py-2.5 text-sm font-bold text-brand"
            >
              125ランの計測結果を見る
            </Link>
          </div>
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
