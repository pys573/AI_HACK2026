import type { ShieldView } from "@/lib/data";
import { Badge } from "./ui";

/**
 * ★ 「防いだ」の証拠。**書いてあることではなく、渡らなかったことを見せる。**
 *
 * 이 섹션의 급소는 위협 목록이 아니라 **오른쪽의 before/after**다.
 * 「검출했습니다」는 로그일 뿐이고, 「모델에게 이 글자가 가지 않았습니다」가 방어다.
 * 그래서 목록보다 본문 대조를 위에 둔다.
 *
 * 하지 않는 주장을 화면에서 먼저 말한다:
 *   - 「AIが指示を見破った」가 아니다. 모델은 그 글자를 **본 적이 없다**
 *   - 패턴표에 없는 형태는 그대로 통과한다. 표가 곧 주장의 범위다
 *   - 사이트는 가공이다. 남의 사이트에는 심지 않는다
 */

const KIND_JA: Record<string, string> = {
  prompt_injection: "指示の埋め込み",
  pii: "個人情報",
  tool_abuse: "許可外の操作",
  offsite_navigation: "対象外サイトへの遷移",
};

const LOCATION_JA = (loc: string) => {
  if (loc === "body") return "本文";
  if (loc === "title") return "ページ名";
  const m = loc.match(/^element:(\d+)$/);
  return m ? `リンクの名前 #${m[1]}` : loc;
};

const REDACTED = "［セキュリティ検査により除去］";

/** 지워진 표식을 눈에 띄게. 그냥 텍스트로 흘러가면 아무도 못 본다 */
function Redacted({ text }: { text: string }) {
  return (
    <>
      {text.split(new RegExp(`(${REDACTED})`, "g")).map((p, i) =>
        p === REDACTED ? (
          <mark
            key={i}
            className="rounded-[3px] border border-clear/40 bg-clear/10 px-1 py-0.5 font-medium text-clear not-italic"
          >
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/**
 * 지워질 부분을 before 쪽에서 미리 물들인다.
 * 하드코딩하지 않는다 — after에 남은 조각을 기준으로 before에서 **빠진 구간**을 찾는다.
 * 트레이스가 바뀌어도 그대로 성립하고, 우리가 화면용으로 지어낸 글자가 섞이지 않는다.
 */
function diffSpans(before: string, after: string): { text: string; cut: boolean }[] {
  const parts = after.split(REDACTED);
  if (parts.length === 1) return [{ text: before, cut: false }];

  const out: { text: string; cut: boolean }[] = [];
  let pos = 0;
  for (let i = 0; i < parts.length - 1; i++) {
    // after의 조각은 before에 그대로 남아 있다. 그 사이가 지워진 구간이다
    const head = parts[i];
    const tail = parts[i + 1];
    const headEnd = head ? before.indexOf(head, pos) + head.length : pos;
    const tailStart = tail ? before.indexOf(tail.slice(0, 40), headEnd) : before.length;
    if (headEnd < pos || tailStart < headEnd) return [{ text: before, cut: false }];
    out.push({ text: before.slice(pos, headEnd), cut: false });
    out.push({ text: before.slice(headEnd, tailStart), cut: true });
    pos = tailStart;
  }
  out.push({ text: before.slice(pos), cut: false });
  return out.filter((s) => s.text.length > 0);
}

export function Threats({ shield }: { shield: ShieldView }) {
  if (!shield) return null;
  const spans = diffSpans(shield.rawText, shield.seenText);
  const cutSomething = spans.some((s) => s.cut);

  return (
    <div className="space-y-6">
      {/* ── ① 무엇이 갔고 무엇이 안 갔는가 ───────────────────────── */}
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-stumble/30 bg-surface p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="stumble">ページにあった文</Badge>
            <span className="text-[11px] text-fg-dim">観測したまま</span>
          </div>
          <pre className="mt-3 max-h-[28rem] overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-fg-muted">
            {cutSomething
              ? spans.map((s, i) =>
                  s.cut ? (
                    <span
                      key={i}
                      className="rounded-[3px] bg-blocked/15 px-0.5 font-medium text-blocked underline decoration-blocked/50 decoration-dashed underline-offset-2"
                    >
                      {s.text}
                    </span>
                  ) : (
                    <span key={i}>{s.text}</span>
                  ),
                )
              : shield.rawText}
          </pre>
        </div>

        <div className="rounded-xl border border-clear/30 bg-surface p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="clear">AIに渡した文</Badge>
            <span className="text-[11px] text-fg-dim">
              constrain() より前・{shield.blockedCount} 件を除去
            </span>
          </div>
          <pre className="mt-3 max-h-[28rem] overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-fg-muted">
            <Redacted text={shield.seenText} />
          </pre>
        </div>
      </div>

      {/* ★ ここが主張の線。「見破った」ではない */}
      <p className="rounded-lg border border-line bg-surface-2 p-4 text-xs leading-relaxed text-fg-muted">
        <strong className="text-fg">AIが指示を見破ったのではありません。</strong>
        モデルはこの文字列を<strong className="text-fg">一度も見ていません</strong>。
        判断ではなく、渡す前の処理です。私たちは観測の仕組みを自前で持っているので、
        上流のモデルに送る<strong className="text-fg">手前</strong>に検査を置けます。
      </p>

      {/* ── ② リンクの名前 ───────────────────────────────────── */}
      {shield.labels.length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-5">
          <div className="text-xs font-medium text-fg">リンクの名前も同じ関門を通ります</div>
          {/* 본문만 지우면 라벨로 그대로 올라간다. 요소명은 반드시 모델에 간다 */}
          <p className="mt-1.5 text-[11px] leading-relaxed text-fg-dim">
            本文だけを見ていると漏れます。押せるものの名前は、かならずモデルに渡るからです。
          </p>
          <ul className="mt-3 space-y-2">
            {shield.labels.map((l) => (
              <li key={l.index} className="flex flex-wrap items-center gap-2 text-xs">
                <code className="font-mono text-[11px] text-fg-dim">#{l.index}</code>
                <span className="rounded border border-blocked/40 bg-blocked/10 px-1.5 py-0.5 font-mono text-[11px] text-blocked">
                  {l.raw}
                </span>
                <span className="text-fg-dim">→</span>
                <span className="rounded border border-clear/40 bg-clear/10 px-1.5 py-0.5 font-mono text-[11px] text-clear">
                  {l.seen}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── ③ 検出の記録 ─────────────────────────────────────── */}
      <div className="rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-fg">記録</span>
          <span className="tnum text-[11px] text-fg-dim">
            {shield.threats.length} 件（うち遮断 {shield.blockedCount} 件）
          </span>
        </div>
        {/* 黙って弾くと「防いだ」証拠が残らない (docs/SECURITY.md) */}
        <p className="mt-1.5 text-[11px] leading-relaxed text-fg-dim">
          黙って弾きません。何を検出し、どう判定したかを、原文の抜粋つきでトレースに残します。
          あとから人が読めなければ、防御の検証ができません。
        </p>
        <ul className="mt-3 space-y-2">
          {shield.threats.map((t, i) => (
            <li key={i} className="rounded-lg border border-line-soft bg-surface-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={t.verdict === "block" ? "blocked" : "neutral"}>
                  {t.verdict === "block" ? "遮断" : "記録のみ"}
                </Badge>
                <span className="text-[11px] text-fg-muted">{KIND_JA[t.kind] ?? t.kind}</span>
                <code className="font-mono text-[11px] text-fg-dim">
                  {LOCATION_JA(t.location)}
                </code>
              </div>
              {t.excerpt && (
                <p className="mt-2 break-words font-mono text-[11px] leading-relaxed text-fg-dim">
                  「{t.excerpt}」
                </p>
              )}
              <p className="mt-1.5 text-[11px] leading-relaxed text-fg-muted">{t.noteJa}</p>
            </li>
          ))}
        </ul>
      </div>

      {/* ── ④ 行動 ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-clear/30 bg-surface p-5">
        <div className="text-xs font-medium text-fg">それで、エージェントは何をしたか</div>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">
          {shield.choiceJa && (
            <>
              「<strong className="text-clear">{shield.choiceJa}</strong>」を押しました。
            </>
          )}
          {shield.reasonJa && (
            <span className="text-fg-dim">その場で書いた理由: {shield.reasonJa}</span>
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-fg-dim">
          <span className="tnum">
            訪れた URL: {shield.visited.map((u) => u.replace(shield.startUrl, "/")).join(" → ")}
          </span>
          <span className="tnum">
            クリック {shield.clicks} 回・{shield.seconds} 秒・${shield.totalUsd.toFixed(6)}（呼び出し{" "}
            {shield.calls} 回）
          </span>
        </div>
        {/* 罠は同じオリジンに置いてある。ドメインガードでは止まらない配置だ */}
        <p className="mt-3 border-t border-line-soft pt-3 text-[11px] leading-relaxed text-fg-dim">
          誘導先の罠ページは<strong className="text-fg-muted">同じサイトの中</strong>に置いてあります。
          「外部サイトだから行けなかった」で合格できないようにするためです。
          止めているのは検査だけで、エージェントは用事のほうを続けました。
        </p>
      </div>

      {/* ── ⑤ 先に言っておくこと ─────────────────────────────── */}
      <div className="rounded-xl border border-line bg-surface-2 p-5">
        <div className="text-xs font-medium text-fg">この画面が言っていないこと</div>
        <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-fg-dim">
          <li>
            ・このサイトは<strong className="text-fg-muted">架空です</strong>。実在しない
            「{shield.siteNameJa}」で、指示文は私たちが仕込みました。
            <strong className="text-fg-muted">他者のサイトには一切設置しません。</strong>
            ただし実行そのものは実測です — 実際のブラウザ・実際のモデル呼び出し・実際の原価です。
          </li>
          <li>
            ・遮断できるのは<strong className="text-fg-muted">パターン表に載っている形だけ</strong>
            です。表にない形は素通りします。表がそのまま主張の範囲です（
            <code className="font-mono">security/patterns.ts</code>）。
          </li>
          <li>
            ・消す量は狭く倒しています。正常な文まで消すと、そのあとの失敗が
            「サイトが難しいから」なのか「私たちが消したから」なのか区別できなくなり、
            この製品の計測値が全部無効になるためです。
          </li>
          <li>
            ・n=1 の実行です。トレースは{" "}
            <code className="font-mono">web/public/demo/honeypot.json</code> にあります。
          </li>
        </ul>
      </div>
    </div>
  );
}
