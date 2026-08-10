/**
 * sample-run.json 생성기 (W0-5).
 *
 * ★ 왜 손으로 JSON을 쓰지 않고 스크립트로 만드는가:
 *   D(web)는 합계를 화면에 띄운다. 합계가 스텝별 값의 합과 1원이라도 다르면
 *   D는 자기 코드에 버그가 있다고 생각하고 하루를 태운다. 합계는 계산해서 넣는다.
 *
 * ★ 이건 **목업이다.** 실행해서 얻은 값이 아니다.
 *   실측인 것: 新宿区 top의 요소 270개 / 200% 줌 첫 화면 9개 / 마스킹 5건
 *              (2026-08-08 sitecheck·probe 결과, FINDINGS.md)
 *   목업인 것: 스텝 진행·LLM 문장·토큰 수·지연시간
 *   그래서 모든 CostRecord의 cost_source는 "table"이다. 실측이라 부르지 않는다.
 *
 *   node core/fixtures/build-sample.ts
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  ConstraintRecord,
  CostRecord,
  ElementView,
  Finding,
  MaskRecord,
  Mission,
  ObservationSnapshot,
  RunTrace,
  Step,
  StepType,
  ThreatRecord,
} from "../types.ts";
import { estimateCost, BASELINE_MODEL, FALLBACK_PRICES } from "../../llm/pricing.ts";

// ── 라우팅 정책(가정) ─────────────────────────────────────────
// B가 최종 결정한다. 여기서는 「step_type이 라우팅의 유일한 입력」이라는 계약만 보여준다.
const MODEL_BY_STEP: Record<StepType, string> = {
  perceive: "qwen/qwen3.7-flash",
  decide: "google/gemini-3.5-flash-lite",
  judge: "google/gemini-3.6-flash",
  diagnose: "anthropic/claude-opus-5",
};

const T0 = Date.parse("2026-08-09T11:20:00.000Z");

function cost(
  step_type: StepType,
  prompt_tokens: number,
  completion_tokens: number,
  cached_tokens: number,
  latency_ms: number,
): CostRecord {
  const model = MODEL_BY_STEP[step_type];
  const usd = estimateCost(model, prompt_tokens, completion_tokens);
  if (usd === null) throw new Error(`가격표에 없는 모델: ${model}`);
  return {
    step_type,
    model,
    prompt_tokens,
    completion_tokens,
    cached_tokens,
    // 소수 12자리에서 끊는다. 부동소수 꼬리가 화면에 뜨면 D가 반올림 버그를 의심한다
    cost_usd: Number(usd.toFixed(12)),
    cost_source: "table",
    latency_ms,
    route: step_type === "diagnose" ? "quality" : "cost",
    mode: "balanced",
    retries: 0,
  };
}

// ── 마스킹 근거 (国立国語研究所 外来語定着度調査, 60歳以上) ──
function mask(surface: string, comprehension: number, in_control: boolean): MaskRecord {
  return {
    surface,
    entry: surface,
    action: "mask",
    basis: "comprehension_rate",
    comprehension,
    cohort: "senior",
    listing: null,
    in_control,
    evidence_ja: `「${surface}」60歳以上の理解率 ${comprehension}%（国立国語研究所 外来語定着度調査 2002-2004, CC BY 4.0）`,
  };
}

const M = {
  accessibility: () => mask("アクセシビリティ", 2.1, true),
  site: () => mask("サイト", 7.8, true),
  link: () => mask("リンク", 10.4, true),
  contents: () => mask("コンテンツ", 8.8, false),
  download: () => mask("ダウンロード", 8.2, false),
  login: () => mask("ログイン", 6.4, true),
  service: () => mask("サービス", 24.6, true),
  online: () => mask("オンライン", 53.0, false), // 30% 이상 → 실제로는 마스킹 안 됨. 참고용으로 쓰지 않는다
};

/** 마스킹된 표층을 ◯로 바꾼다 (mask.ts와 동일 규칙) */
function applyMask(text: string, masks: MaskRecord[]): string {
  let out = text;
  for (const m of masks) {
    if (m.action !== "mask") continue;
    out = out.split(m.surface).join("◯".repeat(m.surface.length));
  }
  return out;
}

function el(index: number, role: string, name: string, in_viewport: boolean): ElementView {
  return { index, role, name, in_viewport };
}

type StepSpec = {
  url: string;
  title: string;
  rawText: string;
  rawElements: ElementView[];
  /** 이 화면에서 걸린 마스킹 */
  masks: MaskRecord[];
  /** 200% 줌 기준 첫 화면 요소 수 */
  inViewport: number;
  /** 전체 요소 수 */
  total: number;
  threats: ThreatRecord[];
  action: Step["action"];
  action_ok: boolean;
  action_error: string | null;
  /** 이 스텝까지 누적 클릭 / 초 */
  clicks: number;
  seconds: number;
  perceive: [number, number, number, number]; // pt, ct, cached, latency
  decide: [number, number, number, number] | null;
};

const PATIENCE_CLICKS = 12; // senior-70s v1.0 variant a
const PATIENCE_SECONDS = 480;

function snapshot(
  spec: StepSpec,
  kind: "raw" | "seen",
): ObservationSnapshot {
  const masked = kind === "seen";
  const elements = spec.rawElements.map((e) =>
    masked ? { ...e, name: applyMask(e.name, spec.masks) } : e,
  );
  return {
    url: spec.url,
    title: masked ? applyMask(spec.title, spec.masks) : spec.title,
    text: masked ? applyMask(spec.rawText, spec.masks) : spec.rawText,
    // seen은 첫 화면(뷰포트) 안의 것만 남는다 — 200% 줌이 시야를 좁힌 결과 그 자체
    elements: masked ? elements.filter((e) => e.in_viewport) : elements,
    scroll: { y: 0, height: 6400 },
    screenshot_key: null,
  };
}

function buildStep(spec: StepSpec, n: number, tsOffsetSec: number): Step {
  const raw = snapshot(spec, "raw");
  const seen = snapshot(spec, "seen");

  const constraint: ConstraintRecord = {
    profile: "senior-70s",
    profile_version: "1.0",
    masked: spec.masks,
    masked_in_controls: spec.masks.filter((m) => m.in_control).length,
    dom_text_withheld: false,
    elements_total: spec.total,
    elements_in_viewport: spec.inViewport,
    chars_before: raw.text!.length + raw.elements.reduce((s, e) => s + e.name.length, 0),
    chars_after: seen.text!.length + seen.elements.reduce((s, e) => s + e.name.length, 0),
  };

  const llm_calls: CostRecord[] = [cost("perceive", ...spec.perceive)];
  if (spec.decide) llm_calls.push(cost("decide", ...spec.decide));

  return {
    n,
    ts: new Date(T0 + tsOffsetSec * 1000).toISOString(),
    raw,
    seen,
    constraint,
    threats: spec.threats,
    action: spec.action,
    action_ok: spec.action_ok,
    action_error: spec.action_error,
    llm_calls,
    patience: {
      clicks: spec.clicks,
      clicks_left: PATIENCE_CLICKS - spec.clicks,
      seconds: spec.seconds,
      seconds_left: PATIENCE_SECONDS - spec.seconds,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// 시나리오: 転入手続きを調べる → たどり着けない
// ─────────────────────────────────────────────────────────────

const TOP_ELEMENTS: ElementView[] = [
  el(0, "link", "新宿区ホームページ", true),
  el(1, "link", "文字サイズ・色合いの変更", true),
  el(2, "link", "サイトマップ", true),
  el(3, "textbox", "検索キーワードを入力", true),
  el(4, "button", "検索", true),
  el(5, "link", "やさしい日本語", true),
  el(6, "link", "Foreign Languages", true),
  el(7, "link", "ウェブアクセシビリティ方針", true),
  el(8, "link", "新型感染症に関するお知らせ", true),
  // ↓ 여기부터는 첫 화면 밖 (200% 줌). 실측: 첫 화면 9개 / 전체 270개
  el(9, "link", "くらし・手続き", false),
  el(10, "link", "子育て・教育", false),
  el(11, "link", "健康・福祉", false),
  el(12, "link", "区政情報", false),
  el(13, "link", "事業者向け情報", false),
  el(14, "link", "施設案内", false),
  el(15, "link", "オンラインサービス", false),
  el(16, "link", "各種申請書ダウンロード", false),
];

const KURASHI_ELEMENTS: ElementView[] = [
  el(0, "link", "戸籍・住民登録", true),
  el(1, "link", "税金", true),
  el(2, "link", "国民健康保険", true),
  el(3, "link", "国民年金", true),
  el(4, "link", "ごみ・リサイクル", true),
  el(5, "link", "住まい", true),
  el(6, "link", "マイナンバーカード", true),
  el(7, "link", "各種証明書のコンビニ交付サービス", true),
  el(8, "link", "オンライン申請", false),
  el(9, "link", "申請書ダウンロード", false),
];

const MYNUMBER_ELEMENTS: ElementView[] = [
  el(0, "link", "マイナンバーカードの申請方法", true),
  el(1, "link", "マイナンバーカードの受け取り", true),
  el(2, "link", "電子証明書の更新", true),
  el(3, "link", "マイナポータルへのログイン", true),
  el(4, "link", "よくある質問", true),
  el(5, "link", "戻る", true),
];

const KOSEKI_ELEMENTS: ElementView[] = [
  el(0, "link", "住民異動届（転入・転出・転居）", true),
  el(1, "link", "戸籍の届出", true),
  el(2, "link", "印鑑登録", true),
  el(3, "link", "各種証明書の請求", true),
  el(4, "link", "コンビニ交付サービス", true),
  el(5, "link", "郵送請求", true),
];

const specs: StepSpec[] = [
  {
    url: "https://www.city.shinjuku.lg.jp/",
    title: "新宿区ホームページ",
    rawText:
      "新宿区ホームページへようこそ。このサイトでは区の行政サービスに関するコンテンツをご案内しています。各種申請書はダウンロードしてご利用いただけます。ウェブアクセシビリティ方針に基づき、すべての方がご利用いただけるよう努めています。",
    rawElements: TOP_ELEMENTS,
    masks: [M.accessibility(), M.site(), M.contents(), M.download(), M.service()],
    inViewport: 9,
    total: 270,
    threats: [],
    action: {
      kind: "scroll",
      delta: 700,
      reason_ja:
        "見えている項目は「◯◯◯マップ」や「ウェブ◯◯◯◯◯◯◯◯方針」など、引っ越しの手続きとは関係がなさそうです。下に何かあるか見てみます。",
    },
    action_ok: true,
    action_error: null,
    clicks: 0,
    seconds: 18,
    perceive: [1840, 126, 0, 610],
    decide: [2180, 188, 1536, 1240],
  },
  {
    url: "https://www.city.shinjuku.lg.jp/",
    title: "新宿区ホームページ",
    rawText:
      "くらし・手続き / 子育て・教育 / 健康・福祉 / 区政情報 / 事業者向け情報 / 施設案内 / オンラインサービス / 各種申請書ダウンロード",
    rawElements: TOP_ELEMENTS.map((e) => ({ ...e, in_viewport: e.index >= 9 && e.index <= 16 })),
    masks: [M.online(), M.download(), M.service()],
    inViewport: 8,
    total: 270,
    threats: [],
    action: {
      kind: "click",
      index: 9,
      reason_ja: "「くらし・手続き」が一番それらしいので押してみます。",
    },
    action_ok: true,
    action_error: null,
    clicks: 1,
    seconds: 41,
    perceive: [1610, 108, 1536, 540],
    decide: [1930, 164, 1536, 1080],
  },
  {
    url: "https://www.city.shinjuku.lg.jp/kurashi/",
    title: "くらし・手続き",
    rawText:
      "戸籍・住民登録、税金、国民健康保険、国民年金、ごみ・リサイクル、住まい、マイナンバーカード、各種証明書のコンビニ交付サービス。オンライン申請もご利用いただけます。申請書ダウンロードはこちら。",
    rawElements: KURASHI_ELEMENTS,
    masks: [M.service(), M.download(), M.online()],
    inViewport: 8,
    total: 96,
    threats: [],
    action: {
      kind: "click",
      index: 6,
      reason_ja:
        "引っ越しの手続きというと、マイナンバーカードが要ると聞いたことがあります。そこを見てみます。",
    },
    action_ok: true,
    action_error: null,
    clicks: 2,
    seconds: 78,
    perceive: [1420, 102, 1536, 500],
    decide: [1760, 210, 1536, 1310],
  },
  {
    url: "https://www.city.shinjuku.lg.jp/kurashi/mynumber.html",
    title: "マイナンバーカード",
    rawText:
      "マイナンバーカードの申請方法、受け取り、電子証明書の更新について。マイナポータルへのログインには電子証明書が必要です。",
    rawElements: MYNUMBER_ELEMENTS,
    masks: [M.login()],
    inViewport: 6,
    total: 54,
    threats: [],
    action: {
      kind: "back",
      reason_ja:
        "ここは引っ越しの話ではなさそうです。カードの作り方ばかり書いてあります。前のページに戻ります。",
    },
    action_ok: true,
    action_error: null,
    clicks: 3,
    seconds: 126,
    perceive: [1180, 96, 1536, 470],
    decide: [1520, 176, 1536, 1150],
  },
  {
    url: "https://www.city.shinjuku.lg.jp/kurashi/",
    title: "くらし・手続き",
    rawText:
      "戸籍・住民登録、税金、国民健康保険、国民年金、ごみ・リサイクル、住まい、マイナンバーカード、各種証明書のコンビニ交付サービス。オンライン申請もご利用いただけます。申請書ダウンロードはこちら。",
    rawElements: KURASHI_ELEMENTS,
    masks: [M.service(), M.download(), M.online()],
    inViewport: 8,
    total: 96,
    threats: [],
    action: {
      kind: "click",
      index: 5,
      reason_ja:
        "引っ越しは住むところの話なので「住まい」でしょうか。ほかに引っ越しと書いてある項目が見当たりません。",
    },
    action_ok: true,
    action_error: null,
    clicks: 4,
    seconds: 171,
    perceive: [1420, 102, 1536, 480],
    decide: [1780, 232, 1536, 1420],
  },
  {
    url: "https://www.city.shinjuku.lg.jp/kurashi/sumai.html",
    title: "住まい",
    rawText:
      "区営住宅の募集、住宅リフォームの助成、耐震診断、空き家対策についてご案内します。民間賃貸住宅にお住まいの方への支援もあります。",
    rawElements: [
      el(0, "link", "区営住宅の入居者募集", true),
      el(1, "link", "住宅リフォーム助成", true),
      el(2, "link", "耐震診断・耐震補強", true),
      el(3, "link", "空き家対策", true),
      el(4, "link", "民間賃貸住宅への支援", true),
      el(5, "link", "戻る", true),
    ],
    masks: [mask("リフォーム", 26.4, true)],
    inViewport: 6,
    total: 61,
    threats: [],
    action: {
      kind: "back",
      reason_ja: "住宅の募集の話でした。引っ越してきたときの届出のことは書いてありません。",
    },
    action_ok: true,
    action_error: null,
    clicks: 5,
    seconds: 223,
    perceive: [1090, 94, 1536, 460],
    decide: [1440, 198, 1536, 1220],
  },
  {
    url: "https://www.city.shinjuku.lg.jp/kurashi/",
    title: "くらし・手続き",
    rawText:
      "戸籍・住民登録、税金、国民健康保険、国民年金、ごみ・リサイクル、住まい、マイナンバーカード、各種証明書のコンビニ交付サービス。オンライン申請もご利用いただけます。申請書ダウンロードはこちら。",
    rawElements: KURASHI_ELEMENTS,
    masks: [M.service(), M.download(), M.online()],
    inViewport: 8,
    total: 96,
    threats: [],
    action: {
      kind: "give_up",
      reason_ja:
        "同じところを行ったり来たりしています。どれを押せばよいのか分かりません。区役所に電話して聞きます。",
    },
    action_ok: true,
    action_error: null,
    clicks: 5,
    seconds: 268,
    perceive: [1420, 102, 1536, 490],
    decide: [1810, 246, 1536, 1490],
  },
];

const steps: Step[] = specs.map((s, i) => buildStep(s, i + 1, s.seconds));

// judge와 diagnose는 마지막 스텝의 llm_calls에 붙는다 (실행 종료 시점에 1회씩)
const judgeCall = cost("judge", 1260, 96, 0, 980);
const diagnoseCall = cost("diagnose", 9640, 1480, 0, 11200);
steps[steps.length - 1].llm_calls.push(judgeCall, diagnoseCall);

const mission: Mission = {
  id: "shinjuku-tennyu",
  track: "public",
  site_id: "shinjuku",
  site_name: "新宿区",
  start_url: "https://www.city.shinjuku.lg.jp/",
  goal_ja:
    "他の市区町村から新宿区へ引っ越してきました。役所でどんな手続きが必要か、その説明が書かれたページまで行ってください。",
  intent_ja: "転入届の手続き方法と、窓口に持っていくものを知りたい",
  max_steps: 20,
};

const findings: Finding[] = [
  {
    step_n: 3,
    url: "https://www.city.shinjuku.lg.jp/kurashi/",
    cause_ja:
      "転入手続きの入口が「戸籍・住民登録」という制度名の下にある。利用者が使う言葉（引っ越し・転入）がカテゴリ名にも本文にも現れないため、制度名を知らない人は正しい入口を選べない。",
    fix_ja:
      "カテゴリ名を「戸籍・住民登録（引っ越し・出生・結婚の届出）」に変える、またはトップに「引っ越しの手続き」の導線を1本追加する。",
    evidence: [
      "ステップ3で「戸籍・住民登録」が第1要素として表示されていたが選ばれなかった",
      "ステップ3・5・7で同一ページに3回戻っている（周回）",
      "エージェントの発話「どれを押せばよいのか分かりません」",
    ],
    severity: "high",
  },
  {
    step_n: 1,
    url: "https://www.city.shinjuku.lg.jp/",
    cause_ja:
      "文字サイズ200%の初期表示に入る要素が9個しかなく、そのうち本文カテゴリは0個。カテゴリ一覧に到達するには必ずスクロールが要る。",
    fix_ja:
      "拡大表示時にヘッダー補助リンク（サイトマップ・アクセシビリティ方針・言語切替）を折りたたみ、主要カテゴリを先頭に出す。",
    evidence: [
      "要素数 270 / 200%表示の初期画面内 9（2026-08-08 実測）",
      "初期画面9要素のうち主要カテゴリ 0",
      "ステップ1の行動がスクロールになった",
    ],
    severity: "medium",
  },
  {
    step_n: 1,
    url: "https://www.city.shinjuku.lg.jp/",
    cause_ja:
      "初期画面に見えるリンクのうち3本が、60歳以上の理解率30%未満の外来語をラベルに含む（アクセシビリティ 2.1%・サイト 7.8%・サービス 24.6%）。押す前に何のリンクか判断できない。",
    fix_ja:
      "「ウェブアクセシビリティ方針」→「見やすさ・使いやすさへの取り組み」、「サイトマップ」→「ページの一覧」のように和語・漢語の併記に変える。",
    evidence: [
      "ステップ1のマスク5件中3件がリンクラベル内",
      "「アクセシビリティ」60歳以上の理解率 2.1%（国立国語研究所 外来語定着度調査）",
    ],
    severity: "medium",
  },
];

const allCalls: CostRecord[] = steps.flatMap((s) => s.llm_calls);

const by_step_type: Record<StepType, number> = {
  perceive: 0,
  decide: 0,
  judge: 0,
  diagnose: 0,
};
const by_model: Record<string, number> = {};
for (const c of allCalls) {
  by_step_type[c.step_type] += c.cost_usd;
  by_model[c.model] = (by_model[c.model] ?? 0) + c.cost_usd;
}
for (const k of Object.keys(by_step_type) as StepType[]) {
  by_step_type[k] = Number(by_step_type[k].toFixed(12));
}
for (const k of Object.keys(by_model)) by_model[k] = Number(by_model[k].toFixed(12));

const total_usd = Number(allCalls.reduce((s, c) => s + c.cost_usd, 0).toFixed(12));

// 「라우팅하지 않았다면」— 전량 프론티어 단가로 다시 계산한다.
// ⚠️ 이건 계산이지 실측이 아니다. 리포트에서도 그렇게 표기한다.
const baseline_usd = Number(
  allCalls
    .reduce((s, c) => s + (estimateCost(BASELINE_MODEL, c.prompt_tokens, c.completion_tokens) ?? 0), 0)
    .toFixed(12),
);

const trace: RunTrace = {
  run_id: "fixture-shinjuku-senior70s-a",
  batch_id: "fixture-batch-001",
  created_at: new Date(T0).toISOString(),
  mission,
  profile_id: "senior-70s",
  profile_version: "1.0",
  variant: 0,
  steps,
  verdict: {
    outcome: "gave_up_self",
    reached: false,
    key_match: false,
    llm_match: false,
    disagreed: false,
    reason_ja:
      "「住民異動届（転入・転出・転居）」を含むページに到達しないまま、7手目で探索を打ち切った。同一ページへの復帰が3回。",
    clicks: 5,
    seconds: 268,
  },
  findings,
  cost: {
    total_usd,
    by_step_type,
    by_model,
    calls: allCalls.length,
    cached_tokens: allCalls.reduce((s, c) => s + c.cached_tokens, 0),
    baseline_usd,
  },
  runner: { node: "v25.5.0", playwright: "1.62.1", chrome: "chrome (system)" },
};

const out = fileURLToPath(new URL("./sample-run.json", import.meta.url));
writeFileSync(out, JSON.stringify(trace, null, 2) + "\n");

console.log(`✓ ${out}`);
console.log(`  steps ${trace.steps.length} / calls ${trace.cost.calls}`);
console.log(`  total    $${trace.cost.total_usd.toFixed(6)}`);
console.log(`  baseline $${trace.cost.baseline_usd?.toFixed(6)} (전량 ${BASELINE_MODEL} 환산)`);
console.log(
  `  削減率   ${(((baseline_usd - total_usd) / baseline_usd) * 100).toFixed(1)}%  ← ⚠️ 표(table) 기준 계산치. 실측 아님`,
);
console.log(`  모델 종류 ${Object.keys(FALLBACK_PRICES).length}개 중 사용 ${Object.keys(by_model).length}개`);
