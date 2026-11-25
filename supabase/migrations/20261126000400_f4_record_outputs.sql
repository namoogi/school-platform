-- 60차: ADR 0025 학사 토대 F4 — 학년도 기록 마감 판 · 출력 프로필 판 · 기록 발행본 · 공개 기록
-- 학년도 기록 마감 판은 DB가 원장(학적·수업 마감 판·과목 표기 판·서술·출결 요약·증거물·확인)에서 스냅샷을 조립해 얼린다.
-- 발행본은 마감 판에서 만든 서식별 결과(내용)와 출처 판 연결을 함께 남기고, 고치지 않는다(정정은 새 마감 판 → 새 발행본).
select set_config('request.jwt.claims', '{}', true);

-- ── 학년도 기록 마감 판 (학생 × 학년도) ───────────────────
create table public.record_closures (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  person_id uuid not null,
  academic_year_id uuid not null,
  version integer not null check (version >= 1),
  previous_id uuid,
  reason text check (reason is null or length(reason) <= 1000),
  request_key text not null check (request_key ~ '^[A-Za-z0-9_.:-]{8,80}$'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  closed_by uuid not null default app.uid(),
  closed_at timestamptz not null default now(),
  check ((version = 1) = (previous_id is null)),
  check (version = 1 or reason is not null),
  unique (person_id, academic_year_id, version),
  unique (school_id, request_key),
  unique (id, school_id),
  foreign key (person_id, school_id) references public.people(id, school_id),
  foreign key (academic_year_id, school_id) references public.academic_years(id, school_id),
  foreign key (previous_id, school_id) references public.record_closures(id, school_id)
);
create unique index record_closures_no_fork on public.record_closures (previous_id) where previous_id is not null;

-- ── 출력 프로필 판 (서식별 학교 설정: 포함 항목·가림·글자 수·설명표 문구) ──
create table public.output_profiles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  format text not null check (format in ('kr_alt_record', 'us_transcript', 'us_school_profile', 'kr_record', 'clr')),
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  unique (school_id, code),
  unique (id, school_id)
);
create table public.output_profile_versions (
  school_id uuid not null,
  profile_id uuid not null,
  version integer not null check (version >= 1),
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  why text check (why is null or length(why) <= 500),
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  primary key (profile_id, version),
  foreign key (profile_id, school_id) references public.output_profiles(id, school_id)
);

-- ── 기록 발행본 (서식별 결과 + 누락·변환 질문 목록) ─────────
create table public.record_documents (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  format text not null check (format in ('kr_alt_record', 'us_transcript', 'us_school_profile', 'kr_record', 'clr')),
  person_id uuid,
  profile_id uuid,
  profile_version integer,
  lang text not null default 'ko' check (lang ~ '^[a-z]{2}$'),
  blind boolean not null default false,
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  issues jsonb not null default '[]' check (jsonb_typeof(issues) = 'array'),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  published_by uuid not null default app.uid(),
  published_at timestamptz not null default now(),
  unique (id, school_id),
  foreign key (person_id, school_id) references public.people(id, school_id),
  foreign key (profile_id, school_id) references public.output_profiles(id, school_id)
);
create table public.record_document_sources (
  school_id uuid not null,
  document_id uuid not null,
  closure_id uuid not null,
  primary key (document_id, closure_id),
  foreign key (document_id, school_id) references public.record_documents(id, school_id),
  foreign key (closure_id, school_id) references public.record_closures(id, school_id)
);

-- ── 공개 기록 (발급·전학 이관·외부 제출 — 받는 곳·근거·범위·날짜) ──
create table public.disclosures (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  document_id uuid not null,
  recipient text not null check (length(trim(recipient)) between 1 and 200),
  purpose text not null check (purpose ~ '^[a-z0-9][a-z0-9_.-]{0,40}$'),
  basis text check (basis is null or length(basis) <= 300),
  disclosed_by uuid not null default app.uid(),
  disclosed_at timestamptz not null default now(),
  foreign key (document_id, school_id) references public.record_documents(id, school_id)
);

create trigger record_closures_guard before update or delete on public.record_closures for each row execute function private.guard_columns();
create trigger output_profiles_guard before update or delete on public.output_profiles for each row execute function private.guard_columns();
create trigger output_profile_versions_guard before update or delete on public.output_profile_versions for each row execute function private.guard_columns();
create trigger record_documents_guard before update or delete on public.record_documents for each row execute function private.guard_columns();
create trigger record_document_sources_guard before update or delete on public.record_document_sources for each row execute function private.guard_columns();
create trigger disclosures_guard before update or delete on public.disclosures for each row execute function private.guard_columns();
-- 발행본의 출처 연결은 발행과 같은 트랜잭션에서만
create or replace function private.doc_source_same_tx() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.record_documents d where d.id = new.document_id and d.published_at = now()) then
    raise exception 'record_document_sources: 발행한 문서에는 출처를 더하지 않습니다.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger record_document_sources_same_tx before insert on public.record_document_sources for each row execute function private.doc_source_same_tx();

do $$
declare t text;
begin
  foreach t in array array['record_closures', 'output_profiles', 'output_profile_versions', 'record_documents', 'record_document_sources', 'disclosures'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated, app_writer', t);
    execute format('grant insert on public.%I to app_writer', t);
    execute format('create policy %I on public.%I for select to authenticated, app_writer using (app.is_member(school_id))', t || '_read', t);
    execute format('create policy %I on public.%I for insert to app_writer with check (app.is_school_admin(school_id))', t || '_insert', t);
  end loop;
end $$;

-- ── 스냅샷 조립 (원장 → 그때 값) ──────────────────────────
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
    'closed_on', current_date)
  into snap;
  return snap;
end $$;

create or replace function app.close_record_year(target uuid, person uuid, year_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare rk text := p ->> 'request_key'; cur record; v integer; nid uuid;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 마감합니다.' using errcode = '42501'; end if;
  if coalesce(rk, '') !~ '^[A-Za-z0-9_.:-]{8,80}$' then raise exception '요청 키(request_key)가 필요합니다.' using errcode = '22023'; end if;
  if not exists (select 1 from public.people where id = person and school_id = target) then raise exception '학생을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtext('school-platform:record_closures'), hashtext(person::text || year_id::text));
  select id, person_id, academic_year_id, version into cur from public.record_closures where school_id = target and request_key = rk;
  if cur.id is not null then
    if cur.person_id <> person or cur.academic_year_id <> year_id then raise exception '같은 요청 키를 다른 기록에 썼습니다.' using errcode = 'P0409'; end if;
    return jsonb_build_object('id', cur.id, 'version', cur.version, 'repeated', true);
  end if;
  select id, version into cur from public.record_closures where person_id = person and academic_year_id = year_id order by version desc limit 1;
  v := coalesce(cur.version, 0);
  if (p ->> 'base_version') is null or (p ->> 'base_version')::int <> v then
    raise exception '그 사이 새 마감 판이 생겼습니다. 최신 판을 다시 읽어 주세요.' using errcode = 'P0409';
  end if;
  if v > 0 and length(trim(coalesce(p ->> 'reason', ''))) = 0 then raise exception '정정 마감에는 사유가 필요합니다.' using errcode = '22023'; end if;
  insert into public.record_closures(school_id, person_id, academic_year_id, version, previous_id, reason, request_key, snapshot)
  values (target, person, year_id, v + 1, cur.id, nullif(trim(p ->> 'reason'), ''), rk, private.record_snapshot(target, person, year_id))
  returning id into nid;
  return jsonb_build_object('id', nid, 'version', v + 1, 'repeated', false);
end $$;

create or replace function app.save_output_profile(target uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare pid uuid; v integer;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('school-platform:output_profiles'), hashtext(target::text || coalesce(p ->> 'code', '')));
  select id into pid from public.output_profiles where school_id = target and code = p ->> 'code';
  if pid is null then
    if coalesce((p ->> 'base_version')::int, 0) <> 0 then raise exception '그 사이 새 판이 생겼습니다.' using errcode = 'P0409'; end if;
    begin
      insert into public.output_profiles(school_id, format, code) values (target, p ->> 'format', p ->> 'code') returning id into pid;
    exception when check_violation or not_null_violation then raise exception '출력 프로필 형식·코드가 올바르지 않습니다.' using errcode = '22023';
    end;
    v := 0;
  else
    select coalesce(max(version), 0) into v from public.output_profile_versions where profile_id = pid;
    if (p ->> 'base_version') is null or (p ->> 'base_version')::int <> v then raise exception '그 사이 새 판이 생겼습니다.' using errcode = 'P0409'; end if;
  end if;
  insert into public.output_profile_versions(school_id, profile_id, version, settings, why)
  values (target, pid, v + 1, coalesce(p -> 'settings', '{}'), nullif(trim(p ->> 'why'), ''));
  return jsonb_build_object('id', pid, 'version', v + 1);
end $$;

-- 발행: 서버가 마감 판에서 만든 내용을 받아 저장. 출처 판은 이 학교의 마감 판이어야 하고, 내용 해시를 남긴다
create or replace function app.publish_record_document(target uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare nid uuid; c uuid; content jsonb := p -> 'content';
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 발행합니다.' using errcode = '42501'; end if;
  if jsonb_typeof(p -> 'closure_ids') <> 'array' or (p ->> 'format') <> 'us_school_profile' and jsonb_array_length(p -> 'closure_ids') = 0 then
    raise exception '출처 마감 판이 필요합니다.' using errcode = '22023';
  end if;
  for c in select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(p -> 'closure_ids', '[]')) x loop
    if not exists (select 1 from public.record_closures r where r.id = c and r.school_id = target
                   and (nullif(p ->> 'person_id', '') is null or r.person_id = (p ->> 'person_id')::uuid)) then
      raise exception '출처 마감 판을 찾을 수 없습니다.' using errcode = 'P0002';
    end if;
  end loop;
  begin
    insert into public.record_documents(school_id, format, person_id, profile_id, profile_version, lang, blind, content, issues, content_sha256)
    values (target, p ->> 'format', nullif(p ->> 'person_id', '')::uuid, nullif(p ->> 'profile_id', '')::uuid, nullif(p ->> 'profile_version', '')::int,
            coalesce(nullif(p ->> 'lang', ''), 'ko'), coalesce((p ->> 'blind')::boolean, false), content, coalesce(p -> 'issues', '[]'),
            encode(sha256(convert_to(content::text, 'UTF8')), 'hex'))
    returning id into nid;
  exception when check_violation or not_null_violation then raise exception '발행본 형식이 올바르지 않습니다.' using errcode = '22023';
  end;
  insert into public.record_document_sources(school_id, document_id, closure_id)
  select target, nid, (x #>> '{}')::uuid from jsonb_array_elements(coalesce(p -> 'closure_ids', '[]')) x;
  return nid;
end $$;

create or replace function app.record_disclosure(target uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare nid uuid;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 기록합니다.' using errcode = '42501'; end if;
  begin
    insert into public.disclosures(school_id, document_id, recipient, purpose, basis)
    values (target, (p ->> 'document_id')::uuid, trim(coalesce(p ->> 'recipient', '')), p ->> 'purpose', nullif(trim(p ->> 'basis'), '')) returning id into nid;
  exception
    when foreign_key_violation then raise exception '발행본을 찾을 수 없습니다.' using errcode = 'P0002';
    when check_violation or not_null_violation then raise exception '공개 기록 형식이 올바르지 않습니다.' using errcode = '22023';
  end;
  return nid;
end $$;

revoke all on function private.record_snapshot(uuid, uuid, uuid) from public;
grant execute on function private.record_snapshot(uuid, uuid, uuid) to app_writer;
grant execute on function app.attendance_summary(uuid, uuid, date, date) to app_writer;
grant create on schema app to app_writer;
do $$
declare f text;
begin
  foreach f in array array['app.close_record_year(uuid, uuid, uuid, jsonb)', 'app.save_output_profile(uuid, jsonb)',
                           'app.publish_record_document(uuid, jsonb)', 'app.record_disclosure(uuid, jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
    execute format('alter function %s owner to app_writer', f);
  end loop;
end $$;
revoke create on schema app from app_writer;
