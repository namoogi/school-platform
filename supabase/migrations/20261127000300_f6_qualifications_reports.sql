-- 64차: ADR 0025 F6-3 — 자격 층·외부 결과, 지정일 보고 스냅샷, 응용 출력(태국 ปพ.1 학교 사본, 영어권 학업 기록)
-- 외부 결과(SAT·AP·IB·GCSE·수능·O-NET 등)는 학교 밖 기관이 낸 값이라 학교가 고치지 않는다: 추가만 하고 정정은 앞 행을 가리키는 새 행.
-- 자격(졸업장·수료·검정 합격)은 수여 때 학점 합계를 확인하고 그때 값을 얼린다.
-- 지정일 보고는 그날 기준 집계만 얼린다(개인 식별 정보 없음). 판·요청 키·409·갈라짐 방지는 학년도 기록 마감 판과 같다.
select set_config('request.jwt.claims', '{}', true);

create table public.external_results (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  person_id uuid not null,
  issuer_code text not null check (issuer_code ~ '^[a-z][a-z0-9_]{1,40}$'),
  exam_code text not null check (exam_code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,40}$'),
  title jsonb not null default '{}' check (jsonb_typeof(title) = 'object'),
  sat_on date not null,
  -- 결과 한 값: grade(글자·숫자 등급, 이중 등급 '9-8' 포함) 또는 score(점수), 하위 점수는 components
  result jsonb not null check (jsonb_typeof(result) = 'object' and (result ? 'grade' or result ? 'score')),
  source text check (source is null or length(source) <= 300),
  corrects_id uuid,
  reason text check (reason is null or length(reason) <= 500),
  recorded_by uuid not null default app.uid(),
  recorded_at timestamptz not null default now(),
  check ((corrects_id is null) or (reason is not null)),
  unique (id, school_id),
  foreign key (person_id, school_id) references public.people(id, school_id),
  foreign key (corrects_id, school_id) references public.external_results(id, school_id)
);
create unique index external_results_one_correction on public.external_results (corrects_id) where corrects_id is not null;

create table public.qualifications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  person_id uuid not null,
  kind_code text not null check (kind_code ~ '^[a-z][a-z0-9_]{1,40}$'),
  title jsonb not null check (jsonb_typeof(title) = 'object' and title <> '{}'),
  issuer_code text not null default 'school' check (issuer_code ~ '^[a-z][a-z0-9_]{1,40}$'),
  awarded_on date not null,
  requirements jsonb not null default '{}' check (jsonb_typeof(requirements) = 'object'),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  corrects_id uuid,
  reason text check (reason is null or length(reason) <= 500),
  awarded_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  check ((corrects_id is null) or (reason is not null)),
  unique (id, school_id),
  foreign key (person_id, school_id) references public.people(id, school_id),
  foreign key (corrects_id, school_id) references public.qualifications(id, school_id)
);
create unique index qualifications_one_correction on public.qualifications (corrects_id) where corrects_id is not null;

create table public.count_reports (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  as_of date not null,
  version integer not null check (version >= 1),
  previous_id uuid,
  reason text check (reason is null or length(reason) <= 1000),
  request_key text not null check (request_key ~ '^[A-Za-z0-9_.:-]{8,80}$'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  closed_by uuid not null default app.uid(),
  closed_at timestamptz not null default now(),
  check ((version = 1) = (previous_id is null)),
  check (version = 1 or reason is not null),
  unique (school_id, code, version),
  unique (school_id, request_key),
  unique (id, school_id),
  foreign key (previous_id, school_id) references public.count_reports(id, school_id)
);
create unique index count_reports_no_fork on public.count_reports (previous_id) where previous_id is not null;

do $$
declare t text;
begin
  foreach t in array array['external_results', 'qualifications', 'count_reports'] loop
    execute format('create trigger %I before update or delete on public.%I for each row execute function private.guard_columns()', t || '_guard', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated, app_writer', t);
    execute format('grant insert on public.%I to app_writer', t);
    execute format('create policy %I on public.%I for select to authenticated, app_writer using (app.is_member(school_id))', t || '_read', t);
    execute format('create policy %I on public.%I for insert to app_writer with check (app.is_school_admin(school_id))', t || '_insert', t);
  end loop;
end $$;

-- 응용 출력 서식: 태국 ปพ.1 학교 사본, 영어권 학업 기록
alter table public.output_profiles drop constraint output_profiles_format_check;
alter table public.output_profiles add constraint output_profiles_format_check
  check (format in ('kr_alt_record', 'us_transcript', 'us_school_profile', 'kr_record', 'clr', 'th_por_por_1', 'en_record'));
alter table public.record_documents drop constraint record_documents_format_check;
alter table public.record_documents add constraint record_documents_format_check
  check (format in ('kr_alt_record', 'us_transcript', 'us_school_profile', 'kr_record', 'clr', 'th_por_por_1', 'en_record'));

-- ── 외부 결과·자격 쓰기 (학교 관리자) ─────────────────────
create or replace function app.add_external_result(target uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare nid uuid; prev record;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 외부 결과를 기록합니다.' using errcode = '42501'; end if;
  if nullif(p ->> 'corrects_id', '') is not null then
    select id, person_id into prev from public.external_results where id = (p ->> 'corrects_id')::uuid and school_id = target;
    if prev.id is null then raise exception '정정할 결과를 찾을 수 없습니다.' using errcode = 'P0002'; end if;
    if prev.person_id <> (p ->> 'person_id')::uuid then raise exception '정정은 같은 학생의 결과만 가리킵니다.' using errcode = '22023'; end if;
  end if;
  begin
    insert into public.external_results(school_id, person_id, issuer_code, exam_code, title, sat_on, result, source, corrects_id, reason)
    values (target, (p ->> 'person_id')::uuid, p ->> 'issuer_code', p ->> 'exam_code', coalesce(p -> 'title', '{}'), (p ->> 'sat_on')::date,
            p -> 'result', nullif(trim(p ->> 'source'), ''), nullif(p ->> 'corrects_id', '')::uuid, nullif(trim(p ->> 'reason'), ''))
    returning id into nid;
  exception
    when foreign_key_violation then raise exception '학생을 찾을 수 없습니다.' using errcode = 'P0002';
    when unique_violation then raise exception '그 결과는 이미 정정되었습니다.' using errcode = 'P0409';
    when check_violation or not_null_violation or invalid_text_representation or datetime_field_overflow then
      raise exception '외부 결과 형식이 올바르지 않습니다(기관·시험 코드, 날짜, 등급 또는 점수, 정정 사유).' using errcode = '22023';
  end;
  return nid;
end $$;

-- 자격 수여: 학년도 기록 마감 판(최신 판)의 취득 학점 합계가 요건 이상이어야 한다. 그때 합계·판을 증거로 얼린다
create or replace function app.award_qualification(target uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare nid uuid; person uuid := nullif(p ->> 'person_id', '')::uuid; earned numeric; closures jsonb; need numeric := nullif(p #>> '{requirements,min_credits}', '')::numeric;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 자격을 수여합니다.' using errcode = '42501'; end if;
  if not exists (select 1 from public.people where id = person and school_id = target) then raise exception '학생을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  select coalesce(sum((c -> 'result' ->> 'credits_earned')::numeric), 0), coalesce(jsonb_agg(distinct jsonb_build_object('id', r.id, 'version', r.version)), '[]')
    into earned, closures
    from (select distinct on (academic_year_id) * from public.record_closures where school_id = target and person_id = person order by academic_year_id, version desc) r
    left join lateral jsonb_array_elements(r.snapshot -> 'courses') c on true;
  if need is not null and earned < need then
    raise exception '취득 학점(%)이 요건(%)보다 적습니다. 학년도 기록 마감 판을 확인하세요.', trim_scale(earned), trim_scale(need) using errcode = '22023';
  end if;
  begin
    insert into public.qualifications(school_id, person_id, kind_code, title, issuer_code, awarded_on, requirements, evidence, corrects_id, reason)
    values (target, person, p ->> 'kind_code', p -> 'title', coalesce(nullif(p ->> 'issuer_code', ''), 'school'), coalesce(nullif(p ->> 'awarded_on', '')::date, current_date),
            coalesce(p -> 'requirements', '{}'), jsonb_build_object('credits_earned', earned, 'record_closures', closures),
            nullif(p ->> 'corrects_id', '')::uuid, nullif(trim(p ->> 'reason'), ''))
    returning id into nid;
  exception
    when unique_violation then raise exception '그 자격은 이미 정정되었습니다.' using errcode = 'P0409';
    when check_violation or not_null_violation or foreign_key_violation then raise exception '자격 형식이 올바르지 않습니다(종류 코드·이름·정정 사유).' using errcode = '22023';
  end;
  return nid;
end $$;

-- ── 지정일 보고 스냅샷 ────────────────────────────────────
-- 그날 재적 학생 수(학교급·상태별), 그날까지 학년도 출결 합계(수업일·결석일·만성 결석 학생 수), 마감된 수업 수. 이름·id 없음
create or replace function private.count_snapshot(target uuid, as_of date) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare yr record; res jsonb; chronic integer := 0; enrolled_days numeric := 0; absent_days numeric := 0; s jsonb; pid uuid;
begin
  select id, label, starts_on, ends_on into yr from public.academic_years where school_id = target and starts_on <= as_of and ends_on > as_of order by starts_on desc limit 1;
  if yr.id is not null then
    for pid in select distinct e.person_id from public.enrollments_school e where e.school_id = target and daterange(e.starts_on, e.ends_on, '[)') @> as_of loop
      s := app.attendance_summary(target, pid, yr.starts_on, as_of + 1);
      enrolled_days := enrolled_days + coalesce((s ->> 'enrolled_days')::numeric, 0);
      absent_days := absent_days + coalesce((s ->> 'absent_days')::numeric, 0);
      if coalesce((s ->> 'chronic_absence')::boolean, false) then chronic := chronic + 1; end if;
    end loop;
  end if;
  select jsonb_build_object(
    'as_of', as_of,
    'year', case when yr.id is null then null else jsonb_build_object('label', yr.label, 'starts_on', yr.starts_on, 'ends_on', yr.ends_on) end,
    'enrollment', jsonb_build_object(
      'total', (select count(distinct e.person_id) from public.enrollments_school e where e.school_id = target and daterange(e.starts_on, e.ends_on, '[)') @> as_of),
      'by_level', (select coalesce(jsonb_object_agg(l.name, n), '{}') from (
                     select e.school_level_id, count(distinct e.person_id) as n from public.enrollments_school e
                      where e.school_id = target and daterange(e.starts_on, e.ends_on, '[)') @> as_of group by e.school_level_id) q
                   join public.school_levels l on l.id = q.school_level_id)),
    'attendance_ytd', jsonb_build_object('enrolled_days', enrolled_days, 'absent_days', absent_days,
                                         'rate', case when enrolled_days > 0 then round(1 - absent_days / enrolled_days, 4) end, 'chronic_absent_students', chronic),
    'closures', jsonb_build_object(
      'offerings_closed', (select count(distinct x.offering_id) from public.offering_closures x where x.school_id = target and x.closed_at::date <= as_of),
      'record_years_closed', (select count(distinct (x.person_id, x.academic_year_id)) from public.record_closures x where x.school_id = target and x.closed_at::date <= as_of)),
    'qualifications_awarded', (select count(*) from public.qualifications q where q.school_id = target and q.awarded_on <= as_of and q.corrects_id is null))
  into res;
  return res;
end $$;

create or replace function app.close_count_report(target uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare rk text := p ->> 'request_key'; cur record; v integer; nid uuid; d date;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 지정일 보고를 마감합니다.' using errcode = '42501'; end if;
  if coalesce(rk, '') !~ '^[A-Za-z0-9_.:-]{8,80}$' then raise exception '요청 키(request_key)가 필요합니다.' using errcode = '22023'; end if;
  if coalesce(p ->> 'code', '') !~ '^[a-z][a-z0-9_]{1,40}$' then raise exception '보고 코드가 올바르지 않습니다.' using errcode = '22023'; end if;
  begin d := (p ->> 'as_of')::date; exception when others then raise exception '기준일이 올바르지 않습니다.' using errcode = '22023'; end;
  if d is null or d > current_date then raise exception '기준일은 오늘이거나 지난날이어야 합니다.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('school-platform:count_reports'), hashtext(target::text || (p ->> 'code')));
  select id, code, version into cur from public.count_reports where school_id = target and request_key = rk;
  if cur.id is not null then
    if cur.code <> p ->> 'code' then raise exception '같은 요청 키를 다른 보고에 썼습니다.' using errcode = 'P0409'; end if;
    return jsonb_build_object('id', cur.id, 'version', cur.version, 'repeated', true);
  end if;
  select id, version, as_of into cur from public.count_reports where school_id = target and code = p ->> 'code' order by version desc limit 1;
  v := coalesce(cur.version, 0);
  if (p ->> 'base_version') is null or (p ->> 'base_version')::int <> v then raise exception '그 사이 새 보고 판이 생겼습니다. 최신 판을 다시 읽어 주세요.' using errcode = 'P0409'; end if;
  if v > 0 and length(trim(coalesce(p ->> 'reason', ''))) = 0 then raise exception '정정 보고에는 사유가 필요합니다.' using errcode = '22023'; end if;
  if v > 0 and (select as_of from public.count_reports where id = cur.id) <> d then raise exception '정정 보고의 기준일은 처음 판과 같아야 합니다.' using errcode = '22023'; end if;
  insert into public.count_reports(school_id, code, as_of, version, previous_id, reason, request_key, snapshot)
  values (target, p ->> 'code', d, v + 1, cur.id, nullif(trim(p ->> 'reason'), ''), rk, private.count_snapshot(target, d))
  returning id into nid;
  return jsonb_build_object('id', nid, 'version', v + 1, 'repeated', false);
end $$;

-- 학년도 기록 마감 판 스냅샷에 외부 결과·자격을 더한다(더하기만, 기존 키는 그대로)
create or replace function private.record_snapshot(target uuid, person uuid, year_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare y record; snap jsonb;
begin
  select id, label, starts_on, ends_on into y from public.academic_years where id = year_id and school_id = target;
  if y.id is null then raise exception '학년도를 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  select jsonb_build_object(
    'student', (select jsonb_build_object('person_id', n.person_id, 'name', n.name, 'name_latin', n.name_latin, 'name_version', n.version)
                  from public.person_names n where n.person_id = person order by n.version desc limit 1),
    'school', (select jsonb_build_object('name', s.name, 'slug', s.slug,
                 'profile', (select jsonb_build_object('country', p.country, 'sector', p.sector, 'accreditation', p.accreditation, 'external_codes', p.external_codes)
                              from public.school_profiles p where p.school_id = s.id order by p.version desc limit 1),
                 'codes', (select coalesce(jsonb_object_agg(x.system, x.value), '{}') from public.external_identifiers x
                            where x.school_id = s.id and x.target_kind = 'school' and x.status <> 'superseded'))
               from public.schools s where s.id = target),
    'year', jsonb_build_object('id', y.id, 'label', y.label, 'starts_on', y.starts_on, 'ends_on', y.ends_on),
    'enrollments', (select coalesce(jsonb_agg(jsonb_build_object('level', l.code, 'level_name', l.name, 'status', e.status, 'starts_on', e.starts_on, 'ends_on', e.ends_on) order by e.starts_on), '[]')
                      from public.enrollments_school e join public.school_levels l on l.id = e.school_level_id
                     where e.school_id = target and e.person_id = person and daterange(e.starts_on, e.ends_on, '[)') && daterange(y.starts_on, y.ends_on, '[)')),
    'courses', (select coalesce(jsonb_agg(c order by c ->> 'term_sequence', c ->> 'subject_code'), '[]') from (
        select jsonb_build_object(
          'offering_id', o.id, 'subject_id', sj.id, 'subject_code', sj.code, 'subject_name', sj.name,
          'term', t.label, 'term_sequence', lpad(t.sequence::text, 3, '0'), 'credits', cl.credits, 'pass_fail', cl.pass_fail,
          'labels', (select coalesce(jsonb_object_agg(sl.purpose, sl.label), '{}') from (
                      select distinct on (purpose) purpose, label from public.subject_labels where subject_id = sj.id order by purpose, version desc) sl),
          'closure', jsonb_build_object('id', cl.id, 'version', cl.version, 'scale_version', cl.scale_version),
          'result', jsonb_build_object('raw_score', cr.raw_score, 'final_score', cr.final_score, 'level_code', cr.level_code, 'attempt_status', cr.attempt_status,
                                       'credits_attempted', cr.credits_attempted, 'credits_earned', cr.credits_earned,
                                       'points', (select (b ->> 'points')::numeric from jsonb_array_elements(coalesce(cl.bands, '[]')) b where b ->> 'code' = cr.level_code limit 1)),
          'stats', (select jsonb_build_object('n', st.n, 'mean', st.mean, 'sd', st.sd) from public.closure_stats st where st.closure_id = cl.id)) as c
        from public.course_offerings o
        join public.terms t on t.id = o.term_id
        join public.subjects sj on sj.id = o.subject_id
        join lateral (select * from public.offering_closures x where x.offering_id = o.id order by x.version desc limit 1) cl on true
        join public.closure_results cr on cr.closure_id = cl.id and cr.person_id = person
       where o.school_id = target and t.academic_year_id = year_id) q),
    'narratives', (select coalesce(jsonb_agg(jsonb_build_object('kind', n.kind, 'author_role', n.author_role, 'offering_id', n.offering_id, 'body', n.body, 'recorded_at', n.recorded_at)
                                             order by n.kind, n.offering_id nulls first), '[]')
                     from (select distinct on (kind, coalesce(offering_id, '00000000-0000-0000-0000-000000000000'::uuid)) * from public.narratives
                            where school_id = target and person_id = person and academic_year_id = year_id
                            order by kind, coalesce(offering_id, '00000000-0000-0000-0000-000000000000'::uuid), recorded_at desc, id) n),
    'attendance', app.attendance_summary(target, person, y.starts_on, y.ends_on),
    'evidence', (select coalesce(jsonb_agg(jsonb_build_object('title', e.title, 'link', e.link, 'offering_id', e.offering_id) order by e.recorded_at), '[]')
                   from public.evidence_items e where e.school_id = target and e.person_id = person
                    and e.recorded_at >= y.starts_on and e.recorded_at < y.ends_on
                    and not exists (select 1 from public.evidence_items z where z.supersedes_id = e.id)),
    -- 64차: 학교 밖 기관이 낸 결과(학교가 고치지 않음)와 수여한 자격
    'external_results', (select coalesce(jsonb_agg(jsonb_build_object('issuer', x.issuer_code, 'exam', x.exam_code, 'title', x.title, 'sat_on', x.sat_on, 'result', x.result) order by x.sat_on, x.exam_code), '[]')
                           from public.external_results x where x.school_id = target and x.person_id = person
                            and x.sat_on >= y.starts_on and x.sat_on < y.ends_on and not exists (select 1 from public.external_results z where z.corrects_id = x.id)),
    'qualifications', (select coalesce(jsonb_agg(jsonb_build_object('kind', q.kind_code, 'title', q.title, 'awarded_on', q.awarded_on, 'issuer', q.issuer_code) order by q.awarded_on), '[]')
                         from public.qualifications q where q.school_id = target and q.person_id = person
                          and q.awarded_on >= y.starts_on and q.awarded_on < y.ends_on and not exists (select 1 from public.qualifications z where z.corrects_id = q.id)),
    'closed_on', current_date)
  into snap;
  return snap;
end $$;
revoke all on function private.count_snapshot(uuid, date) from public;
grant execute on function private.count_snapshot(uuid, date) to app_writer;
grant create on schema app to app_writer;
do $$
declare f text;
begin
  foreach f in array array['app.add_external_result(uuid, jsonb)', 'app.award_qualification(uuid, jsonb)', 'app.close_count_report(uuid, jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
    execute format('alter function %s owner to app_writer', f);
  end loop;
end $$;
revoke create on schema app from app_writer;
