/**
 * OrcaRouter 클라이언트 — 최소 구현 (W0-4).
 *
 * ★ 소유권: 이 파일은 **B(feat/router)**의 것이다. W0는 A를 언블록하기 위한 씨앗만 심는다.
 *   라우팅 정책·A/B 하네스·캐시 최적화는 B가 여기 위에 올린다.
 *
 * 왜 SDK가 아니라 fetch인가:
 *   OrcaRouter는 OpenAI 호환이라 SDK를 그대로 꽂을 수 있다(그게 스폰서의 셀링포인트다).
 *   다만 W0 시점에 의존성을 늘리면 5개 워크트리 전부가 설치를 기다린다.
 *   fetch는 Node 25에 내장이고 빌드 스텝도 없다. SDK 전환 여부는 B-1에서 판단한다.
 *
 * ✅ 2026-08-09 실물 확인 (`npm run orca:smoke`):
 *   - `/models` 182개, 그중 161개가 `pricing.{prompt,completion}_per_million`을 준다
 *     → 라이브 가격표를 만들 수 있다. 이게 ⑥「実測原価」의 근거다
 *   - 응답 본문·헤더에 **원가 필드가 없다.** 토큰 수 × 라이브 단가로 계산해야 한다
 *   - 응답의 `model`에는 **벤더 접두사가 없다** (요청 anthropic/claude-opus-5 → 응답 claude-opus-5)
 *   - `route` 필드도 응답에 없다 → 어느 모델로 갔는지는 `model`로만 안다
 *   - `orcarouter/auto`는 실제로 라우팅한다 (사소한 프롬프트 → qwen3.7-plus)
 */

import type { CostRecord, LlmRequest, LlmResponse } from "../core/types.ts";
import { estimateCost, FALLBACK_PRICES, type ModelPrice } from "./pricing.ts";
import { resolveModel as tableResolveModel } from "./routing.ts";

const BASE_URL = process.env.ORCAROUTER_BASE_URL ?? "https://api.orcarouter.ai/v1";
const API_KEY = process.env.ORCAROUTER_API_KEY ?? "";

/** 덱 p.4: 품질우선 / 코스트우선 / 밸런스 / auto(학습) */
export type RoutingMode = "quality" | "cost" | "balanced" | "auto";

export const AUTO_MODEL = "orcarouter/auto";

/** /models 로 받아온 라이브 가격표. 없으면 폴백 표를 쓴다 */
let livePrices: Record<string, ModelPrice> | null = null;

export function setLivePrices(p: Record<string, ModelPrice> | null): void {
  livePrices = p;
}

export function prices(): Record<string, ModelPrice> {
  return livePrices ?? FALLBACK_PRICES;
}

/** 지금 쓰고 있는 게 라이브 가격표인가. cost_source를 정하는 근거다 */
export function usingLivePrices(): boolean {
  return livePrices !== null;
}

export class OrcaError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string) {
    super(`OrcaRouter ${status}: ${body.slice(0, 300)}`);
    this.status = status;
    this.body = body;
  }
}

function headers(): Record<string, string> {
  if (!API_KEY) {
    throw new Error(
      "ORCAROUTER_API_KEY가 없다. https://www.orcarouter.ai/redeem/AI-HACK-2026-ORCAROUTER 에서 발급 후 .env에 넣는다.",
    );
  }
  return {
    "content-type": "application/json",
    authorization: `Bearer ${API_KEY}`,
  };
}

export async function listModels(): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/models`, { headers: headers() });
  const body = await res.text();
  if (!res.ok) throw new OrcaError(res.status, body);
  return JSON.parse(body);
}

/** 라이브 가격표를 마지막으로 받아온 시각. 덱에 「料金は1分ごとに更新」이라 적혀 있다 */
export let livePricesFetchedAt: string | null = null;

/**
 * `/models`에서 가격표를 만든다. **⑥의 「実測原価」가 여기서 나온다.**
 *
 * 2026-08-09 실측 응답 형태:
 *   { id: "anthropic/claude-opus-5",
 *     pricing: { prompt: "0.0000050000", completion: "0.0000250000",
 *                prompt_per_million: "5.000000", completion_per_million: "25.000000" } }
 *   182개 중 177개가 pricing을 가진다.
 */
export async function fetchLivePrices(): Promise<Record<string, ModelPrice>> {
  const j = (await listModels()) as { data?: Array<Record<string, any>> };
  const out: Record<string, ModelPrice> = {};

  for (const m of j.data ?? []) {
    const p = m?.pricing;
    if (!p) continue;
    const input = Number(p.prompt_per_million ?? Number(p.prompt) * 1e6);
    const output = Number(p.completion_per_million ?? Number(p.completion) * 1e6);
    if (!Number.isFinite(input) || !Number.isFinite(output)) continue;

    const price: ModelPrice = { input_per_m: input, output_per_m: output, provider: m.owned_by ?? "" };
    out[m.id] = price;

    // ⚠️ chat/completions 응답의 model에는 벤더 접두사가 없다
    //    (요청 "anthropic/claude-opus-5" → 응답 "claude-opus-5").
    //    접두사 없는 형태로도 찾을 수 있게 별칭을 건다.
    //    서로 다른 벤더가 같은 뒷이름을 쓰면 먼저 온 쪽이 이긴다 —
    //    그래서 조회는 항상 「요청한 전체 ID」를 먼저 본다.
    const bare = String(m.id).split("/").pop();
    if (bare && !(bare in out)) out[bare] = price;
  }

  livePricesFetchedAt = new Date().toISOString();
  return out;
}

/** 프로세스당 1회만 받아온다. 실패하면 폴백 표로 계속 간다 (실행이 죽는 것보다 낫다) */
let livePricesPromise: Promise<void> | null = null;
export function ensureLivePrices(): Promise<void> {
  if (!livePricesPromise) {
    livePricesPromise = fetchLivePrices()
      .then((p) => setLivePrices(p))
      .catch(() => {
        // 가격표를 못 받은 것은 치명적이지 않다. 다만 cost_source가 "table"이 되고,
        // 그 실행의 원가는 「実測」이라고 말할 수 없게 된다
        setLivePrices(null);
      });
  }
  return livePricesPromise;
}

/**
 * 응답에서 원가를 뽑는다.
 *
 * OrcaRouter는 요청 단위로 {model, cost, latency, route}를 기록한다(덱 p.9).
 * 그게 응답 본문/헤더 중 어디로 오는지는 실물 확인 전까지 모른다 →
 * 알려진 위치를 전부 뒤지고, 없으면 가격표로 계산하되 **출처를 정직하게 표기**한다.
 */
function extractCost(
  json: Record<string, any>,
  res: Response,
  returnedModel: string,
  requestedModel: string,
  promptTokens: number,
  completionTokens: number,
): { cost_usd: number; cost_source: "api" | "table" } {
  const candidates = [
    json?.usage?.cost,
    json?.usage?.total_cost,
    json?.cost,
    json?.orcarouter?.cost,
    res.headers.get("x-orcarouter-cost"),
  ];
  for (const c of candidates) {
    const n = typeof c === "string" ? Number(c.replace(/^\$/, "")) : c;
    if (typeof n === "number" && Number.isFinite(n)) return { cost_usd: n, cost_source: "api" };
  }

  // 조회 순서: 요청한 전체 ID → 응답이 준 이름 → 접두사를 붙여본 이름.
  // 요청 ID를 먼저 보는 이유는 접두사 없는 별칭이 벤더 간에 충돌할 수 있어서다.
  // orcarouter/* 는 라우터 별칭이라 가격이 없다 — 실제로 돌린 모델로 매겨야 한다.
  const table = prices();
  const isAlias = (m: string) => m.startsWith("orcarouter/");
  const keys = [
    isAlias(requestedModel) ? null : requestedModel,
    returnedModel,
    returnedModel.includes("/") ? null : Object.keys(table).find((k) => k.endsWith(`/${returnedModel}`)),
  ].filter((k): k is string => typeof k === "string");

  for (const k of keys) {
    const est = estimateCost(k, promptTokens, completionTokens, table);
    if (est !== null) {
      // 라이브 가격표(=/models)로 계산했으면 실측 원가로 취급한다.
      // 리포에 박아둔 폴백 표로 계산했으면 그건 추정치다.
      return { cost_usd: est, cost_source: usingLivePrices() ? "api" : "table" };
    }
  }

  // 모르는 모델을 0원으로 세지 않는다. 0으로 세면 절감률이 거짓말이 된다.
  return { cost_usd: Number.NaN, cost_source: "table" };
}

// ─────────────────────────────────────────────────────────────
// 과금 원장 (절대규칙 4)
// ─────────────────────────────────────────────────────────────

/**
 * **토큰을 태운 모든 호출**이 여기로 흐른다 — 성공했든, 스키마 위반으로 버려졌든.
 *
 * 왜 반환값(`LlmResponse.cost`)으로는 부족한가:
 *   재시도로 버려진 시도도 **이미 과금됐다.** 그걸 안 세면 실행 합계 원가가
 *   실제보다 **적게** 나온다. 「実測原価」라고 부르면서 과소 보고하는 셈이라
 *   ⑥에서 「이 숫자 어디서 나왔나요」에 답할 수 없다.
 *
 * `core/types.ts`는 전 워크트리 읽기 전용이라(절대규칙 10) `LlmResponse`에 필드를
 * 늘릴 수 없다. 그래서 계약을 건드리지 않는 **곁채널**로 뺀다.
 *   - `LlmResponse.cost` = 최종적으로 채택된 시도 1건 (A의 기존 코드 그대로 동작한다)
 *   - 이 싱크        = 과금된 전건. **원가 합계는 반드시 이쪽으로 낸다**
 */
const billedSinks: Array<(c: CostRecord, kept: boolean) => void> = [];

/** 구독. 반환된 함수를 부르면 해지된다 */
export function onBilledCost(fn: (cost: CostRecord, kept: boolean) => void): () => void {
  billedSinks.push(fn);
  return () => {
    const i = billedSinks.indexOf(fn);
    if (i >= 0) billedSinks.splice(i, 1);
  };
}

function emitBilled(cost: CostRecord, kept: boolean, local?: (c: CostRecord, kept: boolean) => void): void {
  // 원장 기록이 실패해도 호출 자체는 살린다. 여기서 던지면 과금은 됐는데 결과도 잃는다
  for (const fn of [...billedSinks, ...(local ? [local] : [])]) {
    try {
      fn(cost, kept);
    } catch {}
  }
}

/**
 * 다시 시도할 가치가 있는 응답인가.
 *
 * 429는 4xx지만 「우리 잘못」이 아니라 「지금은 말고 조금 뒤에」다. 여기서 포기하면
 * 무료 한도에 한 번 걸린 순간 실행 전체가 죽는다 — 2026-08-10에 실제로 그렇게 멈췄다.
 * 408(타임아웃)·425(too early)도 같은 부류다.
 * 나머지 4xx는 재시도해도 같은 답이 온다. PII Shield 차단(400)도 여기 포함 — 삼키지 않는다.
 */
function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429 || status === 408 || status === 425;
}

/**
 * 다음 시도까지 얼마나 기다릴까.
 * 서버가 `Retry-After`로 말해주면 그걸 따른다 — 우리 추측보다 서버가 옳다.
 * 없으면 지수 백오프 + 지터. 지터가 없으면 병렬 호출이 같은 순간에 다시 몰린다.
 */
function backoffMs(attempt: number, res?: Response): number {
  const header = res?.headers.get("retry-after");
  if (header) {
    const secs = Number(header);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, 30_000);
    const at = Date.parse(header);
    if (Number.isFinite(at)) return Math.max(0, Math.min(at - Date.now(), 30_000));
  }
  const base = Math.min(1000 * 2 ** attempt, 16_000);
  return base + Math.floor(Math.random() * 400);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Anthropic 경유 호출용 스키마 정리.
 *
 * ✅ 2026-08-11 실측: `maxItems`가 있으면 **HTTP 400**으로 거절한다
 *    (`For 'array' type, property 'maxItems' is not supported`).
 *    OpenAI·Google은 같은 스키마를 그대로 받는다 — 벤더별 지원 범위가 다르다.
 *
 * 제약을 지우는 건 의미를 바꾸는 일이라 원래는 피해야 한다. 다만 여기서 지우는 건
 * 전부 **범위 제한**뿐이고(필드 구성·타입·required는 건드리지 않는다),
 * 남기면 400으로 호출 자체가 죽는다. 죽는 것보다 느슨한 게 낫다.
 */
const ANTHROPIC_UNSUPPORTED = ["maxItems", "minItems", "maxLength", "minLength", "pattern", "format"];

function sanitizeForAnthropic(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeForAnthropic);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (ANTHROPIC_UNSUPPORTED.includes(k)) continue;
      out[k] = sanitizeForAnthropic(v);
    }
    return out;
  }
  return node;
}

export type CompleteOptions = {
  mode?: RoutingMode;
  /** 재시도 횟수 (5xx·429·타임아웃·스키마 위반). 그 외 4xx는 재시도하지 않는다 */
  retries?: number;
  timeoutMs?: number;
  /**
   * step_type → 모델.
   * 기본값은 `llm/routing.ts`의 실측 기반 표다. 넘기면 그걸 쓰고,
   * `null`을 넘기면 라우팅을 끄고 `orcarouter/auto`로 보낸다 (A/B 하네스의 대조군).
   */
  resolveModel?: ((req: LlmRequest) => string) | null;
  /** 이 호출에서 과금된 전건. 버려진 시도도 온다 */
  onBilled?: (cost: CostRecord, kept: boolean) => void;
};

/**
 * 1회 호출. **A가 의존하는 유일한 진입점**이다.
 * A는 step_type만 붙이고 모델을 모른다 — 그 분리가 ⑥의 설명 가능성을 만든다.
 */
export async function complete(req: LlmRequest, opts: CompleteOptions = {}): Promise<LlmResponse> {
  const mode = opts.mode ?? (process.env.ORCAROUTER_MODE as RoutingMode | undefined) ?? "balanced";
  const retries = opts.retries ?? 2;
  const timeoutMs = opts.timeoutMs ?? 60_000;

  // 라우팅의 유일한 결정 지점.
  //   force_model      → A/B 하네스가 못을 박은 경우
  //   resolveModel:null → 라우팅 끄기(대조군). orcarouter/auto로 나간다
  //   기본             → llm/routing.ts 실측 표
  // ⚠️ 기본값을 auto로 두면 A는 코드를 안 고쳤다는 이유만으로 라우팅 없이 돌게 된다.
  //    그 상태의 절감은 우리 시책이 아니라 OrcaRouter의 것이다 (⑥에서 설명이 안 된다)
  const model =
    req.force_model ?? (opts.resolveModel === null ? AUTO_MODEL : (opts.resolveModel ?? tableResolveModel)(req));

  const payload: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
    // 라우팅 모드. 필드명이 다를 가능성이 있어 smoke에서 확인한다.
    routing_mode: mode,
  };

  if (req.schema) {
    // 벤더별 스키마 지원 범위가 다르다 — anthropic은 maxItems에서 400을 낸다 (2026-08-11 실측)
    const schema = model.startsWith("anthropic/") ? sanitizeForAnthropic(req.schema) : req.schema;
    payload.response_format = {
      type: "json_schema",
      json_schema: { name: "response", strict: true, schema },
    };
  }

  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const raw = await res.text();
      const latency = Date.now() - t0;

      if (!res.ok) {
        // ⚠️ PII Shield의 차단도 400으로 온다(덱 p.8) — 그건 정상 동작이므로 삼키지 않는다.
        if (!isRetryableStatus(res.status)) throw new OrcaError(res.status, raw);
        lastErr = new OrcaError(res.status, raw);
        if (attempt < retries) await sleep(backoffMs(attempt, res));
        continue;
      }

      const json = JSON.parse(raw) as Record<string, any>;
      const text: string = json?.choices?.[0]?.message?.content ?? "";
      const usedModel: string = json?.model ?? model;
      const pt: number = json?.usage?.prompt_tokens ?? 0;
      const ct: number = json?.usage?.completion_tokens ?? 0;
      const cached: number =
        json?.usage?.prompt_tokens_details?.cached_tokens ?? json?.usage?.cached_tokens ?? 0;

      const { cost_usd, cost_source } = extractCost(json, res, usedModel, model, pt, ct);

      const cost: CostRecord = {
        step_type: req.step_type,
        model: usedModel,
        prompt_tokens: pt,
        completion_tokens: ct,
        cached_tokens: cached,
        cost_usd,
        cost_source,
        latency_ms: latency,
        route: json?.route ?? json?.orcarouter?.route ?? res.headers.get("x-orcarouter-route"),
        mode,
        retries: attempt,
      };

      let parsed: unknown;
      let failure: string | null = null;

      if (req.schema) {
        // ⚠️ 빈 본문을 성공으로 돌려주면 A는 에러도 없이 빈손을 받는다.
        //    「모델이 아무것도 안 했다」와 「모델이 못 하겠다고 했다」는 다른 사건인데
        //    그 구분이 사라진다. 빈 본문은 실패다
        if (!text.trim()) {
          failure = "schema를 요구했으나 본문이 비었다";
        } else {
          try {
            parsed = JSON.parse(text);
          } catch {
            failure = `schema를 요구했으나 JSON이 아니다: ${text.slice(0, 200)}`;
          }
          // JSON이긴 한데 **딴 모양**인 경우를 잡는다.
          // ✅ 2026-08-11 실측: qwen3.7-flash는 response_format을 무시하고
          //    {"classification":{...}} 같은 자기 마음대로의 JSON을 준다.
          //    JSON.parse는 통과하므로 여기서 안 막으면 조용히 틀린 값이 A까지 간다.
          //    전체 검증이 아니라 최상위 required만 본다 — 싸고, 이 사고를 실제로 잡는다
          if (!failure) {
            const need = (req.schema as { required?: unknown }).required;
            if (Array.isArray(need)) {
              const obj = parsed as Record<string, unknown> | null;
              const missing = need.filter((k) => typeof k === "string" && !(obj && k in obj));
              if (missing.length) {
                failure = `schema의 필수 필드가 없다 [${missing.join(", ")}]: ${text.slice(0, 200)}`;
              }
            }
          }
        }
      }

      // 성공이든 실패든 **토큰은 이미 탔다.** 원장에는 지금 넣는다 (절대규칙 4).
      // 여기서 안 넣고 continue하면 「과금됐는데 기록 없는 호출」이 생긴다
      emitBilled(cost, failure === null, opts.onBilled);

      if (failure) {
        lastErr = new Error(`${failure} (model=${cost.model})`);
        if (attempt < retries) await sleep(backoffMs(attempt));
        continue;
      }

      return { text, parsed, cost };
    } catch (e) {
      // 재시도해도 같은 답이 오는 4xx는 즉시 올린다 (429·408·425는 제외 — 위 isRetryableStatus와 같은 기준)
      if (e instanceof OrcaError && !isRetryableStatus(e.status)) throw e;
      lastErr = e;
      if (attempt < retries) await sleep(backoffMs(attempt));
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
