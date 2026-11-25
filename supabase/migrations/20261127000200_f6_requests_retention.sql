-- 63차: ADR 0025 F6-2 · ADR 0030(열람·수정 요청·이의 의견서) · ADR 0028(보존 규칙·파기 사건·가림 판)
-- 요청과 의견서는 원 기록을 바꾸지 않는 사건이다. 요청을 받아들이면 학교가 정정 판(F2·F4)을 만들고 요청이 그 판을 가리킨다.
-- 파기는 행을 지우지 않는다: 파기 사건을 남기고, 같은 트랜잭션에서만 식별·서술 칸을 가림 값으로 덮는다. 법정 영구 항목(이름·학적·학점·최종 성적)은 남긴다.
select set_config('request.jwt.claims', '{}', true);

-- ── 열람·수정 요청 ──────────────────────────────────────
create table public.record_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  person_id uuid not null,
  kind text not null check (kind in ('inspect', 'amend')),
  target_kind text not null check (target_kind in ('record_year', 'document', 'school_record', 'attendance', 'other')),
  target_id uuid,
  body text not null check (length(trim(body)) between 1 and 2000),
  requester_relation text not null check (requester_relation in ('self', 'child')),
  requested_by uuid not null default app.uid(),
  due_on date not null,
  created_at timestamptz not null default now(),
  unique (id, school_id),
  foreign key (person_id, school_id) references public.people(id, school_id)
);
create table public.record_request_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  request_id uuid not null,
  status text not null check (status in ('received', 'in_review', 'granted', 'amended', 'denied', 'not_applicable', 'hearing_offered', 'closed')),
  note text check (note is null or length(note) <= 2000),
  correction_ref uuid,
  decided_by uuid not null default app.uid(),
  decided_at timestamptz not null default now(),
  foreign key (request_id, school_id) references public.record_requests(id, school_id)
);
create index record_request_events_req on public.record_request_events (request_id, decided_at desc, id);
-- 이의 의견서: 거부된 수정 요청에 학생·보호자가 붙이는 진술. 원 기록을 바꾸지 않고, 그 뒤 발행본에 함께 실린다
create table public.record_annotations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  person_id uuid not null,
  request_id uuid not null,
  body text not null check (length(trim(body)) between 1 and 2000),
  written_by uuid not null default app.uid(),
  written_at timestamptz not null default now(),
  unique (request_id),
  foreign key (person_id, school_id) references public.people(id, school_id),
  foreign key (request_id, school_id) references public.record_requests(id, school_id)
);

-- ── 보존 규칙 판 · 파기 사건 ────────────────────────────
create table public.retention_rules (
  school_id uuid not null references public.schools(id),
  version integer not null check (version >= 1),
  years_after_exit integer check (years_after_exit is null or years_after_exit between 0 and 100),
  why text check (why is null or length(why) <= 500),
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  primary key (school_id, version)
);
create table public.destruction_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  person_id uuid not null,
  rule_version integer not null,
  exit_on date not null,
  counts jsonb not null check (jsonb_typeof(counts) = 'object'),
  reason text not null check (length(trim(reason)) between 1 and 500),
  decided_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  foreign key (person_id, school_id) references public.people(id, school_id),
  foreign key (school_id, rule_version) references public.retention_rules(school_id, version)
);

do $$
declare t text;
begin
  foreach t in array array['record_requests', 'record_request_events', 'record_annotations', 'retention_rules', 'destruction_events'] loop
    execute format('create trigger %I before update or delete on public.%I for each row execute function private.guard_columns()', t || '_guard', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated, app_writer', t);
    execute format('create policy %I on public.%I for select to authenticated, app_writer using (app.is_member(school_id))', t || '_read', t);
  end loop;
end $$;
grant insert on public.record_request_events, public.retention_rules to app_writer;
create policy record_request_events_insert on public.record_request_events for insert to app_writer with check (app.is_school_admin(school_id));
create policy retention_rules_insert on public.retention_rules for insert to app_writer with check (app.is_school_admin(school_id));

-- ── 가드: 파기 사건과 같은 트랜잭션에서만 가림 값으로 덮기를 허락한다 ──
-- app.redaction 설정에 이 트랜잭션에서 만든 파기 사건 id가 있고, 그 사건의 학교·학생 행일 때만. 삭제는 여전히 막는다
create or replace function private.redaction_allows(school uuid, person uuid) returns boolean
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare ev text := current_setting('app.redaction', true);
begin
  if ev is null or ev !~ '^[0-9a-f-]{36}$' then return false; end if;
  return exists (select 1 from public.destruction_events d where d.id = ev::uuid and d.created_at = now()
                  and d.school_id = school and (person is null or d.person_id = person));
end $$;
create or replace function private.guard_columns()
 returns trigger language plpgsql as $$
declare
  allowed text[] := coalesce(tg_argv::text[], '{}');
begin
  if tg_op = 'DELETE' then
    raise exception '%: 기록은 삭제하지 않습니다.', tg_table_name using errcode = 'P0001';
  end if;
  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    -- ADR 0028: 파기 사건과 같은 트랜잭션의 가림만 허락(식별 칸 school_id·person_id·id 는 그대로여야 한다)
    if private.redaction_allows((to_jsonb(old) ->> 'school_id')::uuid, nullif(to_jsonb(old) ->> 'person_id', '')::uuid)
       and (to_jsonb(new) -> 'id') is not distinct from (to_jsonb(old) -> 'id')
       and (to_jsonb(new) -> 'school_id') is not distinct from (to_jsonb(old) -> 'school_id')
       and (to_jsonb(new) -> 'person_id') is not distinct from (to_jsonb(old) -> 'person_id') then
      return new;
    end if;
    raise exception '%: 바꿀 수 없는 값입니다. 새 기록을 추가하세요.', tg_table_name using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ── 학생·보호자: 요청 내기, 의견서 붙이기, 내 요청 보기 ──
create or replace function app.portal_request(p jsonb) returns uuid
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v record; nid uuid; days integer;
begin
  select * into v from private.portal_people(app.uid()) pp where pp.person_id = nullif(p ->> 'person_id', '')::uuid limit 1;
  if v.person_id is null then raise exception '볼 수 있는 기록이 아닙니다.' using errcode = '42501'; end if;
  select coalesce((policy -> 'requests' ->> 'due_days')::int, 45) into days from public.grading_policies where school_id = v.school_id order by version desc limit 1;
  begin
    insert into public.record_requests(school_id, person_id, kind, target_kind, target_id, body, requester_relation, due_on)
    values (v.school_id, v.person_id, p ->> 'kind', coalesce(nullif(p ->> 'target_kind', ''), 'other'), nullif(p ->> 'target_id', '')::uuid,
            trim(coalesce(p ->> 'body', '')), v.relation, current_date + coalesce(days, 45))
    returning id into nid;
  exception when check_violation or not_null_violation then raise exception '요청 형식이 올바르지 않습니다(종류·내용).' using errcode = '22023';
  end;
  insert into public.record_request_events(school_id, request_id, status, decided_by) values (v.school_id, nid, 'received', app.uid());
  return nid;
end $$;

create or replace function private.request_status(req uuid) returns text
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select e.status from public.record_request_events e where e.request_id = req order by e.decided_at desc, e.id desc limit 1
$$;

create or replace function app.portal_annotate(p jsonb) returns uuid
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare r record; nid uuid;
begin
  select q.id, q.school_id, q.person_id, q.kind into r from public.record_requests q where q.id = nullif(p ->> 'request_id', '')::uuid;
  if r.id is null or not exists (select 1 from private.portal_people(app.uid()) pp where pp.school_id = r.school_id and pp.person_id = r.person_id) then
    raise exception '볼 수 있는 요청이 아닙니다.' using errcode = '42501';
  end if;
  if r.kind <> 'amend' or not exists (select 1 from public.record_request_events e where e.request_id = r.id and e.status = 'denied') then
    raise exception '의견서는 거부된 수정 요청에만 붙입니다.' using errcode = '22023';
  end if;
  begin
    insert into public.record_annotations(school_id, person_id, request_id, body) values (r.school_id, r.person_id, r.id, trim(coalesce(p ->> 'body', '')))
    returning id into nid;
  exception
    when unique_violation then raise exception '이 요청에는 이미 의견서가 있습니다.' using errcode = '23505';
    when check_violation then raise exception '의견서 내용이 비었거나 너무 깁니다.' using errcode = '22023';
  end;
  return nid;
end $$;

create or replace function app.portal_requests_v1(target_person uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare v record;
begin
  select * into v from private.portal_people(app.uid()) pp where pp.person_id = target_person limit 1;
  if v.person_id is null then raise exception '볼 수 있는 기록이 아닙니다.' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'id', q.id, 'kind', q.kind, 'target_kind', q.target_kind, 'body', q.body, 'due_on', q.due_on, 'created_at', q.created_at,
            'status', private.request_status(q.id),
            'events', (select jsonb_agg(jsonb_build_object('status', e.status, 'note', e.note, 'at', e.decided_at) order by e.decided_at, e.id) from public.record_request_events e where e.request_id = q.id),
            'annotation', (select jsonb_build_object('body', a.body, 'at', a.written_at) from public.record_annotations a where a.request_id = q.id))
          order by q.created_at desc), '[]')
            from public.record_requests q where q.school_id = v.school_id and q.person_id = target_person);
end $$;

-- ── 학교: 요청 결정 ──────────────────────────────────────
-- 끝난 상태(granted·amended·not_applicable·closed)에서는 더 바꾸지 않는다. 거부(denied) 뒤에는 청문 제안·끝냄만
create or replace function app.decide_record_request(target uuid, p jsonb) returns text
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare cur text; nxt text := p ->> 'status'; req uuid := nullif(p ->> 'request_id', '')::uuid;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 요청을 결정합니다.' using errcode = '42501'; end if;
  if not exists (select 1 from public.record_requests where id = req and school_id = target) then raise exception '요청을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtext('school-platform:record_requests'), hashtext(req::text));
  cur := private.request_status(req);
  if coalesce(p ->> 'from_status', cur) <> cur then raise exception '그 사이 요청 상태가 바뀌었습니다.' using errcode = 'P0409'; end if;
  if cur in ('granted', 'amended', 'not_applicable', 'closed') then raise exception '끝난 요청입니다.' using errcode = '22023'; end if;
  if nxt is null or nxt not in ('in_review', 'granted', 'amended', 'denied', 'not_applicable', 'hearing_offered', 'closed') then
    raise exception '요청 상태가 올바르지 않습니다.' using errcode = '22023';
  end if;
  if cur in ('denied', 'hearing_offered') and nxt not in ('hearing_offered', 'amended', 'closed') then
    raise exception '거부한 요청은 청문 제안·수정·끝냄만 할 수 있습니다.' using errcode = '22023';
  end if;
  if nxt in ('denied', 'not_applicable') and length(trim(coalesce(p ->> 'note', ''))) = 0 then
    raise exception '거부·대상 아님은 이유를 적습니다.' using errcode = '22023';
  end if;
  if nxt = 'amended' and nullif(p ->> 'correction_ref', '') is null then
    raise exception '수정했으면 정정 판(새 마감 판·새 기록)을 가리킵니다.' using errcode = '22023';
  end if;
  insert into public.record_request_events(school_id, request_id, status, note, correction_ref)
  values (target, req, nxt, nullif(trim(p ->> 'note'), ''), nullif(p ->> 'correction_ref', '')::uuid);
  return nxt;
end $$;

-- ── 학교: 보존 규칙 판 · 파기 미리보기 · 파기 ─────────────
create or replace function app.save_retention_rule(target uuid, p jsonb) returns integer
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v integer;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 보존 규칙을 정합니다.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('school-platform:retention_rules'), hashtext(target::text));
  select coalesce(max(version), 0) into v from public.retention_rules where school_id = target;
  if (p ->> 'base_version') is null or (p ->> 'base_version')::int <> v then raise exception '그 사이 새 판이 생겼습니다.' using errcode = 'P0409'; end if;
  begin
    insert into public.retention_rules(school_id, version, years_after_exit, why) values (target, v + 1, nullif(p ->> 'years_after_exit', '')::int, nullif(trim(p ->> 'why'), ''));
  exception when check_violation then raise exception '보존 기간은 0~100년이거나 영구(비움)입니다.' using errcode = '22023';
  end;
  return v + 1;
end $$;

-- 파기 판단: 재적이 모두 끝났고, 규칙 판의 기간이 지났고, 끝나지 않은 열람·수정 요청이 없어야 한다(34 CFR 99.10)
create or replace function private.redaction_check(target uuid, person uuid,
  out ok boolean, out why text, out rule_version integer, out exit_on date, out counts jsonb)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare years integer;
begin
  ok := false;
  select version, years_after_exit into rule_version, years from public.retention_rules where school_id = target order by version desc limit 1;
  counts := jsonb_build_object(
    'narratives', (select count(*) from public.narratives where school_id = target and person_id = person),
    'evidence_items', (select count(*) from public.evidence_items where school_id = target and person_id = person),
    'attendance_notes', (select count(*) from public.attendance_events where school_id = target and person_id = person and (note is not null or reason is not null)),
    'assessment_comments', (select count(*) from public.assessment_results where school_id = target and person_id = person and (comment is not null or reason is not null)),
    'custom_records', (select count(*) from public.custom_records where school_id = target and person_id = person),
    'record_closures', (select count(*) from public.record_closures where school_id = target and person_id = person),
    'record_documents', (select count(*) from public.record_documents where school_id = target and person_id = person),
    'requests', (select count(*) from public.record_requests where school_id = target and person_id = person));
  if rule_version is null then why := '보존 규칙 판이 없습니다.'; return; end if;
  if years is null then why := '보존 규칙이 영구 보존입니다.'; return; end if;
  if exists (select 1 from public.enrollments_school e where e.school_id = target and e.person_id = person and (e.ends_on is null or e.ends_on > current_date)) then
    why := '재적이 끝나지 않았습니다.'; return;
  end if;
  select max(e.ends_on) into exit_on from public.enrollments_school e where e.school_id = target and e.person_id = person;
  if exit_on is null then why := '재적 기록이 없습니다.'; return; end if;
  if current_date < (exit_on + make_interval(years => years))::date then
    why := format('보존 기간(%s년)이 아직 지나지 않았습니다(%s부터 파기 가능).', years, (exit_on + make_interval(years => years))::date); return;
  end if;
  if exists (select 1 from public.record_requests q where q.school_id = target and q.person_id = person
              and private.request_status(q.id) not in ('granted', 'amended', 'not_applicable', 'closed')) then
    why := '끝나지 않은 열람·수정 요청이 있어 파기할 수 없습니다.'; return;
  end if;
  ok := true; why := null;
end $$;

create or replace function app.redaction_preview(target uuid, person uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare c record;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 볼 수 있습니다.' using errcode = '42501'; end if;
  if not exists (select 1 from public.people where id = person and school_id = target) then raise exception '사람을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  select * into c from private.redaction_check(target, person);
  return jsonb_build_object('ok', c.ok, 'why', c.why, 'rule_version', c.rule_version, 'exit_on', c.exit_on, 'counts', c.counts,
    'kept', jsonb_build_array('이름', '학적(입·퇴학)', '수업 마감 판의 학점·최종 성적', '학년도 기록의 과목·출결 수치'));
end $$;

-- JSON 안의 서술 칸을 가림 값으로(발행본 내용용)
create or replace function private.redact_json(j jsonb) returns jsonb
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case jsonb_typeof(j)
    when 'object' then (select coalesce(jsonb_object_agg(k, case when k in ('detail', 'behavior', 'body', 'evidence', 'narratives', 'description', 'link', 'statement', 'about') and v <> 'null'::jsonb
                                                              then to_jsonb('[파기됨]'::text) else private.redact_json(v) end), '{}'::jsonb)
                        from jsonb_each(j) as e(k, v))
    when 'array' then (select coalesce(jsonb_agg(private.redact_json(x) order by i), '[]'::jsonb) from jsonb_array_elements(j) with ordinality as a(x, i))
    else j end
$$;

create or replace function app.redact_person(target uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare person uuid := nullif(p ->> 'person_id', '')::uuid; c record; ev uuid; mark constant text := '[파기됨]';
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 파기합니다.' using errcode = '42501'; end if;
  if not exists (select 1 from public.people where id = person and school_id = target) then raise exception '사람을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if length(trim(coalesce(p ->> 'reason', ''))) = 0 then raise exception '파기 사유가 필요합니다.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('school-platform:redaction'), hashtext(person::text));
  select * into c from private.redaction_check(target, person);
  if not c.ok then raise exception '파기할 수 없습니다: %', c.why using errcode = '22023'; end if;
  -- 미리보기에서 본 건수와 지금 건수가 다르면 다시 보게 한다(그 사이 기록이 늘었으면)
  if p ? 'expected_counts' and (p -> 'expected_counts') is distinct from c.counts then
    raise exception '미리보기 뒤에 기록이 바뀌었습니다. 다시 미리보세요.' using errcode = 'P0409';
  end if;
  insert into public.destruction_events(school_id, person_id, rule_version, exit_on, counts, reason)
  values (target, person, c.rule_version, c.exit_on, c.counts, trim(p ->> 'reason')) returning id into ev;
  perform set_config('app.redaction', ev::text, true);
  update public.narratives set body = mark, reason = case when reason is null then null else mark end where school_id = target and person_id = person;
  update public.evidence_items set title = mark, body = mark, link = null where school_id = target and person_id = person;
  update public.attendance_events set note = null, reason = case when reason is null then null else mark end where school_id = target and person_id = person and (note is not null or reason is not null);
  update public.assessment_results set comment = null, reason = case when reason is null then null else mark end where school_id = target and person_id = person and (comment is not null or reason is not null);
  update public.custom_records set data = '{}', reason = case when reason is null then null else mark end where school_id = target and person_id = person;
  update public.record_annotations set body = mark where school_id = target and person_id = person;
  update public.record_requests set body = mark where school_id = target and person_id = person;
  update public.record_request_events e set note = case when e.note is null then null else mark end
    from public.record_requests q where q.id = e.request_id and q.school_id = target and q.person_id = person and e.note is not null;
  update public.record_closures set snapshot = snapshot || jsonb_build_object('narratives', '[]'::jsonb, 'evidence', '[]'::jsonb, 'redacted', jsonb_build_object('event', ev, 'at', now()))
   where school_id = target and person_id = person;
  update public.record_documents set content = private.redact_json(content) || jsonb_build_object('redacted', jsonb_build_object('event', ev, 'at', now()))
   where school_id = target and person_id = person;
  perform set_config('app.redaction', '', true);
  perform app.log_access(target, 'record.redact', jsonb_build_object('person', person, 'event', ev, 'counts', c.counts));
  return jsonb_build_object('event', ev, 'counts', c.counts);
end $$;

revoke all on function private.redaction_allows(uuid, uuid), private.request_status(uuid), private.redaction_check(uuid, uuid), private.redact_json(jsonb) from public;
-- 계약·판단 함수는 표 소유자 권한(ADR 0029 열람 계약과 같은 모양). 함수 안에서 사람·역할을 먼저 확인한다
do $$
declare f text;
begin
  foreach f in array array['app.portal_request(jsonb)', 'app.portal_annotate(jsonb)', 'app.portal_requests_v1(uuid)', 'app.decide_record_request(uuid, jsonb)',
                           'app.save_retention_rule(uuid, jsonb)', 'app.redaction_preview(uuid, uuid)', 'app.redact_person(uuid, jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
