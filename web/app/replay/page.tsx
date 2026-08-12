import Link from "next/link";
import { Page } from "@/components/Chrome";
import { ReplayPlayer } from "@/components/ReplayPlayer";
import { listReplays, loadReplay } from "@/lib/replay";
import { outcomeLabel, loadMatrix } from "@/lib/matrix";

/**
 * リプレイ画面（website design/play_screen.png）。
 *
 * 「제약을 받은 AI가 정말 헤매는가」에 대한 답을 **눈으로** 보여주는 자리다.
 * 여기 뜨는 것은 전부 실행 당시의 스크린샷과, AI가 그 자리에서 쓴 이유다.
 *
 * ★ 좌표가 실린 실행만 나온다. 8/12 이전 트레이스에는 좌표가 없어서
 *   누른 위치를 그릴 수 없다 — 없는 것을 그리느니 목록에서 뺀다.
 */
export default async function ReplayPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const { run } = await searchParams;
  const ids = listReplays();
  const runId = run && ids.includes(run) ? run : ids[0];
  const replay = runId ? loadReplay(runId) : null;

  if (!replay) {
    return (
      <Page back={{ href: "/report", label: "← 結果へ" }}>
        <div className="mx-auto max-w-2xl px-6 py-24 text-center">
          <h1 className="text-2xl font-bold">再生できる実行がありません</h1>
          <p className="mt-3 leading-relaxed text-fg-muted">
            押した位置を描くには、実行時に要素の座標が記録されている必要があります。
            <code className="font-mono text-sm"> npm run batch</code> で新しく回してから
            <code className="font-mono text-sm"> npm run web:data</code> を実行してください。
          </p>
        </div>
      </Page>
    );
  }

  const o = outcomeLabel(replay.outcome);

  // 실행 id는 `<mission>__<profile>__<version>__<ts>` 다. 로마자 mission id를 그대로
  // 버튼에 박으면 「hamamatsu-tennyu」가 되는데, 이건 심사위원이 읽을 글자가 아니다.
  // 사이트 이름은 손으로 적지 않고 matrix.json에서 끌어온다 — 손으로 적으면 어긋난다.
  const siteNames = new Map((loadMatrix()?.sites ?? []).map((s) => [s.mission_id, s.site_name]));
  const others = ids.map((id) => {
    const [mission, profile] = id.split("__");
    return { id, on: id === runId, label: `${siteNames.get(mission) ?? mission} · ${profile}` };
  });

  return (
    <Page back={{ href: "/report", label: "← 結果へ" }}>
      <div className="mx-auto w-full max-w-6xl px-6 py-12">
        <h1 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          迷った様子を再生する
        </h1>
        <p className="mt-3 text-center leading-relaxed text-fg-muted">
          実行したときのスクリーンショットと、AIがその場で書いた理由をそのまま並べています。
          <br className="hidden sm:block" />
          押した場所の印は、記録された座標から描いています。
        </p>

        {/* この実行は何か。
            ★ 用事は決め打ちしない。粗大ごみの実行に「転入届」と出たらそれは嘘になる —
              トレースに書いてある goal_ja をそのまま出す (절대규칙 3) */}
        <div className="card mt-8 px-6 py-4">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <Field label="サイト" value={replay.siteName} />
          <Field
            label="制約プロファイル"
            value={`${replay.profileId} v${replay.profileVersion}`}
            mono
          />
          <div>
            <div className="text-[11px] text-fg-dim">結果</div>
            <div
              className={`mt-0.5 font-bold ${
                o.tone === "clear"
                  ? "text-clear"
                  : o.tone === "blocked"
                    ? "text-blocked"
                    : o.tone === "stumble"
                      ? "text-stumble"
                      : "text-fg-dim"
              }`}
            >
              {o.ja}
            </div>
          </div>
          <Field label="クリック" value={`${replay.clicks} 回`} />
          <Field label="かかった時間" value={`${replay.seconds} 秒`} />
          </div>
          {replay.goalJa && (
            <div className="mt-3 border-t border-line pt-3">
              <div className="text-[11px] text-fg-dim">用事</div>
              <div className="mt-0.5 text-sm font-bold leading-relaxed">{replay.goalJa}</div>
            </div>
          )}
        </div>

        {/* ほかの実行 */}
        {others.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {others.map((x) => (
              <Link
                key={x.id}
                href={`/replay?run=${encodeURIComponent(x.id)}`}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                  x.on
                    ? "border-brand bg-brand/[0.08] text-brand"
                    : "border-line bg-surface text-fg-muted hover:border-brand hover:text-brand"
                }`}
              >
                {x.label}
              </Link>
            ))}
          </div>
        )}

        <div className="mt-8">
          <ReplayPlayer replay={replay} />
        </div>

        <p className="mx-auto mt-10 max-w-3xl text-center text-[11px] leading-relaxed text-fg-dim">
          再生しているのは動画ではなく、実行時に1手ずつ保存したスクリーンショットです。
          生の記録は <code className="font-mono">web/public/demo/shots/{replay.runId}/</code> にあります。
        </p>

        <div className="mt-8 flex justify-center">
          <Link
            href="/report"
            className="rounded-full border border-line bg-surface px-7 py-3.5 text-sm font-bold transition hover:border-brand hover:text-brand"
          >
            ← 結果に戻る
          </Link>
        </div>
      </div>
    </Page>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-fg-dim">{label}</div>
      <div className={`mt-0.5 font-bold ${mono ? "font-mono text-[13px]" : ""}`}>{value}</div>
    </div>
  );
}
