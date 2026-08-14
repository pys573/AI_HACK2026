/**
 * 改善提案 한 건 왼쪽에 붙는 그림. 「무엇이 막았는가」를 6종으로 그린다.
 *
 * ★ 왜 심각도(大きい/中くらい/小さい)가 아니라 종류인가:
 *   심각도는 이미 카드의 테두리색과 「影響 ◯◯」 칩이 말하고 있다. 거기에 색만 다른 그림을
 *   하나 더 얹으면 같은 말을 두 번 하는 것이고, 그건 장식이지 정보가 아니다.
 *   종류는 그림으로만 구별되는 정보다 — 「되돌아왔다」와 「못 읽는 말이 있었다」는
 *   문장을 읽기 전에 이미 다른 그림이다.
 *
 * ★ 팔레트·선 굵기는 랜딩의 `StepArt.tsx`와 같게 둔다. 같은 제품 안에서 그림체가 갈리면
 *   둘 중 하나는 남의 것처럼 보인다. 다만 여기는 28px라 형태를 훨씬 단순하게 잡았다 —
 *   랜딩의 96px 그림을 그대로 줄이면 선이 뭉개져 얼룩으로 읽힌다 (StepArt의 돋보기와 같은 이유).
 *
 * ⚠️ 08-14 이전에 저장된 트레이스에는 `kind`가 없다. 그때는 `Unknown`을 그린다 —
 *   억지로 6종 중 하나로 밀어넣으면 없는 판정을 우리가 지어낸 것이 된다.
 */

const NAVY = "#16306b";
const BLUE = "#3f6fd8";
const LIGHT = "#c3d5f5";
const STUMBLE = "#c2740a";

/** `agent/src/diagnose.ts`의 `label()`과 같은 말을 쓴다. 화면마다 이름이 다르면 같은 것으로 안 읽힌다 */
const TITLE_JA: Record<string, string> = {
  revisit: "同じページに戻ってきている",
  scroll_run: "スクロールを続けている",
  action_failed: "操作が失敗した",
  viewport_starved: "画面に入る操作要素が少ない",
  masked_control: "リンクのラベルに読めない語がある",
  unreached: "最後まで到達できなかった",
};

type GlyphProps = { title: string };

/** 01 revisit — 갔다가 같은 페이지로 U턴해서 돌아온다 */
function Revisit({ title }: GlyphProps) {
  return (
    <svg viewBox="0 0 40 40" className="size-7" fill="none" role="img">
      <title>{title}</title>
      <rect x="6" y="8" width="28" height="24" rx="3" stroke={NAVY} strokeWidth="2.4" />
      <path
        d="M14 17h8a4 4 0 0 1 0 8h-6"
        stroke={BLUE}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M18.5 21.5 15 25l3.5 3.5" stroke={STUMBLE} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 02 scroll_run — 찾는 것이 화면에 없어서 아래로만 계속 간다 */
function ScrollRun({ title }: GlyphProps) {
  return (
    <svg viewBox="0 0 40 40" className="size-7" fill="none" role="img">
      <title>{title}</title>
      <rect x="8" y="5" width="24" height="30" rx="3" stroke={NAVY} strokeWidth="2.4" />
      <rect x="13" y="10" width="14" height="3" rx="1.5" fill={LIGHT} />
      <path d="M14 19l6 5 6-5" stroke={STUMBLE} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 26l6 5 6-5" stroke={STUMBLE} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 03 action_failed — 누르려 했는데 안 눌렸다 */
function ActionFailed({ title }: GlyphProps) {
  return (
    <svg viewBox="0 0 40 40" className="size-7" fill="none" role="img">
      <title>{title}</title>
      <path
        d="M11 8v19l4.4-4.4 3 6.4 3.2-1.5-3-6.3h6.2z"
        fill="#fff"
        stroke={NAVY}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <circle cx="29.5" cy="11.5" r="6.5" fill={STUMBLE} />
      <path d="M27 9l5 5M32 9l-5 5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** 04 viewport_starved — 화면 안에 든 것보다 밖으로 나간 것이 많다 */
function ViewportStarved({ title }: GlyphProps) {
  return (
    <svg viewBox="0 0 40 40" className="size-7" fill="none" role="img">
      <title>{title}</title>
      <rect x="5" y="8" width="18" height="24" rx="2.5" stroke={NAVY} strokeWidth="2.4" />
      <rect x="9" y="13" width="10" height="3.5" rx="1.75" fill={BLUE} />
      {/* 화면 밖으로 밀려난 것들 — 흐리게 두는 것이 「존재는 하는데 안 보인다」다 */}
      <rect x="27" y="13" width="8" height="3.5" rx="1.75" fill={LIGHT} />
      <rect x="27" y="20" width="8" height="3.5" rx="1.75" fill={LIGHT} />
      <rect x="27" y="27" width="8" height="3.5" rx="1.75" fill={LIGHT} />
    </svg>
  );
}

/** 05 masked_control — 링크 라벨 안의 말이 가려져 있다 */
function MaskedControl({ title }: GlyphProps) {
  return (
    <svg viewBox="0 0 40 40" className="size-7" fill="none" role="img">
      <title>{title}</title>
      <rect x="5" y="13" width="8" height="5" rx="2.5" fill={BLUE} />
      {/* 우리가 실제로 덮은 자리. 화면의 masked 표시와 같은 뜻이다 */}
      <rect x="15" y="11.5" width="12" height="8" rx="1.5" fill={NAVY} />
      <rect x="29" y="13" width="6" height="5" rx="2.5" fill={BLUE} />
      <path d="M5 25h30" stroke={BLUE} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M14 30h12" stroke={LIGHT} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/** 06 unreached — 깃발 앞에서 길이 끊겼다 */
function Unreached({ title }: GlyphProps) {
  return (
    <svg viewBox="0 0 40 40" className="size-7" fill="none" role="img">
      <title>{title}</title>
      <path d="M4 28h9" stroke={NAVY} strokeWidth="2.4" strokeLinecap="round" strokeDasharray="1 4.5" />
      <path d="M17 24l6 6M23 24l-6 6" stroke={STUMBLE} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M30 8v24" stroke={NAVY} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M30.5 9.5 37 13l-6.5 3.5z" fill={LIGHT} stroke={NAVY} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

/** 08-14 이전 기록. 종류를 모른다 — 모르는 것을 아는 척하지 않는다 */
function Unknown({ title }: GlyphProps) {
  return (
    <svg viewBox="0 0 40 40" className="size-7" fill="none" role="img">
      <title>{title}</title>
      <path d="M20 7 35 32H5z" stroke={NAVY} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M20 17v6" stroke={STUMBLE} strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="20" cy="27" r="1.6" fill={STUMBLE} />
    </svg>
  );
}

const GLYPH: Record<string, (p: GlyphProps) => React.ReactElement> = {
  revisit: Revisit,
  scroll_run: ScrollRun,
  action_failed: ActionFailed,
  viewport_starved: ViewportStarved,
  masked_control: MaskedControl,
  unreached: Unreached,
};

export function FindingIcon({ kind }: { kind: string }) {
  const Glyph = GLYPH[kind] ?? Unknown;
  const title = TITLE_JA[kind] ?? "詰まった箇所";
  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-surface">
      <Glyph title={title} />
    </span>
  );
}
