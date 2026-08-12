import Link from "next/link";
import { Page } from "@/components/Chrome";
import { LiveRun } from "@/components/LiveRun";

/**
 * 즉석 실행 진행 화면.
 *
 * 조건은 전부 주소(쿼리)에 있다. 그래야 새로고침하면 같은 조건으로 다시 돌고,
 * 「이 URL로 이렇게 돌렸다」를 링크 한 줄로 남길 수 있다.
 *
 * 실행 자체는 `LiveRun`이 열릴 때 시작한다 (서버에서 시작하지 않는다).
 * 서버에서 시작하면 미리 읽기(prefetch)만으로도 모델 호출이 나가서 돈이 샌다.
 */

export const metadata = {
  title: "実行中 — ツマヅキ",
  robots: { index: false },
};

/** 링크로 이상한 값이 들어와도 목록 밖으로 나가지 않게 한다 */
const PROFILES = ["senior-70s", "resident-n3", "smartphone-novice", "busy-worker", "control"];

export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; task?: string; profile?: string }>;
}) {
  const q = await searchParams;
  const url = (q.url ?? "").trim();
  const task = q.task ?? "tennyu";
  const profile = PROFILES.includes(q.profile ?? "") ? (q.profile as string) : "senior-70s";

  return (
    <Page back={{ href: "/request", label: "条件を選び直す" }}>
      <section className="bg-surface-2">
        <div className="mx-auto w-full max-w-6xl px-6 py-10 sm:py-14">
          {url ? (
            <LiveRun url={url} task={task} profile={profile} />
          ) : (
            <div className="mx-auto max-w-2xl rounded-2xl border border-line bg-surface p-8 text-center">
              <p className="text-lg font-bold">URLが指定されていません</p>
              <Link
                href="/request"
                className="mt-6 inline-block rounded-full bg-brand px-8 py-3 text-sm font-bold text-white"
              >
                条件を入力する
              </Link>
            </div>
          )}
        </div>
      </section>
    </Page>
  );
}
