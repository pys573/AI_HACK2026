/**
 * 미션 로더 — **정답을 프롬프트에서 떼어놓기 위한 파일**.
 *
 * 이 파일의 존재 이유는 편의가 아니라 규율이다.
 * `loadMission()`은 정답을 담을 수 없는 타입을 돌려주고, 정답은 `loadKey()`로만 나온다.
 * 그래서 「decide.ts가 정답을 봤는가」를 import 목록만 보고 판정할 수 있다.
 *
 * 규칙: `loadKey()`를 호출해도 되는 파일은 `judge.ts` 하나뿐이다.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Mission, MissionKey } from "../../core/types.ts";

const MISSION_DIR = join(import.meta.dirname, "..", "..", "missions");

function readMissions(): Mission[] {
  return JSON.parse(readFileSync(join(MISSION_DIR, "public.json"), "utf8")) as Mission[];
}

/**
 * 검증용 미션 (`security.json`). 로컬 허니팟처럼 **실제 사이트가 아닌 대상**만 들어간다.
 * 분리해 둔 이유는 아래 `allMissions()`에 있다.
 */
function readSecurityMissions(): Mission[] {
  try {
    return JSON.parse(readFileSync(join(MISSION_DIR, "security.json"), "utf8")) as Mission[];
  } catch {
    return [];
  }
}

/**
 * ★ 공개 미션만 돌려준다. 검증용은 **일부러 뺀다.**
 * 배치 실행(`명부 전원을 같은 조건에 투입`)이 이걸 훑기 때문에, 여기에 허니팟이 섞이면
 * 이탈률 통계에 localhost 실행이 들어간다. 계측 대상과 검증 대상을 같은 통에 담지 않는다.
 */
export function allMissions(): Mission[] {
  return readMissions();
}

export function loadMission(id: string): Mission {
  const m = [...readMissions(), ...readSecurityMissions()].find((x) => x.id === id);
  if (!m) throw new Error(`미션 없음: ${id}`);
  return m;
}

/**
 * ⚠️ 정답 키. **`judge.ts` 외에서 호출하지 않는다.**
 * 호출한 파일이 프롬프트를 만드는 파일이면, 그 순간 이 제품의 측정값은 전부 무효다.
 */
export function loadKey(missionId: string): MissionKey {
  const read = (f: string): MissionKey[] => {
    try {
      return JSON.parse(readFileSync(join(MISSION_DIR, "keys", f), "utf8")) as MissionKey[];
    } catch {
      return [];
    }
  };
  const k = [...read("public.keys.json"), ...read("security.keys.json")].find(
    (x) => x.mission_id === missionId,
  );
  if (!k) throw new Error(`정답 키 없음: ${missionId}`);
  return k;
}
