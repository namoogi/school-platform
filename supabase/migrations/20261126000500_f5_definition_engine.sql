-- 61차: ADR 0025 학사 토대 F5 — 정의 엔진(E3 기록 유형 · E4 양식·목록·출력 · E5 흐름) + 검사기 + 기능 꾸러미 + 학교 정의 기록 + 에이전트 범위(package)
-- 학교 AI(범위 토큰 'package')나 관리자가 정의 판을 쓰면 DB 검사기가 문제 목록을 남긴다. 꾸러미는 정의 판 묶음이고, 켜는 것은 관리자다.
-- 학교 정의 기록은 일반 표 하나(custom_records)에 쌓는다. 사람·수업은 정해진 열(person_id·offering_id)로만 잇고, 자료 칸에는 참조를 두지 않는다.
-- 학교 정의 기록은 승격(E6) 전까지 학년도 기록 마감 판에 들어가지 않는다(ADR 0025 10절).
select set_config('request.jwt.claims', '{}', true);

-- ── 정의 · 정의 판 ───────────────────────────────────────
create table public.definitions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  kind text not null check (kind in ('record_type', 'form', 'view', 'output', 'flow')),
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  created_at timestamptz not null default now(),
  unique (school_id, kind, code),
  unique (id, school_id)
);
create table public.definition_versions (
  school_id uuid not null,
  definition_id uuid not null,
  version integer not null check (version >= 1),
  spec jsonb not null check (jsonb_typeof(spec) = 'object' and length(spec::text) <= 60000),
  why text check (why is null or length(why) <= 500),
  issues jsonb not null default '[]' check (jsonb_typeof(issues) = 'array'),
  valid boolean not null,
  author_kind text not null check (author_kind in ('human', 'agent')),
  agent_token_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (definition_id, version),
  unique (definition_id, version, school_id),
  check ((author_kind = 'agent') = (agent_token_id is not null)),
  check (author_kind = 'agent' or created_by is not null),
  foreign key (definition_id, school_id) references public.definitions(id, school_id),
  foreign key (agent_token_id, school_id) references public.agent_tokens(id, school_id)
);

-- ── 기능 꾸러미 · 꾸러미 판 · 켜기/끄기 사건 ─────────────
create table public.feature_packages (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  created_at timestamptz not null default now(),
  unique (school_id, code),
  unique (id, school_id)
);
create table public.package_versions (
  school_id uuid not null,
  package_id uuid not null,
  version integer not null check (version >= 1),
  title jsonb not null check (jsonb_typeof(title) = 'object'),
  members jsonb not null check (jsonb_typeof(members) = 'array'),
  why text check (why is null or length(why) <= 500),
  issues jsonb not null default '[]' check (jsonb_typeof(issues) = 'array'),
  valid boolean not null,
  author_kind text not null check (author_kind in ('human', 'agent')),
  agent_token_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (package_id, version),
  unique (package_id, version, school_id),
  check ((author_kind = 'agent') = (agent_token_id is not null)),
  check (author_kind = 'agent' or created_by is not null),
  foreign key (package_id, school_id) references public.feature_packages(id, school_id),
  foreign key (agent_token_id, school_id) references public.agent_tokens(id, school_id)
);
create table public.package_states (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  package_id uuid not null,
  version integer not null,
  state text not null check (state in ('enabled', 'disabled')),
  reason text check (reason is null or length(reason) <= 500),
  decided_by uuid not null default app.uid(),
  decided_at timestamptz not null default now(),
  foreign key (package_id, version, school_id) references public.package_versions(package_id, version, school_id)
);
create index package_states_latest on public.package_states (package_id, decided_at desc, id);

-- ── 학교 정의 기록 (E3) · 흐름 전환 사건 (E5) ─────────────
create table public.custom_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  definition_id uuid not null,
  definition_version integer not null,
  package_id uuid not null,
  person_id uuid,
  offering_id uuid,
  data jsonb not null check (jsonb_typeof(data) = 'object' and length(data::text) <= 60000),
  corrects_id uuid,
  reason text check (reason is null or length(reason) <= 500),
  recorded_by uuid not null default app.uid(),
  recorded_at timestamptz not null default now(),
  unique (id, school_id),
  foreign key (definition_id, definition_version, school_id) references public.definition_versions(definition_id, version, school_id),
  foreign key (package_id, school_id) references public.feature_packages(id, school_id),
  foreign key (person_id, school_id) references public.people(id, school_id),
  foreign key (offering_id, school_id) references public.course_offerings(id, school_id),
  foreign key (corrects_id, school_id) references public.custom_records(id, school_id)
);
create unique index custom_records_one_correction on public.custom_records (corrects_id) where corrects_id is not null;
create index custom_records_def on public.custom_records (school_id, definition_id, recorded_at desc);
create table public.custom_record_transitions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  record_id uuid not null,
  from_state text,
  to_state text not null check (to_state ~ '^[a-z][a-z0-9_]{0,30}$'),
  note text check (note is null or length(note) <= 500),
  moved_by uuid not null default app.uid(),
  moved_at timestamptz not null default now(),
  foreign key (record_id, school_id) references public.custom_records(id, school_id)
);
create index custom_record_transitions_rec on public.custom_record_transitions (record_id, moved_at desc, id);

create trigger definitions_guard before update or delete on public.definitions for each row execute function private.guard_columns();
create trigger definition_versions_guard before update or delete on public.definition_versions for each row execute function private.guard_columns();
create trigger feature_packages_guard before update or delete on public.feature_packages for each row execute function private.guard_columns();
create trigger package_versions_guard before update or delete on public.package_versions for each row execute function private.guard_columns();
create trigger package_states_guard before update or delete on public.package_states for each row execute function private.guard_columns();
create trigger custom_records_guard before update or delete on public.custom_records for each row execute function private.guard_columns();
create trigger custom_record_transitions_guard before update or delete on public.custom_record_transitions for each row execute function private.guard_columns();

do $$
declare t text;
begin
  foreach t in array array['definitions', 'definition_versions', 'feature_packages', 'package_versions', 'package_states', 'custom_records', 'custom_record_transitions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated, app_writer', t);
    execute format('grant insert on public.%I to app_writer', t);
    execute format('create policy %I on public.%I for select to authenticated, app_writer using (app.is_member(school_id))', t || '_read', t);
  end loop;
end $$;
-- 정의·꾸러미·켜기는 관리자, 기록·전환은 교직원(함수가 역할·흐름을 판단)
create policy definitions_insert on public.definitions for insert to app_writer with check (app.is_school_admin(school_id));
create policy definition_versions_insert on public.definition_versions for insert to app_writer with check (app.is_school_admin(school_id));
create policy feature_packages_insert on public.feature_packages for insert to app_writer with check (app.is_school_admin(school_id));
create policy package_versions_insert on public.package_versions for insert to app_writer with check (app.is_school_admin(school_id));
create policy package_states_insert on public.package_states for insert to app_writer with check (app.is_school_admin(school_id));
create policy custom_records_insert on public.custom_records for insert to app_writer with check (app.is_member(school_id));
create policy custom_record_transitions_insert on public.custom_record_transitions for insert to app_writer with check (app.is_member(school_id));
-- 에이전트(작업 토큰 'package'): 자기 학교 정의·꾸러미 판만 읽고 쓴다. 켜기·기록은 없다
do $$
declare t text;
begin
  foreach t in array array['definitions', 'definition_versions', 'feature_packages', 'package_versions'] loop
    execute format('grant select, insert on public.%I to agent_writer', t);
    execute format($p$create policy %I on public.%I for select to agent_writer using (school_id = app.agent_school() and 'package' = any(app.agent_kinds()))$p$, t || '_agent_read', t);
    execute format($p$create policy %I on public.%I for insert to agent_writer with check (school_id = app.agent_school() and 'package' = any(app.agent_kinds()))$p$, t || '_agent_insert', t);
  end loop;
end $$;
grant select on public.package_states to agent_writer;
create policy package_states_agent_read on public.package_states for select to agent_writer using (school_id = app.agent_school() and 'package' = any(app.agent_kinds()));

-- ── 검사기 ─────────────────────────────────────────────
-- 문제 하나 = {level: error|warn, path, message}. error 가 하나라도 있으면 그 판은 valid=false 로 남고 꾸러미에 넣을 수 없다.
create or replace function private.def_issue(lvl text, path text, msg text) returns jsonb
language sql immutable as $$ select jsonb_build_object('level', lvl, 'path', path, 'message', msg) $$;

create or replace function private.check_definition(kind text, code text, spec jsonb)
returns jsonb language plpgsql immutable set search_path = pg_catalog, public, pg_temp as $$
declare
  iss jsonb := '[]';
  f jsonb; i integer := 0; k text; seen text[] := '{}'; st text[] := '{}'; fin text[] := '{}'; reach text[]; grown boolean;
  types text[] := array['text', 'longtext', 'number', 'integer', 'date', 'boolean', 'choice', 'multi_choice', 'hours', 'url'];
  privacy text[] := array['directory', 'internal', 'sensitive', 'restricted'];
  core text[] := array['attendance', 'grades', 'grade', 'narratives', 'enrollments', 'assessments', 'evidence', 'people', 'person', 'offerings',
                       'courses', 'closures', 'record', 'records', 'transcript', 'report_card', 'guardians', 'families', 'staff', 'users', 'schools'];
  reserved text[] := array['id', 'school_id', 'person_id', 'offering_id', 'state', 'version', 'created_at', 'recorded_at', 'recorded_by',
                           'name', 'email', 'phone', 'password', 'token', 'rrn', 'ssn', 'passport'];
begin
  if code = any(core) then iss := iss || private.def_issue('error', 'code', format('"%s"은(는) 플랫폼 핵심 기록 이름이라 쓸 수 없습니다.', code)); end if;
  if kind = 'record_type' then
    if jsonb_typeof(spec -> 'title') <> 'object' or coalesce(spec #>> '{title,ko}', spec #>> '{title,en}', '') = '' then
      iss := iss || private.def_issue('error', 'title', '제목(ko 또는 en)이 필요합니다.'); end if;
    if coalesce(spec ->> 'subject', '') not in ('person', 'offering', 'person_offering') then
      iss := iss || private.def_issue('error', 'subject', '대상(subject)은 person·offering·person_offering 중 하나입니다.'); end if;
    if jsonb_typeof(spec -> 'fields') <> 'array' or jsonb_array_length(spec -> 'fields') not between 1 and 60 then
      iss := iss || private.def_issue('error', 'fields', '칸(fields)은 1~60개입니다.');
    else
      for f in select * from jsonb_array_elements(spec -> 'fields') loop
        k := f ->> 'key';
        if k is null or k !~ '^[a-z][a-z0-9_]{0,39}$' then
          iss := iss || private.def_issue('error', format('fields[%s].key', i), '칸 이름은 영문 소문자로 시작하는 a-z·0-9·_ 입니다.');
        else
          if k = any(seen) then iss := iss || private.def_issue('error', format('fields[%s].key', i), format('칸 이름 "%s"이(가) 겹칩니다.', k)); end if;
          seen := seen || k;
          if k = any(reserved) or k ~ '(_id|_ids|_uuid|_email|_name)$' or k ~ '^(person|student|teacher|guardian|offering|course|user)_' then
            iss := iss || private.def_issue('error', format('fields[%s].key', i),
              format('"%s": 사람·수업은 정해진 열(person_id·offering_id)로만 잇습니다. 자료 칸에 이름·메일·식별자를 두지 않습니다.', k));
          end if;
        end if;
        if coalesce(f ->> 'type', '') <> all(types) then
          iss := iss || private.def_issue('error', format('fields[%s].type', i), '칸 종류는 ' || array_to_string(types, '·') || ' 중 하나입니다.'); end if;
        if coalesce(f ->> 'privacy', '') <> all(privacy) then
          iss := iss || private.def_issue('error', format('fields[%s].privacy', i), '칸마다 개인정보 등급(directory·internal·sensitive·restricted)이 필요합니다.'); end if;
        if jsonb_typeof(f -> 'label') <> 'object' then
          iss := iss || private.def_issue('error', format('fields[%s].label', i), '칸 표시 이름(label: {ko, en})이 필요합니다.'); end if;
        if f ->> 'type' in ('choice', 'multi_choice') and (jsonb_typeof(f -> 'options') <> 'array' or jsonb_array_length(f -> 'options') not between 1 and 50
            or exists (select 1 from jsonb_array_elements(f -> 'options') o where coalesce(o ->> 'code', '') !~ '^[a-z0-9][a-z0-9_]{0,30}$')) then
          iss := iss || private.def_issue('error', format('fields[%s].options', i), '고르기 칸에는 보기(options: [{code, label}]) 1~50개가 필요합니다.'); end if;
        if f ->> 'type' in ('text', 'longtext') and (f ->> 'max_length') is not null and (f ->> 'max_length') !~ '^[0-9]{1,4}$' then
          iss := iss || private.def_issue('error', format('fields[%s].max_length', i), '글자 수 한도는 1~9999입니다.'); end if;
        if f ->> 'privacy' = 'restricted' then
          iss := iss || private.def_issue('warn', format('fields[%s].privacy', i), '제한 등급 칸은 관리자만 봅니다(F6 열람 정책). 꼭 필요한지 확인해 주세요.'); end if;
        i := i + 1;
      end loop;
    end if;
    if (spec ->> 'flow') is not null and (spec ->> 'flow') !~ '^[a-z][a-z0-9_]{1,40}$' then
      iss := iss || private.def_issue('error', 'flow', '흐름(flow)은 흐름 정의 코드입니다.'); end if;
  elsif kind in ('form', 'view', 'output') then
    if coalesce(spec ->> 'record_type', '') !~ '^[a-z][a-z0-9_]{1,40}$' then
      iss := iss || private.def_issue('error', 'record_type', '어느 기록 유형의 화면인지(record_type) 적습니다.'); end if;
    if kind = 'form' and (jsonb_typeof(spec -> 'sections') <> 'array' or jsonb_array_length(spec -> 'sections') = 0
        or exists (select 1 from jsonb_array_elements(spec -> 'sections') s where jsonb_typeof(s -> 'fields') <> 'array' or jsonb_array_length(s -> 'fields') = 0)) then
      iss := iss || private.def_issue('error', 'sections', '양식에는 칸 목록(fields)이 있는 구역(sections)이 하나 이상 필요합니다.'); end if;
    if kind = 'view' and (jsonb_typeof(spec -> 'columns') <> 'array' or jsonb_array_length(spec -> 'columns') not between 1 and 20) then
      iss := iss || private.def_issue('error', 'columns', '목록에는 열(columns) 1~20개가 필요합니다.'); end if;
    if kind = 'output' then
      if jsonb_typeof(spec -> 'blocks') <> 'array' or jsonb_array_length(spec -> 'blocks') = 0 then
        iss := iss || private.def_issue('error', 'blocks', '출력에는 블록(blocks)이 하나 이상 필요합니다.');
      elsif exists (select 1 from jsonb_array_elements(spec -> 'blocks') b where coalesce(b ->> 'type', '') not in ('heading', 'text', 'field', 'fields', 'table')) then
        iss := iss || private.def_issue('error', 'blocks', '출력 블록 종류는 heading·text·field·fields·table 입니다.');
      end if;
    end if;
  elsif kind = 'flow' then
    if jsonb_typeof(spec -> 'states') <> 'array' or jsonb_array_length(spec -> 'states') not between 2 and 20 then
      iss := iss || private.def_issue('error', 'states', '흐름에는 상태(states) 2~20개가 필요합니다.');
      return iss;
    end if;
    select array_agg(s ->> 'key') into st from jsonb_array_elements(spec -> 'states') s;
    if exists (select 1 from unnest(st) x where x is null or x !~ '^[a-z][a-z0-9_]{0,30}$') or cardinality(st) <> (select count(distinct x) from unnest(st) x) then
      iss := iss || private.def_issue('error', 'states', '상태 이름은 겹치지 않는 a-z·0-9·_ 입니다.'); end if;
    if not (coalesce(spec ->> 'initial', '') = any(st)) then iss := iss || private.def_issue('error', 'initial', '처음 상태(initial)는 상태 목록에 있어야 합니다.'); end if;
    select coalesce(array_agg(x #>> '{}'), '{}') into fin from jsonb_array_elements(coalesce(spec -> 'final', '[]')) x;
    if cardinality(fin) = 0 or not (fin <@ st) then iss := iss || private.def_issue('error', 'final', '끝 상태(final)는 상태 목록 안에서 하나 이상입니다.'); end if;
    if jsonb_typeof(spec -> 'transitions') <> 'array' or jsonb_array_length(spec -> 'transitions') = 0 then
      iss := iss || private.def_issue('error', 'transitions', '전환(transitions)이 하나 이상 필요합니다.');
      return iss;
    end if;
    i := 0;
    for f in select * from jsonb_array_elements(spec -> 'transitions') loop
      if not (coalesce(f ->> 'from', '') = any(st)) or not (coalesce(f ->> 'to', '') = any(st)) then
        iss := iss || private.def_issue('error', format('transitions[%s]', i), '전환의 from·to 는 상태 목록에 있어야 합니다.'); end if;
      if (f ->> 'from') = any(fin) then
        iss := iss || private.def_issue('error', format('transitions[%s]', i), '끝 상태에서 나가는 전환은 둘 수 없습니다. 끝난 기록의 정정은 사유와 함께 새 기록으로 합니다(핵심 마감·정정 규칙).'); end if;
      if jsonb_typeof(f -> 'roles') <> 'array' or jsonb_array_length(f -> 'roles') = 0
         or exists (select 1 from jsonb_array_elements_text(f -> 'roles') r where r not in ('admin', 'teacher', 'author')) then
        iss := iss || private.def_issue('error', format('transitions[%s].roles', i), '전환할 수 있는 역할(roles)은 admin·teacher·author 중에서 고릅니다.'); end if;
      i := i + 1;
    end loop;
    -- 처음 상태에서 끝 상태에 닿는지
    reach := array[spec ->> 'initial'];
    loop
      grown := false;
      for f in select * from jsonb_array_elements(spec -> 'transitions') loop
        if (f ->> 'from') = any(reach) and not ((f ->> 'to') = any(reach)) then reach := reach || (f ->> 'to'); grown := true; end if;
      end loop;
      exit when not grown;
    end loop;
    if cardinality(fin) > 0 and not (fin && reach) then iss := iss || private.def_issue('error', 'final', '처음 상태에서 끝 상태로 가는 길이 없습니다.'); end if;
    if exists (select 1 from unnest(st) x where not (x = any(reach))) then iss := iss || private.def_issue('warn', 'states', '처음 상태에서 닿지 않는 상태가 있습니다.'); end if;
  end if;
  return iss;
end $$;

-- 꾸러미 검사: 구성 판을 정하고(판을 안 적으면 최신 판), 서로 가리키는 이름이 꾸러미 안에서 풀리는지 본다
create or replace function private.check_package(target uuid, members jsonb, out resolved jsonb, out issues jsonb)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare m jsonb; d record; i integer := 0; rt jsonb := '{}'; flows text[] := '{}'; keys text[]; x jsonb; ref text; nrec integer := 0;
begin
  resolved := '[]'; issues := '[]';
  if jsonb_typeof(members) <> 'array' or jsonb_array_length(members) not between 1 and 40 then
    issues := issues || private.def_issue('error', 'members', '꾸러미 구성(members)은 1~40개입니다.'); return;
  end if;
  for m in select * from jsonb_array_elements(members) loop
    select v.version, v.valid, v.spec, df.kind, df.code into d
      from public.definitions df join public.definition_versions v on v.definition_id = df.id
     where df.school_id = target and df.kind = m ->> 'kind' and df.code = m ->> 'code'
       and (nullif(m ->> 'version', '') is null or v.version = (m ->> 'version')::int)
     order by v.version desc limit 1;
    if d.version is null then
      issues := issues || private.def_issue('error', format('members[%s]', i), format('정의 %s/%s(판 %s)을(를) 찾을 수 없습니다.', m ->> 'kind', m ->> 'code', coalesce(m ->> 'version', '최신')));
    else
      if not d.valid then issues := issues || private.def_issue('error', format('members[%s]', i), format('정의 %s/%s 판 %s에 검사 오류가 있습니다.', d.kind, d.code, d.version)); end if;
      resolved := resolved || jsonb_build_object('kind', d.kind, 'code', d.code, 'version', d.version);
      if d.kind = 'record_type' then rt := rt || jsonb_build_object(d.code, d.spec); nrec := nrec + 1; end if;
      if d.kind = 'flow' then flows := flows || d.code; end if;
    end if;
    i := i + 1;
  end loop;
  if nrec = 0 then issues := issues || private.def_issue('error', 'members', '꾸러미에는 기록 유형(record_type)이 하나 이상 필요합니다.'); end if;
  -- 이름 풀기: 화면·출력의 record_type·칸 이름, 기록 유형의 흐름
  for m in select * from jsonb_array_elements(resolved) loop
    select v.spec into x from public.definitions df join public.definition_versions v on v.definition_id = df.id
     where df.school_id = target and df.kind = m ->> 'kind' and df.code = m ->> 'code' and v.version = (m ->> 'version')::int;
    if m ->> 'kind' = 'record_type' then
      if (x ->> 'flow') is not null and not ((x ->> 'flow') = any(flows)) then
        issues := issues || private.def_issue('error', format('%s/%s', m ->> 'kind', m ->> 'code'), format('흐름 "%s"이(가) 꾸러미에 없습니다.', x ->> 'flow')); end if;
    elsif m ->> 'kind' in ('form', 'view', 'output') then
      ref := x ->> 'record_type';
      if not (rt ? ref) then
        issues := issues || private.def_issue('error', format('%s/%s', m ->> 'kind', m ->> 'code'), format('기록 유형 "%s"이(가) 꾸러미에 없습니다.', ref));
      else
        select array_agg(ff ->> 'key') into keys from jsonb_array_elements(rt -> ref -> 'fields') ff;
        if exists (
          select 1 from (
            select jsonb_array_elements_text(s -> 'fields') k from jsonb_array_elements(coalesce(x -> 'sections', '[]')) s
            union all select jsonb_array_elements_text(coalesce(x -> 'columns', '[]'))
            union all select b ->> 'key' from jsonb_array_elements(coalesce(x -> 'blocks', '[]')) b where b ->> 'type' = 'field'
            union all select jsonb_array_elements_text(b -> 'keys') from jsonb_array_elements(coalesce(x -> 'blocks', '[]')) b where b ->> 'type' in ('fields', 'table') and jsonb_typeof(b -> 'keys') = 'array'
          ) q where not (q.k = any(keys || array['state', 'recorded_at', 'person', 'offering']))) then
          issues := issues || private.def_issue('error', format('%s/%s', m ->> 'kind', m ->> 'code'), format('기록 유형 "%s"에 없는 칸 이름을 씁니다.', ref));
        end if;
      end if;
    end if;
  end loop;
end $$;

-- ── 정의 판·꾸러미 판 저장 (사람·에이전트 공통 본체) ──────
create or replace function private.save_definition(target uuid, p jsonb, by_agent uuid)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public, pg_temp as $$
declare did uuid; v integer; iss jsonb; ok boolean;
begin
  if coalesce(p ->> 'kind', '') not in ('record_type', 'form', 'view', 'output', 'flow') then raise exception '정의 종류가 올바르지 않습니다.' using errcode = '22023'; end if;
  if coalesce(p ->> 'code', '') !~ '^[a-z][a-z0-9_]{1,40}$' then raise exception '정의 코드가 올바르지 않습니다.' using errcode = '22023'; end if;
  if jsonb_typeof(p -> 'spec') <> 'object' then raise exception '정의 명세(spec)가 필요합니다.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('school-platform:definitions'), hashtext(target::text || (p ->> 'kind') || (p ->> 'code')));
  select id into did from public.definitions where school_id = target and kind = p ->> 'kind' and code = p ->> 'code';
  if did is null then
    if coalesce((p ->> 'base_version')::int, 0) <> 0 then raise exception '그 사이 새 판이 생겼습니다.' using errcode = 'P0409'; end if;
    insert into public.definitions(school_id, kind, code) values (target, p ->> 'kind', p ->> 'code') returning id into did;
    v := 0;
  else
    select coalesce(max(version), 0) into v from public.definition_versions where definition_id = did;
    if (p ->> 'base_version') is null or (p ->> 'base_version')::int <> v then raise exception '그 사이 새 판이 생겼습니다. 최신 판을 다시 읽어 주세요.' using errcode = 'P0409'; end if;
  end if;
  iss := private.check_definition(p ->> 'kind', p ->> 'code', p -> 'spec');
  ok := not exists (select 1 from jsonb_array_elements(iss) e where e ->> 'level' = 'error');
  insert into public.definition_versions(school_id, definition_id, version, spec, why, issues, valid, author_kind, agent_token_id, created_by)
  values (target, did, v + 1, p -> 'spec', nullif(trim(p ->> 'why'), ''), iss, ok,
          case when by_agent is null then 'human' else 'agent' end, by_agent, app.uid());
  return jsonb_build_object('kind', p ->> 'kind', 'code', p ->> 'code', 'version', v + 1, 'valid', ok, 'issues', iss);
end $$;

create or replace function private.save_package(target uuid, p jsonb, by_agent uuid)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public, pg_temp as $$
declare pid uuid; v integer; chk record; ok boolean;
begin
  if coalesce(p ->> 'code', '') !~ '^[a-z][a-z0-9_]{1,40}$' then raise exception '꾸러미 코드가 올바르지 않습니다.' using errcode = '22023'; end if;
  if jsonb_typeof(p -> 'title') <> 'object' then raise exception '꾸러미 제목(title: {ko, en})이 필요합니다.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('school-platform:packages'), hashtext(target::text || (p ->> 'code')));
  select id into pid from public.feature_packages where school_id = target and code = p ->> 'code';
  if pid is null then
    if coalesce((p ->> 'base_version')::int, 0) <> 0 then raise exception '그 사이 새 판이 생겼습니다.' using errcode = 'P0409'; end if;
    insert into public.feature_packages(school_id, code) values (target, p ->> 'code') returning id into pid;
    v := 0;
  else
    select coalesce(max(version), 0) into v from public.package_versions where package_id = pid;
    if (p ->> 'base_version') is null or (p ->> 'base_version')::int <> v then raise exception '그 사이 새 판이 생겼습니다. 최신 판을 다시 읽어 주세요.' using errcode = 'P0409'; end if;
  end if;
  select * into chk from private.check_package(target, coalesce(p -> 'members', '[]'));
  ok := not exists (select 1 from jsonb_array_elements(chk.issues) e where e ->> 'level' = 'error');
  insert into public.package_versions(school_id, package_id, version, title, members, why, issues, valid, author_kind, agent_token_id, created_by)
  values (target, pid, v + 1, p -> 'title', chk.resolved, nullif(trim(p ->> 'why'), ''), chk.issues, ok,
          case when by_agent is null then 'human' else 'agent' end, by_agent, app.uid());
  return jsonb_build_object('code', p ->> 'code', 'version', v + 1, 'valid', ok, 'issues', chk.issues, 'members', chk.resolved);
end $$;

create or replace function app.save_definition(target uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  return private.save_definition(target, p, null);
end $$;
create or replace function app.save_package(target uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  return private.save_package(target, p, null);
end $$;

-- ── 켜기·끄기 (관리자만) ──────────────────────────────────
-- 켤 수 있는 것은 검사를 통과한 꾸러미 판뿐이고, 같은 기록 유형을 켜 둔 다른 꾸러미가 있으면 거부한다
create or replace function app.set_package_state(target uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare pid uuid; pv record; clash text;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 꾸러미를 켜고 끕니다.' using errcode = '42501'; end if;
  if coalesce(p ->> 'state', '') not in ('enabled', 'disabled') then raise exception '상태는 enabled·disabled 입니다.' using errcode = '22023'; end if;
  select id into pid from public.feature_packages where school_id = target and code = p ->> 'code';
  if pid is null then raise exception '꾸러미를 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtext('school-platform:package_states'), hashtext(target::text));
  select version, valid, members into pv from public.package_versions
   where package_id = pid and (nullif(p ->> 'version', '') is null or version = (p ->> 'version')::int) order by version desc limit 1;
  if pv.version is null then raise exception '꾸러미 판을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if p ->> 'state' = 'enabled' then
    if not pv.valid then raise exception '검사 오류가 있는 꾸러미 판은 켤 수 없습니다.' using errcode = '22023'; end if;
    select m ->> 'code' into clash
      from jsonb_array_elements(pv.members) m
     where m ->> 'kind' = 'record_type' and exists (
       select 1 from public.feature_packages fp
       cross join lateral (select s.state, s.version from public.package_states s where s.package_id = fp.id order by s.decided_at desc, s.id desc limit 1) cur
       join public.package_versions ov on ov.package_id = fp.id and ov.version = cur.version
       where fp.school_id = target and fp.id <> pid and cur.state = 'enabled'
         and exists (select 1 from jsonb_array_elements(ov.members) om where om ->> 'kind' = 'record_type' and om ->> 'code' = m ->> 'code'))
     limit 1;
    if clash is not null then raise exception '기록 유형 "%"을(를) 다른 꾸러미가 이미 켜 두었습니다.', clash using errcode = '23505'; end if;
  end if;
  insert into public.package_states(school_id, package_id, version, state, reason) values (target, pid, pv.version, p ->> 'state', nullif(trim(p ->> 'reason'), ''));
  return jsonb_build_object('code', p ->> 'code', 'version', pv.version, 'state', p ->> 'state');
end $$;

-- 지금 켜진 꾸러미 판에서 기록 유형의 판·흐름을 찾는다
create or replace function private.active_record_type(target uuid, rt_code text,
  out package_id uuid, out definition_id uuid, out def_version integer, out spec jsonb, out flow jsonb)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare members jsonb; fcode text;
begin
  select fp.id, ov.members into package_id, members
    from public.feature_packages fp
    cross join lateral (select s.state, s.version from public.package_states s where s.package_id = fp.id order by s.decided_at desc, s.id desc limit 1) cur
    join public.package_versions ov on ov.package_id = fp.id and ov.version = cur.version
   where fp.school_id = target and cur.state = 'enabled'
     and exists (select 1 from jsonb_array_elements(ov.members) m where m ->> 'kind' = 'record_type' and m ->> 'code' = rt_code)
   limit 1;
  if package_id is null then return; end if;
  select df.id, v.version, v.spec into definition_id, def_version, spec
    from jsonb_array_elements(members) m join public.definitions df on df.school_id = target and df.kind = 'record_type' and df.code = m ->> 'code'
    join public.definition_versions v on v.definition_id = df.id and v.version = (m ->> 'version')::int
   where m ->> 'kind' = 'record_type' and m ->> 'code' = rt_code;
  fcode := spec ->> 'flow';
  if fcode is not null then
    select v.spec into flow
      from jsonb_array_elements(members) m join public.definitions df on df.school_id = target and df.kind = 'flow' and df.code = m ->> 'code'
      join public.definition_versions v on v.definition_id = df.id and v.version = (m ->> 'version')::int
     where m ->> 'kind' = 'flow' and m ->> 'code' = fcode;
  end if;
end $$;

-- 자료 칸 검사: 모르는 칸·필수·종류·보기·글자 수
create or replace function private.check_record_data(spec jsonb, data jsonb) returns void
language plpgsql immutable set search_path = pg_catalog, public, pg_temp as $$
declare f jsonb; k text; val jsonb; t text;
begin
  if exists (select 1 from jsonb_object_keys(data) dk where not exists (select 1 from jsonb_array_elements(spec -> 'fields') ff where ff ->> 'key' = dk)) then
    raise exception '기록 유형에 없는 칸이 있습니다.' using errcode = '22023';
  end if;
  for f in select * from jsonb_array_elements(spec -> 'fields') loop
    k := f ->> 'key'; t := f ->> 'type'; val := data -> k;
    if val is null or val = 'null'::jsonb then
      if coalesce((f ->> 'required')::boolean, false) then raise exception '필수 칸 "%"이(가) 비었습니다.', k using errcode = '22023'; end if;
      continue;
    end if;
    if (t in ('text', 'longtext', 'url', 'date', 'choice') and jsonb_typeof(val) <> 'string')
       or (t in ('number', 'integer', 'hours') and jsonb_typeof(val) <> 'number')
       or (t = 'boolean' and jsonb_typeof(val) <> 'boolean')
       or (t = 'multi_choice' and jsonb_typeof(val) <> 'array')
       or (t = 'integer' and (val #>> '{}')::numeric <> trunc((val #>> '{}')::numeric))
       or (t = 'hours' and ((val #>> '{}')::numeric < 0 or (val #>> '{}')::numeric > 10000))
       or (t = 'date' and (val #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$')
       or (t = 'url' and (val #>> '{}') !~ '^https://[^\s]{3,500}$') then
      raise exception '칸 "%"의 값 형식이 올바르지 않습니다.', k using errcode = '22023';
    end if;
    if t in ('text', 'longtext') and length(val #>> '{}') > coalesce((f ->> 'max_length')::int, case t when 'text' then 200 else 4000 end) then
      raise exception '칸 "%"의 글자 수가 한도를 넘습니다.', k using errcode = '22023';
    end if;
    if t = 'choice' and not exists (select 1 from jsonb_array_elements(f -> 'options') o where o ->> 'code' = val #>> '{}') then
      raise exception '칸 "%"의 보기에 없는 값입니다.', k using errcode = '22023';
    end if;
    if t = 'multi_choice' and exists (select 1 from jsonb_array_elements_text(val) x where not exists (select 1 from jsonb_array_elements(f -> 'options') o where o ->> 'code' = x)) then
      raise exception '칸 "%"의 보기에 없는 값입니다.', k using errcode = '22023';
    end if;
  end loop;
end $$;

-- 교직원(관리자·교사) 판단: 구성원 표는 함수 소유자만 읽으므로 판단 함수로 둔다
create or replace function app.is_school_staff(target uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select exists (select 1 from public.memberships m where m.user_id = app.uid() and m.school_id = target and m.role in ('admin', 'teacher'))
$$;
revoke all on function app.is_school_staff(uuid) from public, anon;
grant execute on function app.is_school_staff(uuid) to authenticated, app_writer;

-- ── 학교 정의 기록 쓰기 ──────────────────────────────────
-- 켜진 꾸러미의 기록 유형만. 교직원(관리자·교사)이 쓰고, 수업 대상 기록은 담당 교사·관리자. 흐름이 있으면 처음 상태 사건을 함께 남긴다.
-- 정정은 앞 기록을 가리키는 새 기록. 끝 상태에 있는 기록의 정정은 관리자가 사유와 함께.
create or replace function app.add_custom_record(target uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare a record; nid uuid; prev record; person uuid := nullif(p ->> 'person_id', '')::uuid; offering uuid := nullif(p ->> 'offering_id', '')::uuid; cur_state text;
begin
  if not app.is_school_staff(target) then
    raise exception '이 학교 교직원만 기록합니다.' using errcode = '42501';
  end if;
  select * into a from private.active_record_type(target, p ->> 'record_type');
  if a.package_id is null then raise exception '켜진 꾸러미에 그 기록 유형이 없습니다.' using errcode = 'P0002'; end if;
  if (a.spec ->> 'subject') in ('person', 'person_offering') and person is null then raise exception '학생(person_id)이 필요합니다.' using errcode = '22023'; end if;
  if (a.spec ->> 'subject') in ('offering', 'person_offering') and offering is null then raise exception '수업(offering_id)이 필요합니다.' using errcode = '22023'; end if;
  if (a.spec ->> 'subject') = 'offering' and person is not null or (a.spec ->> 'subject') = 'person' and offering is not null then
    raise exception '이 기록 유형의 대상이 아닙니다.' using errcode = '22023';
  end if;
  if person is not null and not exists (select 1 from public.people where id = person and school_id = target) then raise exception '학생을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if offering is not null then
    if not exists (select 1 from public.course_offerings where id = offering and school_id = target) then raise exception '수업을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
    if not app.is_school_admin(target) and not app.is_offering_staff(offering, target) then raise exception '담당 교사·관리자만 이 수업의 기록을 씁니다.' using errcode = '42501'; end if;
  end if;
  perform private.check_record_data(a.spec, coalesce(p -> 'data', '{}'));
  if nullif(p ->> 'corrects_id', '') is not null then
    select r.id, r.definition_id, r.person_id, r.offering_id into prev from public.custom_records r where r.id = (p ->> 'corrects_id')::uuid and r.school_id = target;
    if prev.id is null then raise exception '정정할 기록을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
    if prev.definition_id <> a.definition_id or prev.person_id is distinct from person or prev.offering_id is distinct from offering then
      raise exception '정정은 같은 유형·같은 대상의 기록만 가리킵니다.' using errcode = '22023';
    end if;
    select t.to_state into cur_state from public.custom_record_transitions t where t.record_id = prev.id order by t.moved_at desc, t.id desc limit 1;
    if a.flow is not null and cur_state is not null and exists (select 1 from jsonb_array_elements_text(a.flow -> 'final') x where x = cur_state) then
      if not app.is_school_admin(target) or length(trim(coalesce(p ->> 'reason', ''))) = 0 then
        raise exception '끝난 기록의 정정은 관리자가 사유와 함께 합니다.' using errcode = '42501';
      end if;
    end if;
  end if;
  begin
    insert into public.custom_records(school_id, definition_id, definition_version, package_id, person_id, offering_id, data, corrects_id, reason)
    values (target, a.definition_id, a.def_version, a.package_id, person, offering, coalesce(p -> 'data', '{}'),
            nullif(p ->> 'corrects_id', '')::uuid, nullif(trim(p ->> 'reason'), ''))
    returning id into nid;
  exception when unique_violation then raise exception '그 기록은 이미 정정되었습니다. 최신 기록을 다시 읽어 주세요.' using errcode = 'P0409';
  end;
  if a.flow is not null then
    insert into public.custom_record_transitions(school_id, record_id, from_state, to_state) values (target, nid, null, a.flow ->> 'initial');
  end if;
  return nid;
end $$;

create or replace function app.move_custom_record(target uuid, p jsonb) returns text
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare r record; a record; cur text; tr jsonb; dcode text; ok boolean := false; role text;
begin
  select id, definition_id, recorded_by into r from public.custom_records where id = (p ->> 'record_id')::uuid and school_id = target;
  if r.id is null then raise exception '기록을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  select code into dcode from public.definitions where id = r.definition_id;
  select * into a from private.active_record_type(target, dcode);
  if a.package_id is null then raise exception '꺼진 꾸러미의 기록은 옮길 수 없습니다.' using errcode = '22023'; end if;
  if a.flow is null then raise exception '이 기록 유형에는 흐름이 없습니다.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('school-platform:custom_record_transitions'), hashtext(r.id::text));
  select t.to_state into cur from public.custom_record_transitions t where t.record_id = r.id order by t.moved_at desc, t.id desc limit 1;
  if coalesce(p ->> 'from_state', cur) is distinct from cur then raise exception '그 사이 상태가 바뀌었습니다.' using errcode = 'P0409'; end if;
  for tr in select * from jsonb_array_elements(a.flow -> 'transitions') loop
    if tr ->> 'from' = cur and tr ->> 'to' = p ->> 'to_state' then
      for role in select jsonb_array_elements_text(tr -> 'roles') loop
        if role = 'admin' and app.is_school_admin(target)
           or role = 'teacher' and app.is_school_staff(target)
           or role = 'author' and r.recorded_by = app.uid() then ok := true; end if;
      end loop;
      if not ok then raise exception '이 전환을 할 수 있는 역할이 아닙니다.' using errcode = '42501'; end if;
    end if;
  end loop;
  if not ok then raise exception '흐름에 없는 전환입니다(% → %).', cur, p ->> 'to_state' using errcode = '22023'; end if;
  insert into public.custom_record_transitions(school_id, record_id, from_state, to_state, note) values (target, r.id, cur, p ->> 'to_state', nullif(trim(p ->> 'note'), ''));
  return p ->> 'to_state';
end $$;

revoke all on function private.def_issue(text, text, text), private.check_definition(text, text, jsonb), private.check_package(uuid, jsonb),
  private.save_definition(uuid, jsonb, uuid), private.save_package(uuid, jsonb, uuid), private.active_record_type(uuid, text), private.check_record_data(jsonb, jsonb) from public;
grant execute on function private.def_issue(text, text, text), private.check_definition(text, text, jsonb), private.check_package(uuid, jsonb),
  private.save_definition(uuid, jsonb, uuid), private.save_package(uuid, jsonb, uuid) to app_writer, agent_writer;
grant execute on function private.active_record_type(uuid, text), private.check_record_data(jsonb, jsonb) to app_writer;
grant usage on schema private to agent_writer;
-- 검사기는 화면·에이전트가 저장 전에 미리 돌려 볼 수 있다(읽기 전용, 학교 자료를 읽지 않음)
create or replace function app.check_definition(kind text, code text, spec jsonb) returns jsonb
language sql immutable security definer set search_path = pg_catalog, public, pg_temp as $$ select private.check_definition(kind, code, spec) $$;

grant create on schema app to app_writer;
do $$
declare f text;
begin
  foreach f in array array['app.save_definition(uuid, jsonb)', 'app.save_package(uuid, jsonb)', 'app.set_package_state(uuid, jsonb)',
                           'app.add_custom_record(uuid, jsonb)', 'app.move_custom_record(uuid, jsonb)', 'app.check_definition(text, text, jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
    execute format('alter function %s owner to app_writer', f);
  end loop;
end $$;
revoke create on schema app from app_writer;

-- ── 작업 토큰 범위: 'package'(학사 꾸러미 정의) ─────────────
-- 토큰은 정의 판·꾸러미 판을 읽고(read) 만들고(create) 새 판을 쓴다(edit). 켜기·기록 쓰기는 사람만 한다(함수가 없다).
-- 주소(keys)는 홈페이지 항목에만 적용된다. 'package' 종류는 학교 단위다.
alter table public.agent_tokens drop constraint agent_tokens_kinds_check;
alter table public.agent_tokens add constraint agent_tokens_kinds_check
  check (cardinality(kinds) between 1 and 4 and kinds <@ array['story', 'page', 'news', 'package']::text[]);
alter table public.agent_token_uses drop constraint agent_token_uses_action_check;
alter table public.agent_token_uses add constraint agent_token_uses_action_check
  check (action ~ '^(asset\.upload|(story|page|news)\.(version|create|meta|archive|publish|unpublish)|(definition|package)\.version)$');
-- 라이선스: 꾸러미는 학사 문서실(records) 모듈. 토큰 행 쓰기 정책도 종류별로 본다(홈페이지 종류는 homepage, 꾸러미는 records)
drop policy agent_tokens_writer_insert on public.agent_tokens;
create policy agent_tokens_writer_insert on public.agent_tokens for insert to agent_writer
  with check (app.is_school_admin(school_id) and created_by = app.uid()
              and (kinds <@ array['package'] or app.has_module(school_id, 'homepage'))
              and (not ('package' = any(kinds)) or app.has_module(school_id, 'records')));
create or replace function private.site_kind_allowed(target uuid, entry_kind text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select case entry_kind when 'story' then 'stories' = any(private.school_modules(target)) and 'homepage' = any(private.school_modules(target))
                         when 'package' then 'records' = any(private.school_modules(target))
                         else 'homepage' = any(private.school_modules(target)) end
$$;

grant create on schema app to agent_writer;
grant create on schema agent to agent_writer;
set local role agent_writer;

create or replace function app.create_agent_token(p_school uuid, p_label text, p_days integer, p_kinds text[], p_keys text[], p_perms text[], p_agent_kind text)
returns text
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare token text; ks text[] := nullif(p_keys, '{}'); missing text; site_kinds text[];
begin
  perform set_config('agent.school', '', true);
  perform set_config('agent.kinds', '', true);
  perform set_config('agent.keys', '', true);
  if app.uid() is null or not app.is_school_admin(p_school) then
    raise exception '학교 관리자만 작업 토큰을 발급할 수 있습니다.' using errcode = '42501';
  end if;
  if p_days is not null and p_days not in (7, 30, 90, 365) then raise exception '기한은 7·30·90·365일 또는 무기한입니다.' using errcode = '22023'; end if;
  if p_kinds is null or cardinality(p_kinds) = 0 or not (p_kinds <@ array['story', 'page', 'news', 'package']) then
    raise exception '맡길 항목 종류(동화·쪽·소식·학사 꾸러미)를 하나 이상 고릅니다.' using errcode = '22023';
  end if;
  if p_perms is null or cardinality(p_perms) = 0 or not (p_perms <@ array['read', 'upload', 'create', 'edit', 'archive', 'publish', 'autopublish']) then
    raise exception '권한(읽기·파일 올리기·만들기·고치기·보관·공개·자동 공개)을 하나 이상 고릅니다.' using errcode = '22023';
  end if;
  if 'autopublish' = any(p_perms) and not ('publish' = any(p_perms)) then
    raise exception '자동 공개는 공개 권한과 함께 고릅니다.' using errcode = '22023';
  end if;
  site_kinds := array(select k from unnest(p_kinds) k where k <> 'package');
  if (cardinality(site_kinds) > 0 and not app.has_module(p_school, 'homepage')) or ('story' = any(p_kinds) and not app.has_module(p_school, 'stories'))
     or ('package' = any(p_kinds) and not app.has_module(p_school, 'records')) then
    raise exception '이 학교 라이선스에 없는 기능입니다.' using errcode = '42501';
  end if;
  if p_agent_kind is null or p_agent_kind not in ('codex', 'claude-code', 'other') then raise exception '에이전트 종류가 올바르지 않습니다.' using errcode = '22023'; end if;
  -- 주소 목록(홈페이지 항목에만): 고치기·읽기는 있는 항목만, 만들기 권한이 있으면 아직 없는 주소도 미리 정해 둘 수 있다
  if ks is not null then
    if cardinality(site_kinds) = 0 then raise exception '주소는 홈페이지 항목(동화·쪽·소식)에만 정합니다.' using errcode = '22023'; end if;
    if exists (select 1 from unnest(ks) k where k !~ '^[a-z0-9][a-z0-9-]{0,59}$') then raise exception '주소 이름이 올바르지 않습니다.' using errcode = '22023'; end if;
    if not ('create' = any(p_perms)) then
      select k into missing from unnest(ks) k
       where not exists (select 1 from public.site_entries e where e.school_id = p_school and e.kind = any(site_kinds) and e.key = k) limit 1;
      if missing is not null then raise exception '고른 종류에 그 주소 이름(%)의 항목이 없습니다.', missing using errcode = '22023'; end if;
    end if;
  end if;
  token := 'agt_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.agent_tokens(school_id, label, kinds, keys, perms, entry_key, agent_kind, token_sha256, created_by, expires_at)
    values (p_school, coalesce(nullif(trim(p_label), ''), '외부 작업'), p_kinds, ks, p_perms,
            case when cardinality(ks) = 1 and p_kinds = array['story'] then ks[1] end, p_agent_kind,
            encode(sha256(convert_to(token, 'UTF8')), 'hex'), app.uid(),
            case when p_days is null then null else now() + make_interval(days => p_days) end);
  perform app.log_access(p_school, 'agent.token_create', jsonb_build_object('label', p_label, 'days', p_days, 'kinds', p_kinds, 'keys', ks, 'perms', p_perms, 'agent_kind', p_agent_kind));
  return token;
end $$;

-- 꾸러미 읽기: 정의(최신 판·검사 결과)와 꾸러미(최신 판·지금 상태)
create or replace function agent.packages(p_token text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare c record;
begin
  select * into c from app.agent_enter(p_token);
  perform app.agent_need(c.t_perms, 'read');
  if not ('package' = any(c.t_kinds)) then raise exception '이 토큰으로 볼 수 있는 종류가 아닙니다.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'definitions', (select coalesce(jsonb_agg(jsonb_build_object('kind', d.kind, 'code', d.code, 'version', v.version, 'valid', v.valid, 'issues', v.issues, 'spec', v.spec) order by d.kind, d.code), '[]')
                      from public.definitions d join lateral (select * from public.definition_versions x where x.definition_id = d.id order by x.version desc limit 1) v on true
                     where d.school_id = c.t_school),
    'packages', (select coalesce(jsonb_agg(jsonb_build_object('code', fp.code, 'version', v.version, 'title', v.title, 'members', v.members, 'valid', v.valid, 'issues', v.issues,
                                                              'state', (select jsonb_build_object('state', s.state, 'version', s.version) from public.package_states s where s.package_id = fp.id order by s.decided_at desc, s.id desc limit 1))
                                           order by fp.code), '[]')
                   from public.feature_packages fp join lateral (select * from public.package_versions x where x.package_id = fp.id order by x.version desc limit 1) v on true
                  where fp.school_id = c.t_school));
end $$;

create or replace function agent.save_definition(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare c record; res jsonb; exists_ boolean;
begin
  select * into c from app.agent_enter(p_token);
  if not ('package' = any(c.t_kinds)) then raise exception '이 토큰으로 다룰 수 있는 종류가 아닙니다.' using errcode = '42501'; end if;
  exists_ := exists (select 1 from public.definitions where school_id = c.t_school and kind = p ->> 'kind' and code = p ->> 'code');
  perform app.agent_need(c.t_perms, case when exists_ then 'edit' else 'create' end);
  res := private.save_definition(c.t_school, p, c.t_id);
  insert into public.agent_token_uses(token_id, school_id, action, detail)
  values (c.t_id, c.t_school, 'definition.version', jsonb_build_object('kind', p ->> 'kind', 'code', p ->> 'code', 'version', res -> 'version', 'valid', res -> 'valid'));
  return res;
end $$;

create or replace function agent.save_package(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare c record; res jsonb; exists_ boolean;
begin
  select * into c from app.agent_enter(p_token);
  if not ('package' = any(c.t_kinds)) then raise exception '이 토큰으로 다룰 수 있는 종류가 아닙니다.' using errcode = '42501'; end if;
  exists_ := exists (select 1 from public.feature_packages where school_id = c.t_school and code = p ->> 'code');
  perform app.agent_need(c.t_perms, case when exists_ then 'edit' else 'create' end);
  res := private.save_package(c.t_school, p, c.t_id);
  insert into public.agent_token_uses(token_id, school_id, action, detail)
  values (c.t_id, c.t_school, 'package.version', jsonb_build_object('code', p ->> 'code', 'version', res -> 'version', 'valid', res -> 'valid'));
  return res;
end $$;

reset role;
revoke create on schema app from agent_writer;
revoke create on schema agent from agent_writer;
do $$
declare f text;
begin
  foreach f in array array['agent.packages(text)', 'agent.save_definition(text, jsonb)', 'agent.save_package(text, jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to agent_request', f);
  end loop;
end $$;
