import Link from "next/link";
import { Page } from "@/components/Chrome";
import { loadMatrix } from "@/lib/matrix";
import { loadProfileCards } from "@/lib/profiles";
import { SiteBars } from "@/components/SiteBars";
import { RunDots } from "@/components/RunDots";

/**
 * 結果のまとめ (`/report`)。**20秒で読み終わる画面。**
 *
 * ★ 2026-08-12 신설. 원래 이 URL에는 지금 `/report/detail`에 있는 화면이 있었다.
 *   전 실행 표 + 모델 고정 실험 + 用事별 결과 + findings 237건 + 원가 + 보안 + 한계 5줄이
 *   세로로 이어져 있었다. 데이터는 전부 근거가 있는데, **어느 것이 결론인지가 안 쓰여 있었다.**
 *   심사위원은 옆에서 실행을 지켜본 사람이 아니다. 읽어 주기를 기대하면 안 된다.
 *   (③完成度・デモ의 채점 관점이 「触れて数十秒で価値がわかる」이다)
 *
 * ★ 그래서 이 화면에는 **결론과 그림 2장만** 둔다:
 *     ① 큰 숫자 3개  — 제약 없으면 끝난다 / 제약 걸면 안 끝난다 / 1회 얼마
 *     ② サイト別 横棒 — 端と端が大きく開く。「AIの限界」ではなく**サイトを測った値**である証拠
 *     ③ プロファイル別 点  — 点1つ = 1回。これで「n はいくつ」が質問にならない
 *     ④ findings 1件だけ — 「改善策まで出る」を1件で見せる。残り全部はリンクの先
 *   나머지는 전부 `/report/detail`이다. **지운 게 아니라 옮긴 것이다.**
 *
 * ★ 숫자는 여기서도 만들지 않는다. 전부 matrix.json 집계에서 온다 (절대규칙 4).
 *   사이트 이름·用事 이름도 손으로 쓰지 않는다 — 다른 用事를 돌린 날 여기만 옛날 값으로 남는다.
 */
export default function Report() {
  const m = loadMatrix();
  const cards = loadProfileCards(m?.profiles.map((p) => p.id) ?? []);

  if (!m) {
    return (
      <Page back={{ href: "/", label: "← トップへ" }}>
        <div className="mx-auto max-w-2xl px-6 py-24 text-center">
          <h1 className="text-2xl font-bold">実行データがまだありません</h1>
          <p className="mt-3 text-fg-muted">
            <code className="font-mono text-sm">npm run batch</code> のあとに
            <code className="font-mono text-sm"> npm run web:data</code> を実行してください。
          </p>
        </div>
      </Page>
    );
  }

  const cells = m.sites.flatMap((s) => s.cells);
  const ctrl = cells.filter((c) => c.profile_id === "control");
  const con = cells.filter((c) => c.profile_id !== "control");
  const ctrlReached = ctrl.filter((c) => c.reached).length;
  const conReached = con.filter((c) => c.reached).length;
  const stuck = con.length - conReached;

  // ★ 「制約なしなら終わる」는 손으로 쓰지 않는다. 대조군이 한 번도 못 간 사이트가
  //   하나라도 생기면 그 문장은 거짓이 되고, 바로 아래 큰 숫자와 모순된다.
  //   실제로 2026-08-13 재측정에서 渋谷区 대조군이 4/6이 되면서 이게 걸렸다.
  const everySiteControlReached = m.sites.every((s) => s.control_reached);

  // 「改善策まで出る」を1件で見せる。手で書いた例文は置かない — 実行が残した文だけ (절대규칙 3)
  const sample = m.sites
    .flatMap((s) => s.findings.map((f) => ({ ...f, site_name: s.site_name })))
    .find((f) => f.severity === "high" && f.fix_ja.length > 0 && f.evidence.length > 0);
  const findingsTotal = m.sites.reduce((a, s) => a + s.findings.length, 0);

  return (
    <Page back={{ href: "/", label: "← トップへ" }}>
      <div className="mx-auto w-full max-w-5xl px-6 py-14 sm:py-20">
        {/* ── 結論 ─────────────────────────────────────── */}
        <p className="text-center text-xs font-medium tracking-widest text-fg-dim">RESULT</p>
        <h1 className="mt-3 text-center text-xl font-bold leading-relaxed tracking-tight sm:text-3xl sm:leading-relaxed">
          {everySiteControlReached
            ? `どのサイトも、制約がなければ用事は終わりました。`
            : `制約がなくても終わらなかったサイトがあります。`}
          <br />
          制約をかけると、{con.length}回のうち
          <span className="text-blocked">{stuck}回</span>が終わりませんでした。
        </h1>
        <p className="mt-5 text-center text-sm leading-relaxed text-fg-muted">
          用事：{m.sites[0]?.task_ja}
          <br className="sm:hidden" />
          <span className="hidden sm:inline"> ／ </span>
          対象：{m.sites.map((s) => s.site_name).join("・")}
        </p>

        {/* ── 数字3つ ──────────────────────────────────── */}
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <Big
            label="制約なし（対照群）"
            value={Math.round((ctrlReached / ctrl.length) * 100)}
            unit="%"
            sub={`${ctrlReached} / ${ctrl.length} 回 到達`}
            tone="clear"
          />
          <Big
            label="制約あり"
            value={Math.round((conReached / con.length) * 100)}
            unit="%"
            sub={`${conReached} / ${con.length} 回 到達`}
            tone="blocked"
          />
          <Big
            label="1回あたりの実費"
            value={`$${(m.totals.cost_usd / m.totals.runs).toFixed(3)}`}
            sub={`${m.totals.runs} 回で $${m.totals.cost_usd.toFixed(2)}（APIの実費）`}
          />
        </div>

        {/* ★ 대조군이 100%가 아니면 **먼저** 말한다. 여기서 감추면 아래 표를 보다가 발견된다.
            사이트 이름도 손으로 쓰지 않는다 — 다시 돌리면 이 문장도 따라 바뀐다 */}
        {ctrlReached < ctrl.length && (
          <p className="mt-4 text-center text-xs leading-relaxed text-fg-muted">
            ⚠ 対照群も 100% ではありません。終わらなかった
            {ctrl.length - ctrlReached}回は
            {[
              ...new Set(
                m.sites
                  .filter((s) => s.cells.some((c) => c.profile_id === "control" && !c.reached))
                  .map((s) => s.site_name),
              ),
            ].join("・")}
            で、内訳は<a className="underline" href="/report/detail">詳細ページ</a>に全部出しています。
          </p>
        )}

        {/* ── ① サイト差 ──────────────────────────────── */}
        <section className="card mt-14 p-6 sm:p-8">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
            同じ制約なのに、サイトでここまで違う
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            たどり着けなかった割合。AIの限界なら、5本とも同じ長さになるはずです。
          </p>
          <div className="mt-8">
            <SiteBars sites={m.sites} />
          </div>
        </section>

        {/* ── ② 誰が止まるか ──────────────────────────── */}
        <section className="card mt-8 p-6 sm:p-8">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">誰が、どこで止まったか</h2>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            点1つが1回の実行です。いちばん上の行は、何も制約していない実行です。
          </p>
          <div className="mt-8">
            <RunDots matrix={m} cards={cards} />
          </div>
        </section>

        {/* ── ③ 直す文 ────────────────────────────────── */}
        {sample && (
          <section className="card mt-8 p-6 sm:p-8">
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
              止まった場所には、直す文が付きます
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              全 {findingsTotal} 件のうちの1件です。文はすべて実行が残した記録で、
              こちらで書き足したものはありません。
            </p>

            <div className="mt-6 rounded-2xl border border-line bg-surface-2 p-5 sm:p-6">
              <div className="text-[11px] text-fg-dim">
                {sample.site_name} ／ {sample.profile_id} ／ {sample.step_n} 手目
              </div>
              <p className="mt-3 font-bold leading-relaxed">{sample.cause_ja}</p>

              <div className="mt-4 rounded-xl border border-brand/25 bg-surface px-4 py-3">
                <div className="text-[11px] font-bold text-brand">こう直す</div>
                <p className="mt-1 text-sm leading-relaxed">{sample.fix_ja}</p>
              </div>

              {/* ★ 근거 없는 지적은 버그다. 예시로 내보낼 때도 근거를 떼지 않는다 */}
              <ul className="mt-4 space-y-1">
                {sample.evidence.map((e) => (
                  <li key={e} className="text-[11px] leading-relaxed text-fg-dim">
                    ・{e}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ── 出口 ─────────────────────────────────────── */}
        <div className="mt-14 flex flex-wrap justify-center gap-3">
          <Link
            href="/report/detail"
            className="brand-solid rounded-full px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-brand/20 transition hover:brightness-110"
          >
            全部のデータを見る
          </Link>
          <Link
            href="/replay"
            className="rounded-full border border-line bg-surface px-7 py-3.5 text-sm font-bold transition hover:border-brand hover:text-brand"
          >
            迷った様子を再生する
          </Link>
        </div>

        {/* ★ 한계로 가는 길을 여기서 끊지 않는다. 감추면 質疑에서 무너진다 */}
        <p className="mt-6 text-center text-sm">
          <Link href="/report/detail#honesty" className="text-fg-muted underline hover:text-fg">
            この数値の限界を先に読む
          </Link>
        </p>
      </div>
    </Page>
  );
}

function Big({
  label,
  value,
  unit,
  tone,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  tone?: "clear" | "blocked";
  sub?: string;
}) {
  const color = tone === "clear" ? "text-clear" : tone === "blocked" ? "text-blocked" : "text-fg";
  return (
    <div className="card px-6 py-5">
      <div className="text-xs font-medium text-fg-dim">{label}</div>
      <div className={`tnum mt-1.5 text-4xl font-bold ${color}`}>
        {value}
        {unit && <span className="ml-0.5 text-xl font-bold">{unit}</span>}
      </div>
      {sub && <div className="mt-1.5 text-[11px] text-fg-dim">{sub}</div>}
    </div>
  );
}
