/**
 * 「英語の案内を探す」(用事에 붙는 언어 희망)의 회귀 테스트.
 *
 * 이 변경은 **프롬프트에 한 줄을 더하는** 변경이다. 그래서 위험이 두 방향으로 있다.
 *
 *   1) 붙어선 안 될 때 붙으면 — 나머지 4개 프로필이 105회와 다른 조건이 되고,
 *      사이트끼리의 비교(渋谷区 0% ↔ 港区 94%)가 통째로 근거를 잃는다.
 *   2) 붙었을 때 **너무 많이 말하면** — 「영어 안내가 있다」까지 알려주면 그건 찾은 게
 *      아니라 우리가 가르쳐 준 것이고, 「영어 링크를 못 찾았다」라는 발견 자체가 사라진다.
 *
 * 그래서 첫 묶음은 **옛 프롬프트 전문을 그대로 박아 두고** 통째로 비교한다.
 * 계산해서 맞추면 같이 틀리기 때문에 의미가 없다.
 *
 *   node --test agent/test/language.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { decideUser } from "../src/prompts.ts";
import { allProfiles, loadProfile, variantOf } from "../src/constrain.ts";

const MISSION = { id: "m", intent_ja: "問い合わせ先を知りたい" } as never;

const OBS = {
  url: "https://example.com/",
  title: "見出し",
  text: "本文",
  elements: [{ index: 0, role: "link", name: "引越し", in_viewport: true }],
  scroll: { y: 0, height: 1000, x: 0, width: 640, overflow_x: false },
} as never;

/**
 * ★ 언어 희망이 없을 때 나가야 하는 프롬프트 **전문**.
 *   105회가 받은 것과 같은 바이트다. 한 글자라도 달라지면 여기서 걸린다.
 */
const BEFORE = [
  "## あなたの用事",
  "問い合わせ先を知りたい",
  "",
  "## これまでにしたこと",
  "(まだ何もしていません)",
  "",
  "## 今見えている画面",
  "URL: https://example.com/",
  "タイトル: 見出し",
  "スクロール位置: 0px / 全体 1000px",
  "",
  "### 押せるもの",
  "[0] link 「引越し」",
  "",
  "### 画面の文章",
  "本文",
].join("\n");

// ── 조건이 아닐 때는 전과 완전히 같아야 한다 ──────────────────────

test("★ 언어 희망을 안 넘기면 프롬프트가 105회와 한 글자도 다르지 않다", () => {
  assert.equal(decideUser(MISSION, OBS, []), BEFORE);
});

test("★ 「ja」는 아무것도 더하지 않는다 — 일본어는 기본값이지 요청이 아니다", () => {
  assert.equal(decideUser(MISSION, OBS, [], "ja"), BEFORE);
});

test("모르는 값이 와도 아무것도 더하지 않는다 — 오차는 「안 붙는」 쪽으로 낸다", () => {
  for (const v of ["", "EN", "en-US", "english", "zh"]) {
    assert.equal(decideUser(MISSION, OBS, [], v), BEFORE, `「${v}」에서 프롬프트가 달라졌다`);
  }
});

// ── 「en」일 때만 한 줄 붙는다 ──────────────────────────────────

test("「en」이면 用事에 한 줄만 붙는다. 나머지는 전부 그대로다", () => {
  const u = decideUser(MISSION, OBS, [], "en");
  const added = u.split("\n").filter((l) => !BEFORE.split("\n").includes(l));
  assert.deepEqual(added, ["英語の案内があれば、そちらで済ませたいと思っています。"]);
});

test("★ 붙는 자리는 「あなたの用事」 블록 안이다 — 제약이 아니라 볼일이라는 뜻이다", () => {
  const lines = decideUser(MISSION, OBS, [], "en").split("\n");
  assert.equal(lines[0], "## あなたの用事");
  assert.equal(lines[1], "問い合わせ先を知りたい");
  assert.equal(lines[2], "英語の案内があれば、そちらで済ませたいと思っています。");
  assert.equal(lines[3], "");
});

test("★ 「영어가 더 쉽다」고는 말하지 않는다 — 일본의 외국인 주민이 영어권이라는 근거가 없다", () => {
  const u = decideUser(MISSION, OBS, [], "en");
  for (const leak of ["日本語は読めません", "日本語が苦手", "英語のほうが", "英語は得意"]) {
    assert.equal(u.includes(leak), false, `「${leak}」가 새어 나갔다`);
  }
});

test("★ 영어 안내가 있는지 없는지는 말하지 않는다 — 말하면 찾은 게 아니라 알려준 게 된다", () => {
  const u = decideUser(MISSION, OBS, [], "en");
  for (const leak of ["English", "英語ページがあります", "英語のリンク", "言語切替"]) {
    assert.equal(u.includes(leak), false, `「${leak}」가 새어 나갔다`);
  }
});

test("★ 페이지가 선언한 언어(`<html lang>`)는 프롬프트에 절대 실리지 않는다", () => {
  // Observation에는 lang이라는 필드가 아예 없다. 억지로 끼워 넣어도 새어 나가면 안 된다 —
  // 알려주는 순간 「지금 일본어 페이지에 있다」가 공짜가 되고, 계측이 무의미해진다
  const withLang = { ...(OBS as unknown as Record<string, unknown>), lang: "ja" } as never;
  assert.equal(decideUser(MISSION, withLang, [], "en").includes("ja"), false);
  assert.equal(decideUser(MISSION, withLang, []), BEFORE);
});

// ── variant를 조건으로 쓰는 것은 여기가 처음이다 ────────────────

test("resident-n3의 a는 en, b는 ja다", () => {
  const p = loadProfile("resident-n3");
  assert.equal(variantOf(p, 0).language_preference, "en");
  assert.equal(variantOf(p, 1).language_preference, "ja");
});

test("★ 다른 프로필은 언어 희망이 없다 = 105회와 같은 프롬프트를 계속 받는다", () => {
  for (const p of allProfiles()) {
    if (p.id === "resident-n3") continue;
    for (let i = 0; i < Math.max(1, p.variants?.length ?? 0); i++) {
      assert.equal(variantOf(p, i).language_preference, undefined, `${p.id} variant ${i}`);
    }
  }
});

test("★ variants의 patience·entry는 계속 잠들어 있다 — 지금 깨우면 105회와 조건이 달라진다", () => {
  const p = loadProfile("senior-70s");
  // 파일에는 적혀 있다 (a=12클릭 / b=18클릭). 그런데도 꺼내지 않는다
  assert.equal((p.variants[0] as { patience?: unknown }).patience !== undefined, true);
  assert.deepEqual(Object.keys(variantOf(p, 0)), ["suffix", "language_preference"]);
});

test("없는 variant를 물어도 죽지 않는다 — control은 variants가 비어 있다", () => {
  assert.deepEqual(variantOf(loadProfile("control"), 0), { suffix: undefined, language_preference: undefined });
});
