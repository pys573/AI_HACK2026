/**
 * A-7 · 트레이스에서 「걸린 자리」를 기계적으로 찾아낸다.
 *
 * ★ 이 파일이 존재하는 이유는 하나다 — **숫자를 LLM에게 만들게 하지 않기 위해서.**
 *
 *   「이 트레이스를 보고 문제점을 찾아줘」라고 모델에게 던지면 문장은 훌륭하게 나온다.
 *   그리고 그 안의 숫자는 **지어낸 것이다.** 「要素が270個あり9個しか見えず」라고
 *   써 있는데 실제로는 271과 20이면, ⑥ 심사에서 「이 숫자 어디서 나왔나요」에
 *   답할 수 없다. 그 순간 리포트 전체가 무효가 된다 (절대규칙 4).
 *
 *   그래서 나눈다:
 *     signals.ts  숫자·위치·심각도를 **코드가** 만든다. LLM을 부르지 않는다. 원가 0.
 *     diagnose.ts 그 사실만 주고 **일본어 문장만** 모델에게 쓰게 한다.
 *
 *   심사에서의 답: 「숫자는 코드가 만들었습니다. 모델은 설명문만 썼습니다.」
 *
 * ⚠️ 여기서 검출하지 못하는 걸림은 리포트에 나오지 않는다. 그건 **과소 보고**이고,
 *   절대규칙 2가 요구하는 오차 방향이다. 지어내서 채우지 않는다.
 */

import type { RunTrace, Step } from "../../core/types.ts";
import { MASK_CHAR } from "../../lexicon/src/mask.ts";

export type SignalKind =
  /** 떠났다가 같은 페이지로 돌아왔다 = 길을 잘못 들었다는 걸 본인이 알아챘다 */
  | "revisit"
  /** 같은 페이지에서 스크롤만 계속했다 = 찾는 것이 화면에 없다 */
  | "scroll_run"
  /** 누르려 했는데 안 눌렸다 = 우리 도구 또는 사이트 쪽 문제 */
  | "action_failed"
  /** 첫 화면에 들어온 조작요소가 거의 없다 = 확대·좁은 화면의 실체 */
  | "viewport_starved"
  /** 링크 라벨 안의 말이 가려졌다 = 어휘 장벽. 그 링크를 안 눌렀을 때만 센다 */
  | "masked_control"
  /** 끝내 도달하지 못했다 */
  | "unreached";

export type Signal = {
  kind: SignalKind;
  /** 몇 번째 스텝에서 시작됐는가 */
  step_n: number;
  url: string;
  /** ★ 코드가 실측치로 조립한 문장. 모델은 이 숫자를 바꿀 수 없다 */
  evidence: string[];
  /** 이 걸림이 잡아먹은 스텝 수. 리포트 정렬의 축이다 */
  wasted_steps: number;
  /**
   * ★ 심각도도 **코드가** 정한다. 모델에게 물으면 같은 트레이스에도 매번 다른 답이 오고,
   *   그러면 실행 간 비교가 성립하지 않는다. 기준은 종류마다 다르고 전부 아래에 적어뒀다.
   */
  severity: Severity;
  /**
   * 계측 쪽 고장이라면 그 이유. 채워져 있으면 **리포트에 싣지 않는다** — 사이트 탓이 아니다.
   * 지우지는 않는다. 몇 건을 왜 뺐는지 화면에 적기 위해 남긴다 (절대규칙 3).
   */
  ours?: string;
};

export type Severity = "high" | "medium" | "low";

/** 리포트에 싣는 개수. 넘치면 **버렸다고 적는다** — 조용히 자르면 「전부 봤다」로 읽힌다 */
export const MAX_SIGNALS = 6;

const pageOf = (s: Step) => s.seen.url;

/**
 * ★ 계측 쪽 고장인가.
 *
 * 사이트 탓이 아닌 것을 사이트 탓으로 리포트에 실으면 그건 페이크다 (절대규칙 3).
 * 우리 파서가 깨졌는데 「이 사이트에서 조작이 실패했습니다」라고 납품하면
 * 반증당하는 순간 리포트 전체의 신뢰가 없어진다.
 *
 * 실측(08/11): 이 문자열들이 실제로 트레이스에 남아 있었다.
 * 한국어 에러 문구가 그대로 일본어 리포트에 실리고 있었던 것도 여기서 같이 막힌다.
 *
 * report.ts의 toolFailure()와 같은 규율이다. 합치지 않는 이유는 저쪽이 **실행 단위**,
 * 여기가 **스텝 단위**라서다 — 보는 문자열만 같다.
 */
const OURS: Array<[needle: string, why: string]> = [
  ["createTreeWalker", "관측 중 body null (08/11 수정)"],
  ["429", "OrcaRouter 무료 한도"],
  ["알 수 없는 액션", "모델이 스키마 밖 action을 냈다"],
  ["schema를 요구했으나", "모델이 스키마를 안 지켰다"],
  ["画面にない番号", "모델이 화면에 없는 번호를 냈다"],
  ["요소", "화면 목록에서 그 번호를 못 찾았다"],
  ["화면 밖 좌표", "우리 좌표 계산"],
  ["guard:", "우리 가드가 막았다 (절대규칙 5 — 읽기 전용)"],
  ["Timeout", "브라우저 타임아웃"],
];

function selfInflicted(text: string | undefined | null): string | null {
  if (!text) return null;
  return OURS.find(([n]) => text.includes(n))?.[1] ?? null;
}

/** 심판 사유가 길면 프롬프트를 잡아먹는다. 잘랐다는 것을 남기고 자른다 */
function brief(s: string | undefined | null, max = 200): string {
  const t = (s ?? "(記録なし)").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…(以下略)` : t;
}

/** 스텝 범위를 사람이 읽는 형태로. 「3」이 아니라 「ステップ3〜7」 */
function span(from: number, to: number): string {
  return from === to ? `ステップ${from}` : `ステップ${from}〜${to}`;
}

/**
 * 떠났다가 돌아온 페이지.
 *
 * 같은 URL이 연속으로 이어지는 건 「머물렀다」이지 「돌아왔다」가 아니다.
 * 끊긴 블록이 2개 이상일 때만 주회로 센다 — 스크롤 체류와 섞으면 전부 주회가 된다.
 */
function revisits(steps: Step[]): Signal[] {
  const blocks = new Map<string, Array<{ from: number; to: number }>>();
  for (const s of steps) {
    const u = pageOf(s);
    const b = blocks.get(u) ?? [];
    const last = b[b.length - 1];
    if (last && last.to === s.n - 1) last.to = s.n;
    else b.push({ from: s.n, to: s.n });
    blocks.set(u, b);
  }

  const out: Signal[] = [];
  for (const [url, b] of blocks) {
    if (b.length < 2) continue;
    // 첫 방문은 낭비가 아니다. 두 번째 블록부터가 되돌아온 몫이다
    const wasted = b.slice(1).reduce((a, x) => a + (x.to - x.from + 1), 0);
    out.push({
      kind: "revisit",
      step_n: b[1].from,
      url,
      evidence: [
        `同じページに${b.length}回入っている（${b.map((x) => span(x.from, x.to)).join(" / ")}）`,
        `そのうち${wasted}ステップは一度離れたあとに戻ってきたもの`,
      ],
      wasted_steps: wasted,
      // 한 번 되돌아온 건 흔하다. 네 스텝 넘게 되돌아왔으면 그건 길이 안 보인다는 뜻이다
      severity: wasted >= 4 ? "high" : wasted >= 2 ? "medium" : "low",
    });
  }
  return out;
}

/**
 * 같은 페이지에서 스크롤만 3회 이상 이어진 구간.
 * 세로·가로를 한 덩어리로 본다 — 사람 쪽에서 보면 둘 다 「찾느라 계속 밀고 있다」다.
 */
const isScroll = (s: Step) => s.action?.kind === "scroll" || s.action?.kind === "scroll_side";

function scrollRuns(steps: Step[]): Signal[] {
  const out: Signal[] = [];
  let run: Step[] = [];

  const flush = () => {
    if (run.length >= 3) {
      const first = run[0];
      const vert = run.filter((s) => s.action?.kind === "scroll");
      const side = run.filter((s) => s.action?.kind === "scroll_side");
      const down = vert.filter((s) => (s.action?.delta ?? 0) > 0).length;
      const up = vert.length - down;
      // 화면에 몇 개가 보였는지를 같이 낸다 — 「왜 못 찾았나」의 근거가 여기 있다
      const seen = Math.round(run.reduce((a, s) => a + s.seen.elements.length, 0) / run.length);
      out.push({
        kind: "scroll_run",
        step_n: first.n,
        url: pageOf(first),
        evidence: [
          // 가로가 0이면 문구는 예전과 한 글자도 다르지 않다 — 기존 트레이스의 소견이 안 바뀐다
          `${span(first.n, run[run.length - 1].n)}で、同じページをスクロールし続けている` +
            `（下${down}回・上${up}回${side.length ? `・横${side.length}回` : ""}）`,
          `この間の1画面あたりの操作要素は平均${seen}個`,
          ...(up > 0 ? [`途中で上に戻っている（${up}回）= 通り過ぎたと本人が判断している`] : []),
          // 가로로 밀었다는 것은 창에 안 들어간 부분을 찾고 있었다는 뜻이다. 원인이 다르므로 따로 적는다
          ...(side.length
            ? [`横に${side.length}回動かしている = 画面に収まりきらない部分を探している`]
            : []),
        ],
        wasted_steps: run.length,
        // 3회는 「내려보는 중」이다. 6회면 그 페이지에 찾는 게 없다는 뜻이다
        severity: run.length >= 6 ? "high" : "medium",
      });
    }
    run = [];
  };

  for (const s of steps) {
    const cont = isScroll(s) && run.length > 0 && pageOf(run[run.length - 1]) === pageOf(s);
    if (isScroll(s) && (run.length === 0 || cont)) run.push(s);
    else {
      flush();
      if (isScroll(s)) run = [s];
    }
  }
  flush();
  return out;
}

/**
 * 조작이 실패한 스텝. **전부 우리 쪽으로 분류한다.**
 *
 * ★ 처음에는 알려진 문구만 빼는 목록 방식이었다. 실측(08-11)으로 트레이스에 남은
 *   action_error를 전부 뽑아보니 **사이트 탓인 것이 하나도 없었다** — 우리 파서,
 *   우리 좌표, 우리 가드, 모델의 스키마 위반뿐이다.
 *
 *   사이트가 원인인 조작 실패는 애초에 여기로 오지 않는다. 배너가 링크를 덮어
 *   엉뚱한 것이 눌린 경우는 `action_ok: true`로 성공 처리되고(act.ts:192),
 *   그 결과는 주회·스크롤로 나타난다. 그쪽이 진짜 사용성 데이터다.
 *
 *   그래서 목록 방식을 뒤집는다. 목록은 새 문구가 나올 때마다 **모르는 것을
 *   사이트 탓으로 흘려보낸다.** 기본을 「우리 쪽」으로 두면 그 사고가 구조적으로 막힌다.
 *   원인을 아는 것은 이름을 적고, 모르는 것은 모른다고 적는다 (절대규칙 2).
 */
function actionFailures(steps: Step[]): Signal[] {
  return steps
    .filter((s) => s.action && !s.action_ok)
    .map((s) => ({
      kind: "action_failed" as const,
      step_n: s.n,
      url: pageOf(s),
      evidence: [
        `${span(s.n, s.n)}の操作(${s.action!.kind})が失敗した`,
        `エラー: ${brief(s.action_error, 120)}`,
      ],
      wasted_steps: 1,
      severity: "medium" as const,
      ours: selfInflicted(s.action_error) ?? "원인 미상 — 사이트 탓으로 단정하지 않는다",
    }));
}

/**
 * 첫 화면에 들어온 조작요소가 거의 없는 페이지.
 *
 * 실행당 **가장 심한 곳 하나만** 낸다. 전부 내면 확대 프로필의 리포트가
 * 이 신호로 뒤덮여서 정작 어디가 문제인지 안 보인다.
 * 조건: 화면 안 비율 10% 미만 + 그 페이지에서 실제로 스크롤이 일어났다.
 */
function viewportStarved(steps: Step[]): Signal[] {
  const scrolled = new Set(steps.filter(isScroll).map(pageOf));
  const cand = steps
    .filter((s) => scrolled.has(pageOf(s)) && s.constraint.elements_total > 0)
    .map((s) => ({ s, ratio: s.constraint.elements_in_viewport / s.constraint.elements_total }))
    .filter((x) => x.ratio < 0.1)
    .sort((a, b) => a.ratio - b.ratio);

  const worst = cand[0];
  if (!worst) return [];
  const c = worst.s.constraint;
  const pct = Math.round(worst.ratio * 100);
  return [{
    kind: "viewport_starved",
    step_n: worst.s.n,
    url: pageOf(worst.s),
    evidence: [
      `${span(worst.s.n, worst.s.n)}の時点で、ページ内の操作要素${c.elements_total}個のうち画面に入っていたのは${c.elements_in_viewport}個（${pct}%）`,
      `残りに触れるにはスクロールが要る`,
      `同じ条件で画面に入らなかった要素は${c.elements_total - c.elements_in_viewport}個`,
    ],
    // 스크롤 낭비 자체는 scroll_run이 센다. 여기서 또 세면 심각도가 두 번 붙는다
    wasted_steps: 0,
    // ★ 심각도는 낭비 스텝이 아니라 **차단 비율**로 낸다.
    //   구조적으로 화면에 안 들어오는 것은 그 자체가 결과이지, 몇 번 스크롤했는지의 함수가 아니다.
    severity: pct < 5 ? "high" : "medium",
  }];
}

/**
 * 링크·버튼 라벨 안의 말이 가려진 자리.
 *
 * ★ 그 스텝에서 **그 링크를 누르지 않았을 때만** 센다.
 *   가려졌는데도 눌렀다면 그건 장벽이 아니라 「가려도 통했다」는 반증이다.
 *   반증을 장벽으로 세면 어휘 축 전체가 거짓말이 된다 (절대규칙 2).
 */
function maskedControls(steps: Step[]): Signal[] {
  // ★ 스텝마다 하나씩 내면 안 된다. 「サイト」가 4스텝에 걸쳐 보였다고 문제가 4개인 게 아니다.
  //   실측: 그렇게 냈더니 senior-70s 리포트가 같은 말 4줄로 채워지고 정작 중요한 신호가 잘려나갔다.
  //   **말 단위로 하나**만 내고, 몇 화면에 걸쳐 있었는지를 근거에 적는다.
  const byWord = new Map<string, { steps: number[]; url: string; m: Step["constraint"]["masked"][number] }>();

  for (const s of steps) {
    const hits = s.constraint.masked.filter((m) => m.in_control);
    if (!hits.length) continue;
    // 가려진 라벨을 그대로 눌렀다면, 그 화면에서 어휘는 장벽이 아니었다.
    // 어느 말이 걸렸는지까지는 특정할 수 없으므로 이 스텝은 통째로 세지 않는다 (절대규칙 2 — 과소 보고 쪽).
    const clicked = s.action?.kind === "click" ? s.seen.elements.find((e) => e.index === s.action!.index)?.name ?? "" : "";
    if (clicked.includes(MASK_CHAR)) continue;

    for (const m of hits) {
      const e = byWord.get(m.surface);
      if (e) {
        if (e.steps[e.steps.length - 1] !== s.n) e.steps.push(s.n);
      } else {
        byWord.set(m.surface, { steps: [s.n], url: pageOf(s), m });
      }
    }
  }

  return [...byWord.entries()].flatMap(([surface, { steps: ns, url, m }]) => {
    const basis = basisLine(m);
    if (!basis) return []; // 출처를 댈 수 없으면 싣지 않는다 (아래 basisLine 주석)
    return [{
    kind: "masked_control" as const,
    step_n: ns[0],
    url,
    evidence: [
      `「${surface}」がリンク・ボタンのラベルに含まれており、${ns.length}画面（${ns.map((n) => `ステップ${n}`).join(" / ")}）で読めない状態だった`,
      basis,
    ],
    // 낭비 스텝은 여기서 세지 않는다. 뒤따르는 주회·스크롤이 이미 센다
    wasted_steps: 0,
    // ★ 「이 말 때문에 실패했다」는 인과를 우리는 주장하지 않는다(profiles/README.md).
    //   말할 수 있는 것은 「몇 화면에 걸쳐 있었나」뿐이다. 그래서 high로 올리지 않는다.
    severity: ns.length >= 3 ? ("medium" as const) : ("low" as const),
    }];
  });
}

/**
 * 마스킹의 출처 한 줄.
 *
 * ★ **직접 조립하지 않는다.** `evidence_ja`는 `MaskRecord`의 필수 필드이고(core/types.ts:139),
 *   `lexicon/src/mask.ts`의 `evidence()`가 만든다. 출처를 아는 것은 저쪽 하나뿐이다.
 *
 *   실측(08-11, D 지적): 여기서 손으로 다시 조립하다가 두 군데를 틀렸다.
 *     · 08-10 트레이스에는 `basis`가 없다 — `evidence_ja`가 더 오래된 필드다.
 *       `basis`로 분기하니 이해율 근거인 「サイト」가 명단 쪽으로 새어
 *       「やさしい日本語 書き換え例 No.undefined（出入国在留管理庁）」가 찍혔다.
 *       **없는 명단 번호를, 그 말을 실은 적 없는 관청 이름으로 인용한 것이다.**
 *     · 이해율의 출처를 「外来語言い換え提案 2003-2006」이라고 썼는데
 *       실제 자료는 「外来語定着度調査」다. 둘은 다른 조사다.
 *
 *   지어낸 출처는 근거가 아니라 거짓말이다 (절대규칙 4). 그래서 **그대로 옮긴다.**
 *
 * 옛 기록을 위한 재구성은 `basis` 대신 **값의 존재**로 판정한다(D의 `basisOf()`와 같은 규율).
 * 그래도 못 정하면 신호를 버린다 — 오차는 언제나 과소 보고 쪽으로 (절대규칙 2).
 */
function basisLine(m: Step["constraint"]["masked"][number]): string | null {
  if (m.evidence_ja?.trim()) return m.evidence_ja.trim();
  if (typeof m.comprehension === "number") {
    return `${m.cohort === "senior" ? "60歳以上" : "全体"}の理解率 ${m.comprehension}%（国立国語研究所 外来語定着度調査）`;
  }
  if (m.listing) return `『やさしい日本語 書き換え例』(出入国在留管理庁・文化庁 2020) 収録語 No.${m.listing.no}`;
  return null;
}

/**
 * 끝내 도달하지 못했다. 마지막에 어디에 있었는지가 리포트의 결론이다.
 *
 * ⚠️ 단, 실행이 **우리 쪽 고장으로 끊긴 것**이라면 「이 사이트에서 도달하지 못했다」가 아니다.
 *   그건 우리가 못 잰 것이지 사용자가 못 한 것이 아니다. 구분하지 않으면 未到達率이 부풀고,
 *   그 숫자가 그대로 발표 슬라이드에 올라간다.
 */
function unreached(trace: RunTrace): Signal[] {
  if (trace.verdict.reached) return [];
  const last = trace.steps[trace.steps.length - 1];
  const v = trace.verdict;
  return [{
    kind: "unreached",
    step_n: last?.n ?? 0,
    url: last ? pageOf(last) : trace.mission.start_url,
    evidence: [
      `${trace.steps.length}ステップ・クリック${v.clicks}回・${v.seconds}秒を使って到達できなかった（outcome: ${v.outcome}）`,
      `最後にいたページ: ${last ? last.seen.title || pageOf(last) : "(なし)"}`,
      `審判の判断: ${brief(v.reason_ja)}`,
    ],
    wasted_steps: trace.steps.length,
    // 도달 못 한 것보다 나쁜 결과는 없다. 예외 없이 high
    severity: "high",
    ours: selfInflicted(v.reason_ja) ?? undefined,
  }];
}

/**
 * LLM을 부르지 않는다. 원가 0. 같은 트레이스에 대해 **언제 돌려도 같은 결과**다.
 * 반환 순서 = 심각한 순. 앞에서 잘라도 중요한 게 남는다.
 *
 * 세 갈래로 나눠서 돌려준다. 어느 쪽도 조용히 사라지지 않는다:
 *   signals  리포트에 싣는다 (사이트에서 실제로 걸린 자리)
 *   ours     우리 계측 고장이라 뺐다 — **개수와 이유를 화면에 적는다**
 *   dropped  상한을 넘어 잘렸다 — 개수를 화면에 적는다
 */
export function detectSignals(trace: RunTrace): { signals: Signal[]; ours: Signal[]; dropped: number } {
  const s = trace.steps;
  const rank = { high: 0, medium: 1, low: 2 };
  const all = [
    ...unreached(trace),
    ...revisits(s),
    ...scrollRuns(s),
    ...actionFailures(s),
    ...viewportStarved(s),
    ...maskedControls(s),
  ].sort((a, b) => rank[a.severity] - rank[b.severity] || b.wasted_steps - a.wasted_steps || a.step_n - b.step_n);

  const ours = all.filter((x) => x.ours);
  const site = all.filter((x) => !x.ours);
  return { signals: site.slice(0, MAX_SIGNALS), ours, dropped: Math.max(0, site.length - MAX_SIGNALS) };
}
