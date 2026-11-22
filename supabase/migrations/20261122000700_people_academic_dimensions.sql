-- ADR 0004 단계 1: 공통 사람·계정 연결·학사 차원과 확정 규칙 연결
--
-- 표: school_levels · academic_years · terms · cohorts · homerooms
--     people · person_names · person_accounts · person_account_events
--     enrollments_school · homeroom_assignments
--
-- 원칙 (ADR 0004 P1~P4, B2, B4)
-- * 모든 표에 school_id, UNIQUE(id, school_id), 학교 안 참조는 복합 FK.
-- * 사람은 id로만 참조한다. 이름은 person_names(이력, 추가만)에서 표시용으로 조인한다.
-- * 계정(private.app_users)과 사람(people)을 분리한다. 한 학교에서 계정 하나는 사람 하나, 사람은 계정 0..n.
-- * 요청 역할(authenticated)은 SELECT만 한다. 쓰기는 app_writer(로그인·슈퍼유저·BYPASSRLS 없음)가 소유한
--   SECURITY DEFINER 명령 함수로만 한다. app_writer에도 RLS가 걸린다. (docs/research/command-role-probe.md)
-- * 학기(terms)는 확정 규칙(school_rules) 판을 FK로 가리킨다. 규칙이 새 판으로 바뀌어도 기존 학기를 다시 쓰지 않는다.

create extension if not exists btree_gist;

-- ── 명령 함수 소유 역할 ──────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_writer') then
    create role app_writer nologin nosuperuser nobypassrls nocreaterole nocreatedb noinherit noreplication;
  end if;
  -- 함수 소유자를 바꾸려면 실행 사용자가 이 역할의 구성원이어야 한다. (Supabase postgres는 슈퍼유저가 아님)
  if not (select rolsuper from pg_roles where rolname = current_user)
     and not pg_has_role(current_user, 'app_writer', 'MEMBER') then
    execute format('grant app_writer to %I', current_user);
  end if;
  -- 요청 역할이 명령 역할을 얻을 수 있으면 쓰기 경계가 무너진다.
  if pg_has_role('authenticated', 'app_writer', 'MEMBER') or pg_has_role('anon', 'app_writer', 'MEMBER') then
    raise exception 'authenticated/anon 이 app_writer 의 구성원이면 안 됩니다.';
  end if;
end $$;

grant usage on schema public, app to app_writer;
grant execute on function app.uid(), app.is_member(uuid), app.is_school_admin(uuid), app.is_platform_admin() to app_writer;

-- ── 학사 차원 ────────────────────────────────────────────
create table public.school_levels (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  code text not null check (code ~ '^[a-z][a-z0-9_]{0,30}$'),
  name text not null check (length(trim(name)) between 1 and 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (school_id, code),
  unique (id, school_id)
);

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  label text not null check (length(trim(label)) between 1 and 40),
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  check (ends_on > starts_on),
  unique (school_id, label),
  unique (id, school_id),
  exclude using gist (school_id with =, daterange(starts_on, ends_on, '[)') with &&)
);

-- 학기·텀: 확정 규칙 판의 기간(period) 하나에서 만든다. 기간 열쇠·이름은 만든 때의 규칙 값이다.
create table public.terms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  academic_year_id uuid not null,
  rule_id uuid not null,
  period_key text not null,
  label text not null,
  sequence integer not null check (sequence >= 1),
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  check ((starts_on is null) = (ends_on is null)),
  check (ends_on is null or ends_on > starts_on),
  unique (academic_year_id, period_key),
  unique (academic_year_id, sequence),
  unique (id, school_id),
  foreign key (academic_year_id, school_id) references public.academic_years(id, school_id),
  foreign key (rule_id, school_id) references public.school_rules(id, school_id)
);

-- 기수: 같은 학년도에 같은 학교급으로 입학한 무리
create table public.cohorts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  school_level_id uuid not null,
  entry_year_id uuid not null,
  label text not null check (length(trim(label)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (school_id, school_level_id, entry_year_id),
  unique (id, school_id),
  unique (id, school_id, school_level_id),
  foreign key (school_level_id, school_id) references public.school_levels(id, school_id),
  foreign key (entry_year_id, school_id) references public.academic_years(id, school_id)
);

-- 반: 학년도·학교급별
create table public.homerooms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  academic_year_id uuid not null,
  school_level_id uuid not null,
  grade smallint not null check (grade between 1 and 12),
  name text not null check (length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (school_id, academic_year_id, school_level_id, name),
  unique (id, school_id),
  unique (id, school_id, academic_year_id, school_level_id),
  foreign key (academic_year_id, school_id) references public.academic_years(id, school_id),
  foreign key (school_level_id, school_id) references public.school_levels(id, school_id)
);

-- ── 사람과 계정 ──────────────────────────────────────────
-- 사람에는 이름 열이 없다. 이름은 person_names 이력에서 읽는다. 학교 간 자동 병합은 하지 않는다.
create table public.people (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  unique (id, school_id)
);

create table public.person_names (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  person_id uuid not null,
  version integer not null check (version >= 1),
  name text not null check (length(trim(name)) between 1 and 100 and name !~ '[[:cntrl:]]'),
  name_latin text check (name_latin is null or (length(trim(name_latin)) between 1 and 100 and name_latin !~ '[[:cntrl:]]')),
  reason text check (reason is null or length(reason) <= 500),
  recorded_by uuid not null default app.uid(),
  recorded_at timestamptz not null default now(),
  unique (person_id, version),
  unique (id, school_id),
  check (version = 1 or coalesce(length(trim(reason)), 0) > 0),
  foreign key (person_id, school_id) references public.people(id, school_id)
);

-- 계정 연결: 소속(memberships)이 없어지면 연결도 함께 없어지고, 이력은 person_account_events에 남는다.
create table public.person_accounts (
  school_id uuid not null,
  user_id uuid not null,
  person_id uuid not null,
  linked_by uuid not null default app.uid(),
  linked_at timestamptz not null default now(),
  primary key (user_id, school_id),
  foreign key (person_id, school_id) references public.people(id, school_id),
  foreign key (user_id, school_id) references public.memberships(user_id, school_id) on delete cascade
);
create index person_accounts_person on public.person_accounts (school_id, person_id);

create table public.person_account_events (
  id bigint generated always as identity primary key,
  school_id uuid not null,
  person_id uuid not null,
  user_id uuid not null references private.app_users(id),
  action text not null check (action in ('link', 'unlink')),
  reason text,
  actor uuid,
  created_at timestamptz not null default now(),
  foreign key (person_id, school_id) references public.people(id, school_id)
);

-- ── 학적과 반 배정 (기간) ────────────────────────────────
create table public.enrollments_school (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  person_id uuid not null,
  school_level_id uuid not null,
  cohort_id uuid,
  status text not null default 'enrolled'
    check (status in ('enrolled', 'transferred_out', 'graduated', 'withdrawn')),
  starts_on date not null,
  ends_on date,
  note text check (note is null or length(note) <= 500),
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on > starts_on),
  check ((status = 'enrolled') = (ends_on is null)),
  unique (id, school_id),
  foreign key (person_id, school_id) references public.people(id, school_id),
  foreign key (school_level_id, school_id) references public.school_levels(id, school_id),
  foreign key (cohort_id, school_id, school_level_id) references public.cohorts(id, school_id, school_level_id),
  exclude using gist (school_id with =, person_id with =, daterange(starts_on, ends_on, '[)') with &&)
);

create table public.homeroom_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  person_id uuid not null,
  homeroom_id uuid not null,
  academic_year_id uuid not null,
  school_level_id uuid not null,
  starts_on date not null,
  ends_on date,
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on > starts_on),
  unique (id, school_id),
  foreign key (person_id, school_id) references public.people(id, school_id),
  foreign key (homeroom_id, school_id, academic_year_id, school_level_id)
    references public.homerooms(id, school_id, academic_year_id, school_level_id),
  exclude using gist (school_id with =, person_id with =, academic_year_id with =,
                      daterange(starts_on, ends_on, '[)') with &&)
);

-- ── 현재 이름 (표시용, 호출자 RLS 적용) ──────────────────
create view public.person_current_names with (security_invoker = true) as
  select distinct on (n.person_id) n.person_id, n.school_id, n.name, n.name_latin, n.version
  from public.person_names n
  order by n.person_id, n.version desc;

-- ── 변경 제한 트리거 ─────────────────────────────────────
-- 삭제는 늘 거부한다. 수정은 트리거 인자로 준 열만 허용한다(인자가 없으면 수정도 거부).
create or replace function private.guard_columns() returns trigger
language plpgsql as $$
declare
  allowed text[] := coalesce(tg_argv::text[], '{}');
begin
  if tg_op = 'DELETE' then
    raise exception '%: 기록은 삭제하지 않습니다.', tg_table_name using errcode = 'P0001';
  end if;
  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception '%: 바꿀 수 없는 값입니다. 새 기록을 추가하세요.', tg_table_name using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger school_levels_guard before update or delete on public.school_levels
  for each row execute function private.guard_columns();
create trigger academic_years_guard before update or delete on public.academic_years
  for each row execute function private.guard_columns();
create trigger terms_guard before update or delete on public.terms
  for each row execute function private.guard_columns('starts_on', 'ends_on');
create trigger cohorts_guard before update or delete on public.cohorts
  for each row execute function private.guard_columns();
create trigger homerooms_guard before update or delete on public.homerooms
  for each row execute function private.guard_columns();
create trigger people_guard before update or delete on public.people
  for each row execute function private.guard_columns();
create trigger person_names_guard before update or delete on public.person_names
  for each row execute function private.guard_columns();
create trigger person_account_events_guard before update or delete on public.person_account_events
  for each row execute function private.guard_columns();
create trigger enrollments_school_guard before update or delete on public.enrollments_school
  for each row execute function private.guard_columns('status', 'ends_on', 'note');
create trigger homeroom_assignments_guard before update or delete on public.homeroom_assignments
  for each row execute function private.guard_columns('ends_on');

-- 계정 연결은 바꾸지 않고 끊었다 다시 잇는다. 잇기·끊기(소속 해제로 인한 끊기 포함)는 이력에 남긴다.
create or replace function private.person_accounts_log() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'person_accounts: 연결은 바꾸지 않고 끊은 뒤 다시 잇습니다.' using errcode = 'P0001';
  elsif tg_op = 'INSERT' then
    insert into public.person_account_events(school_id, person_id, user_id, action, actor)
    values (new.school_id, new.person_id, new.user_id, 'link', app.uid());
    return new;
  else
    insert into public.person_account_events(school_id, person_id, user_id, action, reason, actor)
    values (old.school_id, old.person_id, old.user_id, 'unlink',
            coalesce(nullif(current_setting('app.unlink_reason', true), ''), '학교 소속 해제'), app.uid());
    return old;
  end if;
end $$;
revoke all on function private.person_accounts_log() from public;
create trigger person_accounts_log after insert or update or delete on public.person_accounts
  for each row execute function private.person_accounts_log();

-- ── 권한과 RLS ───────────────────────────────────────────
do $$
declare
  t text;
  all_tables text[] := array['school_levels', 'academic_years', 'terms', 'cohorts', 'homerooms', 'people',
    'person_names', 'person_accounts', 'person_account_events', 'enrollments_school', 'homeroom_assignments'];
begin
  foreach t in array all_tables loop
    execute format('alter table public.%I enable row level security', t);
    -- Supabase는 public 새 표에 넓은 기본 권한을 준다. 모두 회수하고 필요한 것만 준다.
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated, app_writer', t);
    execute format('grant insert on public.%I to app_writer', t);
    if t <> 'person_account_events' then
      execute format('create policy %I on public.%I for select to authenticated, app_writer using (app.is_member(school_id))',
                     t || '_read', t);
    end if;
    if t not in ('person_account_events') then
      execute format('create policy %I on public.%I for insert to app_writer with check (app.is_school_admin(school_id))',
                     t || '_insert', t);
    end if;
  end loop;
end $$;

-- 이력은 학교 관리자만 본다. 쓰기는 트리거(표 소유자)만.
create policy person_account_events_read on public.person_account_events for select to authenticated, app_writer
  using (app.is_school_admin(school_id));
revoke insert on public.person_account_events from app_writer;

grant update (starts_on, ends_on) on public.terms to app_writer;
grant update (status, ends_on, note) on public.enrollments_school to app_writer;
grant update (ends_on) on public.homeroom_assignments to app_writer;
grant delete on public.person_accounts to app_writer;
create policy terms_update on public.terms for update to app_writer
  using (app.is_school_admin(school_id)) with check (app.is_school_admin(school_id));
create policy enrollments_school_update on public.enrollments_school for update to app_writer
  using (app.is_school_admin(school_id)) with check (app.is_school_admin(school_id));
create policy homeroom_assignments_update on public.homeroom_assignments for update to app_writer
  using (app.is_school_admin(school_id)) with check (app.is_school_admin(school_id));
create policy person_accounts_delete on public.person_accounts for delete to app_writer
  using (app.is_school_admin(school_id));

-- 학기를 만들 때 확정 규칙을 읽는다. (기존 정책과 같은 소속 조건, 읽기만)
grant select on public.school_rules to app_writer;
create policy school_rules_read_writer on public.school_rules for select to app_writer using (app.is_member(school_id));

revoke all on public.person_current_names from public, anon;
grant select on public.person_current_names to authenticated, app_writer;

-- ── 명령 함수 ────────────────────────────────────────────
-- 공통: 학교 관리자만, 학교 ID는 서버가 로그인 소속에서 정해 넘긴다. 입력값을 오류 메시지에 넣지 않는다.

create or replace function app.add_school_level(target uuid, level_code text, level_name text, level_order integer default 0)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare nid uuid;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if coalesce(level_code, '') !~ '^[a-z][a-z0-9_]{0,30}$' then
    raise exception '학교급 코드는 영문 소문자로 시작하는 31자 이내입니다.' using errcode = '22023';
  end if;
  if length(trim(coalesce(level_name, ''))) not between 1 and 60 then
    raise exception '학교급 이름은 1~60자입니다.' using errcode = '22023';
  end if;
  insert into public.school_levels(school_id, code, name, sort_order)
  values (target, level_code, trim(level_name), coalesce(level_order, 0)) returning id into nid;
  return nid;
end $$;

create or replace function app.add_academic_year(target uuid, year_label text, year_starts date, year_ends date)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare nid uuid;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if length(trim(coalesce(year_label, ''))) not between 1 and 40 then
    raise exception '학년도 이름은 1~40자입니다.' using errcode = '22023';
  end if;
  if year_starts is null or year_ends is null or year_ends <= year_starts then
    raise exception '학년도 끝 날짜는 시작 날짜보다 뒤여야 합니다.' using errcode = '22023';
  end if;
  begin
    insert into public.academic_years(school_id, label, starts_on, ends_on)
    values (target, trim(year_label), year_starts, year_ends) returning id into nid;
  exception when exclusion_violation then
    raise exception '기간이 겹치는 학년도가 이미 있습니다.' using errcode = '22023';
  end;
  return nid;
end $$;

-- 확정 규칙 판의 기간마다 학기를 만든다. 같은 판으로 다시 부르면 아무것도 바꾸지 않는다(0 반환).
-- 이미 다른 판으로 만든 학년도는 거부한다: 규칙이 바뀌어도 기존 학기를 조용히 고치지 않는다.
create or replace function app.create_terms_from_rule(target uuid, year_id uuid, source_rule uuid)
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  r record;
  existing uuid;
  n integer := 0;
  p record;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('school-platform:terms'), hashtext(coalesce(year_id::text, '')));
  if not exists (select 1 from public.academic_years where id = year_id and school_id = target) then
    raise exception '학년도를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  select id, topic, version, value into r from public.school_rules where id = source_rule and school_id = target;
  if r.id is null then raise exception '확정 규칙을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if r.topic <> 'period_structure' then raise exception '학기 구조 규칙이 아닙니다.' using errcode = '22023'; end if;
  select rule_id into existing from public.terms where academic_year_id = year_id and school_id = target limit 1;
  if existing is not null and existing <> source_rule then
    raise exception '이 학년도의 학기는 이미 다른 확정 규칙 판으로 만들었습니다. 규칙이 바뀌어도 기존 학기는 다시 만들지 않습니다.'
      using errcode = 'P0001';
  elsif existing is not null then
    return 0;
  end if;
  if jsonb_typeof(r.value -> 'periods') <> 'array' or jsonb_array_length(r.value -> 'periods') = 0 then
    raise exception '확정 규칙에 기간이 없습니다.' using errcode = '22023';
  end if;
  for p in select e ->> 'id' as key, e ->> 'label' as label, ord
           from jsonb_array_elements(r.value -> 'periods') with ordinality as x(e, ord) loop
    if coalesce(p.key, '') = '' or coalesce(trim(p.label), '') = '' then
      raise exception '확정 규칙의 기간에 열쇠나 이름이 비어 있습니다.' using errcode = '22023';
    end if;
    insert into public.terms(school_id, academic_year_id, rule_id, period_key, label, sequence)
    values (target, year_id, source_rule, p.key, trim(p.label), p.ord);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function app.set_term_dates(target uuid, term uuid, term_starts date, term_ends date)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare y record;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  select a.starts_on, a.ends_on into y from public.terms t join public.academic_years a
    on a.id = t.academic_year_id and a.school_id = t.school_id where t.id = term and t.school_id = target;
  if not found then raise exception '학기를 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if term_starts is null or term_ends is null or term_ends <= term_starts then
    raise exception '학기 끝 날짜는 시작 날짜보다 뒤여야 합니다.' using errcode = '22023';
  end if;
  if term_starts < y.starts_on or term_ends > y.ends_on then
    raise exception '학기 기간은 학년도 기간 안에 있어야 합니다.' using errcode = '22023';
  end if;
  update public.terms set starts_on = term_starts, ends_on = term_ends where id = term and school_id = target;
end $$;

create or replace function app.add_cohort(target uuid, level_id uuid, entry_year uuid, cohort_label text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare nid uuid;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if length(trim(coalesce(cohort_label, ''))) not between 1 and 60 then
    raise exception '기수 이름은 1~60자입니다.' using errcode = '22023';
  end if;
  begin
    insert into public.cohorts(school_id, school_level_id, entry_year_id, label)
    values (target, level_id, entry_year, trim(cohort_label)) returning id into nid;
  exception when foreign_key_violation then
    raise exception '이 학교의 학교급·학년도를 찾을 수 없습니다.' using errcode = 'P0002';
  end;
  return nid;
end $$;

create or replace function app.add_homeroom(target uuid, year_id uuid, level_id uuid, homeroom_grade integer, homeroom_name text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare nid uuid;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if homeroom_grade is null or homeroom_grade not between 1 and 12 then
    raise exception '학년은 1~12 사이입니다.' using errcode = '22023';
  end if;
  if length(trim(coalesce(homeroom_name, ''))) not between 1 and 60 then
    raise exception '반 이름은 1~60자입니다.' using errcode = '22023';
  end if;
  begin
    insert into public.homerooms(school_id, academic_year_id, school_level_id, grade, name)
    values (target, year_id, level_id, homeroom_grade, trim(homeroom_name)) returning id into nid;
  exception when foreign_key_violation then
    raise exception '이 학교의 학교급·학년도를 찾을 수 없습니다.' using errcode = 'P0002';
  end;
  return nid;
end $$;

create or replace function app.add_person(target uuid, person_name text, person_name_latin text default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare pid uuid;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if length(trim(coalesce(person_name, ''))) not between 1 and 100 or person_name ~ '[[:cntrl:]]' then
    raise exception '이름은 1~100자이고 줄바꿈 등 제어 문자를 넣을 수 없습니다.' using errcode = '22023';
  end if;
  if person_name_latin is not null and (length(trim(person_name_latin)) not between 1 and 100 or person_name_latin ~ '[[:cntrl:]]') then
    raise exception '로마자 이름은 1~100자입니다.' using errcode = '22023';
  end if;
  insert into public.people(school_id) values (target) returning id into pid;
  insert into public.person_names(school_id, person_id, version, name, name_latin)
  values (target, pid, 1, trim(person_name), nullif(trim(person_name_latin), ''));
  return pid;
end $$;

-- 개명: 이름 이력에 새 판을 추가한다. 사람 id와 그 사람을 가리키는 기록은 그대로다.
create or replace function app.rename_person(target uuid, person uuid, new_name text, new_name_latin text, change_reason text)
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare nextv integer;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if length(trim(coalesce(new_name, ''))) not between 1 and 100 or new_name ~ '[[:cntrl:]]' then
    raise exception '이름은 1~100자이고 줄바꿈 등 제어 문자를 넣을 수 없습니다.' using errcode = '22023';
  end if;
  if new_name_latin is not null and (length(trim(new_name_latin)) not between 1 and 100 or new_name_latin ~ '[[:cntrl:]]') then
    raise exception '로마자 이름은 1~100자입니다.' using errcode = '22023';
  end if;
  if length(trim(coalesce(change_reason, ''))) not between 1 and 500 then
    raise exception '이름을 바꾸는 사유를 500자 이내로 적어 주세요.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('school-platform:person_names'), hashtext(coalesce(person::text, '')));
  if not exists (select 1 from public.people where id = person and school_id = target) then
    raise exception '사람을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  select coalesce(max(version), 0) + 1 into nextv from public.person_names where person_id = person and school_id = target;
  insert into public.person_names(school_id, person_id, version, name, name_latin, reason)
  values (target, person, nextv, trim(new_name), nullif(trim(new_name_latin), ''), trim(change_reason));
  perform app.log_access(target, 'person.rename', jsonb_build_object('person', person, 'version', nextv));
  return nextv;
end $$;

-- 계정 연결: 이름·메일이 같다는 이유로 자동 연결하지 않는다. 관리자가 사람 id와 계정 id를 골라 잇는다.
create or replace function app.link_account(target uuid, person uuid, account uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if not exists (select 1 from public.people where id = person and school_id = target) then
    raise exception '사람을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  begin
    insert into public.person_accounts(school_id, user_id, person_id) values (target, account, person);
  exception
    when unique_violation then
      raise exception '이 계정은 이 학교에서 이미 다른 사람(또는 같은 사람)에 연결돼 있습니다. 먼저 연결을 끊어 주세요.'
        using errcode = 'P0001';
    when foreign_key_violation then
      raise exception '이 학교 구성원 계정이 아닙니다.' using errcode = 'P0002';
  end;
  perform app.log_access(target, 'person.link_account', jsonb_build_object('person', person, 'user', account));
end $$;

create or replace function app.unlink_account(target uuid, account uuid, unlink_reason text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare pid uuid;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if length(trim(coalesce(unlink_reason, ''))) not between 1 and 500 then
    raise exception '연결을 끊는 사유를 500자 이내로 적어 주세요.' using errcode = '22023';
  end if;
  perform set_config('app.unlink_reason', trim(unlink_reason), true);
  delete from public.person_accounts where school_id = target and user_id = account returning person_id into pid;
  perform set_config('app.unlink_reason', '', true);
  if pid is null then raise exception '연결된 계정을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  perform app.log_access(target, 'person.unlink_account', jsonb_build_object('person', pid, 'user', account));
end $$;

create or replace function app.enroll_person(target uuid, person uuid, level_id uuid, cohort uuid, enroll_starts date, enroll_note text default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare nid uuid;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if enroll_starts is null then raise exception '입학(전입) 날짜를 넣어 주세요.' using errcode = '22023'; end if;
  if enroll_note is not null and length(enroll_note) > 500 then raise exception '메모는 500자 이내입니다.' using errcode = '22023'; end if;
  begin
    insert into public.enrollments_school(school_id, person_id, school_level_id, cohort_id, starts_on, note)
    values (target, person, level_id, cohort, enroll_starts, enroll_note) returning id into nid;
  exception
    when exclusion_violation then
      raise exception '이 사람은 이 기간에 이미 학적이 있습니다.' using errcode = '22023';
    when foreign_key_violation then
      raise exception '이 학교의 사람·학교급·기수를 찾을 수 없거나, 기수의 학교급이 다릅니다.' using errcode = 'P0002';
  end;
  return nid;
end $$;

create or replace function app.end_enrollment(target uuid, enrollment uuid, end_on date, end_status text, end_note text default null)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare e record;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if end_status is null or end_status not in ('transferred_out', 'graduated', 'withdrawn') then
    raise exception '끝나는 사유(전출·졸업·자퇴)를 골라 주세요.' using errcode = '22023';
  end if;
  if end_note is not null and length(end_note) > 500 then raise exception '메모는 500자 이내입니다.' using errcode = '22023'; end if;
  select id, starts_on, ends_on into e from public.enrollments_school where id = enrollment and school_id = target for update;
  if e.id is null then raise exception '학적을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if e.ends_on is not null then raise exception '이미 끝난 학적입니다.' using errcode = 'P0001'; end if;
  if end_on is null or end_on <= e.starts_on then
    raise exception '끝 날짜는 시작 날짜보다 뒤여야 합니다.' using errcode = '22023';
  end if;
  update public.enrollments_school set status = end_status, ends_on = end_on, note = coalesce(end_note, note)
  where id = enrollment and school_id = target;
end $$;

-- 반 배정: 배정 시작일에 반과 같은 학교급의 학적이 있어야 한다.
create or replace function app.assign_homeroom(target uuid, person uuid, homeroom uuid, assign_starts date)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare h record; nid uuid;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  select r.id, r.academic_year_id, r.school_level_id, a.starts_on, a.ends_on into h
    from public.homerooms r join public.academic_years a on a.id = r.academic_year_id and a.school_id = r.school_id
    where r.id = homeroom and r.school_id = target;
  if h.id is null then raise exception '반을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if assign_starts is null or assign_starts < h.starts_on or assign_starts >= h.ends_on then
    raise exception '배정 시작일은 그 학년도 안이어야 합니다.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.enrollments_school e
                 where e.school_id = target and e.person_id = person and e.school_level_id = h.school_level_id
                   and daterange(e.starts_on, e.ends_on, '[)') @> assign_starts) then
    raise exception '배정 시작일에 이 학교급 학적이 없습니다.' using errcode = '22023';
  end if;
  begin
    insert into public.homeroom_assignments(school_id, person_id, homeroom_id, academic_year_id, school_level_id, starts_on)
    values (target, person, homeroom, h.academic_year_id, h.school_level_id, assign_starts) returning id into nid;
  exception when exclusion_violation then
    raise exception '이 학년도에 이미 반 배정이 있습니다. 먼저 이전 배정을 끝내 주세요.' using errcode = '22023';
  end;
  return nid;
end $$;

create or replace function app.end_homeroom_assignment(target uuid, assignment uuid, end_on date)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare a record;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  select id, starts_on, ends_on into a from public.homeroom_assignments where id = assignment and school_id = target for update;
  if a.id is null then raise exception '반 배정을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if a.ends_on is not null then raise exception '이미 끝난 반 배정입니다.' using errcode = 'P0001'; end if;
  if end_on is null or end_on <= a.starts_on then
    raise exception '끝 날짜는 시작 날짜보다 뒤여야 합니다.' using errcode = '22023';
  end if;
  update public.homeroom_assignments set ends_on = end_on where id = assignment and school_id = target;
end $$;

-- 소유자를 제한 역할로 바꾸고, 실행은 로그인 사용자(authenticated)에게만 연다.
do $$
declare f text;
begin
  foreach f in array array[
    'app.add_school_level(uuid, text, text, integer)',
    'app.add_academic_year(uuid, text, date, date)',
    'app.create_terms_from_rule(uuid, uuid, uuid)',
    'app.set_term_dates(uuid, uuid, date, date)',
    'app.add_cohort(uuid, uuid, uuid, text)',
    'app.add_homeroom(uuid, uuid, uuid, integer, text)',
    'app.add_person(uuid, text, text)',
    'app.rename_person(uuid, uuid, text, text, text)',
    'app.link_account(uuid, uuid, uuid)',
    'app.unlink_account(uuid, uuid, text)',
    'app.enroll_person(uuid, uuid, uuid, uuid, date, text)',
    'app.end_enrollment(uuid, uuid, date, text, text)',
    'app.assign_homeroom(uuid, uuid, uuid, date)',
    'app.end_homeroom_assignment(uuid, uuid, date)'
  ] loop
    execute format('alter function %s owner to app_writer', f);
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
