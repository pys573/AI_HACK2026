import { notFound } from "next/navigation";
import { Page } from "@/components/Chrome";
import { ResultReport } from "@/components/ResultReport";
import { loadLiveResult } from "@/lib/live-trace";
import { loadProfileCards } from "@/lib/profiles";

/**
 * 즉석 실행 1회의 결과 화면.
 *
 * ★ 진행 화면(`/live`)의 상태를 갈아끼우지 않고 **따로 주소를 준 이유**가 두 가지 있다.
 *   ① 화면 상태로만 들고 있으면 새로고침 한 번에 결과가 사라진다. 무대에서 결과를
 *      다시 열 수 없다는 뜻이고, 그건 절대규칙 7에 정면으로 걸린다.
 *   ② 스트림의 `done`에는 `baseline_usd`가 없다 — 절감률은 저장된 기록에만 있다.
 *
 * 주소만 있으면 같은 결과가 몇 번이든 열린다. 영상 촬영도 이 성질에 기댄다.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "分析結果 — ツマヅキ",
  // 즉석 실행 결과는 남의 사이트에 대한 1회 관측이다. 검색에 남기지 않는다
  robots: { index: false, follow: false },
};

export default async function LiveResultPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const runId = (await searchParams).run ?? "";
  const d = loadLiveResult(runId);
  // 없는 기록·이상한 주소는 전부 404다. 「무엇이 없었는지」를 알려주지 않는다
  if (!d) notFound();

  const card = loadProfileCards([d.profileId])[0];
  const persona = card?.personaJa && card.photo ? { name: card.personaJa, photo: card.photo } : null;

  return (
    <Page back={{ href: "/request", label: "別の条件で試す" }}>
      <ResultReport d={d} persona={persona} />
    </Page>
  );
}
