/**
 * 같은 미션에 여러 프로필을 순서대로 투입한다. 「どこでツマヅくか、10人が先に試す。」의 실체.
 *
 *   npm run batch -- shinjuku-tennyu                    # 기본 명단 × 2회 = 10런
 *   npm run batch -- shinjuku-tennyu --variants 1       # 빠른 확인 (5런)
 *   npm run batch -- shinjuku-tennyu --profiles control,senior-70s
 *
 * 왜 필요한가: 지금까지는 한 프로필씩 손으로 돌렸다. 그러면 나오는 건 「이 1명이 막혔다」이고,
 * 그건 일화다. 이탈률(gave_up / total)은 **명단을 정해 전원을 같은 조건에 넣어야** 나온다.
 * `core/types.ts`의 `Batch`는 처음부터 그걸 담으라고 있던 자리인데 아무도 채우지 않고 있었다.
 *
 * ★ 순차 실행이다. 절대규칙 6 — 도메인당 동시성 1. 병렬로 돌리면 빨라지지만 그건 규칙 위반이고,
 *   상대 서버에 부하를 주는 순간 우리가 주장하는 「読み取り専用・迷惑をかけない」가 거짓이 된다.
 */

import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Batch, RunTrace } from "../../core/types.ts";
import { BASELINE_MODEL } from "../../llm/pricing.ts";
import { pinnedModel, routingTable } from "../../llm/routing.ts";
import { loadMission } from "./mission.ts";
import { loadProfile } from "./constrain.ts";
import { routingOff } from "./llm-opts.ts";
import { runOnce } from "./run.ts";

const RUNS_DIR = join(import.meta.dirname, "..", "runs");

/**
 * 기본 명단. senior-70s-patient는 **뺀다** — 저건 페르소나가 아니라
 * 「인내 예산이 짧아서 실패한 게 아니냐」를 확인하는 대조 실험용 변종이다.
 * 명단에 섞으면 같은 사람을 두 번 센 것이 되고 이탈률이 오염된다.
 */
export const DEFAULT_ROSTER = ["control", "senior-70s", "resident-n3", "smartphone-novice", "busy-worker"];

export type BatchOptions = {
  missionId: string;
  /** 명단. 첫 번째가 대조군이면 그게 분할화면 왼쪽이 된다 */
  profileIds?: string[];
  /** 같은 프로필을 몇 번 돌릴 것인가. R9(실행 간 분산)를 보려면 2 이상 */
  variants?: number;
  /**
   * ★ 돌릴 **회차 번호를 직접** 고른다 (`--variant-list 2,3`). `variants`보다 우선한다.
   *
   * 왜 필요한가: `--variants N`은 언제나 0번부터 다시 센다. 배치가 죽어서 이어 붙이면
   * 한 칸에 v0가 두 개 쌓이고 v2·v3가 빈다. 그러면 **어느 칸이 몇 번 돌았는지를
   * 파일 이름으로 셀 수 없게 된다** — 재현하려는 사람이 디렉터리를 열어 봐야 한다.
   * 빠진 번호만 정확히 채우기 위한 문이다.
   *
   * ⚠️ **회차 번호는 조건이 아니다.** 2026-08-13 정정 — 한때 이 주석은
   * 「v0=12클릭·톱 시작, v1=18클릭·검색 유입」이라고 적고 있었다. 프로필 JSON의
   * `variants`에 그렇게 적혀 있기는 하다. 그런데 `constrain.ts`의 `variantOf()`가
   * 거기서 꺼내는 것은 `suffix`와 `language_preference` 둘뿐이고, `patience`는
   * `run.ts`가 **프로필 최상위 값만** 읽는다. 즉 v0~v3는 전부 같은 조건의 반복이다.
   * (`suffix`는 꺼내기만 하고 쓰는 곳이 없다 — 이것도 죽은 값이다.)
   *
   * 그래서 이 문의 값어치는 **조건 보존이 아니라 셈의 정확성**이다. 낮춰서 적어 둔다.
   */
  variantList?: number[];
  headless?: boolean;
  delayMs?: number;
  maxSteps?: number;
  /**
   * ★ 이 배치를 공표 집계에서 떼어 놓는다. 붙이면 디렉터리가 `batch<tag>__…`가 되고,
   * `scripts/build-web-data.ts`는 `batch__`로 시작하는 것만 읽으므로 자동으로 빠진다.
   *
   * 왜 필요한가: 프로필 **버전이 올라간** 실행은 옛 실행과 조건이 다르다. 예컨대
   * `resident-n3` v1.2는 v1.1에 없던 한 줄(영어로 끝내고 싶다)이 붙는다. 같은 이름으로
   * 저장하면 집계가 둘을 한 칸에 뭉개고, 그 순간 「무엇을 잰 값인가」에 답할 수 없게 된다.
   * `batchfixed__`(모델 못 박음)가 이미 같은 이유로 이름을 달리했다.
   */
  tag?: string;
};

/** 계측이 아예 실패한 런. run_id가 없으므로 Batch에 담을 수 없다 — 그래서 따로 돌려준다 */
export type BatchFailure = { profile_id: string; variant: number; error: string };

/**
 * ★ 지갑이 비면 **그 자리에서 멈춘다.**
 *
 * 2026-08-13, 재측정 도중 OrcaRouter 잔액이 바닥났는데 배치가 계속 돌았다.
 * 남은 19런은 전부 `outcome: "error"`로 저장됐다 — 그건 사이트를 잰 값이 아니라
 * **우리 지갑을 잰 값**이다. 계측기가 자기 사정으로 만든 숫자를 계측값 옆에 쌓아 두면,
 * 나중에 그 둘을 가려내는 데 드는 시간이 다시 돌리는 시간보다 길다.
 * 게다가 남은 런만큼 브라우저를 더 띄우는 값도 그대로 낭비다.
 *
 * `runOnce`는 403을 안에서 삼키고 error 트레이스를 돌려주므로 예외로는 잡히지 않는다.
 * 그래서 트레이스 본문에서 직접 찾는다.
 */
const OUT_OF_CREDIT = /insufficient credits/i;
export const CREDIT_EXIT_CODE = 2;

export async function runBatch(
  opts: BatchOptions,
): Promise<{ batch: Batch; failures: BatchFailure[]; outOfCredit: boolean }> {
  const mission = loadMission(opts.missionId);
  const roster = opts.profileIds?.length ? opts.profileIds : DEFAULT_ROSTER;
  const variants = opts.variants ?? 2;
  const delayMs = opts.delayMs ?? 4000;

  // 명단을 먼저 전부 읽는다. 오타 하나 때문에 40분짜리 배치가 8번째에서 죽으면 안 된다
  for (const p of roster) {
    try {
      loadProfile(p);
    } catch {
      const have = readdirSync(join(import.meta.dirname, "..", "..", "profiles"))
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(/\.json$/, ""));
      throw new Error(`프로필 "${p}"이 없다. 있는 것: ${have.join(", ")}`);
    }
  }

  const createdAt = new Date().toISOString();
  // ★ 모델을 못 박은 배치는 **이름부터 다르다.** 이 실행의 원가는 라우팅 절감의 증거가
  //   아니고, 도달률도 평소의 라우팅 조건에서 나온 값이 아니다. 같은 `batch__` 이름을
  //   쓰면 집계 스크립트가 조용히 섞어 넣고, 그 순간 두 실험이 하나로 뭉개진다.
  const pin = pinnedModel();
  // 디렉터리 이름이 되므로 영숫자만 남긴다. `..`나 `/`가 들어오면 저장 경로가 새어 나간다
  const tag = (opts.tag ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const batchId = `${pin ? "batchfixed" : tag ? `batch${tag}` : "batch"}__${mission.id}__${Date.now()}`;
  const batchDir = join(RUNS_DIR, batchId);
  mkdirSync(batchDir, { recursive: true });

  const variantIds = opts.variantList?.length
    ? opts.variantList
    : Array.from({ length: variants }, (_, i) => i);

  const plan: Array<{ profileId: string; variant: number }> = [];
  for (const v of variantIds) for (const p of roster) plan.push({ profileId: p, variant: v });

  const traces: RunTrace[] = [];
  const failures: BatchFailure[] = [];
  let controlRunId: string | null = null;
  let outOfCredit = false;

  console.log(`\n▶ 배치 ${batchId}`);
  console.log(`  대상   : ${mission.site_name} / ${mission.id}`);
  console.log(`  명단   : ${roster.join(", ")}`);
  console.log(
    `  구성   : ${roster.length}프로필 × ${opts.variantList?.length ? `회차 v${variantIds.join(",v")}` : `${variants}회`} = ${plan.length}런 (순차 — 절대규칙 6)`,
  );
  console.log(
    `  라우팅  : ${pin ? `못 박음 — 전원 ${pin} (ORCA_FORCE_MODEL). 이 배치의 원가는 절감의 증거가 아니다` : routingOff() ? "OFF — 대조군 (ORCA_NO_ROUTING=1)" : "llm/routing.ts 표"}`,
  );
  for (const r of routingTable()) console.log(`             ${r.step_type.padEnd(9)} ${r.model.padEnd(32)} [${r.source}]`);
  // ★ 어림짐작이다. 실측이 아니다 (절대규칙 4). 스텝당 4초 대기 + LLM 왕복에서 나온 감이고,
  //   실제 소요는 아래 진행 표시가 말한다
  console.log(`  ⏱ 어림 ${plan.length * 3}~${plan.length * 7}분 (추정 — 실측 아님)\n`);

  for (const [i, item] of plan.entries()) {
    const tag = `[${String(i + 1).padStart(2)}/${plan.length}] ${item.profileId} v${item.variant}`;
    console.log(`\n${"─".repeat(60)}\n${tag}`);

    // 런과 런 사이에도 간격을 둔다. runOnce는 자기 RateLimiter를 새로 만들기 때문에
    // 이 이음매에서만 4초 규칙이 비는데, 그 구멍으로 같은 도메인을 연타하게 된다
    if (i > 0) await sleep(delayMs);

    try {
      const t = await runOnce({
        missionId: opts.missionId,
        profileId: item.profileId,
        variant: item.variant,
        batchId,
        headless: opts.headless,
        delayMs,
        maxSteps: opts.maxSteps,
      });
      traces.push(t);
      if (controlRunId === null && item.profileId === "control") controlRunId = t.run_id;

      console.log(`  → ${t.verdict.outcome}  ${t.steps.length}스텝  $${t.cost.total_usd.toFixed(6)}  findings ${t.findings.length}건`);

      // 대조군이 못 갔으면 아래 전부가 「제약 때문」이라고 말할 수 없다. 그래도 계속 돈다 —
      // 데이터는 데이터다. 다만 조용히 넘기면 나중에 근거 없는 인과를 주장하게 된다
      if (item.profileId === "control" && !t.verdict.reached) {
        console.log(`  ⚠️ 대조군이 도달하지 못했다. 이 배치로는 「제약이 원인」이라고 말할 수 없다`);
      }

      if (OUT_OF_CREDIT.test(JSON.stringify(t.steps)) || OUT_OF_CREDIT.test(t.verdict.reason_ja ?? "")) {
        outOfCredit = true;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push({ profile_id: item.profileId, variant: item.variant, error: msg });
      console.log(`  ✗ 계측 실패 — ${msg}`);
      if (OUT_OF_CREDIT.test(msg)) outOfCredit = true;
    }

    if (outOfCredit) {
      writeFileSync(join(batchDir, "batch.json"), JSON.stringify(build(), null, 2));
      console.log(`\n  ⛔ OrcaRouter 잔액 소진 — 배치를 여기서 멈춘다.`);
      console.log(`     돌지 않은 런: ${plan.length - i - 1}개. 충전한 뒤 --variant-list 로 빠진 회차만 채운다`);
      console.log(`     https://www.orcarouter.ai/console/billing#add-credits`);
      break;
    }

    // 매 런마다 다시 쓴다. 40분 돌다 죽었을 때 앞의 결과까지 같이 잃지 않도록
    writeFileSync(join(batchDir, "batch.json"), JSON.stringify(build(), null, 2));
  }

  function build(): Batch {
    return {
      batch_id: batchId,
      created_at: createdAt,
      mission_id: mission.id,
      site_name: mission.site_name,
      run_ids: traces.map((t) => t.run_id),
      control_run_id: controlRunId,
      summary: summarize(traces),
    };
  }

  const batch = build();
  writeFileSync(join(batchDir, "batch.json"), JSON.stringify(batch, null, 2));
  return { batch, failures, outOfCredit };
}

/**
 * ⚠️ reached + gave_up ≠ total_runs 인 경우가 있다.
 *   `max_steps`(우리 스텝 상한에 먼저 걸림)와 `error`(계측 고장)는 **어느 쪽도 아니다.**
 *   그 둘을 이탈에 넣으면 사이트 탓이 아닌 것을 사이트 탓으로 세는 것이고,
 *   도달에 넣으면 없는 성공을 만드는 것이다. 그래서 양쪽 다 안 세고 남긴다.
 *   결과적으로 이탈률은 항상 **과소** 쪽으로 틀린다 (절대규칙 2).
 */
export function summarize(traces: RunTrace[]): Batch["summary"] {
  const gaveUp = traces.filter((t) => t.verdict.outcome.startsWith("gave_up")).length;

  // 한 런이라도 기준선을 모르면 합계도 모르는 것이다. 0으로 채우면 절감률이 부풀어 오른다
  const unknown = traces.some((t) => t.cost.baseline_usd === null);

  return {
    total_runs: traces.length,
    reached: traces.filter((t) => t.verdict.reached).length,
    gave_up: gaveUp,
    dropout_rate: traces.length ? gaveUp / traces.length : 0,
    total_cost_usd: traces.reduce((a, t) => a + t.cost.total_usd, 0),
    baseline_cost_usd: unknown ? null : traces.reduce((a, t) => a + (t.cost.baseline_usd ?? 0), 0),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── CLI ──────────────────────────────────────────────────────
if (import.meta.main) {
  const argv = process.argv.slice(2);
  const missionId = argv.find((a) => !a.startsWith("--"));
  if (!missionId) {
    console.error("사용법: npm run batch -- <mission-id> [--variants N | --variant-list 2,3] [--profiles a,b,c] [--max-steps N] [--tag 이름]");
    console.error("  --tag 를 붙이면 공표 집계(batch__)에서 빠진다. 조건이 다른 실험은 반드시 붙인다");
    console.error("  --variant-list 는 끊긴 배치의 **빠진 회차만** 채울 때 쓴다. 회차 번호는 조건이다");
    console.error(`기본 명단: ${DEFAULT_ROSTER.join(", ")}`);
    process.exit(1);
  }
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  // 설정 실수(오타난 미션·프로필)는 스택 트레이스가 아니라 고칠 수 있는 한 줄로 보여준다
  let batch: Batch;
  let failures: BatchFailure[];
  let outOfCredit = false;
  try {
    ({ batch, failures, outOfCredit } = await runBatch({
      missionId,
      profileIds: flag("profiles")?.split(",").map((s) => s.trim()).filter(Boolean),
      variants: flag("variants") ? Number(flag("variants")) : undefined,
      variantList: flag("variant-list")
        ?.split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n >= 0),
      maxSteps: flag("max-steps") ? Number(flag("max-steps")) : undefined,
      tag: flag("tag"),
      headless: process.env.HEADED !== "1",
    }));
  } catch (e) {
    console.error(`\n✗ ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  }

  const s = batch.summary;
  console.log(`\n${"═".repeat(60)}`);
  console.log(`── 배치 결과 ─────────────────────────────`);
  console.log(`  런       : ${s.total_runs}건  (到達 ${s.reached} / 諦め ${s.gave_up})`);
  console.log(`  이탈률   : ${(s.dropout_rate * 100).toFixed(1)}%  = 諦め ${s.gave_up} / 전체 ${s.total_runs}`);

  // 어느 쪽에도 안 들어간 런이 있으면 반드시 적는다. 안 적으면 두 통이 전부인 줄 안다
  const neither = s.total_runs - s.reached - s.gave_up;
  if (neither > 0) console.log(`             ↑ 이 중 ${neither}건은 到達도 諦め도 아니다 (스텝 상한·계측 오류). 이탈률은 과소 표시다`);
  console.log(`  원가     : $${s.total_cost_usd.toFixed(6)}`);
  if (s.baseline_cost_usd !== null && s.total_cost_usd > 0) {
    const cut = (1 - s.total_cost_usd / s.baseline_cost_usd) * 100;
    console.log(`  기준선   : $${s.baseline_cost_usd.toFixed(6)} (전량 ${BASELINE_MODEL}) → ${cut.toFixed(1)}% 절감`);
  }
  console.log(`  대조군   : ${batch.control_run_id ?? "없음 — 분할화면 왼쪽이 비어 있다"}`);

  // 실패는 batch.json에 담을 자리가 없다(run_id가 없으니까). 그래서 화면에는 반드시 적는다
  if (failures.length) {
    console.log(`\n  ✗ 계측 자체가 실패한 런 ${failures.length}건 — batch.json에는 없다:`);
    for (const f of failures) console.log(`      ${f.profile_id} v${f.variant} — ${f.error}`);
    console.log(`      → total_runs ${s.total_runs}은 「성공한 계측의 수」다. 시도는 ${s.total_runs + failures.length}회였다`);
  }
  console.log(`\n  배치     : agent/runs/${batch.batch_id}/batch.json\n`);

  // 잔액 소진은 **다른 종료 코드로 알린다.** 여러 사이트를 동시에 돌리는 스크립트가
  // 이걸 보고 나머지도 멈춘다 — 안 그러면 빈 지갑으로 브라우저만 60번 더 띄운다
  if (outOfCredit) process.exit(CREDIT_EXIT_CODE);
}
