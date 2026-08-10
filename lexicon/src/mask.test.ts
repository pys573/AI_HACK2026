/**
 * 마스킹 엔진 회귀 테스트.
 *
 * 이 테스트가 지키는 것: 「왜 이 단어를 가렸는가」에 항상 숫자로 답할 수 있는 상태.
 * 근거 없이 가리거나, 근거가 있는데 안 가리거나, 둘 다 데모를 죽인다.
 */

import {
  mask,
  evidence,
  plainJapanese,
  loadLexicon,
  loadDesignated,
  MASK_CHAR,
  type RatePolicy,
  type ListPolicy,
} from "./mask.ts";
import { normalize, waregkiToIso } from "./gairaigo.ts";
import { surfacesOf, EXPECTED_ENTRIES } from "./yasashii.ts";

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

/** 고령자 프로필의 기본 정책. profiles/senior-70s.json 의 스펙과 같은 값이어야 한다. */
const SENIOR: RatePolicy = {
  cohort: "senior",
  mask_below: 30,
  partial_below: null,
  unknown: "keep",
};

/** 외국인 주민 프로필의 정책. profiles/resident-n3.json 의 스펙과 같은 값이어야 한다. */
const N3: ListPolicy = {
  kind: "designated_list",
  list: "yasashii-kakikae-2020",
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
  eq(r.stats.scanned, 0, "카타카나 토큰 0");
}

// ────────────────────────────────────────────────────────────────
section("7. 명단 코퍼스 — 書き換え例가 그대로 들어와 있는가");

const list = loadDesignated();

eq(EXPECTED_ENTRIES, 134, "원본 수록 134어");
{
  const nos = new Set([...list.bySurface.values()].map((e) => e.no));
  eq(nos.size, 134, `항목 ${nos.size}어 — 129면 카타카나 표제어가 빠진 것이다`);
}
// 파싱 함정 ①: 「確定申告」은 PDF 안에서 確定 + 申告 두 덩어리로 쪼개져 있다.
eq(list.bySurface.get("確定申告")?.no, 16, "한자 덩어리가 이어붙어 있다 (確定申告)");
// 파싱 함정 ②: 意味의 첫 덩어리가 語彙에 딸려오면 「育児休業子」가 된다.
eq(list.bySurface.get("育児休業")?.term, "育児休業", "意味 첫 글자가 딸려오지 않는다");
ok(!list.bySurface.has("育児休業子"), "育児休業子 같은 잡종 표제어가 없다");
// 파싱 함정 ③: 카타카나 표제어에는 루비가 없어 교대 패턴이 깨진다.
for (const w of ["オーバーステイ", "ケアマネジャー", "ハザードマップ", "ハローワーク"]) {
  ok(list.bySurface.has(w), `카타카나 표제어 ${w}`);
}
ok(list.bySurface.has("ファミリー・サポート・センター"), "카타카나 표제어 ファミリー・サポート・センター");
// 意味는 「대신 뭐라고 쓰라는 건가」의 답이다. 비어 있으면 리포트가 아무 제안도 못 한다.
ok(list.bySurface.get("転入届")!.meaning.length > 10, "転入届에 やさしい日本語 설명이 붙어 있다");

// ────────────────────────────────────────────────────────────────
section("8. 표기 파생 — 원본 표기 그대로는 어느 사이트에도 없다");

eq(surfacesOf("管理費（共益費）"), ["管理費", "共益費"], "괄호 별칭을 둘로");
eq(surfacesOf("（賃貸契約の）更新料"), ["更新料"], "앞머리 괄호는 한정어라 버린다");
eq(surfacesOf("自治会・町内会"), ["自治会", "町内会"], "中黒 열거는 분리");
eq(
  surfacesOf("ファミリー・サポート・センター"),
  ["ファミリー・サポート・センター", "ファミリーサポートセンター"],
  "카타카나어 내부의 中黒은 열거가 아니다 — 쪼개지 않고 표기 흔들림만 흡수",
);
// 「自動車税」는 이 항목이 지정한 말이 아니다. 긴 표제어를 빌미로 짧고 흔한 말을 가리면 과잉 마스킹이다.
eq(
  surfacesOf("自動車税／軽自動車税種別割"),
  ["軽自動車税種別割"],
  "같은 항목 안의 부분문자열은 버린다 (과소 마스킹 방향)",
);

// ────────────────────────────────────────────────────────────────
section("9. 명단 마스킹 — 근거는 %가 아니라 「지정되었다」");

{
  const r = mask("転入届の手続きは住民課の窓口です。", N3, list);
  eq(r.text, `${MASK_CHAR.repeat(3)}の手続きは住民課の窓口です。`, "転入届 마스킹");
  eq(r.hits[0].basis, "designated_list", "근거 종류 = 명단");
  eq(r.hits[0].comprehension, null, "명단에는 이해율이 없다 — 지어내지 않는다");
  eq(r.hits[0].listing?.no, 97, "원본 番号가 붙는다");
}
{
  // 최장일치. 「国民健康保険」이 「健康保険」이나 「保険」에서 끊기면 근거가 짧은 쪽으로 바뀐다.
  const r = mask("国民健康保険と介護保険", N3, list);
  eq(
    r.hits.map((h) => h.entry),
    ["国民健康保険", "介護保険"],
    "긴 표제어가 이긴다",
  );
}
{
  // 미수록어는 통과. 「住民異動届」은 이 명단에 없다 (절대규칙 2).
  const src = "住民異動届と印鑑登録の窓口";
  const r = mask(src, N3, list);
  ok(r.text.startsWith("住民異動届"), "미수록어 住民異動届는 통과");
  eq(r.stats.masked, 0, "근거 없는 마스킹 0건");
}
{
  // ASCII 표기는 낱말 경계를 요구한다. 아니면 URL·식별자 안에서 터진다.
  eq(mask("日本留学試験（EJU）", N3, list).stats.masked, 2, "EJU는 단독으로 서면 마스킹");
  eq(mask("PROJECT_EJUKAI", N3, list).stats.masked, 0, "낱말 안의 EJU는 히트가 아니다");
}
{
  // 정책이 서로 새지 않는가. 명단 정책은 카타카나 이해율을 보지 않는다.
  const r = mask("ダウンロードとログイン", N3, list);
  eq(r.stats.masked, 0, "명단에 없는 외래어는 명단 정책이 건드리지 않는다");
}
{
  // 모든 히트에 근거가 붙는가. 근거 없는 히트는 버그다 (CLAUDE.md 코드 규약).
  const r = mask("確定申告と年末調整と特別徴収と源泉徴収", N3, list);
  eq(r.stats.masked, 4, "4건 마스킹");
  ok(
    r.hits.every((h) => evidence(h).includes("収録語 No.") && plainJapanese(h) !== null),
    "모든 히트에 出典·番号·言い換え이 붙는다",
  );
}

// ────────────────────────────────────────────────────────────────
section("10. 데모 출력 — 화면에 나갈 문장");

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
{
  const src = "転入届は住民異動届の一種です。国民健康保険の加入もあわせて確定申告に必要です。";
  const r = mask(src, N3, list);
  console.log(`\n    원문 : ${src}`);
  console.log(`    N3   : ${r.text}`);
  for (const h of r.hits) {
    console.log(`           └ ${evidence(h)}`);
    console.log(`             → ${plainJapanese(h)}`);
  }
  ok(r.stats.masked === 3, "転入届·国民健康保険·確定申告 3건 마스킹");
  ok(r.text.includes("住民異動届"), "미수록 住民異動届는 남는다 — 이건 과소평가다");
}

done();
console.log(`\n${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
