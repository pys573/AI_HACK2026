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
 * ⚠️ 이 파일의 응답 파싱은 **아직 실물로 검증되지 않았다.**
 *   키를 받는 즉시 `node llm/smoke.ts`로 확인하고, 실제 응답 형태에 맞춰 고친다.
 *   추측한 필드를 실측이라고 부르지 않는다.
 */

import type { CostRecord, LlmRequest, LlmResponse } from "../core/types.ts";
import { estimateCost, FALLBACK_PRICES, type ModelPrice } from "./pricing.ts";

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
  model: string,
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
  const est = estimateCost(model, promptTokens, completionTokens, prices());
  // 모르는 모델을 0원으로 세지 않는다. 0으로 세면 절감률이 거짓말이 된다.
  return { cost_usd: est ?? Number.NaN, cost_source: "table" };
}

export type CompleteOptions = {
  mode?: RoutingMode;
  /** 재시도 횟수 (5xx·타임아웃만). 4xx는 재시도하지 않는다 */
  retries?: number;
  timeoutMs?: number;
  /** step_type → 모델. B가 주입한다. 없으면 orcarouter/auto */
  resolveModel?: (req: LlmRequest) => string;
};

/**
 * 1회 호출. **A가 의존하는 유일한 진입점**이다.
 * A는 step_type만 붙이고 모델을 모른다 — 그 분리가 ⑥의 설명 가능성을 만든다.
 */
export async function complete(req: LlmRequest, opts: CompleteOptions = {}): Promise<LlmResponse> {
  const mode = opts.mode ?? (process.env.ORCAROUTER_MODE as RoutingMode | undefined) ?? "balanced";
  const retries = opts.retries ?? 2;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const model = req.force_model ?? opts.resolveModel?.(req) ?? AUTO_MODEL;

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
    payload.response_format = {
      type: "json_schema",
      json_schema: { name: "response", strict: true, schema: req.schema },
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
        // 4xx는 우리 잘못이다. 재시도해도 같은 답이 온다.
        // ⚠️ PII Shield의 차단도 400으로 온다(덱 p.8) — 그건 정상 동작이므로 삼키지 않는다.
        if (res.status < 500) throw new OrcaError(res.status, raw);
        lastErr = new OrcaError(res.status, raw);
        continue;
      }

      const json = JSON.parse(raw) as Record<string, any>;
      const text: string = json?.choices?.[0]?.message?.content ?? "";
      const usedModel: string = json?.model ?? model;
      const pt: number = json?.usage?.prompt_tokens ?? 0;
      const ct: number = json?.usage?.completion_tokens ?? 0;
      const cached: number =
        json?.usage?.prompt_tokens_details?.cached_tokens ?? json?.usage?.cached_tokens ?? 0;

      const { cost_usd, cost_source } = extractCost(json, res, usedModel, pt, ct);

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
      if (req.schema && text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          // 스키마를 요구했는데 JSON이 아니면 그건 실패다. 다음 시도로 넘긴다.
          lastErr = new Error(`schema를 요구했으나 JSON이 아니다: ${text.slice(0, 200)}`);
          continue;
        }
      }

      return { text, parsed, cost };
    } catch (e) {
      if (e instanceof OrcaError && e.status < 500) throw e;
      lastErr = e;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
