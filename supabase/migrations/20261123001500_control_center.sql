-- 39차: 관제 센터 (ADR 0015) — 결정 요청함과 지시 전달
-- 서브 세션이 사용자 결정을 기다리며 멈추지 않도록, 결정 요청을 이 표에 올리고 다른 일을 한다.
-- 사용자는 전체 관리 → 관제 센터에서 세부 내용을 보고 선택지를 고르거나 추가 요청사항을 적어 '지시'를 남긴다.
-- 관제 세션(또는 예약 전달 세션)이 지시를 읽어 해당 세션에 보내거나 새 세션을 만들어 실행하고, '전달됨'을 표시한다.
--
--  · 학교 자료가 아니므로 school_id 가 없다. 사람은 전체 관리자만(RLS) 읽고 쓴다.
--  · Claude 세션은 점검 토큰(ADR 0010)으로 control 스키마의 명령 함수만 쓴다. 이 함수는 관제 표에만 쓰고,
--    작성자를 'control'·'session'으로만 남긴다(사람의 답·지시 'user'는 로그인한 전체 관리자만 쓸 수 있다).
--  · 메시지는 추가만 한다. 바꿀 수 있는 것은 '전달됨' 표시 한 번뿐이다.

create table public.control_sessions (
  id text primary key check (id ~ '^session_[A-Za-z0-9]{8,64}$'),
  name text not null check (length(trim(name)) between 1 and 120),
  role text not null default '' check (length(role) <= 500),
  tags text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.control_requests (
  id uuid primary key default gen_random_uuid(),
  no integer generated always as identity unique,
  kind text not null check (kind in ('decision', 'directive')),
  title text not null check (length(trim(title)) between 1 and 200),
  detail text not null default '' check (length(detail) <= 20000),
  -- [{key, label, detail?}] 추천안은 recommended 에 key 로
  options jsonb not null default '[]' check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 8),
  recommended text,
  reversible boolean,
  related text not null default '' check (length(related) <= 500),
  lab_item_id uuid references public.platform_items(id),
  source_session text references public.control_sessions(id),
  status text not null default 'open'
    check (status in ('open', 'proceeding', 'parked', 'answered', 'delivered', 'done', 'dropped')),
  author text not null check (author in ('user', 'control', 'session')),
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index control_requests_status on public.control_requests (status, no);

create table public.control_messages (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.control_requests(id),
  author text not null check (author in ('user', 'control', 'session')),
  author_session text references public.control_sessions(id),
  kind text not null check (kind in ('answer', 'directive', 'report', 'note', 'status')),
  choice text,
  body text not null default '' check (length(body) <= 20000),
  -- 지시를 받을 곳: 세션 하나, 또는 새 세션을 만들어 실행
  target_session text references public.control_sessions(id),
  new_session boolean not null default false,
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  delivery_note text check (delivery_note is null or length(delivery_note) <= 500),
  constraint control_messages_target check (not (new_session and target_session is not null)),
  -- 사람의 답·지시만 전달 대상이 된다
  constraint control_messages_delivery check (author = 'user' or (target_session is null and not new_session))
);
create index control_messages_request on public.control_messages (request_id, id);
create index control_messages_pending on public.control_messages (id) where author = 'user' and delivered_at is null;

-- 요청: 종류·작성 정보는 바꾸지 않는다. 지우지 않고 '접음(dropped)'으로 둔다.
create or replace function private.control_request_touch() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'control_requests: 지우지 않고 접음으로 둡니다.' using errcode = 'P0001';
  end if;
  if new.kind is distinct from old.kind or new.no is distinct from old.no or new.author is distinct from old.author
     or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'control_requests: 종류와 작성 정보는 바꿀 수 없습니다.' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger control_requests_touch before update or delete on public.control_requests
  for each row execute function private.control_request_touch();

-- 메시지: 추가만. '전달됨' 표시는 비어 있을 때 한 번만 채운다.
create or replace function private.control_message_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'control_messages: 대화 기록은 지울 수 없습니다.' using errcode = 'P0001';
  end if;
  if old.delivered_at is not null or new.delivered_at is null
     or (to_jsonb(new) - 'delivered_at' - 'delivery_note') is distinct from (to_jsonb(old) - 'delivered_at' - 'delivery_note') then
    raise exception 'control_messages: 대화 기록은 고칠 수 없습니다(전달됨 표시만 한 번).' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger control_messages_guard before update or delete on public.control_messages
  for each row execute function private.control_message_guard();

create or replace function private.control_session_touch() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'control_sessions: 지우지 않고 끝남(active=false)으로 둡니다.' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger control_sessions_touch before update or delete on public.control_sessions
  for each row execute function private.control_session_touch();

-- ── 사람(전체 관리자) ────────────────────────────────────
alter table public.control_sessions enable row level security;
alter table public.control_requests enable row level security;
alter table public.control_messages enable row level security;
grant select, insert, update on public.control_sessions, public.control_requests to authenticated;
grant select, insert on public.control_messages to authenticated;
create policy control_sessions_admin on public.control_sessions for all to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy control_requests_admin_read on public.control_requests for select to authenticated using (app.is_platform_admin());
create policy control_requests_admin_insert on public.control_requests for insert to authenticated
  with check (app.is_platform_admin() and author = 'user');
create policy control_requests_admin_update on public.control_requests for update to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());
-- 사람은 자기 이름(user)으로만 쓴다. control·session 작성은 아래 명령 함수(점검 토큰)만.
create policy control_messages_read on public.control_messages for select to authenticated
  using (app.is_platform_admin());
create policy control_messages_write on public.control_messages for insert to authenticated
  with check (app.is_platform_admin() and author = 'user' and author_session is null);
revoke delete, truncate, references, trigger on public.control_sessions, public.control_requests, public.control_messages from authenticated;
revoke all on public.control_sessions, public.control_requests, public.control_messages from anon;

-- ── Claude 세션 (점검 토큰) ─────────────────────────────
-- 명령 함수는 제한 역할 control_writer(로그인·BYPASSRLS 없음)가 소유하고, 이 역할의 RLS는 관제 표만 허용한다.
-- 토큰 요청은 표 권한이 없는 agent_request 역할로 돌며(ADR 0012와 같은 문), control 스키마 함수만 부른다.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'control_writer') then
    create role control_writer nologin nosuperuser nobypassrls nocreaterole nocreatedb noinherit noreplication;
  end if;
  if not (select rolsuper from pg_roles where rolname = current_user) then
    if current_setting('server_version_num')::int >= 160000 then
      if not pg_has_role(current_user, 'control_writer', 'SET') then
        execute format('grant control_writer to %I with inherit false, set true', current_user);
      end if;
    elsif not pg_has_role(current_user, 'control_writer', 'MEMBER') then
      execute format('grant control_writer to %I', current_user);
    end if;
  end if;
  if pg_has_role('authenticated', 'control_writer', 'MEMBER') or pg_has_role('anon', 'control_writer', 'MEMBER')
     or pg_has_role('agent_request', 'control_writer', 'MEMBER') then
    raise exception 'authenticated/anon/agent_request 가 control_writer 의 구성원이면 안 됩니다.';
  end if;
end $$;

grant usage on schema private to control_writer;
grant select, insert, update on public.control_sessions, public.control_requests to control_writer;
grant select, insert on public.control_messages to control_writer;
grant update (delivered_at, delivery_note) on public.control_messages to control_writer;
grant select (id, title, body) on public.platform_items to control_writer;
create policy control_sessions_writer on public.control_sessions for all to control_writer using (true) with check (true);
create policy control_requests_writer_read on public.control_requests for select to control_writer using (true);
create policy control_requests_writer_insert on public.control_requests for insert to control_writer
  with check (author in ('control', 'session'));
-- 상태만 바꾼다(제목·내용은 함수가 건드리지 않음). 사람이 만든 지시의 '전달됨'도 이 길로 표시한다.
create policy control_requests_writer_update on public.control_requests for update to control_writer using (true) with check (true);
create policy control_messages_writer_read on public.control_messages for select to control_writer using (true);
create policy control_messages_writer_insert on public.control_messages for insert to control_writer
  with check (author in ('control', 'session'));
create policy control_messages_writer_deliver on public.control_messages for update to control_writer
  using (author = 'user') with check (author = 'user');
create policy platform_items_control_read on public.platform_items for select to control_writer using (true);
grant execute on function private.inspector_user_for(text) to control_writer;
grant update (last_used_at) on private.inspector_tokens to control_writer;
grant select on private.inspector_tokens to control_writer;

create schema if not exists control;
revoke all on schema control from public;
grant usage on schema control to agent_request, control_writer;
grant create on schema control to control_writer;

-- 토큰 확인. 실패하면 28000(인증 실패)
create or replace function control.enter(p_token text) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if p_token is null or p_token !~ '^insp_[0-9a-f]{64}$' or private.inspector_user_for(p_token) is null then
    raise exception '점검 토큰이 올바르지 않거나, 기한이 지났거나, 폐기되었습니다.' using errcode = '28000';
  end if;
end $$;

create or replace function private.control_request_json(r public.control_requests) returns jsonb
language sql stable set search_path = pg_catalog, public, pg_temp as $$
  select jsonb_build_object('id', r.id, 'no', r.no, 'kind', r.kind, 'title', r.title, 'detail', r.detail, 'options', r.options,
    'recommended', r.recommended, 'reversible', r.reversible, 'related', r.related, 'status', r.status,
    'source_session', r.source_session, 'lab_item_id', r.lab_item_id, 'created_at', r.created_at, 'updated_at', r.updated_at)
$$;

-- 전달할 지시: 사람이 남긴 답·지시 가운데 아직 전달하지 않은 것 (오래된 것부터)
create or replace function control.inbox(p_token text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare result jsonb;
begin
  perform control.enter(p_token);
  select coalesce(jsonb_agg(jsonb_build_object(
      'message_id', m.id, 'kind', m.kind, 'choice', m.choice,
      'choice_label', (select o ->> 'label' from jsonb_array_elements(r.options) o where o ->> 'key' = m.choice limit 1),
      'body', m.body, 'target_session', m.target_session, 'target_name', s.name, 'new_session', m.new_session,
      'created_at', m.created_at, 'request', private.control_request_json(r),
      'lab_item', case when i.id is null then null else jsonb_build_object('title', i.title, 'body', i.body) end
    ) order by m.id), '[]')
    into result
    from public.control_messages m
    join public.control_requests r on r.id = m.request_id
    left join public.control_sessions s on s.id = m.target_session
    left join public.platform_items i on i.id = r.lab_item_id
   where m.author = 'user' and m.delivered_at is null and (m.target_session is not null or m.new_session);
  return result;
end $$;

create or replace function control.requests(p_token text, p_status text default null) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare result jsonb;
begin
  perform control.enter(p_token);
  select coalesce(jsonb_agg(private.control_request_json(r) || jsonb_build_object('messages',
      (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'author', m.author, 'author_session', m.author_session, 'kind', m.kind,
         'choice', m.choice, 'body', m.body, 'target_session', m.target_session, 'new_session', m.new_session,
         'created_at', m.created_at, 'delivered_at', m.delivered_at) order by m.id), '[]')
         from public.control_messages m where m.request_id = r.id)) order by r.no), '[]')
    into result
    from public.control_requests r
   where (p_status is null and r.status not in ('done', 'dropped')) or r.status = p_status;
  return result;
end $$;

create or replace function private.control_session_ref(p text) returns text
language plpgsql stable set search_path = pg_catalog, public, pg_temp as $$
begin
  if p is null or p = '' then return null; end if;
  if not exists (select 1 from public.control_sessions where id = p) then
    raise exception '등록되지 않은 세션입니다. 먼저 세션을 등록해 주세요.' using errcode = '22023';
  end if;
  return p;
end $$;

-- 결정 요청 올리기 (세션) — 같은 세션이 같은 제목으로 열린 요청이 있으면 새로 만들지 않고 그 요청을 돌려준다
create or replace function control.file_request(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare r public.control_requests; src text; st text; opts jsonb;
begin
  perform control.enter(p_token);
  src := private.control_session_ref(p ->> 'source_session');
  st := coalesce(nullif(p ->> 'status', ''), case when (p ->> 'reversible')::boolean then 'proceeding' when (p ->> 'reversible')::boolean = false then 'parked' else 'open' end);
  if st not in ('open', 'proceeding', 'parked') then raise exception '새 요청의 상태는 열림·추천안 진행 중·보류 가운데 하나입니다.' using errcode = '22023'; end if;
  opts := coalesce(p -> 'options', '[]'::jsonb);
  if jsonb_typeof(opts) <> 'array' or exists (select 1 from jsonb_array_elements(opts) o
       where jsonb_typeof(o) <> 'object' or coalesce(o ->> 'key', '') !~ '^[A-Za-z0-9_-]{1,20}$' or length(trim(coalesce(o ->> 'label', ''))) not between 1 and 200) then
    raise exception '선택지는 [{key, label, detail}] 모양으로 보내 주세요.' using errcode = '22023';
  end if;
  if p ->> 'recommended' is not null and not exists (select 1 from jsonb_array_elements(opts) o where o ->> 'key' = p ->> 'recommended') then
    raise exception '추천안(recommended)은 선택지 key 가운데 하나여야 합니다.' using errcode = '22023';
  end if;
  select * into r from public.control_requests x
   where x.source_session is not distinct from src and x.title = trim(p ->> 'title') and x.status in ('open', 'proceeding', 'parked') limit 1;
  if found then return private.control_request_json(r) || jsonb_build_object('existing', true); end if;
  insert into public.control_requests(kind, title, detail, options, recommended, reversible, related, source_session, status, author, created_by)
    values ('decision', trim(coalesce(p ->> 'title', '')), coalesce(p ->> 'detail', ''), opts, nullif(p ->> 'recommended', ''),
            (p ->> 'reversible')::boolean, coalesce(p ->> 'related', ''), src, st,
            case when src is null then 'control' else 'session' end, '0c1a0de0-0000-4000-8000-000000000001')
    returning * into r;
  return private.control_request_json(r);
end $$;

-- 보고·메모 남기기 (세션·관제). status 를 주면 요청 상태도 바꾼다(끝남·보류·추천안 진행 중 등)
create or replace function control.post(p_token text, p_request uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare who text; k text; st text; sess text; mid bigint;
begin
  perform control.enter(p_token);
  if not exists (select 1 from public.control_requests where id = p_request) then
    raise exception '요청을 찾을 수 없습니다.' using errcode = '22023';
  end if;
  sess := private.control_session_ref(p ->> 'author_session');
  who := case when sess is null then 'control' else 'session' end;
  k := coalesce(nullif(p ->> 'kind', ''), 'report');
  if k not in ('report', 'note', 'status') then raise exception '세션은 보고·메모·상태만 남깁니다.' using errcode = '22023'; end if;
  st := nullif(p ->> 'status', '');
  if st is not null and st not in ('open', 'proceeding', 'parked', 'delivered', 'done', 'dropped') then
    raise exception '상태 값이 올바르지 않습니다.' using errcode = '22023';
  end if;
  if k = 'status' and st is null then raise exception '상태 메시지에는 status 가 필요합니다.' using errcode = '22023'; end if;
  insert into public.control_messages(request_id, author, author_session, kind, choice, body, created_by)
    values (p_request, who, sess, k, st, coalesce(p ->> 'body', ''), '0c1a0de0-0000-4000-8000-000000000001')
    returning id into mid;
  if st is not null then update public.control_requests set status = st where id = p_request; end if;
  return jsonb_build_object('id', mid, 'status', st);
end $$;

-- 전달됨 표시 (관제가 send_message·create_session 뒤에)
create or replace function control.mark_delivered(p_token text, p_message bigint, p_note text default null) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare rid uuid;
begin
  perform control.enter(p_token);
  update public.control_messages set delivered_at = now(), delivery_note = left(nullif(trim(coalesce(p_note, '')), ''), 500)
   where id = p_message and author = 'user' and delivered_at is null
   returning request_id into rid;
  if rid is null then raise exception '전달할 지시를 찾을 수 없거나 이미 전달했습니다.' using errcode = '22023'; end if;
  -- 이 요청에 전달할 지시가 더 없으면 '세션에 전달됨'
  if not exists (select 1 from public.control_messages m where m.request_id = rid and m.author = 'user' and m.delivered_at is null
                   and (m.target_session is not null or m.new_session)) then
    update public.control_requests set status = 'delivered' where id = rid and status = 'answered';
  end if;
  return jsonb_build_object('ok', true, 'request_id', rid);
end $$;

-- 세션 등록·갱신 (관제가 세션을 만들면 등록한다. 사람이 고를 수 있게 목록에 보인다)
create or replace function control.register_session(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare sid text := p ->> 'id';
begin
  perform control.enter(p_token);
  if sid is null or sid !~ '^session_[A-Za-z0-9]{8,64}$' then raise exception '세션 id 형식이 올바르지 않습니다.' using errcode = '22023'; end if;
  insert into public.control_sessions(id, name, role, tags, active)
    values (sid, trim(coalesce(p ->> 'name', sid)), coalesce(p ->> 'role', ''),
            coalesce(array(select jsonb_array_elements_text(p -> 'tags')), '{}'), coalesce((p ->> 'active')::boolean, true))
  on conflict (id) do update set
    name = case when nullif(trim(p ->> 'name'), '') is not null then excluded.name else control_sessions.name end,
    role = case when p ? 'role' then excluded.role else control_sessions.role end,
    tags = case when p ? 'tags' then excluded.tags else control_sessions.tags end,
    active = case when p ? 'active' then excluded.active else control_sessions.active end;
  return jsonb_build_object('ok', true, 'id', sid);
end $$;

create or replace function control.sessions(p_token text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform control.enter(p_token);
  return (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'role', s.role, 'tags', s.tags, 'active', s.active) order by s.active desc, s.created_at), '[]')
            from public.control_sessions s);
end $$;

-- 권한 정리 → 소유자를 control_writer 로 (ADR 0012 와 같은 순서)
do $$
declare f text;
begin
  foreach f in array array[
    'control.enter(text)', 'control.inbox(text)', 'control.requests(text, text)', 'control.file_request(text, jsonb)',
    'control.post(text, uuid, jsonb)', 'control.mark_delivered(text, bigint, text)', 'control.register_session(text, jsonb)',
    'control.sessions(text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    if f <> 'control.enter(text)' then execute format('grant execute on function %s to agent_request', f); end if;
    execute format('alter function %s owner to control_writer', f);
  end loop;
  foreach f in array array['private.control_request_json(public.control_requests)', 'private.control_session_ref(text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to control_writer', f);
  end loop;
end $$;
grant execute on function control.enter(text) to control_writer;
revoke create on schema control from control_writer;

-- ── 시작 내용: 2026-11-23 결정 요청함(docs/automation/DECISIONS.md)과 세션 목록 ──
-- 세션 id 는 비밀이 아니다(관제가 send_message 로 쓰는 주소). 실제 학생·교직원 정보는 없다.
do $$
declare sys uuid := '00000000-0000-0000-0000-000000000000';
begin
  if exists (select 1 from public.control_requests) then return; end if;
  insert into public.control_sessions(id, name, role, tags) values
    ('session_013RZyUnii47zkGXkmqAhPmt', '학교 플랫폼 전체 (관제)', '방향·결정 기록·조정, 지시 전달', '{school-platform}'),
    ('session_013RZyUq3bukJr2ggdSiQ2vt', '룽아룬숙사 홈페이지', '새벽빛 디자인 충실도, 동화 자료 정리', '{school:rungarunsuksa}'),
    ('session_013RZyUqUFVPBGjdxpiXsrU2', '학교 자율 편집 개발', 'ADR 0011 실시간 화면 편집', '{adr-0011}'),
    ('session_013RZyUoGcTChpSHJuksgDH3', '외부 작업 토큰 + 동화 PDF', 'ADR 0012·0014 토큰, 학교 AI 작업 공간', '{adr-0012}'),
    ('session_013RZyUomAv7AE6YjhpHp6Kc', '자동 개발(매시간)', 'QUEUE.md 자동 허용 항목, PR까지', '{}');

  insert into public.control_requests(kind, title, detail, options, recommended, reversible, related, source_session, status, author, created_by) values
    ('decision', '자동 실행 작업 단위를 GitHub 이슈로 옮길지',
     E'지금은 docs/automation/QUEUE.md 표 하나로 자동 실행 할 일을 관리합니다. 동시 편집 충돌이 나고 PR 상태와 이중 관리가 됩니다.\n이슈로 옮기면 이슈 1건 = 작업 1건, 라벨 auto-ok(자동 허용)·needs-decision(승인 필요)로 나눕니다. 이슈 만들기는 선생님 계정 이름으로 GitHub에 올라갑니다.',
     '[{"key":"A2","label":"GitHub 이슈 + 라벨","detail":"충돌 없음, Codex도 같은 이슈를 봄. 처음 라벨 만들기만 승인"},{"key":"A1","label":"QUEUE.md 유지","detail":"지금 그대로"},{"key":"A3","label":"GitHub 프로젝트 보드까지","detail":"한눈에 보이나 1인 운영엔 과할 수 있음"}]',
     'A2', false, 'ADR 0009 ①', 'session_013RZyUnii47zkGXkmqAhPmt', 'open', 'control', sys),
    ('decision', '문서·시험만 바꾼 자동 PR의 자동 병합',
     E'자동 실행 PR이 3개 쌓이면 실행이 멈춥니다. 바뀐 파일이 docs/(결정 기록 제외)·tests/뿐이고 CI가 통과하면 자동 실행이 스스로 병합하게 할지 묻습니다.\nsrc/·supabase/·scripts/·AGENTS.md·docs/decisions/ 변경은 계속 사람 지시로만 병합합니다.',
     '[{"key":"B2","label":"좁은 위임 병합","detail":"문서·시험만 자동 병합"},{"key":"B1","label":"지금 그대로","detail":"자동 PR은 사람 지시로만 병합"},{"key":"B3","label":"GitHub auto-merge + 보호 규칙","detail":"저장소 설정 변경 필요"}]',
     'B2', false, 'ADR 0009 ②', 'session_013RZyUnii47zkGXkmqAhPmt', 'open', 'control', sys),
    ('decision', '매시간 자동 실행을 실행마다 새 세션으로',
     E'지금은 예약 작업이 같은 세션에 이어서 보내 대화가 계속 길어집니다(실행당 비용이 늘어나는 구조로 추정, 측정 안 함).\n실행마다 새 세션을 만들면 출발점이 같고 비용이 일정하지만, 이어갈 정보는 인계 문서에서만 읽습니다.',
     '[{"key":"C2","label":"실행마다 새 세션","detail":"비용 일정, 인계 문서 품질이 곧 연속성"},{"key":"C1","label":"같은 세션 이어 쓰기","detail":"지금 그대로"},{"key":"C3","label":"GitHub 이벤트 트리거 추가","detail":"리뷰가 오면 바로 반영"}]',
     'C2', false, 'ADR 0009 ③', 'session_013RZyUnii47zkGXkmqAhPmt', 'open', 'control', sys),
    ('decision', '사진 공개 허가(학생·보호자·학교) 확인 기능',
     E'학교 홈페이지에 학생 사진을 올릴 때 허가를 확인하는 장치가 없습니다. 허가 전에는 게시를 막을지 정해야 합니다.\n개인정보 공개 범위 규칙이라 선생님 결정이 필요하고, 사진 표 변경(마이그레이션)이 따릅니다.',
     '[{"key":"gate","label":"허가 전 게시 막기 + 사진 표에 허가 기록","detail":"되돌리기 쉬움, 운영 부담 조금"},{"key":"notice","label":"학교 관리자 책임 안내만","detail":"장치 없음"}]',
     'gate', false, 'docs/rounds/round-35.md', 'session_013RZyUqUFVPBGjdxpiXsrU2', 'parked', 'session', sys),
    ('decision', '대화형 편집(Claude API, 유료) 착수',
     E'학교 관리자가 대화로 홈페이지를 고치는 2단계입니다. Claude API는 사용량만큼 요금이 듭니다.\n먼저 무료로 프롬프트와 학교당 월 비용 추정 문서를 만들고, 그 뒤 착수 여부를 정하는 순서를 추천합니다.',
     '[{"key":"estimate","label":"비용 추정 문서 먼저 (무료)","detail":"과금 전 확인"},{"key":"now","label":"바로 착수","detail":"API 키·요금 필요"},{"key":"later","label":"미룸"}]',
     'estimate', false, 'ADR 0011 2단계', 'session_013RZyUnii47zkGXkmqAhPmt', 'parked', 'control', sys),
    ('decision', '룽아룬숙사 옛 주소 넘겨주기 시점',
     E'옛 사이트(rungarunsuksa.vercel.app)를 새 주소(/s/rungarunsuksa)로 넘기는 판이 선생님 Mac에 준비돼 있습니다.\n넘기면 옛 사이트 편집을 멈추고 묶음을 다시 만든 뒤 307(임시)로 시작해 하루 뒤 308(영구)로 바꿉니다.',
     '[{"key":"wait","label":"선생님이 넘기라고 할 때","detail":"지금은 대기"},{"key":"now","label":"지금 넘기기","detail":"옛 사이트 편집 중지 필요"}]',
     'wait', false, 'docs/rounds/round-31.md', 'session_013RZyUq3bukJr2ggdSiQ2vt', 'parked', 'session', sys),
    ('decision', '동화 성품 이름',
     E'성품 동화마다 다루는 성품 이름(예: 정직, 배려)을 붙입니다. 편집 화면에서 바로 입력할 수 있습니다(33차).',
     '[{"key":"teacher","label":"선생님이 편집 화면에서 입력"},{"key":"draft","label":"세션이 안을 만들어 시안으로","detail":"공개는 선생님이"}]',
     'teacher', true, '33차', 'session_013RZyUq3bukJr2ggdSiQ2vt', 'open', 'session', sys),
    ('decision', '룽아룬숙사 공식 태국어 이름',
     E'홈페이지에 쓰는 학교 태국어 이름이 공식 표기인지 확인이 필요합니다.',
     '[{"key":"school","label":"학교가 알려 주는 이름으로 바꿈"},{"key":"keep","label":"지금 표기 유지"}]',
     'school', true, '', 'session_013RZyUq3bukJr2ggdSiQ2vt', 'open', 'session', sys),
    ('decision', '드리미학교 학생 작품 3편·#1185 공개 여부',
     E'학생 작품을 공개 홈페이지에 올릴지 정합니다. 학생·보호자 허가가 필요한 개인정보 공개 범위 문제입니다.',
     '[{"key":"consent","label":"보호자 허가 확인 뒤 공개"},{"key":"private","label":"비공개 유지"}]',
     'consent', false, '', 'session_013RZyUq3bukJr2ggdSiQ2vt', 'parked', 'session', sys);
end $$;
