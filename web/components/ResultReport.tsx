import Image from "next/image";
import Link from "next/link";
import { FindingIcon } from "@/components/FindingIcon";
import type { ResultData } from "@/lib/live-trace";

/**
 * 즉석 실행 1회의 결과 화면 (`website design/結果.png`의 데이터판).
 *
 * ★ 시안의 레이아웃·색·카드 구조는 그대로 두고, **들어가는 값만 우리 기록으로 갈았다.**
 *   시안에 있던 「離脱地点ランキング」은 뺐다 — 1회 실행에는 순위가 없다.
 *   「PDFをダウンロード」도 뺐다. 없는 기능을 버튼으로 두면 그게 페이크다 (절대규칙 3).
 *
 * ★ 이 화면이 하는 말과 하지 않는 말.
 *   하는 말   : 「이 프로필이, 이 1회에, 여기까지 갔다」
 *   안 하는 말: 「이 사이트는 고령자에게 쉽다/어렵다」
 *   n=1로 사이트를 단정하면 다음 판에 정반대 문장이 나온다 (新宿区×senior-70s는 실측 4회 중 2회 도달).
 *   사이트를 단정하는 것은 125런을 모은 `/report`의 몫이고, 여기서는 거기로 **링크만** 한다.
 *
 * ⚠️ 원가 두 값의 성격이 다르다. 왼쪽은 실제로 나간 돈, 오른쪽은 **가격표에서 나온 계산치**다.
 *   같은 크기로 나란히 두되 라벨에서 반드시 갈라 적는다 (절대규칙 4).
 */

const OUTCOME_JA: Record<string, string> = {
  reached: "たどり着けた",
  gave_up_clicks: "クリック予算を使い切った",
  gave_up_time: "時間予算を使い切った",
  gave_up_self: "本人が諦めた",
  max_steps: "手数の上限に達した",
  error: "実行が中断した",
};

/** `StuckList.tsx`와 같은 말을 쓴다. 화면마다 등급 이름이 다르면 같은 값으로 안 읽힌다 */
const SEVERITY_JA: Record<string, string> = { high: "大きい", medium: "中くらい", low: "小さい" };

function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

/** 큰 숫자 한 칸. 시안의 강조 카드 그대로 — 값은 크게, 라벨은 작게 */
function Stat({
  label,
  value,
  unit,
  note,
  tone = "fg",
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  tone?: "fg" | "brand" | "clear" | "stumble";
}) {
  const color =
    tone === "brand" ? "text-brand" : tone === "clear" ? "text-clear" : tone === "stumble" ? "text-stumble" : "text-fg";
  return (
    <div className="rounded-2xl border border-line bg-surface px-6 py-5">
      <p className="text-xs font-medium text-fg-muted">{label}</p>
      <p className={`tnum mt-2 text-4xl font-bold leading-none ${color}`}>
        {value}
        {unit && <span className="ml-1 text-lg font-bold">{unit}</span>}
      </p>
      {note && <p className="mt-2 text-[11px] leading-relaxed text-fg-dim">{note}</p>}
    </div>
  );
}

export function ResultReport({
  d,
  persona,
}: {
  d: ResultData;
  persona: { name: string; photo: string } | null;
}) {
  const personaJa = persona?.name ?? d.profileId;
  const top = d.maskedWords[0];
  const seenPct = d.firstTotal > 0 ? Math.round((d.firstSeen / d.firstTotal) * 100) : 0;
  const saved = d.baselineUsd > 0 ? Math.round((1 - d.costUsd / d.baselineUsd) * 100) : 0;
  const ten = d.costUsd * 10;

  return (
    <>
      {/* ── 머리 ─────────────────────────────────────────── */}
      <section className="brand-wash border-b border-line">
        <div className="mx-auto w-full max-w-4xl px-6 py-12 text-center sm:py-16">
          <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">分析結果をお届けします</h1>
          <p className="mt-4 text-sm text-fg-muted sm:text-base">
            選んだ利用者の視点で、実際にウェブサイトを操作しました。
          </p>

          {/* ★ 사진 밑에 있던 프로필 id를 뺐다 (2026-08-14). 없앤 것이 아니라 **옮겼다** —
              바로 밑 総合結果 문장 안에 「高齢者プロファイル（senior-70s v1.0）が…」로 들어 있다.
              id가 붙어 있어야 하는 자리는 얼굴 밑이 아니라 **주장을 하는 문장 옆**이다.
              머리는 「누구를 위한 계측인가」만 1초에 말하고, 검증에 필요한 값은 결론과 함께 나온다. */}
          <div className="mt-8 flex flex-col items-center gap-3">
            {persona && (
              <Image
                src={persona.photo}
                alt=""
                width={240}
                height={240}
                className="size-24 rounded-full object-cover ring-1 ring-line sm:size-28"
              />
            )}
            <p className="text-base font-bold sm:text-lg">{personaJa}</p>
          </div>
        </div>
      </section>

      <section className="bg-surface-2">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-12 sm:py-16">
          {/* ── 조건 ───────────────────────────────────────── */}
          <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
            <div className="bg-surface px-6 py-5">
              <p className="text-xs font-medium text-fg-muted">調べたサイト</p>
              <p className="mt-1.5 truncate text-base font-bold">{d.siteName}</p>
              <p className="truncate text-xs text-fg-dim">{d.siteHost}</p>
            </div>
            <div className="bg-surface px-6 py-5">
              <p className="text-xs font-medium text-fg-muted">タスク</p>
              <p className="mt-1.5 text-base font-bold">{d.taskLabelJa}</p>
              <p className="line-clamp-1 text-xs text-fg-dim">{d.goalJa}</p>
            </div>
          </div>

          {/* ── 総合結果 ───────────────────────────────────── */}
          <div
            className={`rounded-2xl border p-7 ${
              d.reached ? "border-clear/35 bg-clear/[0.06]" : "border-stumble/35 bg-stumble/[0.06]"
            }`}
          >
            <p className="text-[11px] font-bold tracking-[0.18em] text-fg-muted">総合結果</p>
            <p
              className={`mt-2 text-3xl font-bold tracking-tight sm:text-4xl ${
                d.reached ? "text-clear" : "text-stumble"
              }`}
            >
              {d.reached ? "○ " : "× "}
              {OUTCOME_JA[d.outcome] ?? d.outcome}
            </p>

            {/* 주어는 페르소나, 술어는 이 1회. 사이트를 주어로 두지 않는다 */}
            <p className="mt-4 text-sm leading-relaxed sm:text-base">
              <strong className="font-bold">{personaJa}</strong>プロファイル（
              <span className="tnum font-mono text-xs">
                {d.profileId} v{d.profileVersion}
              </span>
              ）が{d.siteName}で「{d.taskLabelJa}」を試し、
              {d.reached ? (
                <>目的のページに<strong className="font-bold">たどり着きました</strong>。</>
              ) : (
                <>目的のページには<strong className="font-bold">たどり着けませんでした</strong>。</>
              )}
              これは<strong className="font-bold">1回の実行の記録</strong>です。
            </p>

            {d.reasonJa && (
              <p className="mt-3 border-l-2 border-line pl-4 text-sm leading-relaxed text-fg-muted">
                {d.reasonJa}
              </p>
            )}

            {/* 라벨을 결과에 맞춘다 — 도달 못 했는데 「到達時間」이면 값과 말이 어긋난다 */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Stat
                label={d.reached ? "到達クリック数" : "使ったクリック数"}
                value={String(d.clicks)}
                unit="回"
                tone={d.reached ? "clear" : "stumble"}
                note={`操作は全部で ${d.steps} 手（上限 ${d.maxSteps} 手）`}
              />
              <Stat
                label={d.reached ? "到達時間" : "探した時間"}
                value={mmss(d.seconds)}
                tone={d.reached ? "clear" : "stumble"}
                note="AIが考える時間と、サイトに負担をかけないための待機時間を含みます（人の所要時間ではありません）"
              />
            </div>
          </div>

          {/* ── 主なツマヅキ ───────────────────────────────── */}
          <div className="rounded-2xl border border-line bg-surface p-7">
            <h2 className="text-lg font-bold">主なツマヅキ</h2>
            <p className="mt-1.5 text-xs text-fg-muted">この1回のあいだに記録した数字です。</p>

            {/* ★ 밑줄 설명은 **안내문일 때만** 지웠다 (2026-08-14).
                「下の改善提案に…」는 지워도 숫자가 그대로 읽히지만, 나머지 둘은 지우면
                숫자가 뜻을 잃는다 — `4/38`은 그냥 분수이고, `2.1%`는 출처 없는 숫자다.
                그래서 **값 쪽을 읽기 쉬운 형태로 바꾸고, 밑줄은 한 줄로 줄였다.** */}
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <Stat
                label="見つかったツマヅキ"
                value={String(d.findings.length)}
                unit="件"
                tone={d.findings.length > 0 ? "stumble" : "clear"}
              />
              <Stat
                label="最初の画面に見えていた操作要素"
                value={`${seenPct}%`}
                tone="brand"
                note={`${d.firstSeen} / ${d.firstTotal}個`}
              />
              {/* ★ 근거가 「이해율 조사」일 때만 %를 낸다. 지정 명단에는 조사 자체가 없다.
                  그래서 여기만은 출처를 못 지운다 — 지우면 숫자의 성격이 사라진다 */}
              {top ? (
                <Stat
                  label="伏せた語"
                  value={`「${top.surface}」`}
                  tone="stumble"
                  note={
                    top.comprehension !== null
                      ? `理解率 ${top.comprehension}%（国立国語研究所）`
                      : "行政の書き換え指定語（%なし）"
                  }
                />
              ) : (
                <Stat label="伏せた語" value="0" unit="語" />
              )}
            </div>
          </div>

          {/* ── 改善提案 ───────────────────────────────────── */}
          {d.findings.length > 0 && (
            <div className="rounded-2xl border border-line bg-surface p-7">
              <h2 className="text-lg font-bold">改善提案</h2>
              <p className="mt-1.5 text-xs text-fg-muted">
                詰まった場所と、そこを直す文をひと組にしています。
              </p>
              <ul className="mt-5 space-y-4">
                {d.findings.map((f, i) => (
                  <li
                    key={`${f.stepN}-${i}`}
                    className={`flex gap-4 rounded-2xl border p-5 ${
                      f.severity === "high"
                        ? "border-blocked/40 bg-blocked/[0.05]"
                        : f.severity === "medium"
                          ? "border-stumble/40 bg-stumble/[0.05]"
                          : "border-line bg-surface-2"
                    }`}
                  >
                    {/* ★ 그림이 지는 것은 「어떤 종류로 막혔는가」다. 심각도가 아니다 —
                        그건 이 카드의 테두리색과 옆의 칩이 이미 말하고 있다 (FindingIcon.tsx) */}
                    <FindingIcon kind={f.kind} />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-fg-dim">
                        <span className="tnum text-base font-bold text-fg">{String(i + 1).padStart(2, "0")}</span>
                        <span className="rounded-md border border-line bg-surface px-2 py-0.5">
                          影響 {SEVERITY_JA[f.severity] ?? f.severity}
                        </span>
                        <span className="tnum rounded-md border border-line bg-surface px-2 py-0.5">
                          {f.stepN} 手目
                        </span>
                      </div>

                      <p className="mt-3 font-bold leading-relaxed">{f.causeJa}</p>

                      {/* ★ 모델이 required는 지키면서 빈 문자열을 보내는 일이 있다. 그때 라벨만 남으면
                          「고치는 법이 있는데 안 보여준다」로 읽힌다 — 없으면 칸째로 안 그린다 */}
                      {f.fixJa && (
                        <div className="mt-3 rounded-xl border border-line bg-surface px-4 py-3">
                          <p className="text-[11px] font-medium text-brand">こう直す</p>
                          <p className="mt-1 text-sm leading-relaxed">{f.fixJa}</p>
                        </div>
                      )}

                      {/* 근거 없는 지적은 리포트가 아니라 비난이다. 반드시 같이 낸다 */}
                      {f.evidence.length > 0 && (
                        <ul className="mt-3 space-y-1">
                          {f.evidence.map((e, j) => (
                            <li key={j} className="text-[11px] leading-relaxed text-fg-dim">
                              · {e}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── これは1回の記録である ───────────────────────── */}
          <div className="rounded-2xl border border-stumble/30 bg-[#fdf6e9] p-6">
            <p className="text-sm font-bold text-stumble">※ これは1回の記録です</p>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              同じ条件でも結果は揺れます — 公開している125ランでも、25マス中
              <strong className="font-bold text-fg"> 9マス </strong>
              で○×が分かれました。
              <strong className="font-bold text-fg">1回では「たまたま」を切り分けられません。</strong>
              ツマヅキは、プロファイル5種を2回ずつ、
              <strong className="font-bold text-fg">計10回</strong>まわして傾向を出します。
            </p>
          </div>

          {/* ── 費用 ───────────────────────────────────────── */}
          <div className="rounded-2xl border border-line bg-surface p-7">
            <h2 className="text-lg font-bold">この分析にかかった費用</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-brand/30 bg-brand/[0.05] px-6 py-5">
                <p className="text-xs font-medium text-brand">この1回の実費</p>
                <p className="tnum mt-2 text-4xl font-bold leading-none text-brand">
                  ${d.costUsd.toFixed(4)}
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-fg-dim">
                  LLM呼び出し {d.calls}回ぶん。捨てた再試行も含みます
                </p>
              </div>
              <div className="rounded-2xl border border-line bg-surface-2 px-6 py-5">
                <p className="text-xs font-medium text-fg-muted">10回まわしたら</p>
                <p className="tnum mt-2 text-4xl font-bold leading-none">${ten.toFixed(2)}</p>
                <p className="mt-2 text-[11px] leading-relaxed text-fg-dim">
                  この1回 × 10 の計算値です（プロファイル5種 × 2回＝ツマヅキの既定）
                </p>
              </div>
            </div>

            {/* ★ 이 줄이 ⑥ 심사의 답이다. 다만 오른쪽 값은 계산치라는 말을 빼지 않는다 */}
            {d.baselineUsd > 0 && (
              <p className="tnum mt-4 rounded-xl bg-surface-2 px-5 py-3 text-sm leading-relaxed ring-1 ring-line">
                すべてを最上位モデルで動かしていたら
                <strong className="mx-1.5 text-base font-bold">${d.baselineUsd.toFixed(4)}</strong>
                <span className="text-fg-dim">（価格表からの計算値）</span> →
                <strong className="ml-1.5 text-base font-bold text-clear">{saved}% 減</strong>
                <span className="ml-2 text-xs text-fg-dim">
                  用事ごとに OrcaRouter がモデルを選び分けた結果です
                </span>
              </p>
            )}

            <p className="mt-3 text-[11px] leading-relaxed text-fg-dim">
              費用は毎回同じではありません。迷うほど手数が増え、その分だけ呼び出しが増えます
              （わたしたちの実測では1回あたり $0.036〜$0.073 の幅がありました）。
            </p>
          </div>

          {/* ── 次 ─────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/request"
              className="rounded-full bg-brand px-8 py-3 text-sm font-bold text-white transition hover:opacity-90"
            >
              もう一度試す
            </Link>
            <Link
              href="/report"
              className="rounded-full border border-brand/40 px-8 py-3 text-sm font-bold text-brand transition hover:bg-brand/5"
            >
              125ランの計測結果を見る
            </Link>
          </div>

          {/* ★ 「판정이 AI 하나뿐」이라는 고지는 원래 위쪽에 노란 박스로 있었다. 박스는 없앴지만
              문장은 없애지 않았다 — 이 화면은 위에서 「たどり着けませんでした」를 크게 단정하고 있고,
              그걸 누가 판정했는지가 화면에 없으면 화면이 스스로 거짓말을 하는 구조가 된다.
              눈에 안 띄는 자리에 한 줄로 둔다. 원문은 `/report/detail`에 그대로 있다 */}
          <p className="text-center text-[11px] leading-relaxed text-fg-dim">
            記録は <code className="font-mono">{d.runId}</code> として保存しています。
            この実行は、公開している125ランの集計には含めません（条件が違うためです）。到達判定はAI 1体です。
          </p>
        </div>
      </section>
    </>
  );
}
