-- ─────────────────────────────────────────────────────────────
-- masks 테이블에 「근거의 종류」를 추가한다
--
-- schema.sql 은 `create table if not exists` 라서 이미 적용된 DB 에는
-- 새 칸이 들어가지 않는다. 이 파일을 Supabase SQL Editor 에 붙여넣어 실행한다.
-- 신규 DB 라면 schema.sql 만 돌리면 되고 이 파일은 필요 없다.
--
-- 적용 시점의 masks 는 0행이었으므로 백필(backfill)은 없다.
-- ─────────────────────────────────────────────────────────────

-- ① 근거의 종류. 기존 행은 전부 이해율 근거였다
alter table masks add column if not exists basis text not null default 'comprehension_rate';
alter table masks drop constraint if exists masks_basis_check;
alter table masks add constraint masks_basis_check
  check (basis in ('comprehension_rate','designated_list'));

-- ② 명단 근거에는 코호트가 없다. 「누구의 이해율인가」라는 질문 자체가 성립하지 않는다
alter table masks alter column cohort drop not null;

-- ③ 「대신 뭐라고 쓰라는 건가」. 그대로 리포트의 개선 제안이 된다
alter table masks add column if not exists listing_no      int;
alter table masks add column if not exists listing_term    text;
alter table masks add column if not exists listing_meaning text;

-- ④ 근거 없는 행은 DB 가 직접 거부한다 (절대규칙 2)
alter table masks drop constraint if exists masks_basis_evidence;
alter table masks add constraint masks_basis_evidence check (
  (basis = 'comprehension_rate' and cohort is not null)
  or (basis = 'designated_list' and listing_no is not null)
);

-- ⑤ 뷰는 열 순서가 바뀌면 `create or replace` 가 거부한다. 먼저 지운다
drop view if exists v_top_masks;
create view v_top_masks as
select
  r.batch_id,
  m.surface,
  -- 근거가 다르면 같은 표기라도 합치지 않는다. 합치는 순간 「이 %는 어디서 나왔나」에 답할 수 없다
  m.basis,
  m.comprehension,
  count(*)                                    as hits,
  count(*) filter (where m.in_control)        as hits_in_controls,
  count(distinct m.run_id)                    as runs_affected,
  min(m.evidence_ja)                          as evidence_ja,
  -- 「代わりにこう書く」 — 명단 근거일 때만 채워진다
  min(m.listing_meaning)                      as plain_ja
from masks m
join runs r using (run_id)
group by r.batch_id, m.surface, m.basis, m.comprehension
order by hits_in_controls desc, hits desc;
