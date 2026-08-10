import { Badge } from "./ui";
import type { RunView } from "@/lib/data";

/**
 * 첫 화면에서 30초 안에 전해야 하는 것은 하나다:
 * **같은 사이트·같은 과제·같은 모델인데, 한쪽만 도착했다.**
 * 설명보다 숫자를 먼저 보여준다.
 */
export function Hero({
  control,
  senior,
  mission,
}: {
  control: RunView;
  senior: RunView;
  mission: { intentJa: string; siteName: string; startUrl: string };
}) {
  return (
    <header className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_-10%,rgba(245,165,36,0.13),transparent)]"
      />
      <div className="relative mx-auto w-full max-w-6xl px-6 pt-16 pb-14 sm:pt-24">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight">ツマヅキ</span>
          <Badge>β</Badge>
        </div>

        <h1 className="mt-8 text-4xl font-bold leading-[1.15] tracking-tight sm:text-6xl">
          どこでツマヅくか、
          <br />
          <span className="text-stumble">10人が先に試す。</span>
        </h1>

        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-fg-muted">
          あなたのサイトを、<strong className="text-fg">明示された制約スペック</strong>
          の下でAIに操作させます。
          <br />
          「使いにくい気がする」という主観を、<strong className="text-fg">
            同一基準の計測
          </strong>
          に変えます。
        </p>

        {/* 実測であることを最初に示す。あとから言うと言い訳に聞こえる */}
        <div className="mt-10 rounded-xl border border-line bg-surface/70 p-5 backdrop-blur">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-fg-dim">
            <Badge tone="clear">実測データ</Badge>
            <span>{mission.siteName}</span>
            <span className="text-fg-dim/50">/</span>
            <span className="font-mono">{mission.startUrl}</span>
          </div>
          <p className="mt-3 text-sm text-fg-muted">
            用事: <span className="text-fg">{mission.intentJa}</span>
          </p>

          <div className="mt-6 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
            <RunHeadline run={control} tone="clear" />
            <RunHeadline run={senior} tone="stumble" />
          </div>

          <p className="mt-4 text-xs leading-relaxed text-fg-dim">
            同じサイト・同じ用事・同じ判断プロンプト。
            プロンプトには年齢も属性も一文字も書かれていません。
            違うのは<strong className="text-fg-muted">画面に届いた情報</strong>と
            <strong className="text-fg-muted">使える道具</strong>だけです。
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="#replay"
            className="rounded-lg bg-stumble px-5 py-2.5 text-sm font-bold text-ink transition hover:bg-stumble/85"
          >
            2人の探索を並べて見る
          </a>
          <a
            href="#beforeafter"
            className="rounded-lg border border-line px-5 py-2.5 text-sm font-medium text-fg-muted transition hover:border-fg-dim hover:text-fg"
          >
            AIに何が届いたのか
          </a>
        </div>
      </div>
    </header>
  );
}

function RunHeadline({ run, tone }: { run: RunView; tone: "clear" | "stumble" }) {
  const accent = tone === "clear" ? "text-clear" : "text-stumble";
  return (
    <div className="bg-surface-2 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{run.labelJa}</div>
          <div className="mt-0.5 font-mono text-[11px] text-fg-dim">
            {run.profileId} v{run.profileVersion}
          </div>
        </div>
        <Badge tone={run.reached ? "clear" : "stumble"}>
          {run.reached ? "到達 ○" : "到達 ×"}
        </Badge>
      </div>

      <div className="tnum mt-4 flex items-baseline gap-1.5">
        <span className={`text-4xl font-bold ${accent}`}>{run.clicks}</span>
        <span className="text-sm text-fg-muted">クリック</span>
        <span className="mx-1 text-fg-dim/40">/</span>
        <span className={`text-4xl font-bold ${accent}`}>{run.seconds}</span>
        <span className="text-sm text-fg-muted">秒</span>
      </div>

      <p className="mt-3 text-xs text-fg-muted">{run.outcomeJa}</p>
    </div>
  );
}
