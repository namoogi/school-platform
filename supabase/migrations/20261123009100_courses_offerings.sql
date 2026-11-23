-- ADR 0004 단계 2: 수업·수강·갈래 규칙 판·명령 경계
--
-- 표: subjects · course_types · course_type_rules(판, 추가만) · course_offerings · offering_staff · offering_enrollments
--
-- 원칙 (ADR 0004 P1·P2·P7·P9, B2·B3·B4)
-- * 모든 표에 school_id, UNIQUE(id, school_id), 학교 안 참조는 복합 FK. 사람은 id로만.
-- * 갈래(course_types)의 수명주기 계기·공개 가능·P/F 허용은 규칙 판(course_type_rules) 한 곳에서만 읽는다.
--   개설은 만들 때의 규칙 판을 고정(rule_id)하고, 규칙이 새 판으로 바뀌어도 기존 개설을 다시 쓰지 않는다.
-- * 생성 계기: term_start(필수과목: 학기 시작 명령으로 신청 없이 활성화 + 학교급 학적 학생 자동 수강) /
--   application_close(신청 마감 명령) / approval(승인 명령). 계기와 맞지 않는 명령은 거부한다.
-- * 요청 역할(authenticated)은 SELECT만. 쓰기는 app_writer 소유 명령 함수로만(단계 1과 같은 경계).
-- * 담당자 권한: 수강 변경은 학교 관리자 또는 그 개설의 담당(lead)·보조(assistant). 담당은 로그인 계정 ↔ 사람 연결로 판정.
-- * 동시 편집: 수강·상태를 바꾸는 명령은 expected_revision을 받고 개설 행을 잠근다. 다르면 편집 충돌(409).

-- ── 판정 함수 ────────────────────────────────────────────
-- 로그인 계정이 이 학교에서 연결된 사람 (없으면 null). RLS로 소속 학교만 보인다.
create or replace function app.my_person(target uuid) returns uuid
language sql stable set search_path = pg_catalog, public, pg_temp as $$
  select a.person_id from public.person_accounts a where a.school_id = target and a.user_id = app.uid()
$$;
revoke all on function app.my_person(uuid) from public, anon;
grant execute on function app.my_person(uuid) to authenticated, app_writer;

-- ── 과목·갈래·규칙 판 ────────────────────────────────────
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  code text not null check (code ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$'),
  name text not null check (length(trim(name)) between 1 and 100 and name !~ '[[:cntrl:]]'),
  school_level_id uuid,
  created_at timestamptz not null default now(),
  unique (school_id, code),
  unique (id, school_id),
  foreign key (school_level_id, school_id) references public.school_levels(id, school_id)
);

create table public.course_types (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  code text not null check (code ~ '^[a-z][a-z0-9_]{0,30}$'),
  name text not null check (length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (school_id, code),
  unique (id, school_id)
);

create table public.course_type_rules (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  course_type_id uuid not null,
  version integer not null check (version >= 1),
  creation_trigger text not null check (creation_trigger in ('term_start', 'application_close', 'approval')),
  publishable boolean not null,
  pass_fail_allowed boolean not null,
  note text check (note is null or length(note) <= 500),
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  unique (course_type_id, version),
  unique (id, school_id),
  unique (id, school_id, course_type_id),
  foreign key (course_type_id, school_id) references public.course_types(id, school_id)
);

-- ── 개설·담당·수강 ───────────────────────────────────────
create table public.course_offerings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  term_id uuid not null,
  subject_id uuid not null,
  course_type_id uuid not null,
  rule_id uuid not null,
  school_level_id uuid not null,
  section text not null default '' check (length(section) <= 20),
  credits numeric(4, 1) not null check (credits >= 0 and credits <= 99),
  pass_fail boolean not null default false,
  capacity integer check (capacity is null or capacity >= 1),
  status text not null check (status in ('planned', 'open', 'active', 'closed', 'cancelled')),
  revision integer not null default 1 check (revision >= 1),
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  unique (term_id, subject_id, section),
  unique (id, school_id),
  foreign key (term_id, school_id) references public.terms(id, school_id),
  foreign key (subject_id, school_id) references public.subjects(id, school_id),
  foreign key (rule_id, school_id, course_type_id) references public.course_type_rules(id, school_id, course_type_id),
  foreign key (school_level_id, school_id) references public.school_levels(id, school_id)
);
create index course_offerings_term on public.course_offerings (school_id, term_id, status);

create table public.offering_staff (
  school_id uuid not null,
  offering_id uuid not null,
  person_id uuid not null,
  role text not null check (role in ('lead', 'assistant', 'external')),
  added_by uuid not null default app.uid(),
  added_at timestamptz not null default now(),
  primary key (offering_id, person_id),
  foreign key (offering_id, school_id) references public.course_offerings(id, school_id),
  foreign key (person_id, school_id) references public.people(id, school_id)
);
create unique index offering_staff_one_lead on public.offering_staff (offering_id) where role = 'lead';
create index offering_staff_person on public.offering_staff (school_id, person_id);

create table public.offering_enrollments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  offering_id uuid not null,
  person_id uuid not null,
  status text not null check (status in ('applied', 'enrolled', 'withdrawn', 'rejected')),
  source text not null check (source in ('application', 'required', 'staff')),
  pass_fail_choice boolean,
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid not null default app.uid(),
  updated_at timestamptz not null default now(),
  unique (offering_id, person_id),
  unique (id, school_id),
  foreign key (offering_id, school_id) references public.course_offerings(id, school_id),
  foreign key (person_id, school_id) references public.people(id, school_id)
);
create index offering_enrollments_person on public.offering_enrollments (school_id, person_id);

-- 담당자 판정: 이 개설의 lead·assistant인가 (외부 강사는 수강을 바꾸지 않는다)
create or replace function app.is_offering_staff(offering uuid, target uuid) returns boolean
language sql stable set search_path = pg_catalog, public, pg_temp as $$
  select exists (
    select 1 from public.offering_staff s
    where s.offering_id = offering and s.school_id = target and s.role in ('lead', 'assistant')
      and s.person_id = app.my_person(target)
  )
$$;
revoke all on function app.is_offering_staff(uuid, uuid) from public, anon;
grant execute on function app.is_offering_staff(uuid, uuid) to authenticated, app_writer;

-- ── 변경 제한 트리거 (단계 1의 private.guard_columns 재사용) ──
create trigger subjects_guard before update or delete on public.subjects
  for each row execute function private.guard_columns();
create trigger course_types_guard before update or delete on public.course_types
  for each row execute function private.guard_columns();
create trigger course_type_rules_guard before update or delete on public.course_type_rules
  for each row execute function private.guard_columns();
create trigger course_offerings_guard before update or delete on public.course_offerings
  for each row execute function private.guard_columns('status', 'revision', 'activated_at');
create trigger offering_enrollments_guard before update or delete on public.offering_enrollments
  for each row execute function private.guard_columns('status', 'pass_fail_choice', 'updated_by', 'updated_at');
-- 담당 배정은 바꾸지 않고 빼고 다시 넣는다(삭제는 명령 함수만 허용, 아래 정책)
create or replace function private.offering_staff_no_update() returns trigger
language plpgsql as $$
begin
  raise exception 'offering_staff: 담당 배정은 바꾸지 않고 뺀 뒤 다시 넣습니다.' using errcode = 'P0001';
end $$;
create trigger offering_staff_no_update before update on public.offering_staff
  for each row execute function private.offering_staff_no_update();

-- ── 권한과 RLS ───────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['subjects', 'course_types', 'course_type_rules', 'course_offerings', 'offering_staff', 'offering_enrollments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated, app_writer', t);
    execute format('grant insert on public.%I to app_writer', t);
    execute format('create policy %I on public.%I for select to authenticated, app_writer using (app.is_member(school_id))', t || '_read', t);
  end loop;
end $$;

create policy subjects_insert on public.subjects for insert to app_writer with check (app.is_school_admin(school_id));
create policy course_types_insert on public.course_types for insert to app_writer with check (app.is_school_admin(school_id));
create policy course_type_rules_insert on public.course_type_rules for insert to app_writer
  with check (app.is_school_admin(school_id) and created_by = app.uid());
create policy course_offerings_insert on public.course_offerings for insert to app_writer with check (app.is_school_admin(school_id));
create policy offering_staff_insert on public.offering_staff for insert to app_writer with check (app.is_school_admin(school_id));
-- 수강·개설 상태: 학교 관리자 또는 그 개설의 담당·보조
create policy offering_enrollments_insert on public.offering_enrollments for insert to app_writer
  with check (app.is_school_admin(school_id) or app.is_offering_staff(offering_id, school_id));

grant update (status, revision, activated_at) on public.course_offerings to app_writer;
grant update (status, pass_fail_choice, updated_by, updated_at) on public.offering_enrollments to app_writer;
grant delete on public.offering_staff to app_writer;
create policy course_offerings_update on public.course_offerings for update to app_writer
  using (app.is_school_admin(school_id) or app.is_offering_staff(id, school_id))
  with check (app.is_school_admin(school_id) or app.is_offering_staff(id, school_id));
create policy offering_enrollments_update on public.offering_enrollments for update to app_writer
  using (app.is_school_admin(school_id) or app.is_offering_staff(offering_id, school_id))
  with check (app.is_school_admin(school_id) or app.is_offering_staff(offering_id, school_id));
create policy offering_staff_delete on public.offering_staff for delete to app_writer using (app.is_school_admin(school_id));

-- ── 명령 함수 ────────────────────────────────────────────
-- 공통: 학교 ID는 서버가 로그인 소속에서 정해 넘긴다. 입력값을 오류 메시지에 넣지 않는다.

create or replace function app.add_subject(target uuid, subject_code text, subject_name text, level_id uuid default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare nid uuid;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if coalesce(subject_code, '') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$' then
    raise exception '과목 코드는 영문·숫자로 시작하는 40자 이내입니다.' using errcode = '22023';
  end if;
  if length(trim(coalesce(subject_name, ''))) not between 1 and 100 or subject_name ~ '[[:cntrl:]]' then
    raise exception '과목 이름은 1~100자입니다.' using errcode = '22023';
  end if;
  begin
    insert into public.subjects(school_id, code, name, school_level_id)
    values (target, subject_code, trim(subject_name), level_id) returning id into nid;
  exception when foreign_key_violation then
    raise exception '이 학교의 학교급을 찾을 수 없습니다.' using errcode = 'P0002';
  end;
  return nid;
end $$;

create or replace function app.add_course_type(target uuid, type_code text, type_name text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare nid uuid;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if coalesce(type_code, '') !~ '^[a-z][a-z0-9_]{0,30}$' then
    raise exception '갈래 코드는 영문 소문자로 시작하는 31자 이내입니다.' using errcode = '22023';
  end if;
  if length(trim(coalesce(type_name, ''))) not between 1 and 60 then
    raise exception '갈래 이름은 1~60자입니다.' using errcode = '22023';
  end if;
  insert into public.course_types(school_id, code, name) values (target, type_code, trim(type_name)) returning id into nid;
  return nid;
end $$;

-- 갈래 규칙의 새 판. 이전 판은 그대로 남고, 이미 만든 개설은 만들 때의 판을 계속 따른다.
create or replace function app.set_course_type_rule(target uuid, course_type uuid, trigger_kind text,
  is_publishable boolean, allows_pass_fail boolean, rule_note text default null)
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare nextv integer;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if trigger_kind is null or trigger_kind not in ('term_start', 'application_close', 'approval') then
    raise exception '생성 계기는 학기 시작·신청 마감·승인 중 하나입니다.' using errcode = '22023';
  end if;
  if is_publishable is null or allows_pass_fail is null then
    raise exception '공개 가능 여부와 P/F 허용 여부를 정해 주세요.' using errcode = '22023';
  end if;
  if rule_note is not null and length(rule_note) > 500 then raise exception '메모는 500자 이내입니다.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('school-platform:course_type_rules'), hashtext(coalesce(course_type::text, '')));
  if not exists (select 1 from public.course_types where id = course_type and school_id = target) then
    raise exception '갈래를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  select coalesce(max(version), 0) + 1 into nextv from public.course_type_rules where course_type_id = course_type and school_id = target;
  insert into public.course_type_rules(school_id, course_type_id, version, creation_trigger, publishable, pass_fail_allowed, note)
  values (target, course_type, nextv, trigger_kind, is_publishable, allows_pass_fail, rule_note);
  return nextv;
end $$;

-- 개설: 갈래의 최신 규칙 판을 고정한다. 신청 마감 갈래는 바로 신청을 받고(open), 나머지는 계획(planned).
create or replace function app.create_offering(target uuid, term uuid, subject uuid, course_type uuid, level_id uuid,
  offering_credits numeric, offering_pass_fail boolean default false, offering_section text default '', offering_capacity integer default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare r record; nid uuid;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if offering_credits is null or offering_credits < 0 or offering_credits > 99 then
    raise exception '학점은 0~99 사이입니다.' using errcode = '22023';
  end if;
  if offering_capacity is not null and offering_capacity < 1 then raise exception '정원은 1 이상입니다.' using errcode = '22023'; end if;
  if length(coalesce(offering_section, '')) > 20 then raise exception '분반 이름은 20자 이내입니다.' using errcode = '22023'; end if;
  select id, creation_trigger, pass_fail_allowed into r from public.course_type_rules
    where course_type_id = course_type and school_id = target order by version desc limit 1;
  if r.id is null then raise exception '이 갈래의 규칙 판이 없습니다. 먼저 규칙을 정해 주세요.' using errcode = 'P0002'; end if;
  if coalesce(offering_pass_fail, false) and not r.pass_fail_allowed then
    raise exception '이 갈래는 P/F를 허용하지 않습니다.' using errcode = '22023';
  end if;
  begin
    insert into public.course_offerings(school_id, term_id, subject_id, course_type_id, rule_id, school_level_id, section,
      credits, pass_fail, capacity, status)
    values (target, term, subject, course_type, r.id, level_id, coalesce(offering_section, ''), offering_credits,
      coalesce(offering_pass_fail, false), offering_capacity, case when r.creation_trigger = 'application_close' then 'open' else 'planned' end)
    returning id into nid;
  exception
    when foreign_key_violation then
      raise exception '이 학교의 학기·과목·학교급을 찾을 수 없습니다.' using errcode = 'P0002';
    when unique_violation then
      raise exception '같은 학기에 같은 과목·분반이 이미 있습니다.' using errcode = 'P0001';
  end;
  return nid;
end $$;

create or replace function app.assign_offering_staff(target uuid, offering uuid, person uuid, staff_role text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if staff_role is null or staff_role not in ('lead', 'assistant', 'external') then
    raise exception '역할은 담당·보조·외부 강사 중 하나입니다.' using errcode = '22023';
  end if;
  begin
    insert into public.offering_staff(school_id, offering_id, person_id, role) values (target, offering, person, staff_role);
  exception
    when foreign_key_violation then raise exception '이 학교의 개설·사람을 찾을 수 없습니다.' using errcode = 'P0002';
    when unique_violation then raise exception '이미 배정됐거나 담당(lead)이 이미 있습니다.' using errcode = 'P0001';
  end;
end $$;

create or replace function app.remove_offering_staff(target uuid, offering uuid, person uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  delete from public.offering_staff where school_id = target and offering_id = offering and person_id = person;
  if not found then raise exception '배정을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
end $$;

-- 개설 행을 잠그고 예상 판(revision)을 확인한다. 권한: 학교 관리자 또는 담당·보조.
-- 명령 함수 안에서만 부른다(실행 권한은 app_writer에만).
create or replace function app.lock_offering_for_change(target uuid, offering uuid, expected_revision integer,
  out o_id uuid, out o_status text, out o_revision integer, out o_capacity integer, out o_level uuid,
  out o_term uuid, out o_pass_fail boolean, out o_trigger text)
language plpgsql set search_path = pg_catalog, public, pg_temp as $$
begin
  if not (app.is_school_admin(target) or app.is_offering_staff(offering, target)) then
    raise exception '이 수업의 담당·보조 교사나 학교 관리자만 바꿀 수 있습니다.' using errcode = '42501';
  end if;
  select c.id, c.status, c.revision, c.capacity, c.school_level_id, c.term_id, c.pass_fail, r.creation_trigger
    into o_id, o_status, o_revision, o_capacity, o_level, o_term, o_pass_fail, o_trigger
    from public.course_offerings c join public.course_type_rules r on r.id = c.rule_id and r.school_id = c.school_id
    where c.id = offering and c.school_id = target for update of c;
  if o_id is null then raise exception '개설을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if expected_revision is null or o_revision <> expected_revision then
    raise exception '다른 사람이 먼저 이 수업을 바꿨습니다. 화면을 새로 고친 뒤 다시 해 주세요.' using errcode = 'P0001';
  end if;
end $$;
revoke all on function app.lock_offering_for_change(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function app.lock_offering_for_change(uuid, uuid, integer) to app_writer;

-- 신청(신청 마감 갈래, 신청 받는 중일 때). 학교급 학적이 있어야 한다.
create or replace function app.apply_offering(target uuid, offering uuid, person uuid, expected_revision integer)
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare o record; t record;
begin
  select * into o from app.lock_offering_for_change(target, offering, expected_revision);
  if o.o_trigger <> 'application_close' or o.o_status <> 'open' then
    raise exception '지금은 신청을 받는 수업이 아닙니다.' using errcode = 'P0001';
  end if;
  select coalesce(starts_on, current_date) as d into t from public.terms where id = o.o_term and school_id = target;
  if not exists (select 1 from public.enrollments_school e where e.school_id = target and e.person_id = person
                 and e.school_level_id = o.o_level and daterange(e.starts_on, e.ends_on, '[)') @> t.d) then
    raise exception '이 수업의 학교급 학적이 없습니다.' using errcode = '22023';
  end if;
  insert into public.offering_enrollments(school_id, offering_id, person_id, status, source)
  values (target, offering, person, 'applied', 'application')
  on conflict (offering_id, person_id) do update set status = 'applied', updated_by = app.uid(), updated_at = now()
    where public.offering_enrollments.status in ('withdrawn', 'rejected');
  update public.course_offerings set revision = revision + 1 where id = offering and school_id = target;
  return o.o_revision + 1;
end $$;

-- 신청 마감 → 신청 순서대로 정원까지 확정, 나머지는 반려, 개설 활성화
create or replace function app.close_applications(target uuid, offering uuid, expected_revision integer)
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare o record; n integer;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  select * into o from app.lock_offering_for_change(target, offering, expected_revision);
  if o.o_trigger <> 'application_close' then
    raise exception '이 갈래는 신청 마감으로 개설되지 않습니다(규칙 판의 생성 계기와 다름).' using errcode = 'P0001';
  end if;
  if o.o_status <> 'open' then raise exception '신청을 받는 중인 수업만 마감할 수 있습니다.' using errcode = 'P0001'; end if;
  with ranked as (
    select id, row_number() over (order by created_at, id) as rn from public.offering_enrollments
    where offering_id = offering and school_id = target and status = 'applied'
  )
  update public.offering_enrollments e
     set status = case when o.o_capacity is null or r.rn <= o.o_capacity then 'enrolled' else 'rejected' end,
         updated_by = app.uid(), updated_at = now()
    from ranked r where e.id = r.id;
  select count(*) into n from public.offering_enrollments where offering_id = offering and school_id = target and status = 'enrolled';
  update public.course_offerings set status = 'active', activated_at = now(), revision = revision + 1 where id = offering and school_id = target;
  return n;
end $$;

-- 승인 갈래: 계획 → 활성
create or replace function app.approve_offering(target uuid, offering uuid, expected_revision integer)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare o record;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  select * into o from app.lock_offering_for_change(target, offering, expected_revision);
  if o.o_trigger <> 'approval' then
    raise exception '이 갈래는 승인으로 개설되지 않습니다(규칙 판의 생성 계기와 다름).' using errcode = 'P0001';
  end if;
  if o.o_status <> 'planned' then raise exception '계획 상태인 수업만 승인할 수 있습니다.' using errcode = 'P0001'; end if;
  update public.course_offerings set status = 'active', activated_at = now(), revision = revision + 1 where id = offering and school_id = target;
end $$;

-- 학기 시작: 계기가 term_start인 계획 개설(필수과목)을 모두 활성화하고, 학기 시작일에 그 학교급 학적이 있는 학생을 모두 수강 확정.
-- 신청이 없어도 개설·수강 자리가 생긴다(포털 L3: 필수과목 아카이브 자리 누락 방지). 다시 불러도 중복되지 않는다.
create or replace function app.start_term(target uuid, term uuid)
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare d date; n integer := 0; o record;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  select coalesce(starts_on, current_date) into d from public.terms where id = term and school_id = target;
  if d is null then raise exception '학기를 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  for o in
    select c.id, c.school_level_id from public.course_offerings c
      join public.course_type_rules r on r.id = c.rule_id and r.school_id = c.school_id
     where c.school_id = target and c.term_id = term and c.status = 'planned' and r.creation_trigger = 'term_start'
     order by c.id for update of c
  loop
    insert into public.offering_enrollments(school_id, offering_id, person_id, status, source)
    select target, o.id, e.person_id, 'enrolled', 'required'
      from public.enrollments_school e
     where e.school_id = target and e.school_level_id = o.school_level_id and daterange(e.starts_on, e.ends_on, '[)') @> d
    on conflict (offering_id, person_id) do nothing;
    update public.course_offerings set status = 'active', activated_at = now(), revision = revision + 1 where id = o.id and school_id = target;
    n := n + 1;
  end loop;
  return n;
end $$;

-- 담당·보조 또는 관리자가 수강 상태를 바꾼다(활성·신청 중 개설만). 확정에는 학교급 학적이 필요하다.
create or replace function app.set_offering_enrollment(target uuid, offering uuid, person uuid, new_status text,
  expected_revision integer, pf_choice boolean default null)
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare o record; t record;
begin
  if new_status is null or new_status not in ('enrolled', 'withdrawn', 'rejected') then
    raise exception '수강 상태는 확정·철회·반려 중 하나입니다.' using errcode = '22023';
  end if;
  select * into o from app.lock_offering_for_change(target, offering, expected_revision);
  if o.o_status not in ('open', 'active') then raise exception '마감했거나 취소한 수업의 수강은 바꿀 수 없습니다.' using errcode = 'P0001'; end if;
  if pf_choice is not null and not o.o_pass_fail then raise exception '이 수업은 P/F 수업이 아닙니다.' using errcode = '22023'; end if;
  if new_status = 'enrolled' then
    select coalesce(starts_on, current_date) as d into t from public.terms where id = o.o_term and school_id = target;
    if not exists (select 1 from public.enrollments_school e where e.school_id = target and e.person_id = person
                   and e.school_level_id = o.o_level and daterange(e.starts_on, e.ends_on, '[)') @> t.d) then
      raise exception '이 수업의 학교급 학적이 없습니다.' using errcode = '22023';
    end if;
  end if;
  begin
    insert into public.offering_enrollments(school_id, offering_id, person_id, status, source, pass_fail_choice)
    values (target, offering, person, new_status, 'staff', pf_choice)
    on conflict (offering_id, person_id) do update
      set status = excluded.status, pass_fail_choice = coalesce(excluded.pass_fail_choice, public.offering_enrollments.pass_fail_choice),
          updated_by = app.uid(), updated_at = now();
  exception when foreign_key_violation then
    raise exception '이 학교의 사람을 찾을 수 없습니다.' using errcode = 'P0002';
  end;
  update public.course_offerings set revision = revision + 1 where id = offering and school_id = target;
  return o.o_revision + 1;
end $$;

-- 소유자를 제한 역할로 바꾸고 실행은 로그인 사용자에게만 연다 (단계 1과 같은 순서: 권한 정리 → 소유자 변경)
grant create on schema app to app_writer;
do $$
declare f text;
begin
  foreach f in array array[
    'app.add_subject(uuid, text, text, uuid)',
    'app.add_course_type(uuid, text, text)',
    'app.set_course_type_rule(uuid, uuid, text, boolean, boolean, text)',
    'app.create_offering(uuid, uuid, uuid, uuid, uuid, numeric, boolean, text, integer)',
    'app.assign_offering_staff(uuid, uuid, uuid, text)',
    'app.remove_offering_staff(uuid, uuid, uuid)',
    'app.apply_offering(uuid, uuid, uuid, integer)',
    'app.close_applications(uuid, uuid, integer)',
    'app.approve_offering(uuid, uuid, integer)',
    'app.start_term(uuid, uuid)',
    'app.set_offering_enrollment(uuid, uuid, uuid, text, integer, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
    execute format('alter function %s owner to app_writer', f);
  end loop;
end $$;
revoke create on schema app from app_writer;
