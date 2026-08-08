/**
 * 마스킹 엔진 회귀 테스트.
 *
 * 이 테스트가 지키는 것: 「왜 이 단어를 가렸는가」에 항상 숫자로 답할 수 있는 상태.
 * 근거 없이 가리거나, 근거가 있는데 안 가리거나, 둘 다 데모를 죽인다.
 */

import { mask, evidence, loadLexicon, MASK_CHAR, type MaskPolicy } from "./mask.ts";
import { normalize, waregkiToIso } from "./gairaigo.ts";

let pass = 0;
let fail = 0;
let sec = { pass: 0, fail: 0, name: "" };

function section(name: string) {
  if (sec.name) done();
  sec = { pass: 0, fail: 0, name };
  console.log(`\n[${name}]`);
}
function done() {
  console.log(`  → ${sec.pass}/${sec.pass + sec.fail}`);
}
function ok(cond: boolean, label: string, detail?: string) {
  if (cond) {
    pass++;
    sec.pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    sec.fail++;
    console.log(`  ✗ ${label}${detail ? `  — ${detail}` : ""}`);
  }
}
function eq(actual: unknown, expected: unknown, label: string) {
  ok(
    JSON.stringify(actual) === JSON.stringify(expected),
    label,
    `기대 ${JSON.stringify(expected)} / 실제 ${JSON.stringify(actual)}`,
  );
}

const lex = loadLexicon();

/** 고령자 프로필의 기본 정책. profiles/ 의 스펙과 같은 값이어야 한다. */
const SENIOR: MaskPolicy = {
  cohort: "senior",
  mask_below: 30,
  partial_below: null,
  unknown: "keep",
};

// ────────────────────────────────────────────────────────────────
section("1. 정규화 — 표기 흔들림 흡수");

eq(normalize("アイデンティティー"), "アイデンティティ", "어미 장음 제거");
eq(normalize("コモン・アジェンダ"), "コモンアジェンダ", "中黒 제거");
eq(normalize("ｱｸｾｽ"), "アクセス", "반각 카타카나 → 전각");
eq(normalize("バリア フリー"), "バリアフリ", "공백 제거 + 어미 장음");
eq(waregkiToIso("H15年2月"), "2003-02", "和暦 → ISO");
eq(waregkiToIso("H16年11月"), "2004-11", "두 자리 월");

// ────────────────────────────────────────────────────────────────
section("2. 사전 적재 — 국어연 조사가 그대로 들어와 있는가");

ok(lex.size >= 390, `표제어 ${lex.size}어`);
eq(lex.get("ダウンロード")?.senior.comprehension, 8.2, "ダウンロード 60+ 이해율 8.2%");
eq(lex.get("ログイン")?.senior.comprehension, 6.4, "ログイン 60+ 이해율 6.4%");
eq(lex.get("バリアフリ")?.senior.comprehension, 52.9, "バリアフリー는 장음 제거 키로 저장");
ok(
  lex.get("アイデンティティ")!.surveys.length === 2,
  "복수 조사에 걸린 단어는 surveys에 전부 보존",
);
// 대표값은 표본이 큰 조사(B(1) 2115명)를 택해야 한다. A조사는 750명이다.
eq(lex.get("アイデンティティ")?.overall.comprehension, 23.1, "대표값 = 표본 최대 조사");

// ────────────────────────────────────────────────────────────────
section("3. 마스킹 — 근거가 있는 것만 가린다");

{
  const r = mask("申請書をダウンロードしてください。", SENIOR, lex);
  eq(r.text, `申請書を${MASK_CHAR.repeat(6)}してください。`, "ダウンロード(8.2%) 마스킹");
  eq(r.stats.masked, 1, "마스킹 1건");
  eq(r.hits[0].comprehension, 8.2, "히트에 근거 숫자가 붙는다");
}
{
  // ホームページ는 60+ 이해율 62.6% — 임계 30 위. 가리면 안 된다.
  const r = mask("ホームページをご覧ください。", SENIOR, lex);
  eq(r.text, "ホームページをご覧ください。", "ホームページ(62.6%)는 통과");
  eq(r.stats.masked, 0, "마스킹 0건");
}
{
  // 조사 미수록어는 근거가 없으므로 건드리지 않는다. 과소평가가 기본값이다.
  const r = mask("メニューから選んでください。", SENIOR, lex);
  eq(r.text, "メニューから選んでください。", "미수록어는 기본적으로 통과");
  eq(r.hits[0].entry, null, "미수록 표시");
  eq(r.stats.in_dictionary, 0, "사전 적중 0");
}

// ────────────────────────────────────────────────────────────────
section("4. 최장일치 — 한 런 안의 두 단어를 쪼갠다");

{
  // 「オンライン」(53.0%) 통과 + 「サービス」 미수록.
  const r = mask("オンラインサービス", SENIOR, lex);
  eq(
    r.hits.map((h) => h.surface),
    ["オンライン", "サービス"],
    "런을 표제어 경계로 분할",
  );
  eq(r.hits[0].entry, "オンライン", "앞은 사전 적중");
  eq(r.hits[1].entry, null, "뒤는 미수록");
}
{
  // 「ネット」(23.8%) 마스킹 + 미수록 「ワーク」는 유지.
  // 단 「ネットワーク」 자체가 사전에 있으면 최장일치로 그쪽이 이겨야 한다.
  const r = mask("ネットワーク", SENIOR, lex);
  const known = lex.has("ネットワーク");
  ok(
    known ? r.hits.length === 1 && r.hits[0].entry === "ネットワーク" : r.hits.length === 2,
    known ? "ネットワーク 표제어가 최장일치로 우선" : "미수록이면 ネット + ワーク로 분할",
  );
}

// ────────────────────────────────────────────────────────────────
section("5. 정책 — 임계값과 코호트가 결과를 바꾼다");

{
  // アクセス: 全体 57.7% / 60+ 31.3%. 임계 30이면 아슬하게 통과, 35면 마스킹.
  const a = mask("アクセス", { ...SENIOR, mask_below: 30 }, lex);
  const b = mask("アクセス", { ...SENIOR, mask_below: 35 }, lex);
  eq(a.stats.masked, 0, "임계 30 → アクセス(31.3%) 통과");
  eq(b.stats.masked, 1, "임계 35 → アクセス 마스킹");
}
{
  // 같은 단어라도 코호트가 全体면 안 가려진다. 세대차가 산출물이다.
  const s = mask("ダウンロード", { ...SENIOR, cohort: "senior", mask_below: 30 }, lex);
  const o = mask("ダウンロード", { ...SENIOR, cohort: "overall", mask_below: 30 }, lex);
  eq(s.stats.masked, 1, "60+ 8.2% → 마스킹");
  eq(o.stats.masked, 0, "全体 40.6% → 통과");
}
{
  // 경계역(3단) — 認知는 있으나 理解가 낮은 구간을 첫 글자만 남긴다.
  const r = mask("アクセス", { ...SENIOR, mask_below: 20, partial_below: 40 }, lex);
  eq(r.text, `ア${MASK_CHAR.repeat(3)}`, "경계역은 첫 글자만 남긴다");
  eq(r.hits[0].action, "partial", "action = partial");
}
{
  const r = mask("メニュー", { ...SENIOR, unknown: "mask" }, lex);
  eq(r.text, MASK_CHAR.repeat(4), "unknown=mask면 미수록어도 가린다");
}

// ────────────────────────────────────────────────────────────────
section("6. 비카타카나는 절대 건드리지 않는다");

{
  const src = "転入届の手続きは住民課の窓口で受け付けます。ABC123";
  const r = mask(src, SENIOR, lex);
  eq(r.text, src, "한자·가나·영숫자는 원문 그대로");
  eq(r.stats.katakana_tokens, 0, "카타카나 토큰 0");
}

// ────────────────────────────────────────────────────────────────
section("7. 데모 출력 — 화면에 나갈 문장");

{
  const src = "オンライン申請の手引きはこちらからダウンロードできます。ログインが必要です。";
  const r = mask(src, SENIOR, lex);
  console.log(`\n    원문 : ${src}`);
  console.log(`    60+  : ${r.text}`);
  for (const h of r.hits.filter((x) => x.action === "mask")) {
    console.log(`           └ ${evidence(h)}`);
  }
  ok(r.stats.masked === 2, "ダウンロード·ログイン 2건 마스킹");
  ok(r.text.includes("オンライン申請"), "オンライン(53.0%)은 남는다 — 전부 가리는 게 아니다");
}

done();
console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
