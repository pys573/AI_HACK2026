/**
 * 「어디까지가 같은 사이트인가」의 회귀 테스트.
 *
 * 2026-08-13에 실측으로 드러난 문제: 新宿区의 영어 페이지는 `www.foreign.city.shinjuku.lg.jp`라는
 * **다른 서브도메인**에 있는데, 가드가 origin 완전일치라 우리가 막고 있었다. 그 상태로
 * 영/일 패리티를 재면 「영어로는 도달 못 한다」가 나오지만, 그건 사이트가 아니라
 * **우리 도구를 잰 값**이다. 그래서 자치체 도메인까지는 서브도메인을 연다.
 *
 * 위험은 두 방향이다.
 *   1) 너무 좁으면 — 위처럼 우리가 만든 이탈을 사이트 탓으로 적게 된다
 *   2) **너무 넓으면** — `tokyo.jp`까지 올라가는 순간 도쿄도 전역이 열리고,
 *      「이 사이트를 쟀다」는 말 자체가 성립하지 않는다. 그리고 전자신청 SaaS에
 *      들어가면 절대규칙 5(읽기 전용)가 깨진다
 *
 * 아래 두 번째·세 번째 묶음이 2)를 지킨다. **막혀야 하는 것이 막히는지를 세는 테스트가
 * 더 많은 이유**가 이것이다 — 여는 쪽 실수는 눈에 띄지만, 넓히는 실수는 조용하다.
 *
 *   node --test agent/test/host-guard.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { hostAllowed } from "../src/act.ts";

const SHINJUKU = "https://www.city.shinjuku.lg.jp";
const MINATO = "https://www.city.minato.tokyo.jp";
const SHIBUYA = "https://www.city.shibuya.tokyo.jp";

test("같은 오리진은 지금까지처럼 통과한다", () => {
  for (const u of ["https://www.city.shinjuku.lg.jp/kusei/index.html", "/kusei/snjk001086.html", "?q=1"]) {
    assert.equal(hostAllowed(u, SHINJUKU).allowed, true, u);
  }
});

test("★ 실측으로 막혔던 자치체 서브도메인이 이제 통과한다", () => {
  // 아래 4건은 실제 트레이스에 `guard: 외부 사이트`로 남아 있던 것들이다.
  // 지어낸 예가 아니라 agent/runs/ 에서 꺼냈다.
  const cases: Array<[string, string, string]> = [
    ["https://www.foreign.city.shinjuku.lg.jp/", SHINJUKU, "新宿区 외국인용"],
    ["https://www.faq.city.shinjuku.lg.jp/", SHINJUKU, "新宿区 FAQ"],
    ["https://dcp.city.shibuya.tokyo.jp/", SHIBUYA, "渋谷区"],
    ["https://www.multilingualinterpretercallservice.city.minato.tokyo.jp/", MINATO, "港区 다국어 통역"],
  ];
  for (const [url, origin, what] of cases) {
    const g = hostAllowed(url, origin);
    assert.equal(g.allowed, true, `${what}: ${url} — ${g.reason}`);
  }
});

test("★ 자치체를 넘어가면 막힌다 — 여기가 넓어지면 계측이 무효가 된다", () => {
  const cases: Array<[string, string, string]> = [
    // 같은 `tokyo.jp` 안이지만 **다른 구**다. 여기가 열리면 「이 사이트를 쟀다」가 거짓이 된다
    ["https://www.city.shibuya.tokyo.jp/", MINATO, "港区 기준에서 渋谷区"],
    ["https://www.metro.tokyo.lg.jp/", MINATO, "港区 기준에서 도쿄도"],
    ["https://www.tokyo.jp/", MINATO, "공개 접미사 자체"],
    // 실측에서 막혔고 **계속 막혀야 하는** 것들
    ["https://www.lg-waps.go.jp/", SHINJUKU, "다른 기관"],
    ["https://www.shinjuku-sodai.com/", SHINJUKU, "이름만 비슷한 외부"],
    // F10의 J-SERVER 기계번역 게이트웨이. 이름에 shinjuku가 들어가지만 남의 도메인이다
    ["https://city-shinjuku.j-server.com/", SHINJUKU, "J-SERVER"],
  ];
  for (const [url, origin, what] of cases) {
    assert.equal(hostAllowed(url, origin).allowed, false, `${what}가 통과해 버렸다: ${url}`);
  }
});

test("전자신청 SaaS는 서브도메인을 열어도 계속 막힌다 (절대규칙 5)", () => {
  // 금지 패턴은 sameOrg보다 **먼저** 걸린다. 자치체 안에 있어도 못 들어간다
  const cases = [
    "https://shinsei.city.shinjuku.lg.jp/",
    "https://e-shinsei.city.shinjuku.lg.jp/",
    "https://myna.go.jp/",
    "https://ttzk.graffer.jp/city-shinjuku",
    "https://logoform.jp/form/1",
    "https://elg-front.jp/tokyo",
  ];
  for (const u of cases) {
    assert.equal(hostAllowed(u, SHINJUKU).allowed, false, `막혔어야 한다: ${u}`);
  }
  // 이유 문구도 확인한다. 「외부 사이트」로 기록되면 나중에 원인을 잘못 읽는다
  assert.match(hostAllowed("https://shinsei.city.shinjuku.lg.jp/", SHINJUKU).reason, /電子申請/);
});

test("스킴 제한과 프로토콜 강등은 그대로다", () => {
  for (const u of ["mailto:a@b.jp", "tel:0312345678", "javascript:void(0)"]) {
    assert.equal(hostAllowed(u, SHINJUKU).allowed, false, u);
  }
  // https → http. 서브도메인을 열어 준 김에 강등까지 얹어 주지 않는다
  assert.equal(hostAllowed("http://www.city.shinjuku.lg.jp/", SHINJUKU).allowed, false);
});

test("짧은 도메인은 확장하지 않는다 — 공개 접미사를 잘못 잡으면 남의 사이트가 열린다", () => {
  assert.equal(hostAllowed("https://blog.example.com/", "https://www.example.com").allowed, false);
  assert.equal(hostAllowed("https://www.example.com/", "https://www.example.com").allowed, true);
});
