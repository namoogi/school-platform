-- 56차: ADR 0025 학사 토대 F1 (한국 + 미국 기준)
-- 학교 관할·인가 / 학년 코드 + 정규 서수 / 학기 나무(마디 종류·입력 창) / 수업일 달력 / 코드 목록(E1)
-- 외부 식별자 / 가족·보호자 관계(관리자만 조회) / 교직원 배정 / 디렉터리 공개 거부 / 개설 기원·학생 수업 제안 판
-- 경계는 단계 1·2와 같다: 요청 역할은 SELECT만, 쓰기는 app_writer 소유 명령 함수로만, 모든 표 school_id + RLS + 복합 FK.
select set_config('request.jwt.claims', '{}', true);

-- ── 학교 관할·인가 (판으로 쌓음) ─────────────────────────
create table public.school_profiles (
  school_id uuid not null references public.schools(id),
  version integer not null check (version >= 1),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  sector text check (sector is null or sector in ('public', 'private', 'alternative', 'international', 'homeschool')),
  accreditation text check (accreditation is null or length(accreditation) <= 200),
  external_codes jsonb not null default '{}' check (jsonb_typeof(external_codes) = 'object'),
  why text check (why is null or length(why) <= 500),
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  primary key (school_id, version)
);

-- ── 학년 코드 + 정규 서수 (KR 초1~고3 / US PK·K·1~12 / UK Year) ──
-- ordinal: 정규 서수(PK=-1, K=0, 1~12 = 미국 학년과 같은 자리). 한국 고1 = 10, 중1 = 7, 초1 = 1.
create table public.grade_levels (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  school_level_id uuid,
  code text not null check (code ~ '^[a-z0-9][a-z0-9_]{0,30}$'),
  label jsonb not null check (jsonb_typeof(label) = 'object' and label <> '{}'),
  ordinal smallint not null check (ordinal between -3 and 14),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (school_id, code),
  unique (id, school_id),
  foreign key (school_id) references public.schools(id),
  foreign key (school_level_id, school_id) references public.school_levels(id, school_id)
);

-- ── 학기 나무: 마디 종류 · 학점 여부 · 입력 창 ─────────────
alter table public.terms add column parent_id uuid;
alter table public.terms add column kind text not null default 'semester'
  check (kind in ('semester', 'trimester', 'quarter', 'term', 'grading_period', 'session'));
alter table public.terms add column credit_bearing boolean not null default true;
alter table public.terms add column entry_opens_on date;
alter table public.terms add column entry_closes_on date;
alter table public.terms add constraint terms_parent_fk foreign key (parent_id, school_id) references public.terms(id, school_id);
alter table public.terms add constraint terms_not_self check (parent_id is null or parent_id <> id);
alter table public.terms add constraint terms_entry_window check (entry_closes_on is null or entry_opens_on is null or entry_closes_on >= entry_opens_on);
-- 하위 마디(성적 기간 등)는 부모마다 1부터 센다
alter table public.terms drop constraint terms_academic_year_id_sequence_key;
create unique index terms_sequence_in_parent on public.terms (academic_year_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), sequence);
drop trigger terms_guard on public.terms;
create trigger terms_guard before update or delete on public.terms
  for each row execute function private.guard_columns('starts_on', 'ends_on', 'entry_opens_on', 'entry_closes_on');

-- ── 수업일 달력 (만성 결석·출석 2/3·ADA 분모) ─────────────
create table public.calendar_days (
  school_id uuid not null,
  academic_year_id uuid not null,
  day date not null,
  kind text not null check (kind in ('instructional', 'holiday', 'non_instructional', 'event')),
  half_day boolean not null default false,
  label text check (label is null or length(label) <= 80),
  updated_by uuid not null default app.uid(),
  updated_at timestamptz not null default now(),
  primary key (school_id, day),
  foreign key (academic_year_id, school_id) references public.academic_years(id, school_id)
);

-- ── 코드 목록 (Ed-Fi 기술자 방식: 학교 값 · 플랫폼 기본 · 표준 사상 · 유효 기간 · 이전 코드 · 왜) ──
-- school_id 가 NULL 이면 플랫폼 기본값(모두 읽기). 학교 값은 그 학교가 쓴다(E1).
create table public.code_lists (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id),
  list_key text not null check (list_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  code text not null check (code ~ '^[a-z0-9][a-z0-9_.-]{0,40}$'),
  label jsonb not null check (jsonb_typeof(label) = 'object' and label <> '{}'),
  sort_order integer not null default 0,
  attrs jsonb not null default '{}' check (jsonb_typeof(attrs) = 'object'),
  maps_to jsonb not null default '{}' check (jsonb_typeof(maps_to) = 'object'),
  effective_from date,
  effective_to date,
  prior_code_id uuid references public.code_lists(id),
  why text check (why is null or length(why) <= 500),
  created_by uuid default app.uid(),
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_from is null or effective_to > effective_from)
);
create unique index code_lists_unique on public.code_lists
  (coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid), list_key, code, coalesce(effective_from, '-infinity'::date));
create index code_lists_lookup on public.code_lists (list_key, school_id);

-- ── 외부 식별자 (주 학생 ID·NEIS·CEEB·UPN·OEN …) — 주민번호·SSN 같은 국가 신분 번호는 받지 않는다 ──
create table public.external_identifiers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  target_kind text not null check (target_kind in ('person', 'school')),
  person_id uuid,
  system text not null check (system ~ '^[a-z][a-z0-9_]{1,40}$' and system not in ('kr_rrn', 'us_ssn', 'national_id', 'passport')),
  value text not null check (length(value) between 1 and 64 and value !~ '[[:cntrl:]]'),
  status text not null default 'official' check (status in ('provisional', 'official', 'superseded')),
  scope text check (scope is null or scope in ('lifetime', 'school', 'exam_series')),
  valid_from date,
  valid_to date,
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  check ((target_kind = 'person') = (person_id is not null)),
  check (valid_to is null or valid_from is null or valid_to > valid_from),
  foreign key (person_id, school_id) references public.people(id, school_id)
);
create unique index external_identifiers_active on public.external_identifiers (school_id, system, value) where status <> 'superseded';

-- ── 가족 · 보호자 관계 (보호자 계정 열람은 F6, 지금은 관리자만 조회) ──
create table public.families (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  label text not null check (length(trim(label)) between 1 and 80),
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  unique (id, school_id)
);
create table public.guardian_links (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  family_id uuid,
  guardian_person_id uuid not null,
  student_person_id uuid not null,
  relation_code text not null check (relation_code ~ '^[a-z0-9][a-z0-9_.-]{0,40}$'),
  legal_guardian boolean not null default true,
  contact_allowed boolean not null default true,
  restriction_note text check (restriction_note is null or length(restriction_note) <= 500),
  starts_on date not null default current_date,
  ends_on date,
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  check (guardian_person_id <> student_person_id),
  check (ends_on is null or ends_on > starts_on),
  unique (id, school_id),
  foreign key (family_id, school_id) references public.families(id, school_id),
  foreign key (guardian_person_id, school_id) references public.people(id, school_id),
  foreign key (student_person_id, school_id) references public.people(id, school_id),
  exclude using gist (school_id with =, guardian_person_id with =, student_person_id with =, daterange(starts_on, ends_on, '[)') with &&)
);

-- ── 교직원 배정 (역할 코드는 code_lists 'staff_role') ──
create table public.staff_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  person_id uuid not null,
  role_code text not null check (role_code ~ '^[a-z0-9][a-z0-9_.-]{0,40}$'),
  school_level_id uuid,
  starts_on date not null,
  ends_on date,
  note text check (note is null or length(note) <= 300),
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on > starts_on),
  unique (id, school_id),
  foreign key (person_id, school_id) references public.people(id, school_id),
  foreign key (school_level_id, school_id) references public.school_levels(id, school_id)
);

-- ── 디렉터리 정보 공개 거부 (FERPA 디렉터리 정보 · 학교 누리집·에이전트 공개가 검사) ──
create table public.directory_optouts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  person_id uuid not null,
  scope text not null default 'all' check (scope in ('all', 'photo', 'name', 'contact')),
  starts_on date not null default current_date,
  ends_on date,
  reason text check (reason is null or length(reason) <= 300),
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on > starts_on),
  foreign key (person_id, school_id) references public.people(id, school_id),
  exclude using gist (school_id with =, person_id with =, scope with =, daterange(starts_on, ends_on, '[)') with &&)
);

-- ── 학생 수업 제안 (제안 → 학교 승인 → 개설), 판으로 쌓음 ──
create table public.course_proposals (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  proposer_person_id uuid not null,
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  unique (id, school_id),
  foreign key (proposer_person_id, school_id) references public.people(id, school_id)
);
create table public.course_proposal_versions (
  school_id uuid not null,
  proposal_id uuid not null,
  version integer not null check (version >= 1),
  title text not null check (length(trim(title)) between 1 and 120),
  purpose text not null default '' check (length(purpose) <= 4000),
  plan text not null default '' check (length(plan) <= 8000),
  mentor_person_id uuid,
  term_id uuid,
  status text not null check (status in ('draft', 'submitted', 'approved', 'rejected', 'held', 'withdrawn')),
  note text check (note is null or length(note) <= 1000),
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  primary key (proposal_id, version),
  foreign key (proposal_id, school_id) references public.course_proposals(id, school_id),
  foreign key (mentor_person_id, school_id) references public.people(id, school_id),
  foreign key (term_id, school_id) references public.terms(id, school_id)
);

-- ── 개설 기원 ────────────────────────────────────────────
alter table public.course_offerings add column origin text not null default 'school'
  check (origin in ('school', 'student_proposal', 'project', 'internship', 'external'));
alter table public.course_offerings add column proposal_id uuid;
alter table public.course_offerings add constraint course_offerings_proposal_fk foreign key (proposal_id, school_id) references public.course_proposals(id, school_id);
alter table public.course_offerings add constraint course_offerings_proposal_origin check (proposal_id is null or origin = 'student_proposal');
create unique index course_offerings_one_per_proposal on public.course_offerings (proposal_id) where proposal_id is not null;
drop trigger course_offerings_guard on public.course_offerings;
create trigger course_offerings_guard before update or delete on public.course_offerings
  for each row execute function private.guard_columns('status', 'revision', 'activated_at', 'origin', 'proposal_id');
-- 기원은 한 번만 정한다(학교 → 다른 기원). 이후 다시 바꾸지 않는다
create or replace function private.offering_origin_once() returns trigger language plpgsql as $$
begin
  if (new.origin, new.proposal_id) is distinct from (old.origin, old.proposal_id) and (old.origin <> 'school' or old.proposal_id is not null) then
    raise exception 'course_offerings: 개설 기원은 한 번만 정합니다.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger course_offerings_origin_once before update on public.course_offerings
  for each row execute function private.offering_origin_once();

-- ── 변경 제한 ────────────────────────────────────────────
create trigger school_profiles_guard before update or delete on public.school_profiles for each row execute function private.guard_columns();
create trigger grade_levels_guard before update or delete on public.grade_levels for each row execute function private.guard_columns();
create trigger calendar_days_guard before update or delete on public.calendar_days
  for each row execute function private.guard_columns('kind', 'half_day', 'label', 'updated_by', 'updated_at');
create trigger code_lists_guard before update or delete on public.code_lists for each row execute function private.guard_columns('effective_to');
create trigger external_identifiers_guard before update or delete on public.external_identifiers
  for each row execute function private.guard_columns('status', 'valid_to');
create trigger families_guard before update or delete on public.families for each row execute function private.guard_columns();
create trigger guardian_links_guard before update or delete on public.guardian_links for each row execute function private.guard_columns('ends_on');
create trigger staff_assignments_guard before update or delete on public.staff_assignments for each row execute function private.guard_columns('ends_on');
create trigger directory_optouts_guard before update or delete on public.directory_optouts for each row execute function private.guard_columns('ends_on');
create trigger course_proposals_guard before update or delete on public.course_proposals for each row execute function private.guard_columns();
create trigger course_proposal_versions_guard before update or delete on public.course_proposal_versions for each row execute function private.guard_columns();

-- ── 권한과 RLS ───────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['school_profiles', 'grade_levels', 'calendar_days', 'code_lists', 'external_identifiers', 'families',
                           'guardian_links', 'staff_assignments', 'directory_optouts', 'course_proposals', 'course_proposal_versions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated, app_writer', t);
    execute format('grant insert on public.%I to app_writer', t);
  end loop;
end $$;
-- 읽기: 소속 학교(코드 목록은 플랫폼 기본도). 민감한 표(외부 식별자·가족·보호자)는 학교 관리자만
create policy school_profiles_read on public.school_profiles for select to authenticated, app_writer using (app.is_member(school_id));
create policy grade_levels_read on public.grade_levels for select to authenticated, app_writer using (app.is_member(school_id));
create policy calendar_days_read on public.calendar_days for select to authenticated, app_writer using (app.is_member(school_id));
create policy code_lists_read on public.code_lists for select to authenticated, app_writer using (school_id is null or app.is_member(school_id));
create policy external_identifiers_read on public.external_identifiers for select to authenticated, app_writer using (app.is_school_admin(school_id));
create policy families_read on public.families for select to authenticated, app_writer using (app.is_school_admin(school_id));
create policy guardian_links_read on public.guardian_links for select to authenticated, app_writer using (app.is_school_admin(school_id));
create policy staff_assignments_read on public.staff_assignments for select to authenticated, app_writer using (app.is_member(school_id));
create policy directory_optouts_read on public.directory_optouts for select to authenticated, app_writer using (app.is_member(school_id));
create policy course_proposals_read on public.course_proposals for select to authenticated, app_writer using (app.is_member(school_id));
create policy course_proposal_versions_read on public.course_proposal_versions for select to authenticated, app_writer using (app.is_member(school_id));
-- 쓰기: 학교 관리자. 수업 제안은 교사도(학생 계정은 F6)
do $$
declare t text;
begin
  foreach t in array array['school_profiles', 'grade_levels', 'calendar_days', 'external_identifiers', 'families',
                           'guardian_links', 'staff_assignments', 'directory_optouts'] loop
    execute format('create policy %I on public.%I for insert to app_writer with check (app.is_school_admin(school_id))', t || '_insert', t);
  end loop;
end $$;
create policy code_lists_insert on public.code_lists for insert to app_writer with check (school_id is not null and app.is_school_admin(school_id));
create policy course_proposals_insert on public.course_proposals for insert to app_writer with check (app.is_member(school_id));
create policy course_proposal_versions_insert on public.course_proposal_versions for insert to app_writer with check (app.is_member(school_id));
grant update (kind, half_day, label, updated_by, updated_at) on public.calendar_days to app_writer;
grant update (effective_to) on public.code_lists to app_writer;
grant update (status, valid_to) on public.external_identifiers to app_writer;
grant update (ends_on) on public.guardian_links, public.staff_assignments, public.directory_optouts to app_writer;
grant update (entry_opens_on, entry_closes_on) on public.terms to app_writer;
grant update (origin, proposal_id) on public.course_offerings to app_writer;
create policy calendar_days_update on public.calendar_days for update to app_writer using (app.is_school_admin(school_id)) with check (app.is_school_admin(school_id));
create policy code_lists_update on public.code_lists for update to app_writer using (school_id is not null and app.is_school_admin(school_id)) with check (school_id is not null and app.is_school_admin(school_id));
create policy external_identifiers_update on public.external_identifiers for update to app_writer using (app.is_school_admin(school_id)) with check (app.is_school_admin(school_id));
create policy guardian_links_update on public.guardian_links for update to app_writer using (app.is_school_admin(school_id)) with check (app.is_school_admin(school_id));
create policy staff_assignments_update on public.staff_assignments for update to app_writer using (app.is_school_admin(school_id)) with check (app.is_school_admin(school_id));
create policy directory_optouts_update on public.directory_optouts for update to app_writer using (app.is_school_admin(school_id)) with check (app.is_school_admin(school_id));

-- ── 플랫폼 기본 코드 목록 (한국 + 미국 기준, maps_to 로 표준·서식에 사상) ──
insert into public.code_lists(school_id, list_key, code, label, sort_order, attrs, maps_to, why, created_by) values
  (null, 'attendance_kind', 'absent',      '{"ko":"결석","en":"Absent"}', 1, '{"counts_absent":true}', '{"kr_record":"결석","us_nces":"absence"}', 'KR 기재요령 4종 × US NCES 출결 종류', null),
  (null, 'attendance_kind', 'tardy',       '{"ko":"지각","en":"Tardy"}', 2, '{"counts_absent":false}', '{"kr_record":"지각","us_nces":"tardy"}', 'KR 기재요령 4종 × US NCES 출결 종류', null),
  (null, 'attendance_kind', 'early_leave', '{"ko":"조퇴","en":"Early dismissal"}', 3, '{"counts_absent":false}', '{"kr_record":"조퇴","us_nces":"early_departure"}', 'KR 기재요령 4종 × US NCES 출결 종류', null),
  (null, 'attendance_kind', 'class_absent','{"ko":"결과","en":"Class period absence"}', 4, '{"counts_absent":false,"period_level":true}', '{"kr_record":"결과","us_nces":"period_absence"}', 'KR 결과 ≈ US 교시 결석', null),
  (null, 'attendance_reason', 'illness',   '{"ko":"질병","en":"Illness"}', 1, '{"excused":true}', '{"kr_record":"질병","us":"excused"}', 'KR 사유 3 × US 인정 여부', null),
  (null, 'attendance_reason', 'unexcused', '{"ko":"미인정","en":"Unexcused"}', 2, '{"excused":false}', '{"kr_record":"미인정","us":"unexcused"}', 'KR 사유 3 × US 인정 여부', null),
  (null, 'attendance_reason', 'other',     '{"ko":"기타","en":"Other excused"}', 3, '{"excused":true}', '{"kr_record":"기타","us":"excused"}', 'KR 사유 3 × US 인정 여부', null),
  (null, 'attendance_reason', 'recognized','{"ko":"출석인정","en":"Counted present"}', 4, '{"excused":true,"counts_present":true}', '{"kr_record":"출석인정","us":"school_activity"}', 'KR 출석인정 = US 학교 활동 등 출석 처리', null),
  (null, 'relation', 'mother',      '{"ko":"어머니","en":"Mother"}', 1, '{}', '{}', null, null),
  (null, 'relation', 'father',      '{"ko":"아버지","en":"Father"}', 2, '{}', '{}', null, null),
  (null, 'relation', 'guardian',    '{"ko":"후견인","en":"Legal guardian"}', 3, '{}', '{}', null, null),
  (null, 'relation', 'grandparent', '{"ko":"조부모","en":"Grandparent"}', 4, '{}', '{}', null, null),
  (null, 'relation', 'other',       '{"ko":"기타","en":"Other"}', 9, '{}', '{}', null, null),
  (null, 'staff_role', 'teacher',   '{"ko":"교사","en":"Teacher"}', 1, '{}', '{}', null, null),
  (null, 'staff_role', 'homeroom',  '{"ko":"담임","en":"Homeroom teacher"}', 2, '{}', '{}', null, null),
  (null, 'staff_role', 'counselor', '{"ko":"상담교사","en":"School counselor"}', 3, '{}', '{}', null, null),
  (null, 'staff_role', 'principal', '{"ko":"교장","en":"Principal"}', 4, '{}', '{}', null, null),
  (null, 'staff_role', 'staff',     '{"ko":"직원","en":"Staff"}', 5, '{}', '{}', null, null),
  (null, 'staff_role', 'mentor',    '{"ko":"멘토","en":"Mentor"}', 6, '{}', '{}', null, null),
  (null, 'staff_role', 'external',  '{"ko":"외부 강사","en":"External instructor"}', 7, '{}', '{}', null, null),
  (null, 'enrollment_entry', 'new',         '{"ko":"신입학","en":"New entry"}', 1, '{}', '{}', null, null),
  (null, 'enrollment_entry', 'transfer_in', '{"ko":"전입","en":"Transfer in"}', 2, '{}', '{}', null, null),
  (null, 'enrollment_entry', 'readmit',     '{"ko":"재입학","en":"Re-entry"}', 3, '{}', '{}', null, null),
  (null, 'enrollment_exit', 'graduated',    '{"ko":"졸업","en":"Graduated"}', 1, '{}', '{}', null, null),
  (null, 'enrollment_exit', 'transfer_out', '{"ko":"전출","en":"Transfer out"}', 2, '{}', '{}', null, null),
  (null, 'enrollment_exit', 'withdrawn',    '{"ko":"자퇴","en":"Withdrawn"}', 3, '{}', '{}', null, null),
  (null, 'enrollment_exit', 'leave',        '{"ko":"휴학","en":"Leave of absence"}', 4, '{"kr_only":true}', '{}', 'KR 휴학 — US는 대개 퇴학 후 재입학', null),
  (null, 'id_system', 'kr_neis_school',  '{"ko":"NEIS 학교 코드","en":"Korea NEIS school code"}', 1, '{"target":"school"}', '{}', null, null),
  (null, 'id_system', 'us_ceeb',         '{"ko":"CEEB 코드","en":"CEEB code"}', 2, '{"target":"school"}', '{}', null, null),
  (null, 'id_system', 'us_state_student','{"ko":"주 학생 ID","en":"State student ID"}', 3, '{"target":"person"}', '{}', null, null),
  (null, 'id_system', 'school_student',  '{"ko":"학교 학번","en":"School student number"}', 4, '{"target":"person"}', '{}', null, null);

-- ── 명령 함수 ────────────────────────────────────────────
-- 공통: 학교 ID는 서버가 로그인 소속에서 정해 넘긴다. 입력값을 오류 메시지에 넣지 않는다.
create or replace function app.set_school_profile(target uuid, p jsonb)
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v integer;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('school-platform:school_profiles'), hashtext(target::text));
  select coalesce(max(version), 0) + 1 into v from public.school_profiles where school_id = target;
  if (p ? 'base_version') and (p ->> 'base_version')::int <> v - 1 then
    raise exception '그 사이 새 판이 생겼습니다. 최신 판을 다시 읽어 고쳐 주세요.' using errcode = 'P0409';
  end if;
  insert into public.school_profiles(school_id, version, country, sector, accreditation, external_codes, why)
  values (target, v, nullif(upper(p ->> 'country'), ''), nullif(p ->> 'sector', ''), nullif(trim(p ->> 'accreditation'), ''),
          coalesce(p -> 'external_codes', '{}'), nullif(trim(p ->> 'why'), ''));
  return v;
end $$;

create or replace function app.add_grade_level(target uuid, level_id uuid, gl_code text, gl_label jsonb, gl_ordinal integer, gl_order integer default 0)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare nid uuid;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if coalesce(gl_code, '') !~ '^[a-z0-9][a-z0-9_]{0,30}$' then raise exception '학년 코드는 영문 소문자·숫자 31자 이내입니다.' using errcode = '22023'; end if;
  if gl_ordinal is null or gl_ordinal not between -3 and 14 then raise exception '정규 서수는 -3~14입니다(PK=-1, K=0, 1~12).' using errcode = '22023'; end if;
  if gl_label is null or jsonb_typeof(gl_label) <> 'object' or gl_label = '{}' then raise exception '학년 표기가 필요합니다.' using errcode = '22023'; end if;
  begin
    insert into public.grade_levels(school_id, school_level_id, code, label, ordinal, sort_order)
    values (target, level_id, gl_code, gl_label, gl_ordinal, coalesce(gl_order, gl_ordinal)) returning id into nid;
  exception when unique_violation then raise exception '같은 학년 코드가 이미 있습니다.' using errcode = '23505';
  end;
  return nid;
end $$;

-- 하위 마디(성적 기간·분기 등). 부모와 같은 확정 규칙 판을 물려받고, 기간은 부모 안에 있어야 한다
create or replace function app.add_sub_term(target uuid, parent uuid, sub_kind text, sub_key text, sub_label text,
  sub_starts date, sub_ends date, sub_credit boolean default false)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare pt record; nid uuid; seq integer;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  select id, academic_year_id, rule_id, starts_on, ends_on into pt from public.terms where id = parent and school_id = target;
  if pt.id is null then raise exception '상위 학기를 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if sub_kind not in ('semester', 'trimester', 'quarter', 'term', 'grading_period', 'session') then raise exception '마디 종류가 올바르지 않습니다.' using errcode = '22023'; end if;
  if coalesce(sub_key, '') !~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,40}$' or length(trim(coalesce(sub_label, ''))) not between 1 and 60 then
    raise exception '하위 학기 열쇠·이름이 올바르지 않습니다.' using errcode = '22023';
  end if;
  if sub_starts is null or sub_ends is null or sub_ends <= sub_starts then raise exception '끝 날짜는 시작 날짜보다 뒤여야 합니다.' using errcode = '22023'; end if;
  if pt.starts_on is not null and (sub_starts < pt.starts_on or sub_ends > pt.ends_on) then
    raise exception '하위 학기 기간은 상위 학기 기간 안에 있어야 합니다.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('school-platform:terms'), hashtext(pt.academic_year_id::text));
  select coalesce(max(sequence), 0) + 1 into seq from public.terms where parent_id = parent;
  begin
    insert into public.terms(school_id, academic_year_id, rule_id, period_key, label, sequence, starts_on, ends_on, parent_id, kind, credit_bearing)
    values (target, pt.academic_year_id, pt.rule_id, sub_key, trim(sub_label), seq, sub_starts, sub_ends, parent, sub_kind, coalesce(sub_credit, false))
    returning id into nid;
  exception when unique_violation then raise exception '같은 학년도에 같은 열쇠의 학기가 있습니다.' using errcode = '23505';
  end;
  return nid;
end $$;

create or replace function app.set_term_entry_window(target uuid, term uuid, opens date, closes date)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if opens is not null and closes is not null and closes < opens then raise exception '입력 창 끝이 시작보다 앞입니다.' using errcode = '22023'; end if;
  update public.terms set entry_opens_on = opens, entry_closes_on = closes where id = term and school_id = target;
  if not found then raise exception '학기를 찾을 수 없습니다.' using errcode = 'P0002'; end if;
end $$;

-- 수업일 묶음 넣기: [{day, kind, half_day, label}]. 같은 날은 고쳐 쓴다(누가·언제는 남김)
create or replace function app.set_calendar_days(target uuid, year_id uuid, days jsonb)
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare y record; d record; n integer := 0;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  select id, starts_on, ends_on into y from public.academic_years where id = year_id and school_id = target;
  if y.id is null then raise exception '학년도를 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if jsonb_typeof(days) <> 'array' or jsonb_array_length(days) > 400 then raise exception '수업일은 400개 이하 배열로 넣습니다.' using errcode = '22023'; end if;
  for d in select (e ->> 'day')::date as day, coalesce(e ->> 'kind', 'instructional') as kind, coalesce((e ->> 'half_day')::boolean, false) as half_day,
                  nullif(trim(e ->> 'label'), '') as label from jsonb_array_elements(days) e loop
    if d.day < y.starts_on or d.day >= y.ends_on then raise exception '학년도 밖의 날짜가 있습니다.' using errcode = '22023'; end if;
    insert into public.calendar_days(school_id, academic_year_id, day, kind, half_day, label)
    values (target, year_id, d.day, d.kind, d.half_day, d.label)
    on conflict (school_id, day) do update set kind = excluded.kind, half_day = excluded.half_day, label = excluded.label,
      updated_by = app.uid(), updated_at = now()
      where calendar_days.academic_year_id = excluded.academic_year_id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- E1: 학교 코드 값. 같은 코드를 바꾸려면 새 행(prior_code_id)을 만들고 옛 행은 effective_to 로 닫는다
create or replace function app.add_code(target uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare nid uuid; prior uuid := nullif(p ->> 'prior_code_id', '')::uuid; pr record; starts date := nullif(p ->> 'effective_from', '')::date;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if coalesce(p ->> 'list_key', '') !~ '^[a-z][a-z0-9_]{1,40}$' or coalesce(p ->> 'code', '') !~ '^[a-z0-9][a-z0-9_.-]{0,40}$' then
    raise exception '목록 열쇠·코드 형식이 올바르지 않습니다.' using errcode = '22023';
  end if;
  if jsonb_typeof(p -> 'label') <> 'object' or (p -> 'label') = '{}' then raise exception '코드 표기가 필요합니다.' using errcode = '22023'; end if;
  if prior is not null then
    select id, school_id, list_key, effective_to into pr from public.code_lists where id = prior;
    if pr.id is null or pr.school_id is distinct from target or pr.list_key <> p ->> 'list_key' then
      raise exception '이전 코드를 찾을 수 없습니다.' using errcode = 'P0002';
    end if;
    if pr.effective_to is not null then raise exception '이미 닫힌 코드입니다.' using errcode = 'P0409'; end if;
    if starts is null then starts := current_date; end if;
    update public.code_lists set effective_to = starts where id = prior;
  end if;
  begin
    insert into public.code_lists(school_id, list_key, code, label, sort_order, attrs, maps_to, effective_from, prior_code_id, why)
    values (target, p ->> 'list_key', p ->> 'code', p -> 'label', coalesce((p ->> 'sort_order')::int, 0),
            coalesce(p -> 'attrs', '{}'), coalesce(p -> 'maps_to', '{}'), starts, prior, nullif(trim(p ->> 'why'), ''))
    returning id into nid;
  exception when unique_violation then raise exception '같은 코드가 이미 있습니다.' using errcode = '23505';
  end;
  return nid;
end $$;

create or replace function app.add_external_identifier(target uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare nid uuid;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if coalesce(p ->> 'system', '') in ('kr_rrn', 'us_ssn', 'national_id', 'passport') then
    raise exception '국가 신분 번호는 이 표에 두지 않습니다.' using errcode = '22023';
  end if;
  begin
    insert into public.external_identifiers(school_id, target_kind, person_id, system, value, status, scope, valid_from, valid_to)
    values (target, coalesce(p ->> 'target_kind', 'person'), nullif(p ->> 'person_id', '')::uuid, p ->> 'system', trim(p ->> 'value'),
            coalesce(nullif(p ->> 'status', ''), 'official'), nullif(p ->> 'scope', ''), nullif(p ->> 'valid_from', '')::date, nullif(p ->> 'valid_to', '')::date)
    returning id into nid;
  exception
    when unique_violation then raise exception '같은 체계에 같은 번호가 이미 있습니다.' using errcode = '23505';
    when check_violation then raise exception '외부 식별자 형식이 올바르지 않습니다.' using errcode = '22023';
    when foreign_key_violation then raise exception '사람을 찾을 수 없습니다.' using errcode = 'P0002';
  end;
  return nid;
end $$;

create or replace function app.supersede_external_identifier(target uuid, ident uuid, end_on date)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  update public.external_identifiers set status = 'superseded', valid_to = coalesce(end_on, current_date)
   where id = ident and school_id = target and status <> 'superseded';
  if not found then raise exception '외부 식별자를 찾을 수 없습니다.' using errcode = 'P0002'; end if;
end $$;

create or replace function app.add_family(target uuid, family_label text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare nid uuid;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if length(trim(coalesce(family_label, ''))) not between 1 and 80 then raise exception '가족 이름은 1~80자입니다.' using errcode = '22023'; end if;
  insert into public.families(school_id, label) values (target, trim(family_label)) returning id into nid;
  return nid;
end $$;

create or replace function app.link_guardian(target uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare nid uuid;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  begin
    insert into public.guardian_links(school_id, family_id, guardian_person_id, student_person_id, relation_code, legal_guardian, contact_allowed, restriction_note, starts_on)
    values (target, nullif(p ->> 'family_id', '')::uuid, (p ->> 'guardian_person_id')::uuid, (p ->> 'student_person_id')::uuid,
            coalesce(nullif(p ->> 'relation_code', ''), 'guardian'), coalesce((p ->> 'legal_guardian')::boolean, true),
            coalesce((p ->> 'contact_allowed')::boolean, true), nullif(trim(p ->> 'restriction_note'), ''), coalesce(nullif(p ->> 'starts_on', '')::date, current_date))
    returning id into nid;
  exception
    when foreign_key_violation then raise exception '사람이나 가족을 찾을 수 없습니다.' using errcode = 'P0002';
    when exclusion_violation then raise exception '같은 기간에 이미 연결돼 있습니다.' using errcode = '23505';
    when check_violation then raise exception '보호자와 학생이 같거나 형식이 올바르지 않습니다.' using errcode = '22023';
  end;
  return nid;
end $$;

create or replace function app.end_guardian_link(target uuid, link uuid, end_on date)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  update public.guardian_links set ends_on = coalesce(end_on, current_date) where id = link and school_id = target and ends_on is null;
  if not found then raise exception '연결을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
end $$;

create or replace function app.assign_staff(target uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare nid uuid;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  begin
    insert into public.staff_assignments(school_id, person_id, role_code, school_level_id, starts_on, note)
    values (target, (p ->> 'person_id')::uuid, p ->> 'role_code', nullif(p ->> 'school_level_id', '')::uuid,
            coalesce(nullif(p ->> 'starts_on', '')::date, current_date), nullif(trim(p ->> 'note'), ''))
    returning id into nid;
  exception
    when foreign_key_violation then raise exception '사람이나 학교급을 찾을 수 없습니다.' using errcode = 'P0002';
    when check_violation then raise exception '역할 코드 형식이 올바르지 않습니다.' using errcode = '22023';
  end;
  return nid;
end $$;

create or replace function app.end_staff_assignment(target uuid, assignment uuid, end_on date)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  update public.staff_assignments set ends_on = coalesce(end_on, current_date) where id = assignment and school_id = target and ends_on is null;
  if not found then raise exception '배정을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
end $$;

create or replace function app.set_directory_optout(target uuid, person uuid, optout_scope text, optout_reason text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare nid uuid;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  begin
    insert into public.directory_optouts(school_id, person_id, scope, reason)
    values (target, person, coalesce(nullif(optout_scope, ''), 'all'), nullif(trim(optout_reason), '')) returning id into nid;
  exception
    when foreign_key_violation then raise exception '사람을 찾을 수 없습니다.' using errcode = 'P0002';
    when exclusion_violation then raise exception '이미 공개 거부 중입니다.' using errcode = '23505';
    when check_violation then raise exception '공개 거부 범위가 올바르지 않습니다.' using errcode = '22023';
  end;
  return nid;
end $$;

create or replace function app.end_directory_optout(target uuid, optout uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  update public.directory_optouts set ends_on = current_date + 1 where id = optout and school_id = target and ends_on is null;
  if not found then raise exception '공개 거부를 찾을 수 없습니다.' using errcode = 'P0002'; end if;
end $$;

-- 공개해도 되는지(학교 누리집·에이전트 공개가 부른다)
create or replace function app.directory_allowed(target uuid, person uuid, what text default 'all')
returns boolean language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select app.is_member(target) and not exists (
    select 1 from public.directory_optouts o
     where o.school_id = target and o.person_id = person and (o.scope = 'all' or o.scope = what)
       and o.starts_on <= current_date and (o.ends_on is null or o.ends_on > current_date))
$$;

-- 학생 수업 제안: 새 제안(1판) / 새 판(base_version 409) / 승인된 판을 개설과 한 번 잇기
create or replace function app.propose_course(target uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare nid uuid;
begin
  if not app.is_member(target) then raise exception '이 학교 구성원만 할 수 있습니다.' using errcode = '42501'; end if;
  begin
    insert into public.course_proposals(school_id, proposer_person_id) values (target, (p ->> 'proposer_person_id')::uuid) returning id into nid;
  exception when foreign_key_violation then raise exception '제안한 사람을 찾을 수 없습니다.' using errcode = 'P0002';
  end;
  perform app.save_course_proposal(target, nid, p || jsonb_build_object('base_version', 0));
  return nid;
end $$;

create or replace function app.save_course_proposal(target uuid, proposal uuid, p jsonb)
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v integer; st text := coalesce(nullif(p ->> 'status', ''), 'draft'); prev text;
begin
  if not app.is_member(target) then raise exception '이 학교 구성원만 할 수 있습니다.' using errcode = '42501'; end if;
  if not exists (select 1 from public.course_proposals where id = proposal and school_id = target) then
    raise exception '수업 제안을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtext('school-platform:course_proposals'), hashtext(proposal::text));
  select coalesce(max(version), 0) into v from public.course_proposal_versions where proposal_id = proposal;
  if (p ->> 'base_version') is null or (p ->> 'base_version')::int <> v then
    raise exception '그 사이 새 판이 생겼습니다. 최신 판을 다시 읽어 고쳐 주세요.' using errcode = 'P0409';
  end if;
  select status into prev from public.course_proposal_versions where proposal_id = proposal and version = v;
  -- 승인·반려는 학교 관리자만. 승인된 제안은 다시 고치지 않는다(새 제안으로)
  if st in ('approved', 'rejected') and not app.is_school_admin(target) then raise exception '승인·반려는 학교 관리자가 합니다.' using errcode = '42501'; end if;
  if prev = 'approved' then raise exception '승인된 제안은 고치지 않습니다. 새 제안을 만드세요.' using errcode = 'P0001'; end if;
  begin
    insert into public.course_proposal_versions(school_id, proposal_id, version, title, purpose, plan, mentor_person_id, term_id, status, note)
    values (target, proposal, v + 1, trim(coalesce(p ->> 'title', '')), coalesce(p ->> 'purpose', ''), coalesce(p ->> 'plan', ''),
            nullif(p ->> 'mentor_person_id', '')::uuid, nullif(p ->> 'term_id', '')::uuid, st, nullif(trim(p ->> 'note'), ''));
  exception
    when check_violation then raise exception '제안 내용 형식이 올바르지 않습니다.' using errcode = '22023';
    when foreign_key_violation then raise exception '멘토나 학기를 찾을 수 없습니다.' using errcode = 'P0002';
  end;
  return v + 1;
end $$;

create or replace function app.link_proposal_offering(target uuid, proposal uuid, offering uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare st text;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  select status into st from public.course_proposal_versions where proposal_id = proposal and school_id = target order by version desc limit 1;
  if st is null then raise exception '수업 제안을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if st <> 'approved' then raise exception '승인된 제안만 개설과 이을 수 있습니다.' using errcode = 'P0001'; end if;
  begin
    update public.course_offerings set origin = 'student_proposal', proposal_id = proposal where id = offering and school_id = target;
  exception when unique_violation then raise exception '이 제안은 이미 다른 개설과 이어져 있습니다.' using errcode = '23505';
  end;
  if not found then raise exception '개설을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
end $$;

create or replace function app.set_offering_origin(target uuid, offering uuid, new_origin text)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if new_origin not in ('project', 'internship', 'external') then raise exception '이 함수로 정하는 기원은 project·internship·external 입니다.' using errcode = '22023'; end if;
  update public.course_offerings set origin = new_origin where id = offering and school_id = target;
  if not found then raise exception '개설을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
end $$;

grant execute on function app.directory_allowed(uuid, uuid, text) to authenticated, app_writer;

grant create on schema app to app_writer;
do $$
declare f text;
begin
  foreach f in array array[
    'app.set_school_profile(uuid, jsonb)',
    'app.add_grade_level(uuid, uuid, text, jsonb, integer, integer)',
    'app.add_sub_term(uuid, uuid, text, text, text, date, date, boolean)',
    'app.set_term_entry_window(uuid, uuid, date, date)',
    'app.set_calendar_days(uuid, uuid, jsonb)',
    'app.add_code(uuid, jsonb)',
    'app.add_external_identifier(uuid, jsonb)',
    'app.supersede_external_identifier(uuid, uuid, date)',
    'app.add_family(uuid, text)',
    'app.link_guardian(uuid, jsonb)',
    'app.end_guardian_link(uuid, uuid, date)',
    'app.assign_staff(uuid, jsonb)',
    'app.end_staff_assignment(uuid, uuid, date)',
    'app.set_directory_optout(uuid, uuid, text, text)',
    'app.end_directory_optout(uuid, uuid)',
    'app.propose_course(uuid, jsonb)',
    'app.save_course_proposal(uuid, uuid, jsonb)',
    'app.link_proposal_offering(uuid, uuid, uuid)',
    'app.set_offering_origin(uuid, uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
    execute format('alter function %s owner to app_writer', f);
  end loop;
end $$;
revoke create on schema app from app_writer;
-- propose_course 가 save_course_proposal 을 부르는 것은 둘 다 app_writer 소유라 따로 권한이 필요 없다
