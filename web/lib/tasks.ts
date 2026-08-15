/**
 * 즉석 실행에서 고르는 「用事」와 그 분야. **서버에서만 돈다.**
 *
 * 목록의 원본은 `missions/tasks.json`·`missions/categories.json` 두 곳뿐이다.
 * 화면에도 같은 목록을 손으로 적어두면 언젠가 반드시 어긋나고, 그때 화면에서 고른
 * 용무가 에이전트에 없는 id가 된다.
 *
 * ★ 왜 분야로 나누는가: 목록이 평평하면 은행 주소에 「転入届」을 붙일 수 있다.
 *   그러면 실패한 것이 사이트인지 조합인지 구별되지 않고, 계측이 아니라 사고가 된다.
 *   분야를 먼저 고르게 하면 그 조합이 애초에 화면에 나오지 않는다.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Task = {
  id: string;
  /** 이 용무가 나오는 분야. 비어 있으면 화면에 안 나온다(주소로는 여전히 돈다) */
  categories: string[];
  label_ja: string;
  goal_ja: string;
  intent_ja: string;
};

export type Category = {
  id: string;
  label_ja: string;
  hint_ja: string;
  /** 그 분야에서 바로 넣어볼 수 있는 주소. 주소창에 채워 넣기만 한다 */
  sites: { label_ja: string; url: string }[];
};

const DIR = join(process.cwd(), "..", "missions");

function read<T>(file: string): T[] {
  try {
    return JSON.parse(readFileSync(join(DIR, file), "utf8")) as T[];
  } catch {
    return [];
  }
}

export function loadTasks(): Task[] {
  // 옛 파일에는 categories가 없다. 없으면 빈 배열로 본다 — 화면에서 사라질 뿐 실행은 된다
  return read<Task>("tasks.json").map((t) => ({ ...t, categories: t.categories ?? [] }));
}

export function loadCategories(): Category[] {
  return read<Category>("categories.json");
}
