/**
 * sample-run-n3.json 생성기 — resident-n3(行政漢語) 프로필용 두 번째 픽스처.
 *
 * ★ 왜 sample-run.json 에 섞지 않고 따로 만드는가:
 *   프로필 하나는 어휘 정책 하나만 갖는다. senior-70s 는 이해율(%) 기반이고
 *   resident-n3 는 지정 명단 기반이다. 한 실행 안에 두 근거를 섞으면
 *   「이 마스킹은 무슨 근거인가」에 답할 수 없는 트레이스가 된다.
 *   D 는 두 근거를 각각 화면에 띄워야 하므로, 실행도 둘로 나눈다.
 *
 * ★ 실측인 것 / 목업인 것:
 *   실측 — 페이지 3장(URL·제목·본문·조작요소·스크롤 위치). n3-pages.json 에 그대로 있다.
 *          2026-08-11 캡처, resident-n3 뷰포트 375x667, 읽기 전용.
 *   실측 — 마스킹. 이 파일이 lexicon/src/mask.ts 를 실제로 호출해서 만든다.
 *          손으로 쓴 마스킹 기록은 하나도 없다. 어휘가 바뀌면 픽스처도 따라 바뀐다.
 *   목업 — 스텝 진행·LLM 문장·토큰 수·지연시간. 그래서 cost_source 는 전부 "table" 이다.
 *
 *   node core/fixtures/build-sample-n3.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
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
} from "../types.ts";
import { estimateCost, BASELINE_MODEL } from "../../llm/pricing.ts";
import { mask, evidence, plainJapanese, type MaskPolicy } from "../../lexicon/src/mask.ts";

// 라우팅 정책은 build-sample.ts 와 같은 가정을 쓴다. B가 최종 결정한다.
const MODEL_BY_STEP: Record<StepType, string> = {
  perceive: "qwen/qwen3.7-flash",
  decide: "google/gemini-3.5-flash-lite",
  judge: "google/gemini-3.6-flash",
  diagnose: "anthropic/claude-opus-5",
};

const T0 = Date.parse("2026-08-11T02:40:00.000Z");
const PATIENCE_CLICKS = 10; // resident-n3 v1.1 variant a
const PATIENCE_SECONDS = 420;

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
    cost_usd: Number(usd.toFixed(12)),
    cost_source: "table",
    latency_ms,
    route: step_type === "diagnose" ? "quality" : "cost",
    mode: "balanced",
    retries: 0,
  };
}

// ── 실측 입력 ────────────────────────────────────────────────
type Page = {
  url: string;
  title: string;
  scroll_y: number;
  text: string;
  elements: ElementView[];
};

const PAGES: Page[] = JSON.parse(
  readFileSync(fileURLToPath(new URL("./n3-pages.json", import.meta.url)), "utf8"),
).pages;

const PROFILE = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../profiles/resident-n3.json", import.meta.url)), "utf8"),
);
const POLICY: MaskPolicy = PROFILE.lexicon;

/**
 * constrain() 과 같은 규칙으로 마스킹한다 —
 * 본문 + **화면 안 조작요소 라벨**. 라벨 쪽이 본질이다. 본문만 가리면 링크는 그대로 눌린다.
 */
function maskPage(p: Page): { masks: MaskRecord[]; text: string; labels: Map<number, string> } {
  const masks: MaskRecord[] = [];
  const record = (s: string, in_control: boolean): string => {
    const r = mask(s, POLICY);
    for (const h of r.hits) {
      if (h.action !== "mask" && h.action !== "partial" && h.action !== "unknown") continue;
      // 근거 없는 히트는 기록하지 않는다 (절대규칙 2). 명단 정책에서는 애초에 나오지 않는다
      if (h.basis === "none") continue;
      masks.push({
        surface: h.surface,
        entry: h.entry,
        action: h.action,
        basis: h.basis,
        comprehension: h.comprehension,
        cohort: h.cohort,
        listing: h.listing,
        in_control,
        evidence_ja: evidence(h),
      });
    }
    return r.text;
  };

  const text = record(p.text, false);
  const labels = new Map<number, string>();
  for (const e of p.elements) {
    if (!e.in_viewport) continue;
    labels.set(e.index, record(e.name, true));
  }
  return { masks, text, labels };
}

function snapshot(p: Page, m: ReturnType<typeof maskPage>, kind: "raw" | "seen"): ObservationSnapshot {
  const seen = kind === "seen";
  const visible = p.elements.filter((e) => e.in_viewport);
  return {
    url: p.url,
    title: seen ? mask(p.title, POLICY).text : p.title,
    text: seen ? m.text : p.text,
    // seen 은 화면 안 요소만 남고 번호를 0부터 다시 매긴다 — constrain() 과 같은 규칙
    elements: seen
      ? visible.map((e, i) => ({ index: i, role: e.role, name: m.labels.get(e.index)!, in_viewport: true }))
      : p.elements,
    scroll: { y: p.scroll_y, height: 6400 },
    screenshot_key: null,
  };
}

type StepSpec = {
  page: Page;
  action: Step["action"];
  action_ok: boolean;
  clicks: number;
  seconds: number;
  perceive: [number, number, number, number];
  decide: [number, number, number, number] | null;
};

function buildStep(spec: StepSpec, n: number, tsOffsetSec: number): Step {
  const m = maskPage(spec.page);
  const raw = snapshot(spec.page, m, "raw");
  const seen = snapshot(spec.page, m, "seen");

  const constraint: ConstraintRecord = {
    profile: PROFILE.id,
    profile_version: PROFILE.version,
    masked: m.masks,
    masked_in_controls: m.masks.filter((x) => x.in_control).length,
    dom_text_withheld: false,
    elements_total: spec.page.elements.length,
    elements_in_viewport: spec.page.elements.filter((e) => e.in_viewport).length,
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
    threats: [],
    action: spec.action,
    action_ok: spec.action_ok,
    action_error: null,
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
// 시나리오: 転入届を出す方法を調べる → ◯◯◯ が 3 つ並んで見分けられない
// ─────────────────────────────────────────────────────────────

const mission: Mission = {
  id: "shinjuku-tennyu",
  track: "public",
  site_id: "shinjuku",
  site_name: "新宿区",
  start_url: "https://www.city.shinjuku.lg.jp/todokede/index01.html",
  goal_ja:
    "他の市区町村から新宿区へ引っ越してきました。引っ越してきたときに出す届出のページまで行って、窓口に持っていくものを確認してください。",
  intent_ja: "転入届の出し方と、持っていくものを知りたい",
  max_steps: 20,
};

const SPECS: StepSpec[] = [
  {
    // ① 스마트폰 첫 화면에는 사이트 껍데기밖에 없다. 마스킹 0건 — 그래도 아무것도 못 읽는다
    page: PAGES[0],
    action: { kind: "scroll", delta: 600, reason_ja: "画面にはメニューしか見えない。下に送って中身を探す。" },
    action_ok: true,
    clicks: 0,
    seconds: 22,
    perceive: [1180, 96, 0, 940],
    decide: [640, 48, 512, 610],
  },
  {
    // ② 여기가 벽이다. 届出 링크 3개가 전부 ◯◯◯ 로 보인다
    page: PAGES[1],
    action: {
      kind: "click",
      index: 1,
      reason_ja: "◯◯◯ が3つ並んでいて区別できない。括弧の中に「転入」とある1番を選ぶ。",
    },
    action_ok: true,
    clicks: 1,
    seconds: 71,
    perceive: [2240, 128, 1180, 1310],
    decide: [980, 86, 640, 880],
  },
  {
    // ③ 도착한 곳은 마이넘버카드 전용 페이지. 카드가 없으면 쓸 수 없다
    page: PAGES[2],
    action: {
      kind: "give_up",
      reason_ja: "開いたページも ◯◯◯ で始まっており、自分の場合に当てはまるのか判断できない。",
    },
    action_ok: true,
    clicks: 1,
    seconds: 138,
    perceive: [1960, 112, 1180, 1180],
    decide: [860, 74, 640, 790],
  },
];

const steps = SPECS.map((s, i) => buildStep(s, i + 1, [22, 71, 138][i]));

const allCalls = steps.flatMap((s) => s.llm_calls);
const by_step_type: Record<string, number> = {};
const by_model: Record<string, number> = {};
for (const c of allCalls) {
  by_step_type[c.step_type] = (by_step_type[c.step_type] ?? 0) + c.cost_usd;
  by_model[c.model] = (by_model[c.model] ?? 0) + c.cost_usd;
}
for (const k of Object.keys(by_step_type)) by_step_type[k] = Number(by_step_type[k].toFixed(12));
for (const k of Object.keys(by_model)) by_model[k] = Number(by_model[k].toFixed(12));

const total_usd = Number(allCalls.reduce((s, c) => s + c.cost_usd, 0).toFixed(12));
// ⚠️ 계산치다. 실측이 아니다 (절대규칙 4)
const baseline_usd = Number(
  allCalls
    .reduce((s, c) => s + (estimateCost(BASELINE_MODEL, c.prompt_tokens, c.completion_tokens) ?? 0), 0)
    .toFixed(12),
);

// 「가장 많이 링크를 죽인 단어」 — 리포트의 핵심 표가 이 집계에서 나온다
const inControl = steps.flatMap((s) => s.constraint.masked).filter((m) => m.in_control);
const worst = new Map<string, MaskRecord>();
for (const m of inControl) worst.set(m.surface, m);

const findings: Finding[] = [
  {
    step_n: 2,
    url: PAGES[1].url,
    cause_ja:
      "同じ画面に並ぶ3本のリンクが、いずれもラベル本体を伏せられて ◯◯◯ になった。" +
      "「転入届」「転出届」「転居届」は『やさしい日本語 書き換え例』(出入国在留管理庁・文化庁 2020) の収録語であり、" +
      "本文ではなくリンクのラベルそのものに含まれる。残った手がかりは括弧内の補足だけになり、" +
      "エージェントはマイナンバーカード専用ページを選んだ。",
    // ★ 「代わりにこう書く」は我々の意見ではない。出入国在留管理庁が示した言い換え文をそのまま出す
    fix_ja: [...worst.values()]
      .filter((m) => m.listing && m.surface.endsWith("届"))
      .map((m) => `「${m.surface}」→ ${m.listing!.meaning}`)
      .join(" / "),
    evidence: [...worst.values()].map((m) => m.evidence_ja),
    severity: "high",
  },
  {
    step_n: 1,
    url: PAGES[0].url,
    cause_ja:
      "375x667 の最初の画面に入る操作要素は 11 個で、すべてサイト共通のヘッダーとメニューだった。" +
      "届出の一覧に到達するにはスクロールが必須である。",
    fix_ja: "スマートフォン表示で、最初の画面に主要な届出への導線を1本入れる。",
    evidence: [
      `最初の画面の操作要素 11 個 / ページ全体 ${PAGES[0].elements.length} 個`,
      "1手目の行動が scroll になっており、クリックできる候補が画面内に無かった",
    ],
    severity: "medium",
  },
];

const trace: RunTrace = {
  run_id: "fixture-shinjuku-residentn3-a",
  batch_id: "fixture-batch-001",
  created_at: new Date(T0).toISOString(),
  mission,
  profile_id: PROFILE.id,
  profile_version: PROFILE.version,
  variant: 0,
  steps,
  verdict: {
    outcome: "gave_up_self",
    reached: false,
    key_match: false,
    llm_match: false,
    disagreed: false,
    reason_ja:
      "「転入届」を含むページには到達したが、マイナンバーカード専用の手続きページであり、" +
      "持ち物の確認には至らないまま3手目で探索を打ち切った。",
    clicks: 1,
    seconds: 138,
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

const out = fileURLToPath(new URL("./sample-run-n3.json", import.meta.url));
writeFileSync(out, JSON.stringify(trace, null, 2) + "\n");

const allMasks = steps.flatMap((s) => s.constraint.masked);
console.log(`✅ ${out}`);
console.log(`   스텝 ${steps.length} / 마스킹 ${allMasks.length}건 (링크·버튼 라벨 안 ${inControl.length}건)`);
console.log(`   가린 단어 ${new Set(allMasks.map((m) => m.surface)).size}종 — 전부 designated_list 근거`);
for (const m of worst.values()) console.log(`   ・${m.surface} → ${m.listing?.meaning.slice(0, 34)}…`);
console.log(`   total $${total_usd.toFixed(6)} / baseline $${baseline_usd.toFixed(6)}`);
