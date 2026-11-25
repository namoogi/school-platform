-- 59차: ADR 0025 학사 토대 F3 — 출결 사건 원장 · 하루 환산·요약 · 증거물 · 확인(서명)
-- 출결은 사건으로 추가만(정정 = 앞 사건을 가리키는 새 사건). 코드는 학교 사본 code_lists(attendance_kind × attendance_reason, ADR 0027).
-- 하루 환산·요약 기준은 성적 정책 판 policy.attendance(학교가 판으로 정함), 분모는 수업일 달력 × 학적 기간.
select set_config('request.jwt.claims', '{}', true);

create table public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  person_id uuid not null,
  day date not null,
  scope text not null check (scope in ('day', 'session', 'period')),
  session_code text check (session_code is null or session_code in ('am', 'pm')),
  period smallint check (period is null or period between 0 and 20),
  offering_id uuid,
  kind_code text not null check (kind_code ~ '^[a-z0-9][a-z0-9_.-]{0,40}$'),
  reason_code text check (reason_code is null or reason_code ~ '^[a-z0-9][a-z0-9_.-]{0,40}$'),
  minutes integer check (minutes is null or minutes between 0 and 1440),
  note text check (note is null or length(note) <= 500),
  corrects_id uuid references public.attendance_events(id),
  reason text check (reason is null or length(reason) <= 500),
  recorded_by uuid not null default app.uid(),
  recorded_at timestamptz not null default clock_timestamp(),
  check ((scope = 'session') = (session_code is not null)),
  check ((scope = 'period') = (period is not null)),
  unique (id, school_id),
  foreign key (person_id, school_id) references public.people(id, school_id),
  foreign key (offering_id, school_id) references public.course_offerings(id, school_id)
);
create index attendance_events_lookup on public.attendance_events (school_id, person_id, day);
-- 같은 자리(사람·날·범위·반나절·교시·수업)의 가장 최근 사건이 현재 값
create view public.current_attendance with (security_invoker = true) as
  select distinct on (a.school_id, a.person_id, a.day, a.scope, coalesce(a.session_code, ''), coalesce(a.period, -1), coalesce(a.offering_id, '00000000-0000-0000-0000-000000000000'::uuid)) a.*
    from public.attendance_events a
   order by a.school_id, a.person_id, a.day, a.scope, coalesce(a.session_code, ''), coalesce(a.period, -1),
            coalesce(a.offering_id, '00000000-0000-0000-0000-000000000000'::uuid), a.recorded_at desc, a.id;

-- 증거물(산출물·포트폴리오·관찰 기록): 사람 + (수업·평가 항목·역량) 연결, 글·링크. 대체는 새 행
create table public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  person_id uuid not null,
  offering_id uuid,
  assessment_id uuid,
  competency_item_id uuid,
  title text not null check (length(trim(title)) between 1 and 200),
  body text check (body is null or length(body) <= 8000),
  link text check (link is null or link ~ '^https://'),
  supersedes_id uuid references public.evidence_items(id),
  recorded_by uuid not null default app.uid(),
  recorded_at timestamptz not null default clock_timestamp(),
  check (body is not null or link is not null),
  unique (id, school_id),
  foreign key (person_id, school_id) references public.people(id, school_id),
  foreign key (offering_id, school_id) references public.course_offerings(id, school_id),
  foreign key (assessment_id, school_id) references public.assessments(id, school_id),
  foreign key (competency_item_id, school_id) references public.competency_items(id, school_id)
);

-- 확인(서명): 마감 판·서술·증거물·수업 제안에 대한 역할별 확인. 위원회·멘토·결재를 한 경로로
create table public.attestations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  subject_kind text not null check (subject_kind in ('closure', 'narrative', 'evidence', 'proposal')),
  subject_id uuid not null,
  role_code text not null check (role_code ~ '^[a-z0-9][a-z0-9_.-]{0,40}$'),
  decision text not null check (decision in ('confirmed', 'rejected')),
  note text check (note is null or length(note) <= 500),
  attested_by uuid not null default app.uid(),
  attested_at timestamptz not null default now()
);
create index attestations_subject on public.attestations (school_id, subject_kind, subject_id);

create trigger attendance_events_guard before update or delete on public.attendance_events for each row execute function private.guard_columns();
create trigger evidence_items_guard before update or delete on public.evidence_items for each row execute function private.guard_columns();
create trigger attestations_guard before update or delete on public.attestations for each row execute function private.guard_columns();

do $$
declare t text;
begin
  foreach t in array array['attendance_events', 'evidence_items', 'attestations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated, app_writer', t);
    execute format('grant insert on public.%I to app_writer', t);
    execute format('create policy %I on public.%I for select to authenticated, app_writer using (app.is_member(school_id))', t || '_read', t);
    execute format('create policy %I on public.%I for insert to app_writer with check (app.is_member(school_id))', t || '_insert', t);
  end loop;
end $$;
revoke all on public.current_attendance from public, anon;
grant select on public.current_attendance to authenticated, app_writer;

-- ── 출결 기록 ────────────────────────────────────────────
-- 하루·반나절은 학교 구성원(교사·관리자), 교시·수업은 그 수업 담당 교사·관리자. 수업일이 아닌 날(달력에 있으면)은 거부.
create or replace function app.record_attendance(target uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare person uuid := (p ->> 'person_id')::uuid; d date := (p ->> 'day')::date; sc text := coalesce(nullif(p ->> 'scope', ''), 'day');
        off uuid := nullif(p ->> 'offering_id', '')::uuid; k text := p ->> 'kind_code'; r text := nullif(p ->> 'reason_code', '');
        ses text := nullif(p ->> 'session_code', ''); per smallint := nullif(p ->> 'period', '')::smallint; prev uuid; nid uuid; cal text;
begin
  if off is not null then
    if not private.can_grade(target, off) then raise exception '이 수업의 담당 교사나 학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  elsif not app.is_member(target) then
    raise exception '이 학교 구성원만 할 수 있습니다.' using errcode = '42501';
  end if;
  if k is null or (k <> 'present' and not exists (select 1 from public.code_lists c where c.school_id = target and c.list_key = 'attendance_kind' and c.code = k
                                                   and (c.effective_to is null or c.effective_to > d) and (c.effective_from is null or c.effective_from <= d))) then
    raise exception '이 학교에 없는 출결 종류입니다.' using errcode = '22023';
  end if;
  if r is not null and not exists (select 1 from public.code_lists c where c.school_id = target and c.list_key = 'attendance_reason' and c.code = r
                                    and (c.effective_to is null or c.effective_to > d) and (c.effective_from is null or c.effective_from <= d)) then
    raise exception '이 학교에 없는 출결 사유입니다.' using errcode = '22023';
  end if;
  select kind into cal from public.calendar_days where school_id = target and day = d;
  if cal is not null and cal <> 'instructional' then raise exception '수업일이 아닌 날입니다.' using errcode = '22023'; end if;
  if not exists (select 1 from public.enrollments_school e where e.school_id = target and e.person_id = person
                  and daterange(e.starts_on, e.ends_on, '[)') @> d) then
    raise exception '그날 이 학교 학적이 없습니다.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('school-platform:attendance'), hashtext(person::text || d::text));
  select id into prev from public.current_attendance a
   where a.school_id = target and a.person_id = person and a.day = d and a.scope = sc and a.session_code is not distinct from ses
     and a.period is not distinct from per and a.offering_id is not distinct from off;
  begin
    insert into public.attendance_events(school_id, person_id, day, scope, session_code, period, offering_id, kind_code, reason_code, minutes, note, corrects_id, reason)
    values (target, person, d, sc, ses, per, off, k, r, nullif(p ->> 'minutes', '')::int, nullif(trim(p ->> 'note'), ''), prev, nullif(trim(p ->> 'reason'), ''))
    returning id into nid;
  exception
    when check_violation then raise exception '출결 형식이 올바르지 않습니다(범위·반나절·교시).' using errcode = '22023';
    when foreign_key_violation then raise exception '사람이나 수업을 찾을 수 없습니다.' using errcode = 'P0002';
  end;
  return nid;
end $$;

-- 하루 환산: 하루 사건 > 반나절 사건(둘 다 결석 = 결석 1, 하나 = 0.5) > 교시 사건(결석 교시 비율 ≥ day_absent_ratio → 결석, 아니면 결과)
-- 결과 jsonb: [{day, status: present|absent|half_absent|tardy|early_leave|class_absent, reason, absent_value}]
create or replace function app.attendance_days(target uuid, person uuid, from_day date, to_day date)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare ratio numeric; res jsonb := '[]'; d record; dayev record; am record; pm record; tot integer; nabs integer; status text; val numeric; rsn text;
begin
  if not app.is_member(target) then raise exception '이 학교 구성원만 볼 수 있습니다.' using errcode = '42501'; end if;
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

-- 요약: 재적 수업일(달력 × 학적 기간, 반일 0.5) · 결석 일수 · 종류별 횟수 · 출석률 · 만성 결석(US 10%) · 출석 2/3(KR) 판정
create or replace function app.attendance_summary(target uuid, person uuid, from_day date, to_day date)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare days jsonb; enrolled numeric; absent numeric; chronic numeric; minr numeric; pol jsonb;
begin
  if not app.is_member(target) then raise exception '이 학교 구성원만 볼 수 있습니다.' using errcode = '42501'; end if;
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

-- ── 증거물 · 확인 ────────────────────────────────────────
create or replace function app.add_evidence(target uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare off uuid := nullif(p ->> 'offering_id', '')::uuid; nid uuid;
begin
  if off is not null then
    if not private.can_grade(target, off) then raise exception '이 수업의 담당 교사나 학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  elsif not app.is_member(target) then raise exception '이 학교 구성원만 할 수 있습니다.' using errcode = '42501';
  end if;
  begin
    insert into public.evidence_items(school_id, person_id, offering_id, assessment_id, competency_item_id, title, body, link, supersedes_id)
    values (target, (p ->> 'person_id')::uuid, off, nullif(p ->> 'assessment_id', '')::uuid, nullif(p ->> 'competency_item_id', '')::uuid,
            trim(coalesce(p ->> 'title', '')), nullif(p ->> 'body', ''), nullif(trim(p ->> 'link'), ''), nullif(p ->> 'supersedes_id', '')::uuid)
    returning id into nid;
  exception
    when check_violation then raise exception '증거물 형식이 올바르지 않습니다(제목, 글이나 https 링크).' using errcode = '22023';
    when foreign_key_violation then raise exception '사람·수업·평가·역량을 찾을 수 없습니다.' using errcode = 'P0002';
  end;
  return nid;
end $$;

create or replace function app.attest(target uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare k text := p ->> 'subject_kind'; sid uuid := (p ->> 'subject_id')::uuid; ok boolean; nid uuid;
begin
  if not app.is_member(target) then raise exception '이 학교 구성원만 할 수 있습니다.' using errcode = '42501'; end if;
  ok := case k
    when 'closure' then exists (select 1 from public.offering_closures where id = sid and school_id = target)
    when 'narrative' then exists (select 1 from public.narratives where id = sid and school_id = target)
    when 'evidence' then exists (select 1 from public.evidence_items where id = sid and school_id = target)
    when 'proposal' then exists (select 1 from public.course_proposals where id = sid and school_id = target)
    else false end;
  if not ok then raise exception '확인할 대상을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  -- 위원회·교장 확인은 학교 관리자만
  if p ->> 'role_code' in ('committee', 'principal') and not app.is_school_admin(target) then
    raise exception '위원회·교장 확인은 학교 관리자가 합니다.' using errcode = '42501';
  end if;
  begin
    insert into public.attestations(school_id, subject_kind, subject_id, role_code, decision, note)
    values (target, k, sid, p ->> 'role_code', coalesce(nullif(p ->> 'decision', ''), 'confirmed'), nullif(trim(p ->> 'note'), '')) returning id into nid;
  exception when check_violation then raise exception '확인 형식이 올바르지 않습니다.' using errcode = '22023';
  end;
  return nid;
end $$;

grant create on schema app to app_writer;
do $$
declare f text;
begin
  foreach f in array array['app.record_attendance(uuid, jsonb)', 'app.add_evidence(uuid, jsonb)', 'app.attest(uuid, jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
    execute format('alter function %s owner to app_writer', f);
  end loop;
end $$;
revoke create on schema app from app_writer;
revoke all on function app.attendance_days(uuid, uuid, date, date), app.attendance_summary(uuid, uuid, date, date) from public, anon;
grant execute on function app.attendance_days(uuid, uuid, date, date), app.attendance_summary(uuid, uuid, date, date) to authenticated;
