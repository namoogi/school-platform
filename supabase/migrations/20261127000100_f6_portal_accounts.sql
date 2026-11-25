-- 62차: ADR 0025 F6-1 · ADR 0029 — 학생·보호자 열람 계정과 열람 계약(app.portal_record_v1)
-- 열람 계정은 구성원(memberships)과 따로다. 기존 표의 정책(app.is_member)은 열람 계정에 아무것도 열지 않는다.
-- 열람은 표를 직접 읽지 않고 열람 계약 함수 하나로만 한다(ADR 0027 보고 계약과 같은 모양). 민감·제한 칸은 내보내지 않는다.
select set_config('request.jwt.claims', '{}', true);

create table public.portal_accounts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  kind text not null check (kind in ('student', 'guardian')),
  person_id uuid not null,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 200),
  user_id uuid references private.app_users(id),
  -- 동의 연령(학교 관할: KR 만 14세, US 13세 등) 미만 학생 계정은 보호자 동의 또는 학교 승인 근거를 남겨야 만든다. 생년월일은 모으지 않는다
  under_consent_age boolean not null default false,
  consent_basis text check (consent_basis is null or consent_basis in ('guardian_consent', 'school_authorization')),
  consent_note text check (consent_note is null or length(consent_note) <= 500),
  starts_on date not null default current_date,
  ends_on date,
  end_reason text check (end_reason is null or length(end_reason) <= 500),
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  check (kind = 'guardian' or not under_consent_age or consent_basis is not null),
  check (kind = 'student' or not under_consent_age),
  check (ends_on is null or ends_on >= starts_on),
  check ((user_id is null) = (claimed_at is null)),
  unique (id, school_id),
  foreign key (person_id, school_id) references public.people(id, school_id)
);
create unique index portal_accounts_active on public.portal_accounts (school_id, email, person_id) where ends_on is null;
create index portal_accounts_user on public.portal_accounts (user_id) where user_id is not null;
create index portal_accounts_pending on public.portal_accounts (email) where user_id is null and ends_on is null;
-- 바꿀 수 있는 것: 첫 로그인 때 연결(user_id·claimed_at), 끝내기(ends_on·end_reason). 나머지는 새 계정으로
create trigger portal_accounts_guard before update or delete on public.portal_accounts
  for each row execute function private.guard_columns('user_id', 'claimed_at', 'ends_on', 'end_reason');
create or replace function private.portal_account_once() returns trigger language plpgsql as $$
begin
  if old.user_id is not null and new.user_id is distinct from old.user_id then raise exception 'portal_accounts: 연결한 계정은 바꾸지 않습니다.' using errcode = 'P0001'; end if;
  if old.ends_on is not null and new.ends_on is distinct from old.ends_on then raise exception 'portal_accounts: 끝낸 열람 계정은 다시 열지 않습니다. 새로 만드세요.' using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger portal_accounts_once before update on public.portal_accounts for each row execute function private.portal_account_once();

alter table public.portal_accounts enable row level security;
revoke all on public.portal_accounts from public, anon, authenticated;
grant select on public.portal_accounts to authenticated, app_writer;
grant insert, update (ends_on, end_reason) on public.portal_accounts to app_writer;
create policy portal_accounts_read on public.portal_accounts for select to authenticated, app_writer using (app.is_member(school_id) or user_id = app.uid());
create policy portal_accounts_insert on public.portal_accounts for insert to app_writer with check (app.is_school_admin(school_id));
create policy portal_accounts_end on public.portal_accounts for update to app_writer using (app.is_school_admin(school_id)) with check (app.is_school_admin(school_id));

-- ── 내가 볼 수 있는 사람 (열람 계정 → 본인 / 보호 관계가 이어진 자녀) ──
create or replace function private.portal_people(uid uuid)
returns table (school_id uuid, person_id uuid, relation text, account_id uuid)
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select a.school_id, a.person_id, 'self', a.id
    from public.portal_accounts a join public.schools s on s.id = a.school_id
   where a.user_id = uid and a.kind = 'student' and a.starts_on <= current_date and (a.ends_on is null or a.ends_on > current_date) and s.status <> 'suspended'
  union
  select a.school_id, g.student_person_id, 'child', a.id
    from public.portal_accounts a join public.schools s on s.id = a.school_id
    join public.guardian_links g on g.school_id = a.school_id and g.guardian_person_id = a.person_id
   where a.user_id = uid and a.kind = 'guardian' and a.starts_on <= current_date and (a.ends_on is null or a.ends_on > current_date) and s.status <> 'suspended'
     and g.legal_guardian and g.starts_on <= current_date and (g.ends_on is null or g.ends_on > current_date)
$$;
revoke all on function private.portal_people(uuid) from public;

-- ── 관리자: 열람 계정 만들기·끝내기 ──────────────────────
create or replace function app.add_portal_account(target uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare nid uuid; e text := lower(trim(coalesce(p ->> 'email', ''))); person uuid := nullif(p ->> 'person_id', '')::uuid; existing uuid;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 열람 계정을 만듭니다.' using errcode = '42501'; end if;
  if not exists (select 1 from public.people where id = person and school_id = target) then raise exception '사람을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if p ->> 'kind' = 'guardian' and not exists (select 1 from public.guardian_links g where g.school_id = target and g.guardian_person_id = person and g.legal_guardian
                                                 and (g.ends_on is null or g.ends_on > current_date)) then
    raise exception '이 사람에게 이어진 자녀(보호 관계)가 없습니다. 가족·보호자 연결을 먼저 하세요.' using errcode = '22023';
  end if;
  if p ->> 'kind' = 'student' and coalesce((p ->> 'under_consent_age')::boolean, false) and coalesce(p ->> 'consent_basis', '') = '' then
    raise exception '동의 연령 미만 학생은 보호자 동의 또는 학교 승인 근거를 남겨야 계정을 만듭니다.' using errcode = '22023';
  end if;
  if exists (select 1 from public.memberships m join private.app_users u on u.id = m.user_id where m.school_id = target and lower(u.email) = e) then
    raise exception '이 이메일은 이 학교 교직원 계정입니다. 열람 계정은 다른 이메일로 만드세요.' using errcode = '22023';
  end if;
  select id into existing from private.app_users where lower(email) = e;
  begin
    insert into public.portal_accounts(school_id, kind, person_id, email, user_id, claimed_at, under_consent_age, consent_basis, consent_note, starts_on)
    values (target, p ->> 'kind', person, e, existing, case when existing is not null then now() end,
            coalesce((p ->> 'under_consent_age')::boolean, false), nullif(p ->> 'consent_basis', ''), nullif(trim(p ->> 'consent_note'), ''),
            coalesce(nullif(p ->> 'starts_on', '')::date, current_date))
    returning id into nid;
  exception
    when unique_violation then raise exception '같은 사람·이메일의 열람 계정이 이미 있습니다.' using errcode = '23505';
    when check_violation or not_null_violation then raise exception '열람 계정 형식이 올바르지 않습니다(종류·이메일·동의 근거).' using errcode = '22023';
  end;
  perform app.log_access(target, 'portal.account_add', jsonb_build_object('kind', p ->> 'kind', 'person', person, 'under_consent_age', coalesce((p ->> 'under_consent_age')::boolean, false)));
  return nid;
end $$;

create or replace function app.end_portal_account(target uuid, account uuid, reason text) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 열람 계정을 끝냅니다.' using errcode = '42501'; end if;
  update public.portal_accounts set ends_on = current_date, end_reason = nullif(trim(reason), '')
   where id = account and school_id = target and ends_on is null;
  if not found then raise exception '열린 열람 계정을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  perform app.log_access(target, 'portal.account_end', jsonb_build_object('account', account));
end $$;

-- ── 열람(학생·보호자 본인 로그인) ────────────────────────
create or replace function app.portal_people() returns jsonb
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'school_id', pp.school_id, 'school', s.name, 'person_id', pp.person_id, 'relation', pp.relation,
           'name', (select n.name from public.person_names n where n.person_id = pp.person_id order by n.version desc limit 1))
         order by s.name, pp.relation desc), '[]')
    from private.portal_people(app.uid()) pp join public.schools s on s.id = pp.school_id
$$;

-- 출결 환산·요약: 교직원 구성원 또는 그 학생을 볼 수 있는 열람 계정(본인·보호자)
create or replace function app.attendance_days(target uuid, person uuid, from_day date, to_day date)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare ratio numeric; res jsonb := '[]'; d record; dayev record; am record; pm record; tot integer; nabs integer; status text; val numeric; rsn text;
begin
  if not (app.is_member(target) or exists (select 1 from private.portal_people(app.uid()) pp where pp.school_id = target and pp.person_id = person)) then
    raise exception '이 학교 구성원만 볼 수 있습니다.' using errcode = '42501';
  end if;
  select coalesce((policy -> 'attendance' ->> 'day_absent_ratio')::numeric, 0.5) into ratio from public.grading_policies where school_id = target order by version desc limit 1;
  ratio := coalesce(ratio, 0.5);
  for d in select distinct a.day from public.current_attendance a where a.school_id = target and a.person_id = person and a.day >= from_day and a.day < to_day order by a.day loop
    select kind_code, reason_code into dayev from public.current_attendance where school_id = target and person_id = person and day = d.day and scope = 'day';
    select kind_code, reason_code into am from public.current_attendance where school_id = target and person_id = person and day = d.day and scope = 'session' and session_code = 'am';
    select kind_code, reason_code into pm from public.current_attendance where school_id = target and person_id = person and day = d.day and scope = 'session' and session_code = 'pm';
    val := 0; rsn := null;
    if dayev.kind_code is not null then
      status := dayev.kind_code; rsn := dayev.reason_code; val := case when dayev.kind_code = 'absent' then 1 else 0 end;
    elsif am.kind_code is not null or pm.kind_code is not null then
      if am.kind_code = 'absent' and pm.kind_code = 'absent' then status := 'absent'; val := 1; rsn := am.reason_code;
      elsif am.kind_code = 'absent' or pm.kind_code = 'absent' then status := 'half_absent'; val := 0.5; rsn := coalesce(am.reason_code, pm.reason_code);
      else status := coalesce(nullif(am.kind_code, 'present'), nullif(pm.kind_code, 'present'), 'present');
      end if;
    else
      select count(*), count(*) filter (where kind_code in ('absent', 'class_absent')), max(reason_code) filter (where kind_code in ('absent', 'class_absent'))
        into tot, nabs, rsn from public.current_attendance where school_id = target and person_id = person and day = d.day and scope = 'period';
      if tot > 0 and nabs::numeric / tot >= ratio then status := 'absent'; val := 1;
      elsif nabs > 0 then status := 'class_absent';
      else status := coalesce((select kind_code from public.current_attendance where school_id = target and person_id = person and day = d.day
                                and scope = 'period' and kind_code in ('tardy', 'early_leave') limit 1), 'present');
      end if;
    end if;
    -- 출석인정 사유는 결석으로 세지 않는다(KR 출석인정, US 학교 활동)
    if rsn is not null and exists (select 1 from public.code_lists c where c.school_id = target and c.list_key = 'attendance_reason' and c.code = rsn
                                    and coalesce((c.attrs ->> 'counts_present')::boolean, false)) then
      val := 0;
    end if;
    res := res || jsonb_build_object('day', d.day, 'status', status, 'reason', rsn, 'absent_value', val);
  end loop;
  return res;
end $$;

create or replace function app.attendance_summary(target uuid, person uuid, from_day date, to_day date)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare days jsonb; enrolled numeric; absent numeric; chronic numeric; minr numeric; pol jsonb;
begin
  if not (app.is_member(target) or exists (select 1 from private.portal_people(app.uid()) pp where pp.school_id = target and pp.person_id = person)) then
    raise exception '이 학교 구성원만 볼 수 있습니다.' using errcode = '42501';
  end if;
  days := app.attendance_days(target, person, from_day, to_day);
  select coalesce(sum(case when c.half_day then 0.5 else 1 end), 0) into enrolled
    from public.calendar_days c
   where c.school_id = target and c.kind = 'instructional' and c.day >= from_day and c.day < to_day
     and exists (select 1 from public.enrollments_school e where e.school_id = target and e.person_id = person and daterange(e.starts_on, e.ends_on, '[)') @> c.day);
  select coalesce(sum((x ->> 'absent_value')::numeric), 0) into absent from jsonb_array_elements(days) x;
  select policy -> 'attendance' into pol from public.grading_policies where school_id = target order by version desc limit 1;
  chronic := coalesce((pol ->> 'chronic_ratio')::numeric, 0.1);
  minr := coalesce((pol ->> 'min_attendance_ratio')::numeric, 2.0 / 3);
  return jsonb_build_object(
    'enrolled_days', enrolled, 'absent_days', absent,
    'counts', (select coalesce(jsonb_object_agg(s, n), '{}') from (select x ->> 'status' as s, count(*) as n from jsonb_array_elements(days) x group by 1) q),
    'absent_by_reason', (select coalesce(jsonb_object_agg(coalesce(r, 'none'), v), '{}') from (select x ->> 'reason' as r, sum((x ->> 'absent_value')::numeric) as v
                          from jsonb_array_elements(days) x where (x ->> 'absent_value')::numeric > 0 group by 1) q),
    'attendance_rate', case when enrolled > 0 then round((enrolled - absent) / enrolled, 4) end,
    'chronic_absence', enrolled > 0 and absent / enrolled >= chronic,
    'meets_min_attendance', enrolled = 0 or (enrolled - absent) / enrolled >= minr,
    'thresholds', jsonb_build_object('chronic_ratio', chronic, 'min_attendance_ratio', round(minr, 4)));
end $$;

-- 열람 계약 1판: 학년도 기록 마감 판(확정 기록), 발행본 목록, 올해 출결 요약, 켜진 꾸러미의 학교 정의 기록(민감·제한 칸 제외)
create or replace function app.portal_record_v1(target_person uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare v record; yr record; res jsonb;
begin
  select * into v from private.portal_people(app.uid()) pp where pp.person_id = target_person limit 1;
  if v.person_id is null then raise exception '볼 수 있는 기록이 아닙니다.' using errcode = '42501'; end if;
  select id, label, starts_on, ends_on into yr from public.academic_years
   where school_id = v.school_id and starts_on <= current_date and ends_on > current_date order by starts_on desc limit 1;
  select jsonb_build_object(
    'contract', 'portal-record/1',
    'relation', v.relation,
    'school', (select name from public.schools where id = v.school_id),
    'student', (select jsonb_build_object('name', n.name, 'name_latin', n.name_latin) from public.person_names n where n.person_id = target_person order by n.version desc limit 1),
    'record_years', (select coalesce(jsonb_agg(jsonb_build_object('version', r.version, 'closed_at', r.closed_at, 'reason', r.reason,
                                  'year', r.snapshot -> 'year', 'enrollments', r.snapshot -> 'enrollments', 'courses', r.snapshot -> 'courses',
                                  'narratives', r.snapshot -> 'narratives', 'attendance', r.snapshot -> 'attendance', 'evidence', r.snapshot -> 'evidence')
                                order by r.snapshot #>> '{year,starts_on}'), '[]')
                       from (select distinct on (academic_year_id) * from public.record_closures
                              where school_id = v.school_id and person_id = target_person order by academic_year_id, version desc) r),
    'documents', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'format', d.format, 'lang', d.lang, 'published_at', d.published_at) order by d.published_at desc), '[]')
                    from public.record_documents d where d.school_id = v.school_id and d.person_id = target_person and not d.blind),
    'attendance_current', case when yr.id is null then null else
                            jsonb_build_object('year', yr.label) || app.attendance_summary(v.school_id, target_person, yr.starts_on, least(yr.ends_on, current_date + 1)) end,
    'school_records', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'record_type', d.code, 'title', dv.spec -> 'title', 'recorded_at', r.recorded_at,
               'state', (select t.to_state from public.custom_record_transitions t where t.record_id = r.id order by t.moved_at desc, t.id desc limit 1),
               'fields', (select coalesce(jsonb_agg(jsonb_build_object('key', f ->> 'key', 'label', f -> 'label', 'value', r.data -> (f ->> 'key')) order by ord), '[]')
                            from jsonb_array_elements(dv.spec -> 'fields') with ordinality as x(f, ord)
                           where f ->> 'privacy' in ('directory', 'internal') and r.data ? (f ->> 'key')))
             order by r.recorded_at), '[]')
        from public.custom_records r
        join public.definitions d on d.id = r.definition_id
        join public.definition_versions dv on dv.definition_id = r.definition_id and dv.version = r.definition_version
       where r.school_id = v.school_id and r.person_id = target_person
         and not exists (select 1 from public.custom_records z where z.corrects_id = r.id)
         and exists (select 1 from public.package_states s where s.package_id = r.package_id
                      and s.id = (select s2.id from public.package_states s2 where s2.package_id = r.package_id order by s2.decided_at desc, s2.id desc limit 1)
                      and s.state = 'enabled')))
  into res;
  return res;
end $$;

-- 발행본 내용: 볼 수 있는 학생의 블라인드 아닌 발행본만
create or replace function app.portal_document_v1(doc uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare d record;
begin
  select id, school_id, person_id, format, lang, content, published_at, content_sha256 into d from public.record_documents where id = doc and not blind;
  if d.id is null or not exists (select 1 from private.portal_people(app.uid()) pp where pp.school_id = d.school_id and pp.person_id = d.person_id) then
    raise exception '볼 수 있는 발행본이 아닙니다.' using errcode = '42501';
  end if;
  return jsonb_build_object('id', d.id, 'format', d.format, 'lang', d.lang, 'content', d.content, 'published_at', d.published_at, 'sha256', d.content_sha256);
end $$;

-- 계약 함수는 보고 계약(app.school_report_v1)처럼 표 소유자 권한으로 돌고, 함수 안에서 볼 수 있는 사람을 먼저 확인한다
revoke all on function app.add_portal_account(uuid, jsonb), app.end_portal_account(uuid, uuid, text), app.portal_people(),
  app.portal_record_v1(uuid), app.portal_document_v1(uuid) from public, anon;
grant execute on function app.add_portal_account(uuid, jsonb), app.end_portal_account(uuid, uuid, text), app.portal_people(),
  app.portal_record_v1(uuid), app.portal_document_v1(uuid) to authenticated;
