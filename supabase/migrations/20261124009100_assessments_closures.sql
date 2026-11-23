-- ADR 0004 단계 3: 평가 초안 · 수업 마감 판 · 정정 사슬
--
-- 초안(고칠 수 있음): assessments · assessment_results · population_exclusions
-- 마감 판(추가만):   offering_closures · closure_members · closure_results
--
-- 원칙 (ADR 0004 P6, B3 · AGENTS 데이터 경계 8·10)
-- * 성적·모집단·통계는 수업 마감 판으로 확정한다. 마감 한 번에 같은 트랜잭션·같은 수업 잠금 안에서
--   모집단(포함/제외·사유)·학생별 총점·평가 항목별 점수 사본·통계(n·평균·표준편차)를 함께 얼린다.
-- * 판은 봉인(sealed) 뒤 수정·삭제·자식 행 추가를 거부한다. 표 소유자도 마찬가지(트리거).
-- * 정정은 사유와 이전 판 FK를 가진 새 판. 한 판에서 정정 판이 둘로 갈라지지 않게 previous_id 유일.
-- * 중복 요청: (학교, 수업, 요청 키) 유일. 같은 키·같은 입력이면 기존 판을 돌려주고, 같은 키·다른 입력이면 거부.
-- * 부분 실패: 자식 행 하나라도 실패하면 함수 전체(판·자식·수업 상태)가 롤백된다.
-- * 초안 쓰기는 수업 revision을 base_version으로 받는다(AGENTS 10). 다르면 409.
-- * 총점·통계 계산 규칙은 임시값이다: 총점 = Σ(점수/만점×가중치)/Σ가중치×100(빈 점수가 있으면 총점 없음),
--   통계는 포함 + 총점 있는 학생으로 모집단 표준편차, 소수 둘째 자리 반올림. 학교별 승인 규칙으로 바꿀 것(확인 필요).

-- ── 단계 2 표 보강 (새 파일에서 제약만 추가) ──────────────
alter table public.course_offerings drop constraint course_offerings_status_check;
alter table public.course_offerings add constraint course_offerings_status_check
  check (status in ('planned', 'open', 'active', 'closed', 'correcting', 'cancelled'));
-- 수강(학교 포함) 복합 FK 대상
alter table public.offering_enrollments add constraint offering_enrollments_offering_person_school unique (offering_id, person_id, school_id);

-- ── 초안 ─────────────────────────────────────────────────
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  offering_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 60 and name !~ '[[:cntrl:]]'),
  max_score numeric(7, 2) not null check (max_score > 0),
  weight numeric(6, 3) not null check (weight > 0),
  sort_order integer not null default 0,
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  unique (offering_id, name),
  unique (id, school_id),
  unique (id, school_id, offering_id),
  foreign key (offering_id, school_id) references public.course_offerings(id, school_id)
);

create table public.assessment_results (
  school_id uuid not null,
  offering_id uuid not null,
  assessment_id uuid not null,
  person_id uuid not null,
  score numeric(7, 2) check (score is null or score >= 0),
  passed boolean,
  updated_by uuid not null default app.uid(),
  updated_at timestamptz not null default now(),
  primary key (assessment_id, person_id),
  foreign key (assessment_id, school_id, offering_id) references public.assessments(id, school_id, offering_id),
  foreign key (offering_id, person_id, school_id) references public.offering_enrollments(offering_id, person_id, school_id)
);

create table public.population_exclusions (
  school_id uuid not null,
  offering_id uuid not null,
  person_id uuid not null,
  reason text not null check (length(trim(reason)) between 1 and 300),
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  primary key (offering_id, person_id),
  foreign key (offering_id, person_id, school_id) references public.offering_enrollments(offering_id, person_id, school_id)
);

-- ── 마감 판 ──────────────────────────────────────────────
create table public.offering_closures (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  offering_id uuid not null,
  version integer not null check (version >= 1),
  previous_id uuid,
  correction_reason text check (correction_reason is null or length(correction_reason) <= 500),
  request_key text not null check (request_key ~ '^[A-Za-z0-9_-]{8,80}$'),
  base_revision integer not null,
  member_count integer not null,
  n integer not null,
  mean numeric(7, 2),
  sd numeric(7, 2),
  approved_by uuid not null default app.uid(),
  approved_at timestamptz not null default now(),
  sealed boolean not null default false,
  unique (offering_id, version),
  unique (school_id, offering_id, request_key),
  unique (id, school_id),
  unique (id, school_id, offering_id),
  check ((version = 1) = (previous_id is null)),
  check (previous_id is null or coalesce(length(trim(correction_reason)), 0) > 0),
  foreign key (offering_id, school_id) references public.course_offerings(id, school_id),
  foreign key (previous_id, school_id, offering_id) references public.offering_closures(id, school_id, offering_id)
);
-- 한 판에서 정정 판이 둘로 갈라지지 않는다
create unique index offering_closures_one_successor on public.offering_closures (previous_id) where previous_id is not null;

create table public.closure_members (
  closure_id uuid not null,
  school_id uuid not null,
  offering_id uuid not null,
  person_id uuid not null,
  included boolean not null,
  exclusion_reason text,
  total numeric(7, 2),
  passed boolean,
  primary key (closure_id, person_id),
  check (included = (exclusion_reason is null)),
  foreign key (closure_id, school_id, offering_id) references public.offering_closures(id, school_id, offering_id),
  foreign key (person_id, school_id) references public.people(id, school_id)
);

create table public.closure_results (
  closure_id uuid not null,
  school_id uuid not null,
  offering_id uuid not null,
  person_id uuid not null,
  assessment_id uuid not null,
  assessment_name text not null,
  max_score numeric(7, 2) not null,
  weight numeric(6, 3) not null,
  score numeric(7, 2),
  passed boolean,
  primary key (closure_id, assessment_id, person_id),
  foreign key (closure_id, school_id, offering_id) references public.offering_closures(id, school_id, offering_id),
  foreign key (closure_id, person_id) references public.closure_members(closure_id, person_id),
  foreign key (assessment_id, school_id, offering_id) references public.assessments(id, school_id, offering_id)
);

-- ── 변경 제한 ────────────────────────────────────────────
create trigger assessments_guard before update or delete on public.assessments
  for each row execute function private.guard_columns();
create trigger assessment_results_guard before update or delete on public.assessment_results
  for each row execute function private.guard_columns('score', 'passed', 'updated_by', 'updated_at');

-- 판: 봉인(false → true)만 허용, 삭제·다른 열 수정·봉인 뒤 수정은 거부
create or replace function private.guard_closure() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'offering_closures: 마감 판은 삭제하지 않습니다. 정정은 새 판으로 합니다.' using errcode = 'P0001';
  end if;
  if old.sealed or not new.sealed or (to_jsonb(new) - 'sealed') is distinct from (to_jsonb(old) - 'sealed') then
    raise exception 'offering_closures: 마감 판은 고칠 수 없습니다. 정정은 새 판으로 합니다.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger offering_closures_guard before update or delete on public.offering_closures
  for each row execute function private.guard_closure();

-- 판의 자식 행: 봉인 전(같은 마감 명령 안)에서만 추가, 수정·삭제는 늘 거부
create or replace function private.guard_closure_child() returns trigger
language plpgsql as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception '%: 마감 판의 행은 고치거나 지울 수 없습니다.', tg_table_name using errcode = 'P0001';
  end if;
  if exists (select 1 from public.offering_closures c where c.id = new.closure_id and c.sealed) then
    raise exception '%: 봉인한 마감 판에는 행을 더할 수 없습니다.', tg_table_name using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger closure_members_guard before insert or update or delete on public.closure_members
  for each row execute function private.guard_closure_child();
create trigger closure_results_guard before insert or update or delete on public.closure_results
  for each row execute function private.guard_closure_child();

-- ── 권한과 RLS ───────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['assessments', 'assessment_results', 'population_exclusions', 'offering_closures', 'closure_members', 'closure_results'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated, app_writer', t);
    execute format('grant insert on public.%I to app_writer', t);
    execute format('create policy %I on public.%I for select to authenticated, app_writer using (app.is_member(school_id))', t || '_read', t);
  end loop;
end $$;

-- 초안: 학교 관리자 또는 그 수업의 담당·보조
create policy assessments_insert on public.assessments for insert to app_writer
  with check (app.is_school_admin(school_id) or app.is_offering_staff(offering_id, school_id));
create policy assessment_results_insert on public.assessment_results for insert to app_writer
  with check (app.is_school_admin(school_id) or app.is_offering_staff(offering_id, school_id));
create policy population_exclusions_insert on public.population_exclusions for insert to app_writer
  with check (app.is_school_admin(school_id) or app.is_offering_staff(offering_id, school_id));
grant update (score, passed, updated_by, updated_at) on public.assessment_results to app_writer;
create policy assessment_results_update on public.assessment_results for update to app_writer
  using (app.is_school_admin(school_id) or app.is_offering_staff(offering_id, school_id))
  with check (app.is_school_admin(school_id) or app.is_offering_staff(offering_id, school_id));
grant delete on public.population_exclusions to app_writer;
create policy population_exclusions_delete on public.population_exclusions for delete to app_writer
  using (app.is_school_admin(school_id) or app.is_offering_staff(offering_id, school_id));
-- 마감 판: 학교 관리자만
create policy offering_closures_insert on public.offering_closures for insert to app_writer
  with check (app.is_school_admin(school_id) and approved_by = app.uid());
grant update (sealed) on public.offering_closures to app_writer;
create policy offering_closures_update on public.offering_closures for update to app_writer
  using (app.is_school_admin(school_id)) with check (app.is_school_admin(school_id));
create policy closure_members_insert on public.closure_members for insert to app_writer with check (app.is_school_admin(school_id));
create policy closure_results_insert on public.closure_results for insert to app_writer with check (app.is_school_admin(school_id));

-- ── 명령 함수 ────────────────────────────────────────────
-- 초안을 바꾸는 명령은 단계 2의 잠금 도우미(app.lock_offering_for_change: 권한·revision 확인)를 거친다.

create or replace function app.add_assessment(target uuid, offering uuid, assessment_name text,
  assessment_max numeric, assessment_weight numeric, base_revision integer)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare o record; nid uuid;
begin
  select * into o from app.lock_offering_for_change(target, offering, base_revision);
  if o.o_status not in ('active', 'correcting') then
    raise exception '수업 중이거나 정정 중인 수업에만 평가 항목을 더할 수 있습니다.' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(assessment_name, ''))) not between 1 and 60 or assessment_name ~ '[[:cntrl:]]' then
    raise exception '평가 이름은 1~60자입니다.' using errcode = '22023';
  end if;
  if assessment_max is null or assessment_max <= 0 or assessment_max >= 100000 then
    raise exception '만점은 0보다 커야 합니다.' using errcode = '22023';
  end if;
  if assessment_weight is null or assessment_weight <= 0 or assessment_weight >= 1000 then
    raise exception '가중치는 0보다 커야 합니다.' using errcode = '22023';
  end if;
  begin
    insert into public.assessments(school_id, offering_id, name, max_score, weight,
      sort_order) values (target, offering, trim(assessment_name), assessment_max, assessment_weight,
      (select coalesce(max(sort_order), 0) + 1 from public.assessments where offering_id = offering and school_id = target))
    returning id into nid;
  exception when unique_violation then
    raise exception '같은 이름의 평가 항목이 이미 있습니다.' using errcode = 'P0001';
  end;
  update public.course_offerings set revision = revision + 1 where id = offering and school_id = target;
  return nid;
end $$;

-- 점수 기록(초안). 확정 수강생만. P/F 수업은 passed, 아니면 score.
create or replace function app.record_result(target uuid, assessment uuid, person uuid,
  result_score numeric, result_passed boolean, base_revision integer)
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare a record; o record;
begin
  select id, offering_id, max_score into a from public.assessments where id = assessment and school_id = target;
  if a.id is null then raise exception '평가 항목을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  select * into o from app.lock_offering_for_change(target, a.offering_id, base_revision);
  if o.o_status not in ('active', 'correcting') then
    raise exception '마감한 수업의 점수는 정정을 연 뒤에만 고칠 수 있습니다.' using errcode = 'P0001';
  end if;
  if result_score is not null and (result_score < 0 or result_score > a.max_score) then
    raise exception '점수는 0부터 만점 사이입니다.' using errcode = '22023';
  end if;
  if result_passed is not null and not o.o_pass_fail then raise exception '이 수업은 P/F 수업이 아닙니다.' using errcode = '22023'; end if;
  if not exists (select 1 from public.offering_enrollments e where e.offering_id = a.offering_id and e.school_id = target
                 and e.person_id = person and e.status = 'enrolled') then
    raise exception '이 수업의 확정 수강생이 아닙니다.' using errcode = '22023';
  end if;
  insert into public.assessment_results(school_id, offering_id, assessment_id, person_id, score, passed)
  values (target, a.offering_id, assessment, person, result_score, result_passed)
  on conflict (assessment_id, person_id) do update
    set score = excluded.score, passed = excluded.passed, updated_by = app.uid(), updated_at = now();
  update public.course_offerings set revision = revision + 1 where id = a.offering_id and school_id = target;
  return o.o_revision + 1;
end $$;

-- 모집단 제외(사유 필수) · 제외 해제
create or replace function app.set_population_exclusion(target uuid, offering uuid, person uuid, exclusion_reason text, base_revision integer)
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare o record;
begin
  select * into o from app.lock_offering_for_change(target, offering, base_revision);
  if o.o_status not in ('active', 'correcting') then
    raise exception '마감한 수업의 모집단은 정정을 연 뒤에만 바꿀 수 있습니다.' using errcode = 'P0001';
  end if;
  delete from public.population_exclusions where offering_id = offering and school_id = target and person_id = person;
  if exclusion_reason is not null then
    if length(trim(exclusion_reason)) not between 1 and 300 then
      raise exception '제외 사유를 300자 이내로 적어 주세요.' using errcode = '22023';
    end if;
    begin
      insert into public.population_exclusions(school_id, offering_id, person_id, reason) values (target, offering, person, trim(exclusion_reason));
    exception when foreign_key_violation then
      raise exception '이 수업의 수강생이 아닙니다.' using errcode = 'P0002';
    end;
  end if;
  update public.course_offerings set revision = revision + 1 where id = offering and school_id = target;
  return o.o_revision + 1;
end $$;

-- 마감: 모집단·성적·통계를 한 번에 얼린 판을 만든다. 학교 관리자만.
-- 첫 마감(수업 중) → 1판. 정정 중 → 이전 판을 가리키는 새 판(사유 필수).
create or replace function app.close_offering(target uuid, offering uuid, request_key text, base_revision integer,
  correction_reason text default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  o record; prev record; existing record; cid uuid; ver integer; st record; snap jsonb;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 마감할 수 있습니다.' using errcode = '42501'; end if;
  if coalesce(request_key, '') !~ '^[A-Za-z0-9_-]{8,80}$' then
    raise exception '요청 키가 올바르지 않습니다.' using errcode = '22023';
  end if;
  -- 같은 수업의 모든 초안 쓰기·마감과 같은 잠금
  select c.id, c.status, c.revision, c.pass_fail into o from public.course_offerings c
    where c.id = offering and c.school_id = target for update;
  if o.id is null then raise exception '개설을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  -- 중복 요청: 같은 키 → 같은 입력이면 기존 판, 다르면 거부 (revision 확인보다 먼저: 재시도는 옛 revision을 들고 온다)
  select oc.id, oc.base_revision, oc.correction_reason as reason into existing from public.offering_closures oc
    where oc.school_id = target and oc.offering_id = offering and oc.request_key = close_offering.request_key;
  if existing.id is not null then
    if existing.base_revision = close_offering.base_revision and existing.reason is not distinct from nullif(trim(correction_reason), '') then
      return existing.id;
    end if;
    raise exception '같은 요청 키로 다른 내용의 마감을 보냈습니다. 새 요청으로 다시 해 주세요.' using errcode = 'P0001';
  end if;
  if base_revision is null or o.revision <> base_revision then
    raise exception '다른 사람이 먼저 이 수업을 바꿨습니다. 화면을 새로 고친 뒤 다시 해 주세요.' using errcode = 'P0001';
  end if;
  select oc.id, oc.version into prev from public.offering_closures oc where oc.offering_id = offering and oc.school_id = target order by oc.version desc limit 1;
  if o.status = 'active' then
    if prev.id is not null then raise exception '이미 마감한 수업입니다.' using errcode = 'P0001'; end if;
    if nullif(trim(correction_reason), '') is not null then raise exception '첫 마감에는 정정 사유를 쓰지 않습니다.' using errcode = '22023'; end if;
    ver := 1;
  elsif o.status = 'correcting' then
    if nullif(trim(correction_reason), '') is null or length(correction_reason) > 500 then
      raise exception '정정 사유를 500자 이내로 적어 주세요.' using errcode = '22023';
    end if;
    ver := prev.version + 1;
  else
    raise exception '수업 중이거나 정정 중인 수업만 마감할 수 있습니다.' using errcode = 'P0001';
  end if;

  -- 학생별 총점(임시 규칙)과 통계를 같은 스냅샷에서 계산 (임시 표 대신 jsonb 변수: 임시 표 권한에 기대지 않는다)
  select coalesce(jsonb_agg(jsonb_build_object('person_id', q.person_id, 'included', q.included, 'reason', q.reason,
                                                'total', q.total, 'passed', q.passed)), '[]'::jsonb)
    into snap
    from (
      select e.person_id, x.person_id is null as included, x.reason,
             case when count(a.id) > 0 and count(a.id) = count(r.score)
                  then round(sum(r.score / a.max_score * a.weight) / sum(a.weight) * 100, 2) end as total,
             case when o.pass_fail and count(a.id) > 0 and count(a.id) = count(r.passed) then bool_and(r.passed) end as passed
        from public.offering_enrollments e
        left join public.population_exclusions x on x.offering_id = e.offering_id and x.person_id = e.person_id and x.school_id = e.school_id
        left join public.assessments a on a.offering_id = e.offering_id and a.school_id = e.school_id
        left join public.assessment_results r on r.assessment_id = a.id and r.person_id = e.person_id and r.school_id = e.school_id
       where e.offering_id = offering and e.school_id = target and e.status = 'enrolled'
       group by e.person_id, x.person_id, x.reason
    ) q;
  select count(*)::int as members,
         count(*) filter (where m.included and m.total is not null)::int as n,
         round(avg(m.total) filter (where m.included), 2) as mean,
         round(stddev_pop(m.total) filter (where m.included), 2) as sd
    into st from jsonb_to_recordset(snap) as m(person_id uuid, included boolean, reason text, total numeric, passed boolean);

  insert into public.offering_closures(school_id, offering_id, version, previous_id, correction_reason, request_key, base_revision,
    member_count, n, mean, sd)
  values (target, offering, ver, prev.id, nullif(trim(correction_reason), ''), close_offering.request_key, close_offering.base_revision,
    st.members, st.n, st.mean, st.sd)
  returning id into cid;
  insert into public.closure_members(closure_id, school_id, offering_id, person_id, included, exclusion_reason, total, passed)
  select cid, target, offering, m.person_id, m.included, m.reason, m.total, m.passed
    from jsonb_to_recordset(snap) as m(person_id uuid, included boolean, reason text, total numeric, passed boolean);
  insert into public.closure_results(closure_id, school_id, offering_id, person_id, assessment_id, assessment_name, max_score, weight, score, passed)
  select cid, target, offering, m.person_id, a.id, a.name, a.max_score, a.weight, r.score, r.passed
    from jsonb_to_recordset(snap) as m(person_id uuid, included boolean, reason text, total numeric, passed boolean)
    join public.assessments a on a.offering_id = offering and a.school_id = target
    left join public.assessment_results r on r.assessment_id = a.id and r.person_id = m.person_id and r.school_id = target;
  update public.offering_closures set sealed = true where id = cid;
  update public.course_offerings set status = 'closed', revision = revision + 1 where id = offering and school_id = target;
  perform app.log_access(target, 'closure.create', jsonb_build_object('offering', offering, 'version', ver));
  return cid;
end $$;

-- 정정 열기: 마감한 수업을 정정 중으로 돌린다. 기존 판은 그대로 남는다. 학교 관리자만.
create or replace function app.reopen_for_correction(target uuid, offering uuid, base_revision integer)
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare o record;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 정정을 열 수 있습니다.' using errcode = '42501'; end if;
  select * into o from app.lock_offering_for_change(target, offering, base_revision);
  if o.o_status <> 'closed' then raise exception '마감한 수업만 정정을 열 수 있습니다.' using errcode = 'P0001'; end if;
  update public.course_offerings set status = 'correcting', revision = revision + 1 where id = offering and school_id = target;
  perform app.log_access(target, 'closure.reopen', jsonb_build_object('offering', offering));
  return o.o_revision + 1;
end $$;

-- 소유자를 제한 역할로 (단계 1·2와 같은 순서: 권한 정리 → 소유자 변경)
grant create on schema app to app_writer;
do $$
declare f text;
begin
  foreach f in array array[
    'app.add_assessment(uuid, uuid, text, numeric, numeric, integer)',
    'app.record_result(uuid, uuid, uuid, numeric, boolean, integer)',
    'app.set_population_exclusion(uuid, uuid, uuid, text, integer)',
    'app.close_offering(uuid, uuid, text, integer, text)',
    'app.reopen_for_correction(uuid, uuid, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
    execute format('alter function %s owner to app_writer', f);
  end loop;
end $$;
revoke create on schema app from app_writer;
