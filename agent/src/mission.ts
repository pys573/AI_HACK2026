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

export function allMissions(): Mission[] {
  return readMissions();
}

export function loadMission(id: string): Mission {
  const m = readMissions().find((x) => x.id === id);
  if (!m) throw new Error(`미션 없음: ${id}`);
  return m;
}

/**
 * ⚠️ 정답 키. **`judge.ts` 외에서 호출하지 않는다.**
 * 호출한 파일이 프롬프트를 만드는 파일이면, 그 순간 이 제품의 측정값은 전부 무효다.
 */
export function loadKey(missionId: string): MissionKey {
  const keys = JSON.parse(
    readFileSync(join(MISSION_DIR, "keys", "public.keys.json"), "utf8"),
  ) as MissionKey[];
  const k = keys.find((x) => x.mission_id === missionId);
  if (!k) throw new Error(`정답 키 없음: ${missionId}`);
  return k;
}
