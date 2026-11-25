-- 57차: ADR 0025 학사 토대 F2 — 과목 표기 판 · 척도 판 · 성적 정책 판 · 역량 틀 · 평가 항목 · 결과(사건) · 서술(사건) · 수업 마감 판 · 정정 판 · 재수강 연결
-- 원칙: 결과·서술은 추가만(정정은 앞 사건을 가리키는 새 사건), 마감 판은 그때 값·적용 판을 얼린다(지침 8), 판으로 쌓는 쓰기는 base_version 409(지침 10).
-- 쓰기는 app_writer 소유 명령 함수로만. 요청 역할은 SELECT만.
select set_config('request.jwt.claims', '{}', true);

-- ── 과목 표기 판 (학생부·성적증명서 과목명은 '제출용 표기'이고 바꾸는 것이 정상 실무 — 포털 교훈) ──
create table public.subject_labels (
  school_id uuid not null,
  subject_id uuid not null,
  purpose text not null check (purpose in ('all', 'record', 'transcript', 'report_card')),
  version integer not null check (version >= 1),
  label jsonb not null check (jsonb_typeof(label) = 'object' and label <> '{}'),
  why text check (why is null or length(why) <= 500),
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  primary key (subject_id, purpose, version),
  foreign key (subject_id, school_id) references public.subjects(id, school_id)
);

-- ── 척도 판 (KR 성취평가제 A–E·미이수, US 글자 성적·GPA 점수, 수준 1–4, P/F …) ──
create table public.scales (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  kind text not null check (kind in ('letter', 'level', 'pass_fail', 'percent', 'points')),
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  unique (school_id, code),
  unique (id, school_id)
);
-- bands: [{code, label:{}, min (이상), points, earns_credit}] — min 높은 것부터 맞춘다
create table public.scale_versions (
  school_id uuid not null,
  scale_id uuid not null,
  version integer not null check (version >= 1),
  bands jsonb not null check (jsonb_typeof(bands) = 'array' and jsonb_array_length(bands) between 1 and 30),
  why text check (why is null or length(why) <= 500),
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  primary key (scale_id, version),
  foreign key (scale_id, school_id) references public.scales(id, school_id)
);

-- ── 성적 정책 판 (학교 하나에 한 줄): 반올림·통계·글자 수 등. '왜' 칸 ──
create table public.grading_policies (
  school_id uuid not null references public.schools(id),
  version integer not null check (version >= 1),
  policy jsonb not null check (jsonb_typeof(policy) = 'object'),
  why text check (why is null or length(why) <= 500),
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  primary key (school_id, version)
);

-- ── 역량 틀 (CASE 모양: 틀 → 항목 나무). 국가 성취기준과 학교 역량(신앙·인성 포함)을 같은 구조로 ──
create table public.competency_frameworks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  code text not null check (code ~ '^[a-z0-9][a-z0-9_.-]{0,40}$'),
  title jsonb not null check (jsonb_typeof(title) = 'object' and title <> '{}'),
  source text not null default 'school' check (source in ('national', 'school', 'external')),
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  unique (school_id, code),
  unique (id, school_id)
);
create table public.competency_items (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  framework_id uuid not null,
  parent_id uuid,
  code text not null check (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,40}$'),
  statement jsonb not null check (jsonb_typeof(statement) = 'object' and statement <> '{}'),
  sort_order integer not null default 0,
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  unique (framework_id, code),
  unique (id, school_id),
  foreign key (framework_id, school_id) references public.competency_frameworks(id, school_id),
  foreign key (parent_id, school_id) references public.competency_items(id, school_id)
);

-- ── 평가 항목 (축: 과목 총괄 / 성취기준·역량 / 습관·품행) ──
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  offering_id uuid not null,
  grading_period_id uuid,
  code text not null check (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,40}$'),
  title jsonb not null check (jsonb_typeof(title) = 'object' and title <> '{}'),
  kind text not null default 'exam' check (kind ~ '^[a-z0-9][a-z0-9_.-]{0,40}$'),
  axis text not null default 'course' check (axis in ('course', 'competency', 'habit')),
  weight numeric(6, 2) not null default 0 check (weight >= 0 and weight <= 1000),
  max_score numeric(8, 2) check (max_score is null or max_score > 0),
  competency_item_id uuid,
  scale_id uuid,
  archived_at timestamptz,
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  check (axis <> 'competency' or competency_item_id is not null),
  check (axis <> 'course' or max_score is not null),
  unique (offering_id, code),
  unique (id, school_id),
  foreign key (offering_id, school_id) references public.course_offerings(id, school_id),
  foreign key (grading_period_id, school_id) references public.terms(id, school_id),
  foreign key (competency_item_id, school_id) references public.competency_items(id, school_id),
  foreign key (scale_id, school_id) references public.scales(id, school_id)
);

-- ── 결과 사건 (추가만. 정정 = 앞 결과를 가리키는 새 결과) ──
create table public.assessment_results (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  assessment_id uuid not null,
  person_id uuid not null,
  score numeric(8, 2),
  level_code text check (level_code is null or level_code ~ '^[A-Za-z0-9+\-]{1,8}$'),
  comment text check (comment is null or length(comment) <= 1000),
  corrects_id uuid references public.assessment_results(id),
  reason text check (reason is null or length(reason) <= 500),
  recorded_by uuid not null default app.uid(),
  recorded_at timestamptz not null default clock_timestamp(),
  check (score is not null or level_code is not null or comment is not null),
  unique (id, school_id),
  foreign key (assessment_id, school_id) references public.assessments(id, school_id),
  foreign key (person_id, school_id) references public.people(id, school_id)
);
create index assessment_results_latest on public.assessment_results (assessment_id, person_id, recorded_at desc);
create view public.current_assessment_results with (security_invoker = true) as
  select distinct on (r.assessment_id, r.person_id) r.*
    from public.assessment_results r order by r.assessment_id, r.person_id, r.recorded_at desc, r.id;

-- ── 서술 사건 (세특·행특·교사 의견·상담교사 서류: 종류와 작성자 역할은 코드) ──
create table public.narratives (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  person_id uuid not null,
  offering_id uuid,
  academic_year_id uuid not null,
  term_id uuid,
  kind text not null check (kind ~ '^[a-z0-9][a-z0-9_.-]{0,40}$'),
  author_role text not null check (author_role ~ '^[a-z0-9][a-z0-9_.-]{0,40}$'),
  body text not null check (length(body) <= 8000),
  corrects_id uuid references public.narratives(id),
  reason text check (reason is null or length(reason) <= 500),
  recorded_by uuid not null default app.uid(),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (id, school_id),
  foreign key (person_id, school_id) references public.people(id, school_id),
  foreign key (offering_id, school_id) references public.course_offerings(id, school_id),
  foreign key (academic_year_id, school_id) references public.academic_years(id, school_id),
  foreign key (term_id, school_id) references public.terms(id, school_id)
);
create index narratives_lookup on public.narratives (school_id, person_id, kind, recorded_at desc);

-- ── 재수강 연결 (원 시도를 가리키는 새 시도) ──
create table public.attempt_links (
  school_id uuid not null,
  person_id uuid not null,
  offering_id uuid not null,
  retake_of_offering_id uuid not null,
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  primary key (offering_id, person_id),
  check (offering_id <> retake_of_offering_id),
  foreign key (person_id, school_id) references public.people(id, school_id),
  foreign key (offering_id, school_id) references public.course_offerings(id, school_id),
  foreign key (retake_of_offering_id, school_id) references public.course_offerings(id, school_id)
);

-- ── 수업 마감 판 · 정정 판 (지침 8) ──
create table public.offering_closures (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  offering_id uuid not null,
  version integer not null check (version >= 1),
  previous_id uuid,
  reason text check (reason is null or length(reason) <= 1000),
  request_key text not null check (request_key ~ '^[A-Za-z0-9_.:-]{8,80}$'),
  policy_version integer,
  policy jsonb not null,
  scale_id uuid,
  scale_version integer,
  bands jsonb,
  credits numeric(4, 1) not null,
  pass_fail boolean not null,
  closed_by uuid not null default app.uid(),
  closed_at timestamptz not null default now(),
  check ((version = 1) = (previous_id is null)),
  check (version = 1 or reason is not null),
  unique (offering_id, version),
  unique (school_id, request_key),
  unique (id, school_id),
  unique (id, school_id, offering_id),
  foreign key (offering_id, school_id) references public.course_offerings(id, school_id),
  foreign key (previous_id, school_id, offering_id) references public.offering_closures(id, school_id, offering_id),
  foreign key (scale_id, school_id) references public.scales(id, school_id)
);
create unique index offering_closures_no_fork on public.offering_closures (previous_id) where previous_id is not null;
create table public.closure_results (
  school_id uuid not null,
  closure_id uuid not null,
  person_id uuid not null,
  raw_score numeric(7, 2),
  final_score numeric(7, 2),
  level_code text,
  attempt_status text not null check (attempt_status in ('completed', 'failed', 'incomplete', 'withdrawn')),
  credits_attempted numeric(4, 1) not null,
  credits_earned numeric(4, 1) not null,
  in_stats boolean not null,
  primary key (closure_id, person_id),
  foreign key (closure_id, school_id) references public.offering_closures(id, school_id),
  foreign key (person_id, school_id) references public.people(id, school_id)
);
create table public.closure_stats (
  school_id uuid not null,
  closure_id uuid primary key,
  n integer not null,
  mean numeric(7, 2),
  sd numeric(7, 2),
  foreign key (closure_id, school_id) references public.offering_closures(id, school_id)
);

-- ── 변경 제한 (모두 추가만, 평가 항목은 보관 표시만) ──
create trigger subject_labels_guard before update or delete on public.subject_labels for each row execute function private.guard_columns();
create trigger scales_guard before update or delete on public.scales for each row execute function private.guard_columns();
create trigger scale_versions_guard before update or delete on public.scale_versions for each row execute function private.guard_columns();
create trigger grading_policies_guard before update or delete on public.grading_policies for each row execute function private.guard_columns();
create trigger competency_frameworks_guard before update or delete on public.competency_frameworks for each row execute function private.guard_columns();
create trigger competency_items_guard before update or delete on public.competency_items for each row execute function private.guard_columns();
create trigger assessments_guard before update or delete on public.assessments for each row execute function private.guard_columns('archived_at');
create trigger assessment_results_guard before update or delete on public.assessment_results for each row execute function private.guard_columns();
create trigger narratives_guard before update or delete on public.narratives for each row execute function private.guard_columns();
create trigger attempt_links_guard before update or delete on public.attempt_links for each row execute function private.guard_columns();
create trigger offering_closures_guard before update or delete on public.offering_closures for each row execute function private.guard_columns();
create trigger closure_results_guard before update or delete on public.closure_results for each row execute function private.guard_columns();
create trigger closure_stats_guard before update or delete on public.closure_stats for each row execute function private.guard_columns();
-- 마감 판의 자식 행은 판과 같은 트랜잭션에서만 쓴다(확정 뒤 자식 추가 거부)
create or replace function private.closure_child_same_tx() returns trigger language plpgsql as $$
begin
  -- 마감 판의 closed_at 은 그 트랜잭션의 now() 다. 다른 트랜잭션에서는 같을 수 없다
  if not exists (select 1 from public.offering_closures c where c.id = new.closure_id and c.closed_at = now()) then
    raise exception '%: 확정한 마감 판에는 행을 더하지 않습니다.', tg_table_name using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger closure_results_same_tx before insert on public.closure_results for each row execute function private.closure_child_same_tx();
create trigger closure_stats_same_tx before insert on public.closure_stats for each row execute function private.closure_child_same_tx();

-- ── 권한과 RLS ───────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['subject_labels', 'scales', 'scale_versions', 'grading_policies', 'competency_frameworks', 'competency_items',
                           'assessments', 'assessment_results', 'narratives', 'attempt_links', 'offering_closures', 'closure_results', 'closure_stats'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated, app_writer', t);
    execute format('grant insert on public.%I to app_writer', t);
    execute format('create policy %I on public.%I for select to authenticated, app_writer using (app.is_member(school_id))', t || '_read', t);
    execute format('create policy %I on public.%I for insert to app_writer with check (app.is_member(school_id))', t || '_insert', t);
  end loop;
end $$;
grant update (archived_at) on public.assessments to app_writer;
create policy assessments_update on public.assessments for update to app_writer using (app.is_member(school_id)) with check (app.is_member(school_id));
revoke all on public.current_assessment_results from public, anon;
grant select on public.current_assessment_results to authenticated, app_writer;

-- ── 도움 함수 ────────────────────────────────────────────
create or replace function app.offering_closed(offering uuid) returns boolean
language sql stable set search_path = pg_catalog, public, pg_temp as $$
  select exists (select 1 from public.offering_closures c where c.offering_id = offering)
$$;
grant execute on function app.offering_closed(uuid) to authenticated, app_writer;

create or replace function private.can_grade(target uuid, offering uuid) returns boolean
language sql stable set search_path = pg_catalog, public, pg_temp as $$
  select app.is_school_admin(target) or app.is_offering_staff(offering, target)
$$;
grant usage on schema private to app_writer;
grant execute on function private.can_grade(uuid, uuid) to app_writer;

-- 척도 판으로 점수 → 등급 (min 이상인 가장 높은 띠)
create or replace function app.band_for(bands jsonb, score numeric) returns jsonb
language sql immutable set search_path = pg_catalog, public, pg_temp as $$
  select b from jsonb_array_elements(bands) b
   where score is not null and (b ->> 'min') is not null and score >= (b ->> 'min')::numeric
   order by (b ->> 'min')::numeric desc limit 1
$$;
grant execute on function app.band_for(jsonb, numeric) to authenticated, app_writer;

-- ── 명령 함수 ────────────────────────────────────────────
create or replace function app.set_subject_label(target uuid, subject uuid, p jsonb)
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v integer; pur text := coalesce(nullif(p ->> 'purpose', ''), 'all');
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if not exists (select 1 from public.subjects where id = subject and school_id = target) then raise exception '과목을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtext('school-platform:subject_labels'), hashtext(subject::text || pur));
  select coalesce(max(version), 0) into v from public.subject_labels where subject_id = subject and purpose = pur;
  if (p ->> 'base_version') is null or (p ->> 'base_version')::int <> v then
    raise exception '그 사이 새 판이 생겼습니다. 최신 판을 다시 읽어 고쳐 주세요.' using errcode = 'P0409';
  end if;
  begin
    insert into public.subject_labels(school_id, subject_id, purpose, version, label, why)
    values (target, subject, pur, v + 1, p -> 'label', nullif(trim(p ->> 'why'), ''));
  exception when check_violation then raise exception '표기 형식이 올바르지 않습니다.' using errcode = '22023';
  end;
  return v + 1;
end $$;

create or replace function app.save_scale(target uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare sid uuid; v integer; b jsonb;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if jsonb_typeof(p -> 'bands') <> 'array' then raise exception '척도 띠가 필요합니다.' using errcode = '22023'; end if;
  for b in select * from jsonb_array_elements(p -> 'bands') loop
    if coalesce(b ->> 'code', '') !~ '^[A-Za-z0-9+\-]{1,8}$' or jsonb_typeof(b -> 'label') <> 'object' then
      raise exception '척도 띠의 코드·표기가 올바르지 않습니다.' using errcode = '22023';
    end if;
  end loop;
  perform pg_advisory_xact_lock(hashtext('school-platform:scales'), hashtext(target::text || coalesce(p ->> 'code', '')));
  select id into sid from public.scales where school_id = target and code = p ->> 'code';
  if sid is null then
    if coalesce((p ->> 'base_version')::int, 0) <> 0 then raise exception '그 사이 새 판이 생겼습니다. 최신 판을 다시 읽어 고쳐 주세요.' using errcode = 'P0409'; end if;
    begin
      insert into public.scales(school_id, code, kind) values (target, p ->> 'code', p ->> 'kind') returning id into sid;
    exception when check_violation then raise exception '척도 코드·종류가 올바르지 않습니다.' using errcode = '22023';
    end;
    v := 0;
  else
    select coalesce(max(version), 0) into v from public.scale_versions where scale_id = sid;
    if (p ->> 'base_version') is null or (p ->> 'base_version')::int <> v then
      raise exception '그 사이 새 판이 생겼습니다. 최신 판을 다시 읽어 고쳐 주세요.' using errcode = 'P0409';
    end if;
  end if;
  insert into public.scale_versions(school_id, scale_id, version, bands, why) values (target, sid, v + 1, p -> 'bands', nullif(trim(p ->> 'why'), ''));
  return jsonb_build_object('id', sid, 'version', v + 1);
end $$;

create or replace function app.save_grading_policy(target uuid, p jsonb)
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v integer;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if jsonb_typeof(p -> 'policy') <> 'object' then raise exception '성적 정책이 필요합니다.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('school-platform:grading_policies'), hashtext(target::text));
  select coalesce(max(version), 0) into v from public.grading_policies where school_id = target;
  if (p ->> 'base_version') is null or (p ->> 'base_version')::int <> v then
    raise exception '그 사이 새 판이 생겼습니다. 최신 판을 다시 읽어 고쳐 주세요.' using errcode = 'P0409';
  end if;
  insert into public.grading_policies(school_id, version, policy, why) values (target, v + 1, p -> 'policy', nullif(trim(p ->> 'why'), ''));
  return v + 1;
end $$;

create or replace function app.add_competency_framework(target uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare nid uuid;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  begin
    insert into public.competency_frameworks(school_id, code, title, source)
    values (target, p ->> 'code', p -> 'title', coalesce(nullif(p ->> 'source', ''), 'school')) returning id into nid;
  exception
    when unique_violation then raise exception '같은 역량 틀 코드가 이미 있습니다.' using errcode = '23505';
    when check_violation or not_null_violation then raise exception '역량 틀 형식이 올바르지 않습니다.' using errcode = '22023';
  end;
  return nid;
end $$;

create or replace function app.add_competency_item(target uuid, framework uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare nid uuid;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  begin
    insert into public.competency_items(school_id, framework_id, parent_id, code, statement, sort_order)
    values (target, framework, nullif(p ->> 'parent_id', '')::uuid, p ->> 'code', p -> 'statement', coalesce((p ->> 'sort_order')::int, 0)) returning id into nid;
  exception
    when unique_violation then raise exception '같은 역량 코드가 이미 있습니다.' using errcode = '23505';
    when foreign_key_violation then raise exception '역량 틀이나 상위 항목을 찾을 수 없습니다.' using errcode = 'P0002';
    when check_violation or not_null_violation then raise exception '역량 항목 형식이 올바르지 않습니다.' using errcode = '22023';
  end;
  return nid;
end $$;

create or replace function app.add_assessment(target uuid, offering uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare nid uuid;
begin
  if not private.can_grade(target, offering) then raise exception '이 수업의 담당 교사나 학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if not exists (select 1 from public.course_offerings where id = offering and school_id = target) then raise exception '개설을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if app.offering_closed(offering) then raise exception '마감한 수업에는 평가 항목을 더하지 않습니다.' using errcode = 'P0001'; end if;
  begin
    insert into public.assessments(school_id, offering_id, grading_period_id, code, title, kind, axis, weight, max_score, competency_item_id, scale_id)
    values (target, offering, nullif(p ->> 'grading_period_id', '')::uuid, p ->> 'code', p -> 'title', coalesce(nullif(p ->> 'kind', ''), 'exam'),
            coalesce(nullif(p ->> 'axis', ''), 'course'), coalesce((p ->> 'weight')::numeric, 0), nullif(p ->> 'max_score', '')::numeric,
            nullif(p ->> 'competency_item_id', '')::uuid, nullif(p ->> 'scale_id', '')::uuid)
    returning id into nid;
  exception
    when unique_violation then raise exception '같은 평가 항목 코드가 이미 있습니다.' using errcode = '23505';
    when foreign_key_violation then raise exception '학기·역량·척도를 찾을 수 없습니다.' using errcode = 'P0002';
    when check_violation or not_null_violation then raise exception '평가 항목 형식이 올바르지 않습니다.' using errcode = '22023';
  end;
  return nid;
end $$;

create or replace function app.archive_assessment(target uuid, assessment uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare off uuid;
begin
  select offering_id into off from public.assessments where id = assessment and school_id = target and archived_at is null;
  if off is null then raise exception '평가 항목을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if not private.can_grade(target, off) then raise exception '이 수업의 담당 교사나 학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if app.offering_closed(off) then raise exception '마감한 수업의 평가 항목은 보관하지 않습니다.' using errcode = 'P0001'; end if;
  update public.assessments set archived_at = now() where id = assessment;
end $$;

-- 결과 기록. 마감 뒤에는 학교 관리자가 사유와 함께만(정정 → 새 마감 판)
create or replace function app.record_result(target uuid, assessment uuid, person uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare a record; prev uuid; nid uuid; sc numeric := nullif(p ->> 'score', '')::numeric;
begin
  select id, offering_id, max_score, archived_at into a from public.assessments where id = assessment and school_id = target;
  if a.id is null then raise exception '평가 항목을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if not private.can_grade(target, a.offering_id) then raise exception '이 수업의 담당 교사나 학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if a.archived_at is not null then raise exception '보관한 평가 항목입니다.' using errcode = 'P0001'; end if;
  if app.offering_closed(a.offering_id) then
    if not app.is_school_admin(target) or length(trim(coalesce(p ->> 'reason', ''))) = 0 then
      raise exception '마감한 수업의 결과는 학교 관리자가 사유와 함께 정정합니다.' using errcode = 'P0001';
    end if;
  end if;
  if not exists (select 1 from public.offering_enrollments e where e.offering_id = a.offering_id and e.person_id = person and e.status in ('enrolled', 'withdrawn')) then
    raise exception '이 수업의 수강생이 아닙니다.' using errcode = '22023';
  end if;
  if sc is not null and (sc < 0 or (a.max_score is not null and sc > a.max_score)) then raise exception '점수가 범위를 벗어났습니다.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('school-platform:results'), hashtext(assessment::text || person::text));
  select id into prev from public.current_assessment_results where assessment_id = assessment and person_id = person;
  begin
    insert into public.assessment_results(school_id, assessment_id, person_id, score, level_code, comment, corrects_id, reason)
    values (target, assessment, person, sc, nullif(p ->> 'level_code', ''), nullif(trim(p ->> 'comment'), ''), prev, nullif(trim(p ->> 'reason'), ''))
    returning id into nid;
  exception when check_violation then raise exception '결과 형식이 올바르지 않습니다.' using errcode = '22023';
  end;
  return nid;
end $$;

-- 서술 기록(세특·행특·교사 의견·상담교사 서류). 글자 수 한도는 성적 정책 판 narrative_limits[kind]
create or replace function app.record_narrative(target uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare off uuid := nullif(p ->> 'offering_id', '')::uuid; person uuid := (p ->> 'person_id')::uuid; k text := p ->> 'kind';
        lim integer; prev uuid; nid uuid; body text := coalesce(p ->> 'body', '');
begin
  if off is not null then
    if not private.can_grade(target, off) then raise exception '이 수업의 담당 교사나 학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
    if app.offering_closed(off) and (not app.is_school_admin(target) or length(trim(coalesce(p ->> 'reason', ''))) = 0) then
      raise exception '마감한 수업의 서술은 학교 관리자가 사유와 함께 정정합니다.' using errcode = 'P0001';
    end if;
  elsif not app.is_member(target) then
    raise exception '이 학교 구성원만 할 수 있습니다.' using errcode = '42501';
  end if;
  select (policy -> 'narrative_limits' ->> k)::int into lim from public.grading_policies where school_id = target order by version desc limit 1;
  if lim is not null and char_length(body) > lim then raise exception '글자 수 한도(%자)를 넘었습니다.', lim using errcode = '22023'; end if;
  select id into prev from public.narratives where school_id = target and person_id = person and kind = k
     and offering_id is not distinct from off and academic_year_id = (p ->> 'academic_year_id')::uuid
   order by recorded_at desc, id limit 1;
  begin
    insert into public.narratives(school_id, person_id, offering_id, academic_year_id, term_id, kind, author_role, body, corrects_id, reason)
    values (target, person, off, (p ->> 'academic_year_id')::uuid, nullif(p ->> 'term_id', '')::uuid, k, coalesce(nullif(p ->> 'author_role', ''), 'teacher'),
            body, prev, nullif(trim(p ->> 'reason'), ''))
    returning id into nid;
  exception
    when foreign_key_violation then raise exception '사람·수업·학년도를 찾을 수 없습니다.' using errcode = 'P0002';
    when check_violation or not_null_violation then raise exception '서술 형식이 올바르지 않습니다.' using errcode = '22023';
  end;
  return nid;
end $$;

create or replace function app.link_retake(target uuid, person uuid, offering uuid, prior_offering uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if (select subject_id from public.course_offerings where id = offering and school_id = target)
     is distinct from (select subject_id from public.course_offerings where id = prior_offering and school_id = target) then
    raise exception '같은 과목의 개설끼리만 재수강으로 잇습니다.' using errcode = '22023';
  end if;
  begin
    insert into public.attempt_links(school_id, person_id, offering_id, retake_of_offering_id) values (target, person, offering, prior_offering);
  exception
    when unique_violation then raise exception '이미 재수강으로 이어져 있습니다.' using errcode = '23505';
    when foreign_key_violation then raise exception '사람이나 개설을 찾을 수 없습니다.' using errcode = 'P0002';
  end;
end $$;

-- 수업 마감 판: 그때의 수강·결과·정책·척도로 원점수·최종 점수·등급·이수·학점·통계를 얼린다.
-- 정정은 base_version = 지금 판, 사유 필수 → 새 판(previous_id). 같은 request_key 다시 보내면 같은 판을 돌려준다.
create or replace function app.close_offering(target uuid, offering uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  o record; cur record; pol record; sc_id uuid; sc_ver integer; sc_bands jsonb; cid uuid; v integer; rk text := p ->> 'request_key';
  sdigits integer; fdigits integer; sd_kind text; e record; raw numeric; fin numeric; band jsonb; st text; pf boolean; inst boolean;
  total_w numeric; got_w numeric; missing boolean; n integer; m numeric; s numeric; earned numeric;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 마감합니다.' using errcode = '42501'; end if;
  select id, credits, pass_fail into o from public.course_offerings where id = offering and school_id = target;
  if o.id is null then raise exception '개설을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if coalesce(rk, '') !~ '^[A-Za-z0-9_.:-]{8,80}$' then raise exception '요청 키(request_key)가 필요합니다.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('school-platform:closures'), hashtext(offering::text));
  select id, offering_id, version into cur from public.offering_closures where school_id = target and request_key = rk;
  if cur.id is not null then
    if cur.offering_id <> offering then raise exception '같은 요청 키를 다른 수업에 썼습니다.' using errcode = 'P0409'; end if;
    return jsonb_build_object('id', cur.id, 'version', cur.version, 'repeated', true);
  end if;
  select id, version into cur from public.offering_closures where offering_id = offering order by version desc limit 1;
  v := coalesce(cur.version, 0);
  if (p ->> 'base_version') is null or (p ->> 'base_version')::int <> v then
    raise exception '그 사이 새 마감 판이 생겼습니다. 최신 판을 다시 읽어 주세요.' using errcode = 'P0409';
  end if;
  if v > 0 and length(trim(coalesce(p ->> 'reason', ''))) = 0 then raise exception '정정 마감에는 사유가 필요합니다.' using errcode = '22023'; end if;
  select version, policy into pol from public.grading_policies where school_id = target order by version desc limit 1;
  sdigits := coalesce((pol.policy ->> 'score_digits')::int, 2);
  fdigits := coalesce((pol.policy ->> 'final_digits')::int, 0);
  sd_kind := coalesce(pol.policy -> 'stats' ->> 'sd', 'population');
  if nullif(p ->> 'scale_id', '') is not null then
    select s2.id, sv.version, sv.bands into sc_id, sc_ver, sc_bands from public.scales s2 join public.scale_versions sv on sv.scale_id = s2.id
     where s2.id = (p ->> 'scale_id')::uuid and s2.school_id = target order by sv.version desc limit 1;
    if sc_id is null then raise exception '척도를 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  end if;
  insert into public.offering_closures(school_id, offering_id, version, previous_id, reason, request_key, policy_version, policy, scale_id, scale_version, bands, credits, pass_fail)
  values (target, offering, v + 1, cur.id, nullif(trim(p ->> 'reason'), ''), rk, pol.version, coalesce(pol.policy, '{}'), sc_id, sc_ver, sc_bands, o.credits, o.pass_fail)
  returning id into cid;

  for e in select en.person_id, en.status, en.pass_fail_choice from public.offering_enrollments en
            where en.offering_id = offering and en.status in ('enrolled', 'withdrawn') loop
    pf := o.pass_fail or coalesce(e.pass_fail_choice, false);
    -- 과목 총괄 축 가중 원점수: Σ(점수/만점×가중) / Σ가중 × 100. 빠진 결과가 있으면 미완료
    select coalesce(sum(a.weight), 0),
           coalesce(sum(case when r.score is not null then r.score / a.max_score * a.weight end), 0),
           bool_or(r.score is null)
      into total_w, got_w, missing
      from public.assessments a left join public.current_assessment_results r on r.assessment_id = a.id and r.person_id = e.person_id
     where a.offering_id = offering and a.archived_at is null and a.axis = 'course' and a.weight > 0;
    raw := case when total_w > 0 and not coalesce(missing, true) then round(got_w / total_w * 100, sdigits) end;
    fin := case when raw is not null then round(raw, fdigits) end;
    band := case when sc_id is not null then app.band_for(sc_bands, fin) end;
    if e.status = 'withdrawn' then st := 'withdrawn';
    elsif raw is null then st := 'incomplete';
    elsif band is not null and coalesce((band ->> 'earns_credit')::boolean, true) = false then st := 'failed';
    else st := 'completed';
    end if;
    earned := case when st = 'completed' then o.credits else 0 end;
    inst := st in ('completed', 'failed') and not pf and raw is not null;
    insert into public.closure_results(school_id, closure_id, person_id, raw_score, final_score, level_code, attempt_status, credits_attempted, credits_earned, in_stats)
    values (target, cid, e.person_id, raw, fin, band ->> 'code', st, case when e.status = 'withdrawn' then 0 else o.credits end, earned, inst);
  end loop;

  select count(*), round(avg(final_score), coalesce((pol.policy -> 'stats' ->> 'digits')::int, 1)),
         round(case when sd_kind = 'sample' then stddev_samp(final_score) else stddev_pop(final_score) end, coalesce((pol.policy -> 'stats' ->> 'digits')::int, 1))
    into n, m, s from public.closure_results where closure_id = cid and in_stats;
  insert into public.closure_stats(school_id, closure_id, n, mean, sd) values (target, cid, n, m, s);
  return jsonb_build_object('id', cid, 'version', v + 1, 'repeated', false);
end $$;

grant create on schema app to app_writer;
do $$
declare f text;
begin
  foreach f in array array[
    'app.set_subject_label(uuid, uuid, jsonb)',
    'app.save_scale(uuid, jsonb)',
    'app.save_grading_policy(uuid, jsonb)',
    'app.add_competency_framework(uuid, jsonb)',
    'app.add_competency_item(uuid, uuid, jsonb)',
    'app.add_assessment(uuid, uuid, jsonb)',
    'app.archive_assessment(uuid, uuid)',
    'app.record_result(uuid, uuid, uuid, jsonb)',
    'app.record_narrative(uuid, jsonb)',
    'app.link_retake(uuid, uuid, uuid, uuid)',
    'app.close_offering(uuid, uuid, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
    execute format('alter function %s owner to app_writer', f);
  end loop;
end $$;
revoke create on schema app from app_writer;
