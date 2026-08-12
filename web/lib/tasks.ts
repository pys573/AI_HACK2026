/**
 * 즉석 실행에서 고르는 「用事」. **서버에서만 돈다.**
 *
 * 목록의 원본은 `missions/tasks.json` 한 곳이다. 화면에도 같은 목록을 손으로 적어두면
 * 언젠가 반드시 어긋나고, 그때 화면에서 고른 용무가 에이전트에 없는 id가 된다.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Task = { id: string; label_ja: string; goal_ja: string; intent_ja: string };

const FILE = join(process.cwd(), "..", "missions", "tasks.json");

export function loadTasks(): Task[] {
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) as Task[];
  } catch {
    return [];
  }
}
