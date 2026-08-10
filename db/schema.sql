-- ツマヅキ (Tsumazuki) — Supabase / Postgres 스키마 (W0-6)
--
-- ★ 설계 원칙: RunTrace(JSONB)가 **원본**이고, 나머지 컬럼은 전부 **질의용 사본**이다.
--   리플레이 화면은 runs.trace 하나만 읽으면 되고,
--   원가·이탈률·마스킹 집계는 정규화된 테이블에서 SQL로 뽑는다.
--   해커톤 일정에서 스키마 마이그레이션을 반복할 여유가 없다 — 원본을 통째로 들고 있으면
--   나중에 컬럼이 더 필요해져도 재실행 없이 backfill할 수 있다.
--
--   psql "$SUPABASE_DB_URL" -f db/schema.sql

-- ─────────────────────────────────────────────────────────────
-- 배치: 같은 미션·같은 사이트에 대한 여러 프로필 실행 묶음
-- ─────────────────────────────────────────────────────────────
create table if not exists batches (
  batch_id        text primary key,
  created_at      timestamptz not null default now(),
  mission_id      text not null,
  site_id         text not null,
  site_name       text not null,
  -- 분할화면 왼쪽에 놓을 대조군
  control_run_id  text
);

-- ─────────────────────────────────────────────────────────────
-- 실행 1회
-- ─────────────────────────────────────────────────────────────
create table if not exists runs (
  run_id            text primary key,
  batch_id          text not null references batches(batch_id) on delete cascade,
  created_at        timestamptz not null,

  mission_id        text not null,
  track             text not null check (track in ('public','b2b')),
  site_id           text not null,
  site_name         text not null,
  start_url         text not null,
  goal_ja           text not null,

  -- ★ 프로필 id와 version은 항상 붙어다닌다. 분리되면 검증 불가능한 주장이 된다
  profile_id        text not null,
  profile_version   text not null,
  variant           int  not null default 0,

  outcome           text not null check (outcome in
                      ('reached','gave_up_clicks','gave_up_time','gave_up_self','max_steps','error')),
  reached           boolean not null,
  -- 정답키 판정과 LLM 판정이 갈린 건. 감추지 않는다 — 사람이 본다
  disagreed         boolean not null default false,
  clicks            int not null,
  seconds           int not null,

  total_cost_usd    numeric(14,10) not null,
  -- 전량 프론티어 환산. ⚠️ 계산치이지 실측이 아니다
  baseline_cost_usd numeric(14,10),
  llm_calls_count   int not null default 0,
  cached_tokens     int not null default 0,

  runner_node       text,
  runner_playwright text,
  runner_chrome     text,

  -- ★ 원본. 리플레이는 이것만 읽는다
  trace             jsonb not null,
  schema_version    text not null default '1.0'
);

create index if not exists runs_batch_idx    on runs (batch_id);
create index if not exists runs_profile_idx  on runs (profile_id, profile_version);
create index if not exists runs_site_idx     on runs (site_id, mission_id);
create index if not exists runs_outcome_idx  on runs (outcome);

-- ─────────────────────────────────────────────────────────────
-- 스텝
-- raw/seen 스냅샷은 runs.trace 안에 이미 있다. 여기엔 집계용 수치만 꺼내둔다
-- ─────────────────────────────────────────────────────────────
create table if not exists steps (
  run_id                text not null references runs(run_id) on delete cascade,
  n                     int  not null,
  ts                    timestamptz not null,
  url                   text not null,
  title                 text,

  action_kind           text check (action_kind in
                          ('click','scroll','back','find_in_page','site_search','give_up')),
  action_index          int,
  action_ok             boolean not null default true,
  action_error          text,
  -- LLM이 스스로 말한 이유. 「헤맴」의 증거이자 리포트 인용문
  reason_ja             text,

  elements_total        int not null,
  elements_in_viewport  int not null,
  masked_count          int not null default 0,
  masked_in_controls    int not null default 0,
  -- ⑥ 제약 자체가 코스트 절감이다
  chars_before          int not null default 0,
  chars_after           int not null default 0,

  patience_clicks_left  int,
  patience_seconds_left int,

  primary key (run_id, n)
);

create index if not exists steps_url_idx on steps (url);

-- ─────────────────────────────────────────────────────────────
-- LLM 호출 — ⑥「実測原価」의 원장(元帳)
-- 여기가 비면 코스트 주장은 전부 근거를 잃는다
-- ─────────────────────────────────────────────────────────────
create table if not exists llm_calls (
  id                bigserial primary key,
  run_id            text not null references runs(run_id) on delete cascade,
  -- 실행 종료 시점의 judge/diagnose는 마지막 스텝에 붙는다
  step_n            int not null,
  step_type         text not null check (step_type in ('perceive','decide','judge','diagnose')),
  model             text not null,
  prompt_tokens     int not null,
  completion_tokens int not null,
  cached_tokens     int not null default 0,
  cost_usd          numeric(14,10) not null,
  -- ★ 'api' = OrcaRouter가 돌려준 실측 원가 / 'table' = 우리가 가격표로 계산
  --   「이 숫자 어디서 나왔나요」에 답하지 못하면 ⑥은 0점이다
  cost_source       text not null check (cost_source in ('api','table')),
  latency_ms        int not null,
  route             text,
  mode              text,
  retries           int not null default 0
);

create index if not exists llm_calls_run_idx   on llm_calls (run_id);
create index if not exists llm_calls_model_idx on llm_calls (model);
create index if not exists llm_calls_type_idx  on llm_calls (step_type);

-- ─────────────────────────────────────────────────────────────
-- 마스킹 히트 — 「どの語が何回リンクを潰したか」
-- 리포트에서 가장 강한 표가 여기서 나온다
-- ─────────────────────────────────────────────────────────────
create table if not exists masks (
  id            bigserial primary key,
  run_id        text not null references runs(run_id) on delete cascade,
  step_n        int not null,
  surface       text not null,
  entry         text,
  action        text not null check (action in ('mask','partial','unknown')),
  -- 근거의 종류. 이해율(%)과 지정 명단은 성질이 다르다 — 섞으면 주장이 무너진다
  basis         text not null default 'comprehension_rate'
                check (basis in ('comprehension_rate','designated_list')),
  comprehension numeric(5,2),
  -- 명단 근거에는 코호트가 없다. 「누구의 이해율인가」라는 질문 자체가 성립하지 않는다
  cohort        text check (cohort in ('overall','senior')),
  -- 「대신 뭐라고 쓰라는 건가」. 명단 근거에만 있고, 그대로 리포트의 개선 제안이 된다
  listing_no      int,
  listing_term    text,
  listing_meaning text,
  -- true = 링크·버튼 라벨 안이었다. 이게 많을수록 탐색 자체가 막힌다
  in_control    boolean not null,
  evidence_ja   text not null,
  -- 근거 없는 히트는 버그다(절대규칙 2). 애플리케이션만 믿지 않고 여기서도 막는다
  constraint masks_basis_evidence check (
    (basis = 'comprehension_rate' and cohort is not null)
    or (basis = 'designated_list' and listing_no is not null)
  )
);

create index if not exists masks_run_idx     on masks (run_id);
create index if not exists masks_surface_idx on masks (surface);

-- ─────────────────────────────────────────────────────────────
-- 위협 — ⑦ 보안. 외부 웹 텍스트를 LLM에 먹이는 이상 인젝션은 실재 위협이다
-- 조용히 처리하면 증거가 사라진다. 반드시 남기고 화면에 띄운다
-- ─────────────────────────────────────────────────────────────
create table if not exists threats (
  id        bigserial primary key,
  run_id    text not null references runs(run_id) on delete cascade,
  step_n    int not null,
  kind      text not null check (kind in
              ('prompt_injection','pii','tool_abuse','offsite_navigation')),
  severity  text not null check (severity in ('info','warn','block')),
  location  text not null,
  excerpt   text not null,
  verdict   text not null check (verdict in ('allow','review','block')),
  detector  text not null check (detector in ('local','orcarouter_firewall','orcarouter_pii')),
  note_ja   text
);

create index if not exists threats_run_idx  on threats (run_id);
create index if not exists threats_kind_idx on threats (kind);

-- ─────────────────────────────────────────────────────────────
-- 진단 결과 — 리포트 본문
-- ─────────────────────────────────────────────────────────────
create table if not exists findings (
  id        bigserial primary key,
  run_id    text not null references runs(run_id) on delete cascade,
  step_n    int not null,
  url       text not null,
  cause_ja  text not null,
  fix_ja    text not null,
  -- 근거는 실측치만. 근거 없는 findings는 버그다
  evidence  text[] not null default '{}',
  severity  text not null check (severity in ('high','medium','low'))
);

create index if not exists findings_run_idx      on findings (run_id);
create index if not exists findings_severity_idx on findings (severity);

-- ─────────────────────────────────────────────────────────────
-- 집계 뷰 — 화면에 그대로 꽂는다
-- ─────────────────────────────────────────────────────────────

-- ⑥ 스텝 종류별 원가. 「なぜこの配分なのか」를 이 표로 설명한다
create or replace view v_cost_by_step_type as
select
  r.batch_id,
  c.step_type,
  count(*)                              as calls,
  sum(c.cost_usd)                       as cost_usd,
  sum(c.prompt_tokens)                  as prompt_tokens,
  sum(c.completion_tokens)              as completion_tokens,
  sum(c.cached_tokens)                  as cached_tokens,
  round(avg(c.latency_ms))              as avg_latency_ms,
  -- 표 기준 계산이 섞여 있으면 「実測」이라고 말할 수 없다
  bool_and(c.cost_source = 'api')       as all_measured
from llm_calls c
join runs r using (run_id)
group by r.batch_id, c.step_type;

create or replace view v_cost_by_model as
select
  r.batch_id,
  c.model,
  count(*)                        as calls,
  sum(c.cost_usd)                 as cost_usd,
  round(avg(c.latency_ms))        as avg_latency_ms,
  bool_and(c.cost_source = 'api') as all_measured
from llm_calls c
join runs r using (run_id)
group by r.batch_id, c.model;

-- 이탈률. 제품이 파는 숫자 그 자체
create or replace view v_dropout as
select
  r.batch_id,
  r.site_name,
  r.mission_id,
  r.profile_id,
  r.profile_version,
  count(*)                                                   as runs,
  count(*) filter (where r.reached)                          as reached,
  count(*) filter (where not r.reached)                      as gave_up,
  round(count(*) filter (where not r.reached)::numeric
        / nullif(count(*), 0), 3)                            as dropout_rate,
  round(avg(r.clicks), 1)                                    as avg_clicks,
  round(avg(r.seconds), 1)                                   as avg_seconds,
  -- 판정이 갈린 건이 있으면 그 배치의 숫자는 아직 사람이 봐야 한다
  count(*) filter (where r.disagreed)                        as needs_review
from runs r
group by r.batch_id, r.site_name, r.mission_id, r.profile_id, r.profile_version;

-- 「どの語がリンクを潰したか」 상위 목록
create or replace view v_top_masks as
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

-- ⑦ 위협 요약
create or replace view v_threats as
select
  r.batch_id,
  t.kind,
  t.detector,
  t.verdict,
  count(*) as hits
from threats t
join runs r using (run_id)
group by r.batch_id, t.kind, t.detector, t.verdict;

-- ─────────────────────────────────────────────────────────────
-- RLS
-- 데모는 공개 URL로 보여준다 → anon은 읽기만. 쓰기는 service_role(러너)만
-- ─────────────────────────────────────────────────────────────
alter table batches   enable row level security;
alter table runs      enable row level security;
alter table steps     enable row level security;
alter table llm_calls enable row level security;
alter table masks     enable row level security;
alter table threats   enable row level security;
alter table findings  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['batches','runs','steps','llm_calls','masks','threats','findings'] loop
    execute format('drop policy if exists %I on %I', t || '_anon_read', t);
    execute format('create policy %I on %I for select to anon, authenticated using (true)',
                   t || '_anon_read', t);
  end loop;
end $$;
