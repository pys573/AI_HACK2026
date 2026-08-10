import type { MomentView, RunView } from "@/lib/data";
import { Badge, MaskedText } from "./ui";

/**
 * ★★ 이 섹션 하나로 심사 ③(수십 초 안에 가치 전달)을 통과시킨다.
 *
 * 「제약을 걸었더니 실패했다」는 상관관계다. 「같은 페이지에 둘 다 서 있었는데
 * 한쪽에는 정답 링크가 화면에 있었고 다른 쪽에는 없어서 되돌아갔다」는 인과다.
 * 숫자는 전부 lib/data.ts の findMoment() 가 트레이스에서 뽑은 것이다.
 */
export function Moment({
  moment,
  control,
  senior,
}: {
  moment: MomentView;
  control: RunView;
  senior: RunView;
}) {
  if (!moment) return null;
  const hidden = moment.rawTotal - moment.seniorSeenTotal;

  return (
    <div>
      {/* 同じURLに立っていた、という事実を最初に置く */}
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge>2人とも到達したページ</Badge>
          <span className="font-mono text-fg-dim">{moment.url}</span>
        </div>
        <div className="mt-1.5 text-sm">{moment.title}</div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* ── 対照群 ── */}
        <div className="flex flex-col rounded-xl border border-clear/35 bg-surface p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{control.labelJa}</span>
            <span className="tnum text-[11px] text-fg-dim">
              ステップ {moment.controlStepN}
            </span>
          </div>

          <div className="tnum mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-bold text-clear">{moment.controlSeenTotal}</span>
            <span className="text-sm text-fg-muted">個の選択肢が画面にあった</span>
          </div>

          {/* 49 vs 10 は数字より「密度」で伝わる。だからチップで敷き詰める */}
          <div className="mt-5 flex flex-wrap content-start gap-1">
            {moment.controlSeen.map((e) => {
              const isAnswer = e.name === moment.answerLabel;
              return (
                <span
                  key={e.index}
                  className={`max-w-full truncate rounded border px-1.5 py-0.5 text-[10px] leading-4 ${
                    isAnswer
                      ? "border-clear bg-clear/20 font-medium text-clear"
                      : "border-line bg-surface-2 text-fg-dim"
                  }`}
                >
                  {e.name || "（名前なし）"}
                </span>
              );
            })}
          </div>

          <div className="mt-5 rounded-lg border border-clear/40 bg-clear/10 p-4">
            <div className="text-[11px] text-clear">この中から押した</div>
            <div className="mt-1 text-base font-medium leading-snug">
              {moment.answerLabel}
            </div>
          </div>

          <p className="mt-auto pt-5 text-sm text-fg-muted">
            この1クリックで<strong className="text-clear">終わった</strong>。
            合計 {control.clicks} クリック / {control.seconds} 秒。
          </p>
        </div>

        {/* ── 制約プロファイル ── */}
        <div className="flex flex-col rounded-xl border border-stumble/35 bg-surface p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{senior.labelJa}</span>
            <span className="tnum text-[11px] text-fg-dim">
              ステップ {moment.seniorStepN}
            </span>
          </div>

          <div className="tnum mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-bold text-stumble">{moment.seniorSeenTotal}</span>
            <span className="text-sm text-fg-muted">個しか画面になかった</span>
            <span className="text-xs text-fg-dim">（ページ全体 {moment.rawTotal}）</span>
          </div>

          <ul className="mt-5 space-y-1">
            {moment.seniorSeen.map((e) => (
              <li
                key={e.index}
                className="flex items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-xs"
              >
                <span className="tnum shrink-0 rounded bg-ink px-1.5 py-0.5 font-mono text-[10px] text-fg-dim">
                  {e.index}
                </span>
                <span className="truncate">
                  <MaskedText text={e.name || "（名前なし）"} />
                </span>
              </li>
            ))}
          </ul>

          {moment.answerExisted && !moment.answerInViewport && (
            <div className="mt-4 rounded-lg border border-blocked/40 bg-blocked/10 p-4">
              <div className="text-[11px] text-blocked">
                このページにあったのに、画面の外だったもの
              </div>
              <div className="mt-1 text-base font-medium leading-snug text-blocked">
                {moment.answerLabel}
              </div>
            </div>
          )}

          <p className="mt-4 text-sm leading-relaxed text-fg-muted">
            見えていた {moment.seniorSeenTotal} 個のうち、手続きの名前はひとつもありません。
            AIは「{moment.seniorChoiceLabel || "名前のないボタン"}」を押して、
            <strong className="text-stumble">カテゴリの入口まで戻りました</strong>。
          </p>
          <p className="mt-2 text-xs leading-relaxed text-fg-dim">
            「{moment.seniorReasonJa}」
          </p>

          <p className="mt-auto pt-5 text-sm text-fg-muted">
            このあと {moment.seniorClicksAfter} クリック使って、
            <strong className="text-stumble">二度とこのページに戻ってきませんでした</strong>。
          </p>
        </div>
      </div>

      {/* 結論を言い切る。ここを曖昧にすると全部ぼやける */}
      <div className="mt-4 rounded-xl border border-line bg-surface-2 p-5">
        <p className="text-base leading-relaxed">
          答えのリンクは、<strong>{hidden} 個の「画面の外」</strong>の中にありました。
          <br className="hidden sm:block" />
          サイトは壊れていません。リンクは存在し、文字も正しい。
          <span className="text-stumble">
            ただ、この条件では画面に入らなかった
          </span>
          — それだけです。
        </p>
        <p className="mt-3 text-xs leading-relaxed text-fg-dim">
          制約の中身は事前に宣言してあります:
          表示倍率 {senior.viewport.zoom * 100}%（実効
          {senior.viewport.width / senior.viewport.zoom}×
          {senior.viewport.height / senior.viewport.zoom}）、
          ページ内検索・サイト内検索なし、戻るは3回まで。
          プロンプトで「高齢者のふりをしろ」とは一度も言っていません。
        </p>
      </div>
    </div>
  );
}
