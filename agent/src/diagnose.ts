/**
 * A-7 · 검출된 신호에 일본어 설명을 붙여 Finding으로 만든다.
 *
 * ★ 이 파일이 모델에게 주지 않는 것: **트레이스**.
 *   트레이스를 통째로 주면 모델은 반드시 자기가 센 숫자를 쓴다. 그리고 그건 틀린다.
 *   여기가 주는 것은 `signals.ts`가 실측으로 만든 문장뿐이고,
 *   모델이 돌려주는 것은 `cause_ja`(왜 막혔나)와 `fix_ja`(뭘 고치면 되나) 두 개다.
 *
 *   step_n · url · evidence · severity는 **전부 코드가 채운다.** 모델은 못 건드린다.
 *   그래서 「이 숫자 어디서 나왔나요」에 답할 수 있다 (절대규칙 4).
 *
 * 왜 opus인가: 이 실행에서 LLM이 문장을 쓰는 곳은 여기 한 번뿐이고,
 * 그 문장이 그대로 고객에게 가는 납품물이다. 스텝마다 도는 decide와는 원가 성격이 다르다.
 * (모델 선택 자체는 B의 `llm/routing.ts` step_type=diagnose가 갖는다)
 */

import { complete } from "../../llm/orca.ts";
import type { CostRecord, Finding, RunTrace } from "../../core/types.ts";
import { detectSignals, type Signal } from "./signals.ts";

export const DIAGNOSE_SYSTEM = [
  "あなたは公共ウェブサイトの改善提案をまとめる担当者です。",
  "",
  "利用者が実際にサイトを操作した記録から、機械的に「詰まった箇所」を抽出しました。",
  "各箇所について、原因(cause_ja)と改善案(fix_ja)を日本語で書いてください。",
  "",
  "守ること:",
  "- 与えられた事実(evidence)だけを根拠にしてください。数値を自分で作らないでください。",
  "- cause_ja には数値を書かないでください。数値は evidence 側にすでにあります。",
  "- 利用者の年齢・障害・国籍などを推測して書かないでください。分かっているのは「どういう条件で見ていたか」だけです。",
  "- fix_ja は、そのサイトの運営者が今週着手できる具体的な変更を1つだけ書いてください。",
  "  「分かりやすくする」「配慮する」のような、やることが決まらない文は書かないでください。",
  "- 断定できないことは書かないでください。推測を事実として書くと提案全体が信用を失います。",
  // ✅ 2026-08-13 실측: 모델이 required는 지키면서 값을 빈 문자열로 채워 보낸 적이 있다.
  //    스키마 검사는 「키가 있는가」만 보므로 통과하고, 화면에는 「説明の生成に失敗」만 남았다
  "- 「詰まった箇所」の数だけ項目を作り、番号(n)は 1 から順に必ず対応させてください。",
  "- cause_ja と fix_ja を空文字にしないでください。書けない箇所があれば、その項目自体を出さないでください。",
].join("\n");

/**
 * 배열 하나를 통째로 받는다. 신호마다 호출하면 원가가 n배가 되고,
 * 무엇보다 **모델이 서로 겹치는 제안을 낸다** — 전체를 한 번에 봐야 중복을 스스로 피한다.
 *
 * ⚠️ maxItems는 넣지 않는다. 스키마 항목을 지키지 않는 모델이 실제로 있고(B 실측),
 *   개수는 어차피 코드가 신호 수로 정한다.
 */
export const DIAGNOSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          n: { type: "integer", description: "対応する「詰まった箇所」の番号" },
          cause_ja: { type: "string", description: "何が利用者を止めたのか。1〜2文" },
          fix_ja: { type: "string", description: "何を変えれば解消するのか。具体的に1つ" },
        },
        required: ["n", "cause_ja", "fix_ja"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

/** 모델이 보는 전부. 트레이스도 프로필 이름도 없다 — 사실만 있다 */
export function diagnoseUser(trace: RunTrace, signals: Signal[]): string {
  const p = trace.mission;
  return [
    `## 利用者の用事`,
    p.intent_ja,
    ``,
    `## どういう条件で画面を見ていたか`,
    // ★ 「72歳」ではなく **制約スペック** を書く。ここが発表禁止語との境界線だ
    conditionLines(trace).map((l) => `- ${l}`).join("\n"),
    ``,
    `## 機械的に抽出した「詰まった箇所」`,
    ...signals.map((s, i) =>
      [
        ``,
        `### ${i + 1}. ${label(s.kind)}`,
        `URL: ${s.url}`,
        ...s.evidence.map((e) => `- ${e}`),
      ].join("\n"),
    ),
  ].join("\n");
}

function label(k: Signal["kind"]): string {
  return {
    revisit: "同じページに戻ってきている",
    scroll_run: "スクロールを続けている",
    action_failed: "操作が失敗した",
    viewport_starved: "画面に入る操作要素が少ない",
    masked_control: "リンクのラベルに読めない語がある",
    unreached: "最後まで到達できなかった",
  }[k];
}

/**
 * 「누가」가 아니라 「어떤 조건으로 봤는가」를 쓴다.
 * 프로필 이름(senior-70s)조차 넣지 않는다 — 넣는 순간 모델이 나이를 추측해서 문장에 쓴다.
 */
function conditionLines(trace: RunTrace): string[] {
  const s1 = trace.steps[0];
  const out: string[] = [];
  if (s1) out.push(`最初の画面に入っていた操作要素は、ページ全体${s1.constraint.elements_total}個のうち${s1.constraint.elements_in_viewport}個`);
  const words = new Set(trace.steps.flatMap((s) => s.constraint.masked).map((m) => m.surface));
  out.push(words.size ? `語彙条件により${words.size}語が読めない状態だった` : `語彙条件による伏せ字はなかった`);
  out.push(`使える操作の予算: クリック${trace.verdict.clicks}回・${trace.verdict.seconds}秒を実際に使用`);
  return out;
}

/**
 * 신호가 없으면 모델을 부르지 않는다. 원가 0.
 * 「막힌 곳이 없었다」도 결과다 — 억지로 뭔가 찾아내게 만들면 그때부터 없는 문제를 판다.
 */
export async function diagnose(trace: RunTrace): Promise<{ findings: Finding[]; costs: CostRecord[]; dropped: number; ours: Signal[] }> {
  const { signals, ours, dropped } = detectSignals(trace);
  if (!signals.length) return { findings: [], costs: [], dropped, ours };

  const user = diagnoseUser(trace, signals);
  const costs: CostRecord[] = [];

  /**
   * ★ 한 번 더 묻는 조건은 **「하나도 못 건졌을 때」뿐이다.**
   *
   *   `llm/orca.ts`의 스키마 검사는 최상위 required(=`items`가 있는가)만 본다. 그래서
   *   `{"items":[{"n":1,"cause_ja":"","fix_ja":""}]}`는 **성공으로 통과한다.** 그러면
   *   화면에는 「説明の生成に失敗」만 5줄 남는다 — 실측은 멀쩡한데 납품물만 빈손이다.
   *   실제로 2026-08-13 실행 두 건이 그랬다.
   *
   *   부분적으로 비는 것까지 다시 묻지는 않는다. 원가가 배로 들고, 무엇보다
   *   **모델이 못 쓰겠다고 한 칸을 억지로 채우게 만드는 것**은 없는 문제를 파는 짓이다.
   */
  const ask = async () => {
    const r = await complete({ step_type: "diagnose", system: DIAGNOSE_SYSTEM, user, schema: DIAGNOSE_SCHEMA });
    costs.push(r.cost);
    const items = ((r.parsed as { items?: unknown })?.items ?? []) as Array<{ n?: number; cause_ja?: string; fix_ja?: string }>;
    return new Map(
      items
        .filter((x) => typeof x.n === "number" && !!x.cause_ja?.trim())
        .map((x) => [x.n!, x]),
    );
  };

  let byN = await ask();
  if (byN.size === 0) {
    console.error("  ⚠️ 진단이 빈손으로 왔다 — 한 번만 다시 묻는다 (원가는 두 번 다 기록한다)");
    byN = await ask();
  }

  // ★ 모델이 빠뜨린 신호도 **버리지 않는다.** 설명이 없는 채로 실린다.
  //   빠뜨린 걸 조용히 지우면 「이 사이트엔 이만큼만 문제가 있었다」가 거짓이 된다.
  const findings = signals.map((s, i) => {
    const m = byN.get(i + 1);
    return {
      step_n: s.step_n,
      url: s.url,
      cause_ja: m?.cause_ja?.trim() || `${label(s.kind)}（説明の生成に失敗。根拠は下記のとおり実測値である）`,
      fix_ja: m?.fix_ja?.trim() || "",
      evidence: s.evidence,
      severity: s.severity,
    } satisfies Finding;
  });

  return { findings, costs, dropped, ours };
}
