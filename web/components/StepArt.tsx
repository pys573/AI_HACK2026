/**
 * 「ツマヅキがすること」 3장 카드의 그림.
 *
 * ★ 왜 SVG를 직접 그리는가: 이 절은 계측이 아니라 **무슨 물건인지**를 전하는 자리다.
 *   PNG를 넣으면 화면 배율·다크 대응·용량이 전부 따라오는데, 얻는 것은 장식뿐이다.
 *   그림 자체는 의미를 지지 않는다 — 의미는 밑의 문장이 진다.
 *
 * 팔레트는 랜딩의 brand 계열에 맞춘다. 초록(도달)·주황(멈춤)은 globals.css의
 * --color-clear / --color-stumble와 같은 값이다. 화면 다른 곳의 판정색과 어긋나면
 * 같은 색이 다른 뜻으로 두 번 쓰인다.
 */

const NAVY = "#16306b";
const BLUE = "#3f6fd8";
const LIGHT = "#c3d5f5";
const CLEAR = "#0f9d63";
const STUMBLE = "#c2740a";

type Props = { className?: string };

const BASE = "h-24 w-24";

/**
 * 01 — 減らす. 검게 칠해진 줄 = 지워진 말.
 * 눈+사선을 먼저 그렸다가 버렸다 — 배지가 28px라 눈동자와 사선이 뭉개져 얼룩으로 읽혔다.
 * 돋보기는 같은 크기에서 형태가 살아남고, 카드 본문의 「画面を拡大する」와도 맞는다.
 */
export function ArtReduce({ className }: Props) {
  return (
    <svg viewBox="0 0 96 96" className={className ?? BASE} aria-hidden="true" fill="none">
      <rect x="10" y="16" width="70" height="62" rx="7" fill="#fff" stroke={NAVY} strokeWidth="3" />
      <path d="M10 30h70" stroke={NAVY} strokeWidth="3" />
      <circle cx="19" cy="23" r="2" fill={NAVY} />
      <circle cx="26" cy="23" r="2" fill={NAVY} />
      <circle cx="33" cy="23" r="2" fill={NAVY} />
      <rect x="19" y="39" width="44" height="6" rx="3" fill={BLUE} />
      <rect x="19" y="51" width="50" height="6" rx="3" fill={NAVY} />
      <rect x="19" y="63" width="30" height="6" rx="3" fill={BLUE} />
      <circle cx="72" cy="70" r="17" fill={BLUE} stroke="#fff" strokeWidth="3" />
      <circle cx="69.5" cy="67.5" r="6.5" stroke="#fff" strokeWidth="3" />
      <path d="M74.5 72.5 80 78" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

/** 02 — 比べる. 왼쪽은 끝까지 가고 오른쪽은 도중에 멈춘다 */
export function ArtCompare({ className }: Props) {
  return (
    <svg viewBox="0 0 96 96" className={className ?? BASE} aria-hidden="true" fill="none">
      <rect x="8" y="14" width="34" height="68" rx="6" fill="#fff" stroke={NAVY} strokeWidth="3" />
      <rect x="54" y="14" width="34" height="68" rx="6" fill="#fff" stroke={NAVY} strokeWidth="3" />
      <path d="M48 10v76" stroke={LIGHT} strokeWidth="3" strokeDasharray="5 6" strokeLinecap="round" />

      <rect x="15" y="24" width="20" height="5" rx="2.5" fill={BLUE} />
      <rect x="15" y="34" width="20" height="5" rx="2.5" fill={BLUE} />
      <rect x="15" y="44" width="20" height="5" rx="2.5" fill={BLUE} />
      <circle cx="25" cy="65" r="11" fill={CLEAR} />
      <path d="M20 65.5 23.5 69 30 61.5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

      <rect x="61" y="24" width="20" height="5" rx="2.5" fill={BLUE} />
      <rect x="61" y="34" width="20" height="5" rx="2.5" fill={BLUE} />
      <rect x="61" y="44" width="20" height="5" rx="2.5" fill={LIGHT} />
      <circle cx="71" cy="65" r="11" fill={STUMBLE} />
      <path d="M66 65h10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** 03 — 直す文. 지워진 줄 밑에 새 줄이 놓인다 */
export function ArtRewrite({ className }: Props) {
  return (
    <svg viewBox="0 0 96 96" className={className ?? BASE} aria-hidden="true" fill="none">
      <rect x="16" y="10" width="56" height="72" rx="6" fill="#fff" stroke={NAVY} strokeWidth="3" />
      <rect x="25" y="22" width="30" height="5" rx="2.5" fill={BLUE} />
      <rect x="25" y="33" width="38" height="5" rx="2.5" fill={LIGHT} />
      {/* 멈추게 한 말 — 취소선을 긋는다 */}
      <rect x="25" y="44" width="34" height="5" rx="2.5" fill={LIGHT} />
      <path d="M22 46.5h40" stroke={STUMBLE} strokeWidth="3" strokeLinecap="round" />
      <path d="M42 54v9m0 0-4.5-4.5M42 63l4.5-4.5" stroke={NAVY} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {/* 바꿔 쓴 말 */}
      <rect x="25" y="69" width="34" height="6" rx="3" fill={BLUE} />
      <circle cx="74" cy="70" r="16" fill={BLUE} stroke="#fff" strokeWidth="3" />
      <path
        d="M67.5 76.5l1.4-4.6 8.6-8.6 3.2 3.2-8.6 8.6z"
        fill="#fff"
      />
    </svg>
  );
}
