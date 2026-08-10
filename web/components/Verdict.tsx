import type { RunView } from "@/lib/data";
import { Badge } from "./ui";

/**
 * 「도착했다」를 누가 정했는가에 답하는 섹션.
 *
 * 판정은 2중이다: ①미션에 미리 적어둔 정답 URL/문구(key) ②LLM 심판.
 * 둘이 갈리면 `disagreed: true`가 되고, 그건 숨기지 않고 화면에 띄운다.
 * ⚠️ 정답 키는 절대 프롬프트에 들어가지 않는다 — 들어가면 판정이 자기충족이 된다.
 */
export function Verdict({ runs, goalJa }: { runs: RunView[]; goalJa: string }) {
  return (
    <div>
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="text-[11px] text-fg-dim">この実行の「到達」の定義</div>
        <p className="mt-1.5 text-sm leading-relaxed">{goalJa}</p>
        <p className="mt-2 text-xs text-fg-dim">
          この文と正解ページのURLは実行前にミッションファイルに書いてあり、
          <strong className="text-fg-muted">AIには一度も渡していません</strong>。
        </p>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="bg-surface-2 text-left">
              <th className="px-4 py-3 text-xs font-medium text-fg-dim">　</th>
              {runs.map((r) => (
                <th key={r.runId} className="px-4 py-3 font-medium">
                  {r.labelJa}
                  <div className="mt-0.5 font-mono text-[11px] font-normal text-fg-dim">
                    {r.profileId} v{r.profileVersion}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-surface">
            <Row
              label="結果"
              cells={runs.map((r) => (
                <Badge key={r.runId} tone={r.reached ? "clear" : "stumble"}>
                  {r.outcomeJa}
                </Badge>
              ))}
            />
            <Row
              label="クリック"
              cells={runs.map((r) => (
                <span key={r.runId} className="tnum">
                  {r.clicks} / {r.patience.clicks}
                </span>
              ))}
            />
            <Row
              label="かかった時間"
              cells={runs.map((r) => (
                <span key={r.runId} className="tnum">
                  {r.seconds} 秒
                </span>
              ))}
            />
            <Row
              label="正解ページの一致（事前に用意した鍵）"
              cells={runs.map((r) => (
                <Mark key={r.runId} ok={r.keyMatch} />
              ))}
            />
            <Row
              label="AI審判の判定"
              cells={runs.map((r) => (
                <Mark key={r.runId} ok={r.llmMatch} />
              ))}
            />
            <Row
              label="2つの判定が割れたか"
              cells={runs.map((r) => (
                <span key={r.runId} className="text-xs">
                  {r.disagreed ? (
                    <Badge tone="blocked">割れた（要確認）</Badge>
                  ) : (
                    <span className="text-fg-dim">一致</span>
                  )}
                </span>
              ))}
            />
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {runs.map((r) => (
          <div key={r.runId} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-center gap-2">
              <Badge tone={r.reached ? "clear" : "stumble"}>
                {r.reached ? "到達 ○" : "到達 ×"}
              </Badge>
              <span className="text-xs text-fg-dim">審判の言葉</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-fg-muted">{r.reasonJa}</p>
            <div className="mt-3 font-mono text-[10px] break-all text-fg-dim">{r.runId}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ label, cells }: { label: string; cells: React.ReactNode[] }) {
  return (
    <tr className="border-t border-line-soft">
      <td className="px-4 py-3 text-xs text-fg-dim">{label}</td>
      {cells.map((c, i) => (
        <td key={i} className="px-4 py-3">
          {c}
        </td>
      ))}
    </tr>
  );
}

function Mark({ ok }: { ok: boolean }) {
  return (
    <span className={ok ? "text-clear" : "text-fg-dim"}>{ok ? "○ 一致" : "× 不一致"}</span>
  );
}
