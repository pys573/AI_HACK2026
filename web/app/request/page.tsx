import { Page } from "@/components/Chrome";
import { LiveForm } from "@/components/LiveForm";
import { loadProfileCards } from "@/lib/profiles";
import { loadCategories, loadTasks } from "@/lib/tasks";

/**
 * 즉석 실행 접수 화면 (`website design/mainpage.png`).
 *
 * ★ 이 화면이 생기기 전까지, 랜딩의 「依頼する」는 GitHub 이슈를 열었다.
 *   그건 페이크는 아니었지만(실제로 접수는 됐다) 「그 자리에서 돌지 않는다」는 뜻이었다.
 *   심사위원은 자기가 아는 URL을 넣어본다. 거기서 아무 일도 안 일어나면
 *   「미리 준비한 것만 되는 도구」가 되고, 105회 실측의 신뢰도까지 같이 떨어진다.
 *
 * ⚠️ 즉석 실행에는 **사람이 만든 정답 키가 없다** → 도달 판정이 AI 하나뿐이다.
 *   그 사실은 `/live` 화면과 판정문에 그대로 적힌다 (`missions/README.md`).
 */

export const metadata = {
  title: "試してみる — ツマヅキ",
  description: "URLと条件を入れると、制約をかけたAIがその場でサイトを試します。",
};

export default async function RequestPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const cards = loadProfileCards([
    "senior-70s",
    "resident-n3",
    "smartphone-novice",
    "busy-worker",
    "control",
  ]);
  const tasks = loadTasks();
  const categories = loadCategories();
  // 랜딩에서 이미 URL을 쳤으면 두 번 치게 하지 않는다
  const initialUrl = (await searchParams).url ?? "";

  return (
    <Page back={{ href: "/", label: "トップへ" }}>
      <section className="brand-wash border-b border-line">
        <div className="mx-auto w-full max-w-6xl px-6 py-14 text-center sm:py-20">
          <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">
            試したいウェブサイトのURLを入力
          </h1>
          <p className="mt-4 text-sm text-fg-muted sm:text-base">
            公共サイトや企業サイトの「つまずき」を、その場で探します。
          </p>
        </div>
      </section>

      <section className="bg-surface">
        <div className="mx-auto w-full max-w-6xl px-6 py-14 sm:py-20">
          <LiveForm
            cards={cards}
            tasks={tasks}
            categories={categories}
            initialUrl={initialUrl}
          />
        </div>
      </section>
    </Page>
  );
}
