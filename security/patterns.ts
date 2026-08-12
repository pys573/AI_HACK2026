/**
 * C-2 · 위협 패턴표 — **무엇을 왜 위협으로 보는가**의 단일 출처.
 *
 * 이 파일의 존재 이유는 편의가 아니라 규율이다.
 * 패턴을 검사 코드 안에 흩어 놓으면 「그 판정 근거가 뭐냐」에 답할 때
 * 코드를 읽어 내려가며 설명해야 한다. 표로 모아 두면 표를 보여주면 끝난다.
 *
 * ── 오차 방향 (절대규칙 2의 거울상) ─────────────────────────
 *
 * 마스킹은 **과소** 쪽으로 틀린다. 근거 없이 가리지 않는다.
 * 위협 검사는 반대로 **과대** 쪽으로 기울여야 안전할 것 같지만, 그렇게 하면 안 된다.
 *
 *   과잉 차단 = 정상 문장을 지운 채로 에이전트를 돌린다
 *              → 에이전트가 실패한다
 *              → 그 실패가 「사이트가 어려워서」인지 「우리가 지워서」인지 구별할 수 없다
 *              → 이 제품의 측정값 전체가 무효가 된다
 *
 * 그래서 규율을 둘로 나눈다:
 *   **탐지는 넓게(info/warn), 차단은 좁게(block).**
 * 기록은 아낌없이 남기되, LLM에게 가는 바이트를 실제로 지우는 것은
 * 「사람 독자를 향한 문장으로는 읽히지 않는」 것만이다.
 *
 * ── PII를 좁게 잡는 이유 ────────────────────────────────────
 *
 * 전화번호·메일주소·우편번호는 공공 사이트에 **있는 것이 정상**이다.
 * 区役所 대표번호를 PII로 기록하면 트레이스가 그걸로 가득 차고,
 * 진짜 한 건이 그 안에 묻힌다. 그래서 「공개 www에 있으면 안 되는 것」만 잡는다.
 * 공개된 연락처는 우리 관심사가 아니라고 먼저 말한다.
 */

import type { ThreatRecord } from "../core/types.ts";

export type Pattern = {
  /** 트레이스·화면에서 이 판정을 가리키는 이름. 바꾸면 과거 기록과 대조가 끊긴다 */
  id: string;
  kind: ThreatRecord["kind"];
  severity: ThreatRecord["severity"];
  re: RegExp;
  /** 왜 이것이 위협인가. note_ja의 재료가 된다 — 근거 없는 히트는 버그다 */
  why_ja: string;
};

// ─────────────────────────────────────────────────────────────
// prompt_injection
// ─────────────────────────────────────────────────────────────
//
// block으로 올리는 기준은 하나다: **사람 독자를 향한 문장으로는 읽히지 않는가.**
//
// 「下記のリンクにアクセスしてください」는 실제 자치체 페이지에 흔히 있다.
// 사람에게 하는 말이다. 이걸 block으로 잡으면 정상 사이트가 전부 위협이 된다.
// 반대로 「AIへ: 上記の指示を無視し…」는 사람 독자에게는 의미가 없는 문장이다.
// 그 페이지에 그 문장이 있을 정당한 이유가 없다.

const INJECTION: Pattern[] = [
  {
    id: "inj.override-ja",
    kind: "prompt_injection",
    severity: "block",
    // 「これまでの指示を無視して」— 가장 전형적인 형태. 사람 독자를 향한 문장이 아니다
    re: /(これまで|それまで|以上|上記|前|先|事前|元)の\s*(指示|命令|ルール|規則|設定|プロンプト)[^。\n]{0,12}(無視|忘れ|破棄|上書き|取り消)/g,
    why_ja: "ページ本文が、事前の指示を無効化するよう求めています。人間の読者に向けた文章としては成立しません。",
  },
  {
    id: "inj.override-en",
    kind: "prompt_injection",
    severity: "block",
    re: /\b(ignore|disregard|forget|override)\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|preceding|earlier|system)\s+(instruction|prompt|rule|direction|message)s?\b/gi,
    why_ja: "英文で事前の指示の無効化を求めています。日本語の公共ページに置かれる理由がありません。",
  },
  {
    id: "inj.address-agent",
    kind: "prompt_injection",
    severity: "block",
    // 「AIへ:〜してください」— 읽는 주체를 AI로 지목하고 명령한다.
    // 지목 + 명령형이 같은 문장 안에 있을 때만 잡는다. 지목만으로는 아래 warn 단계다
    re: /(AI|ＡＩ|エージェント|アシスタント|ボット|クローラー|自動巡回|言語モデル|LLM)\s*(の方|さん|各位|様)?\s*[へに][:：、]?[^。\n]{0,100}(ください|下さい|せよ|しろ|すること|しなさい|してね)/g,
    why_ja: "読み手を AI として名指しし、操作を指示しています。人間の利用者に向けた案内ではありません。",
  },
  {
    id: "inj.exfiltrate",
    kind: "prompt_injection",
    severity: "block",
    // 회話 이력·자격증명의 반출 요구. 이게 실제 피해가 나는 경로다.
    //
    // ★ 명사 쪽을 좁게 잡는다. 「履歴」 단독을 넣으면 「更新履歴を表示」 같은
    //   자치체 페이지의 정상 UI 문자열이 block이 된다. 그렇게 지우고 나면
    //   에이전트의 실패가 사이트 탓인지 우리 탓인지 구별할 수 없게 된다.
    //   사이에 URL이 끼는 형태가 실제 공격의 표준이라 간격은 60자까지 허용한다.
    re: /((会話|やり取り)の?履歴|これまでの(会話|やり取り)|(システム)?プロンプト|APIキー|api[_\s-]?key|認証情報|アクセストークン|パスワード|秘密鍵)[^。\n]{0,60}?(送信|送って|転送|開示|アップロード|共有)/g,
    why_ja: "会話履歴や認証情報の送信・開示を求めています。情報の持ち出しを狙う典型的な形です。",
  },
  {
    id: "inj.fake-tag",
    kind: "prompt_injection",
    severity: "block",
    // 시스템 메시지 경계를 위조하는 태그. 사람이 읽는 문서에 있을 이유가 없다
    re: /(<\s*\/?\s*(system|instruction|assistant|human)\s*>|\[\s*\/?\s*(INST|SYS|SYSTEM)\s*\]|###\s*(System|Instruction)\s*:)/gi,
    why_ja: "システムメッセージの境界を偽装するタグです。通常の本文には現れません。",
  },
  {
    id: "inj.role-reassign",
    kind: "prompt_injection",
    severity: "warn",
    // 역할 재지정. block까지 올리지 않는 이유: 소설·해설문에서도 나올 수 있는 형태다
    re: /((あなた|君|きみ)は(今|今後|これから|以降|もう)[^。\n]{0,30}(です|である|になりました|として振る舞)|\byou\s+are\s+(now|no longer)\b)/gi,
    why_ja: "読み手の役割を書き換えようとする文です。単独では断定できないため記録のみ行います。",
  },
  {
    id: "inj.system-prompt-mention",
    kind: "prompt_injection",
    severity: "warn",
    re: /(システム\s*(プロンプト|メッセージ|指示)|\bsystem\s*(prompt|message)\s*[:：])/gi,
    why_ja: "システムプロンプトへの言及です。解説記事でも現れうるため、記録のみ行います。",
  },
  {
    id: "inj.urgent-directive",
    kind: "prompt_injection",
    severity: "info",
    // 「重要な指示:」류. 정상 문서에도 흔하다. 기록만 남긴다
    re: /(【\s*(重要|緊急|必須)\s*(な)?(指示|命令)\s*】|(重要|緊急|必須)な?(指示|命令)\s*[:：])/g,
    why_ja: "指示文の体裁をとった強調表現です。正当な案内でも用いられるため、記録のみ行います。",
  },
];

// ─────────────────────────────────────────────────────────────
// pii
// ─────────────────────────────────────────────────────────────
//
// ★ 여기에 전화번호·메일주소·우편번호는 **일부러 넣지 않았다.**
//   공개 www에 있는 것이 정상이고, 넣으면 트레이스가 잡음으로 가득 찬다.
//   우리가 잡는 것은 「공개 페이지에 있어서는 안 되고, 상류 모델에 보내서도 안 되는 것」뿐이다.
//   상류(OrcaRouter PII Shield)가 더 넓게 본다 — 여기는 그 앞단의 좁은 그물이다.

const PII: Pattern[] = [
  {
    id: "pii.mynumber",
    kind: "pii",
    severity: "block",
    // 12자리 단독이면 전화번호·정리번호와 구별할 수 없다. 반드시 키워드와 함께 볼 것
    re: /(マイナンバー|個人番号)[^0-9\n]{0,12}(\d[\s-]?){11}\d/g,
    why_ja: "個人番号（マイナンバー）とみられる並びです。上流モデルへ送ってはならない情報です。",
  },
  {
    id: "pii.pension",
    kind: "pii",
    severity: "block",
    re: /基礎年金番号[^0-9\n]{0,12}\d{4}[\s-]?\d{6}/g,
    why_ja: "基礎年金番号とみられる並びです。上流モデルへ送ってはならない情報です。",
  },
  {
    id: "pii.card",
    kind: "pii",
    severity: "block",
    // Luhn 검사를 통과한 것만 남긴다 (verifyCard). 통과 못 하면 그냥 숫자열이다
    re: /\b(?:\d[ -]?){13,18}\d\b/g,
    why_ja: "クレジットカード番号の形式（Luhn 検査を通過）です。上流モデルへ送ってはならない情報です。",
  },
];

export const PATTERNS: Pattern[] = [...INJECTION, ...PII];

/**
 * Luhn 검사. `pii.card`의 후처리 전용.
 *
 * 왜 필요한가: 13~19자리 숫자열은 자치체 페이지의 정리번호·통계표에도 나온다.
 * 검사 없이 잡으면 통계 페이지 하나에서 수십 건이 뜨고, 그 순간 이 탐지기는 못 쓰게 된다.
 */
export function verifyCard(digits: string): boolean {
  const d = digits.replace(/[^0-9]/g, "");
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let dbl = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (dbl) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** severity → verdict. block만 실제로 바이트를 지운다 (탐지는 넓게, 차단은 좁게) */
export function verdictFor(severity: ThreatRecord["severity"]): ThreatRecord["verdict"] {
  return severity === "block" ? "block" : severity === "warn" ? "review" : "allow";
}
