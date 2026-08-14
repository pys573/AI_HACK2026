/**
 * 표시용 인물 정보. **여기만 손으로 쓴다.**
 *
 * 왜 profiles/*.json이 아니라 여기인가: 이건 계측 사양이 아니라 **화면 문구**다.
 * 프로필 파일은 「무엇을 제한했는가」의 기록이고, 여기는 「누구를 위한 것인가」의 설명이다.
 * 섞으면 사양 파일에 검증 불가능한 문장이 들어간다.
 *
 * ★ 왜 `profiles.ts`에서 떼어냈는가 (2026-08-14): 그 파일은 `node:fs`로 프로필 JSON을 읽어서
 *   **서버에서만 돈다.** 진행 화면(`LiveRun.tsx`)은 브라우저에서 도는 화면이라 거기서 못 부른다.
 *   그런데 진행 화면에도 같은 얼굴이 떠야 한다 → 손으로 한 벌 더 적으면 언젠가 반드시 어긋난다.
 *   그래서 **아무것도 import 하지 않는 이 파일**로 내리고, 양쪽이 여기를 본다.
 *
 * ⚠️ busy-worker의 사진은 목업에서 「高校生」으로 준비된 것이다. 우리 프로필은
 *    「시간이 없다(8클릭 / 2분)」를 재는 것이라 표시 이름을 인물 직업이 아니라
 *    **상태**로 두었다. 회사원 사진으로 바꿀 거라면 이름도 같이 바꾼다.
 *
 * ⚠️ control(대조군)은 여기에 없다. 사람이 아니라 **기준선**이라서 얼굴이 없는 게 맞다.
 *    부르는 쪽은 항상 「없을 때」를 견뎌야 한다.
 */

export type Persona = { name: string; photo: string; tags: string[] };

export const PERSONA: Record<string, Persona> = {
  "senior-70s": {
    name: "高齢者",
    photo: "/img/persona/senior-70s.jpg",
    tags: ["カタカナ語が読めない", "小さな文字が苦手"],
  },
  "resident-n3": {
    name: "外国人住民",
    photo: "/img/persona/resident-n3.jpg",
    tags: ["日本語に不安", "行政用語が難しい"],
  },
  "smartphone-novice": {
    name: "デジタル初心者",
    photo: "/img/persona/smartphone-novice.jpg",
    tags: ["画面しか見ない", "操作に不慣れ"],
  },
  "busy-worker": {
    name: "時間がない人",
    photo: "/img/persona/busy-worker.jpg",
    tags: ["すぐ諦める", "探し続けない"],
  },
};
