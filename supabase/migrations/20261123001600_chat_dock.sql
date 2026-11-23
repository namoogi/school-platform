-- 40차: 어디서나 여는 대화창 (ADR 0016) — 관제 센터 위에 학교 관리자 대화를 더한다
-- 전체 관리자와 학교 관리자가 어느 화면에서든 대화창을 열어 관제 센터 · 학교 AI · 홈페이지 인터페이스 · 시스템 기능을 두고
-- 세션과 대화한다. 답은 그 대화를 맡은 Claude 세션이 점검 토큰 API(control.*)로 남긴다(유료 API 자동 답변은 아직 없음).
--
--  · 대화 = control_requests 한 건(kind 'chat'). 학교 대화는 school_id 를 갖고, RLS가 그 학교 관리자에게만 읽기·쓰기를 연다.
--  · 학교 관리자의 '시스템 기능' 대화는 승인 대기(pending)로 들어가고, 전체 관리자가 승인해야 세션에 전달된다.
--  · 사람이 보낸 글은 deliver=true 이면 전달 대상이다. 받을 세션이 비어 있으면 관제가 정한다.
--  · 결과 확인(review): 세션이 끝났다고 하면 사람이 '확인 완료' 또는 '다시 수정 요청'을 누른다(옛 개선 요청 판 방식).

-- ── 표 바꾸기 ─────────────────────────────────────────────
alter table public.control_sessions
  add column school_id uuid references public.schools(id);

alter table public.control_requests
  add column school_id uuid references public.schools(id),
  add column topic text not null default 'control' check (topic in ('control', 'school_ai', 'site_ui', 'system')),
  add column assignee_session text references public.control_sessions(id);
alter table public.control_requests drop constraint control_requests_kind_check;
alter table public.control_requests add constraint control_requests_kind_check check (kind in ('decision', 'directive', 'chat'));
alter table public.control_requests drop constraint control_requests_status_check;
alter table public.control_requests add constraint control_requests_status_check
  check (status in ('pending', 'open', 'proceeding', 'parked', 'answered', 'delivered', 'review', 'done', 'dropped'));
-- 학교 주제(학교 AI·홈페이지)는 학교가 있어야 하고, 관제 주제는 학교가 없다
alter table public.control_requests add constraint control_requests_topic_school
  check ((topic in ('school_ai', 'site_ui') and school_id is not null) or (topic = 'control' and school_id is null) or topic = 'system');
create index control_requests_school on public.control_requests (school_id, status) where school_id is not null;

alter table public.control_messages
  add column school_id uuid references public.schools(id),
  add column deliver boolean not null default false;
-- 이미 있는 기록: 사람의 답·지시 가운데 받을 곳이 있던 것만 전달 대상이었다
alter table public.control_messages disable trigger control_messages_guard;
update public.control_messages set deliver = (author = 'user' and (target_session is not null or new_session));
alter table public.control_messages enable trigger control_messages_guard;
alter table public.control_messages drop constraint control_messages_delivery;
alter table public.control_messages add constraint control_messages_delivery
  check (author = 'user' or (not deliver and target_session is null and not new_session));
alter table public.control_messages add constraint control_messages_deliver_target
  check (deliver or (target_session is null and not new_session));
alter table public.control_messages drop constraint control_messages_kind_check;
alter table public.control_messages add constraint control_messages_kind_check
  check (kind in ('message', 'answer', 'directive', 'report', 'note', 'status'));
drop index public.control_messages_pending;
create index control_messages_pending on public.control_messages (id) where author = 'user' and deliver and delivered_at is null;

-- 메시지의 학교는 그 대화의 학교를 그대로 따른다(사람·세션이 다른 학교를 적을 수 없다)
create or replace function private.control_message_school() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  select r.school_id into new.school_id from public.control_requests r where r.id = new.request_id;
  return new;
end $$;
create trigger control_messages_school before insert on public.control_messages
  for each row execute function private.control_message_school();

-- 학교 관리자는 승인 대기를 스스로 풀거나, 대화의 학교·주제를 바꾸지 못한다
-- security definer: 세션 경로(control_writer, 사용자 클레임 없음)에서도 app.* 를 부를 수 있게. 판정은 호출자의 클레임(app.uid())으로 한다
create or replace function private.control_request_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.school_id is distinct from old.school_id or new.topic is distinct from old.topic then
    if not app.is_platform_admin() and app.uid() is not null then
      raise exception '대화의 학교·주제는 바꿀 수 없습니다.' using errcode = '42501';
    end if;
  end if;
  if old.status = 'pending' and new.status not in ('pending', 'dropped') and app.uid() is not null and not app.is_platform_admin() then
    raise exception '시스템 기능 요청은 전체 관리자가 승인합니다.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger control_requests_guard before update on public.control_requests
  for each row execute function private.control_request_guard();

-- ── 사람(전체 관리자 · 그 학교 관리자) ─────────────────────
drop policy control_requests_admin_read on public.control_requests;
drop policy control_requests_admin_insert on public.control_requests;
drop policy control_requests_admin_update on public.control_requests;
create policy control_requests_read on public.control_requests for select to authenticated
  using (app.is_platform_admin() or (school_id is not null and app.is_school_admin(school_id)));
create policy control_requests_insert on public.control_requests for insert to authenticated
  with check (author = 'user' and (app.is_platform_admin()
    or (school_id is not null and topic <> 'control' and app.is_school_admin(school_id)
        and (topic <> 'system' or status = 'pending'))));
create policy control_requests_update on public.control_requests for update to authenticated
  using (app.is_platform_admin() or (school_id is not null and app.is_school_admin(school_id)))
  with check (app.is_platform_admin() or (school_id is not null and app.is_school_admin(school_id)));

drop policy control_messages_read on public.control_messages;
drop policy control_messages_write on public.control_messages;
create policy control_messages_read on public.control_messages for select to authenticated
  using (app.is_platform_admin() or (school_id is not null and app.is_school_admin(school_id)));
create policy control_messages_write on public.control_messages for insert to authenticated
  with check (author = 'user' and author_session is null
    and (app.is_platform_admin() or (school_id is not null and app.is_school_admin(school_id))));

-- 학교 관리자는 자기 학교를 맡은 세션 이름만 본다(받는 곳 표시용)
create policy control_sessions_school_read on public.control_sessions for select to authenticated
  using (school_id is not null and app.is_school_admin(school_id));

-- 글쓴 사람 이름(표시용): 전체 관리자, 또는 같은 학교 관리자에게만
create or replace function app.chat_author_name(p_user uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select u.display_name from private.app_users u
   where u.id = p_user and (app.is_platform_admin() or exists (
     select 1 from public.memberships m where m.user_id = p_user and app.is_school_admin(m.school_id)))
$$;
revoke all on function app.chat_author_name(uuid) from public, anon;
grant execute on function app.chat_author_name(uuid) to authenticated;

-- ── Claude 세션 (control_writer) ──────────────────────────
grant select (id, slug, name) on public.schools to control_writer;
create policy schools_control_read on public.schools for select to control_writer using (true);
grant execute on function private.control_message_school() to control_writer;

-- 마이그레이션 사용자 소유(private) 함수는 역할을 바꾸기 전에 고친다
create or replace function private.control_request_json(r public.control_requests) returns jsonb
language sql stable set search_path = pg_catalog, public, pg_temp as $$
  select jsonb_build_object('id', r.id, 'no', r.no, 'kind', r.kind, 'title', r.title, 'detail', r.detail, 'options', r.options,
    'recommended', r.recommended, 'reversible', r.reversible, 'related', r.related, 'status', r.status, 'topic', r.topic,
    'school_id', r.school_id, 'school', (select jsonb_build_object('slug', s.slug, 'name', s.name) from public.schools s where s.id = r.school_id),
    'source_session', r.source_session, 'assignee_session', r.assignee_session, 'lab_item_id', r.lab_item_id,
    'created_at', r.created_at, 'updated_at', r.updated_at)
$$;

create or replace function private.control_school_ref(p text) returns uuid
language plpgsql stable set search_path = pg_catalog, public, pg_temp as $$
declare sid uuid;
begin
  if p is null or p = '' then return null; end if;
  select s.id into sid from public.schools s where s.slug = p or s.id::text = p;
  if sid is null then raise exception '학교를 찾을 수 없습니다(slug).' using errcode = '22023'; end if;
  return sid;
end $$;

revoke all on function private.control_school_ref(text) from public, anon, authenticated;
grant execute on function private.control_school_ref(text) to control_writer;

grant create on schema control to control_writer;
-- 함수는 control_writer 소유다. 마이그레이션 사용자는 이 역할로 SET ROLE 만 할 수 있으므로 바꿔서 다시 만든다(ADR 0012와 같은 이유)
set local role control_writer;

-- 전달할 글: 사람이 보낸 글 가운데 아직 전달하지 않은 것. 승인 대기 대화는 빼고, 대화 최근 10줄을 함께 준다.
-- target_session 이 비어 있으면 관제가 받을 곳을 정한다(assign → 전달).
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
      'recent', (select coalesce(jsonb_agg(x.j order by x.id), '[]') from (
          select h.id, jsonb_build_object('id', h.id, 'author', h.author, 'author_session', h.author_session, 'kind', h.kind,
                   'choice', h.choice, 'body', left(h.body, 2000), 'created_at', h.created_at) as j
            from public.control_messages h where h.request_id = r.id and h.id < m.id order by h.id desc limit 10) x),
      'lab_item', case when i.id is null then null else jsonb_build_object('title', i.title, 'body', i.body) end
    ) order by m.id), '[]')
    into result
    from public.control_messages m
    join public.control_requests r on r.id = m.request_id
    left join public.control_sessions s on s.id = m.target_session
    left join public.platform_items i on i.id = r.lab_item_id
   where m.author = 'user' and m.deliver and m.delivered_at is null and r.status <> 'pending';
  return result;
end $$;

-- 대화 하나 전체 (세션이 앞뒤 맥락을 읽을 때)
create or replace function control.thread(p_token text, p_request uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare r public.control_requests;
begin
  perform control.enter(p_token);
  select * into r from public.control_requests where id = p_request;
  if not found then raise exception '요청을 찾을 수 없습니다.' using errcode = '22023'; end if;
  return private.control_request_json(r) || jsonb_build_object('messages',
    (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'author', m.author, 'author_session', m.author_session, 'kind', m.kind,
       'choice', m.choice, 'body', m.body, 'target_session', m.target_session, 'new_session', m.new_session,
       'created_at', m.created_at, 'delivered_at', m.delivered_at) order by m.id), '[]')
       from public.control_messages m where m.request_id = r.id));
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

-- 결정 요청 올리기 — school(slug)·topic 을 주면 그 학교 관리자 대화창에도 보인다
create or replace function control.file_request(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare r public.control_requests; src text; st text; opts jsonb; sch uuid; tp text;
begin
  perform control.enter(p_token);
  src := private.control_session_ref(p ->> 'source_session');
  sch := private.control_school_ref(p ->> 'school');
  tp := coalesce(nullif(p ->> 'topic', ''), case when sch is null then 'control' else 'site_ui' end);
  if tp not in ('control', 'school_ai', 'site_ui', 'system') then raise exception '주제는 control·school_ai·site_ui·system 가운데 하나입니다.' using errcode = '22023'; end if;
  if tp = 'control' and sch is not null then raise exception '학교 일은 주제를 school_ai·site_ui·system 으로 올려 주세요.' using errcode = '22023'; end if;
  if tp in ('school_ai', 'site_ui') and sch is null then raise exception '학교 주제에는 school(slug)이 필요합니다.' using errcode = '22023'; end if;
  st := coalesce(nullif(p ->> 'status', ''), case when (p ->> 'reversible')::boolean then 'proceeding' when (p ->> 'reversible')::boolean = false then 'parked' else 'open' end);
  if st not in ('open', 'proceeding', 'parked') then raise exception '새 요청의 상태는 열림·추천안 진행 중·보류 가운데 하나입니다.' using errcode = '22023'; end if;
  opts := coalesce(p -> 'options', '[]'::jsonb);
  if jsonb_typeof(opts) <> 'array' or jsonb_array_length(opts) > 8 or exists (select 1 from jsonb_array_elements(opts) o
       where jsonb_typeof(o) <> 'object' or coalesce(o ->> 'key', '') !~ '^[A-Za-z0-9_-]{1,20}$' or length(trim(coalesce(o ->> 'label', ''))) not between 1 and 200) then
    raise exception '선택지는 [{key, label, detail}] 모양으로 보내 주세요(최대 8개).' using errcode = '22023';
  end if;
  if p ->> 'recommended' is not null and not exists (select 1 from jsonb_array_elements(opts) o where o ->> 'key' = p ->> 'recommended') then
    raise exception '추천안(recommended)은 선택지 key 가운데 하나여야 합니다.' using errcode = '22023';
  end if;
  select * into r from public.control_requests x
   where x.source_session is not distinct from src and x.title = trim(p ->> 'title') and x.status in ('open', 'proceeding', 'parked') limit 1;
  if found then return private.control_request_json(r) || jsonb_build_object('existing', true); end if;
  insert into public.control_requests(kind, title, detail, options, recommended, reversible, related, source_session, assignee_session,
                                      school_id, topic, status, author, created_by)
    values ('decision', trim(coalesce(p ->> 'title', '')), coalesce(p ->> 'detail', ''), opts, nullif(p ->> 'recommended', ''),
            (p ->> 'reversible')::boolean, coalesce(p ->> 'related', ''), src, src, sch, tp, st,
            case when src is null then 'control' else 'session' end, '0c1a0de0-0000-4000-8000-000000000001')
    returning * into r;
  return private.control_request_json(r);
end $$;

-- 답·보고·메모 (세션·관제). status: open(사람 답 필요)·review(결과 확인 필요)·done 등
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
  if k not in ('message', 'report', 'note', 'status') then raise exception '세션은 답·보고·메모·상태만 남깁니다.' using errcode = '22023'; end if;
  st := nullif(p ->> 'status', '');
  if st is not null and st not in ('open', 'proceeding', 'parked', 'delivered', 'review', 'done', 'dropped') then
    raise exception '상태 값이 올바르지 않습니다.' using errcode = '22023';
  end if;
  if k = 'status' and st is null then raise exception '상태 메시지에는 status 가 필요합니다.' using errcode = '22023'; end if;
  insert into public.control_messages(request_id, author, author_session, kind, choice, body, created_by)
    values (p_request, who, sess, k, st, coalesce(p ->> 'body', ''), '0c1a0de0-0000-4000-8000-000000000001')
    returning id into mid;
  if st is not null then update public.control_requests set status = st where id = p_request; end if;
  return jsonb_build_object('id', mid, 'status', st);
end $$;

-- 맡을 세션 정하기 (관제). 이 대화의 다음 글은 이 세션으로 간다
create or replace function control.assign(p_token text, p_request uuid, p_session text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare sess text;
begin
  perform control.enter(p_token);
  sess := private.control_session_ref(p_session);
  update public.control_requests set assignee_session = sess where id = p_request;
  if not found then raise exception '요청을 찾을 수 없습니다.' using errcode = '22023'; end if;
  return jsonb_build_object('ok', true, 'assignee_session', sess);
end $$;

-- 전달됨 표시: 받을 곳이 비어 있던 글은 관제가 정한 곳(session)을 함께 적는다
create or replace function control.mark_delivered(p_token text, p_message bigint, p_note text default null) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare rid uuid;
begin
  perform control.enter(p_token);
  update public.control_messages set delivered_at = now(), delivery_note = left(nullif(trim(coalesce(p_note, '')), ''), 500)
   where id = p_message and author = 'user' and deliver and delivered_at is null
   returning request_id into rid;
  if rid is null then raise exception '전달할 지시를 찾을 수 없거나 이미 전달했습니다.' using errcode = '22023'; end if;
  if not exists (select 1 from public.control_messages m where m.request_id = rid and m.author = 'user' and m.deliver and m.delivered_at is null) then
    update public.control_requests set status = 'delivered' where id = rid and status = 'answered';
  end if;
  return jsonb_build_object('ok', true, 'request_id', rid);
end $$;

create or replace function control.register_session(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare sid text := p ->> 'id'; sch uuid;
begin
  perform control.enter(p_token);
  if sid is null or sid !~ '^session_[A-Za-z0-9]{8,64}$' then raise exception '세션 id 형식이 올바르지 않습니다.' using errcode = '22023'; end if;
  sch := private.control_school_ref(p ->> 'school');
  insert into public.control_sessions(id, name, role, tags, active, school_id)
    values (sid, trim(coalesce(nullif(p ->> 'name', ''), sid)), coalesce(p ->> 'role', ''),
            coalesce(array(select jsonb_array_elements_text(p -> 'tags')), '{}'), coalesce((p ->> 'active')::boolean, true), sch)
  on conflict (id) do update set
    name = case when nullif(trim(p ->> 'name'), '') is not null then excluded.name else control_sessions.name end,
    role = case when p ? 'role' then excluded.role else control_sessions.role end,
    tags = case when p ? 'tags' then excluded.tags else control_sessions.tags end,
    active = case when p ? 'active' then excluded.active else control_sessions.active end,
    school_id = case when p ? 'school' then excluded.school_id else control_sessions.school_id end;
  return jsonb_build_object('ok', true, 'id', sid);
end $$;

create or replace function control.sessions(p_token text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform control.enter(p_token);
  return (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'role', s.role, 'tags', s.tags, 'active', s.active,
            'school', (select sc.slug from public.schools sc where sc.id = s.school_id)) order by s.active desc, s.created_at), '[]')
            from public.control_sessions s);
end $$;

-- 새 함수 권한은 소유자(control_writer)인 동안 정리한다(소유자가 아니면 Supabase 에서 권한 오류, #48)
do $$
declare f text;
begin
  foreach f in array array['control.thread(text, uuid)', 'control.assign(text, uuid, text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to agent_request', f);
  end loop;
end $$;

reset role;
revoke create on schema control from control_writer;


-- ── 시작 내용: 룽아룬숙사 세션이 그 학교를 맡는다(학교가 있을 때만; 예시 DB에는 없다) ──
update public.control_sessions s set school_id = sc.id
  from public.schools sc where s.id = 'session_013RZyUq3bukJr2ggdSiQ2vt' and sc.slug = 'rungarunsuksa';
-- 학교 일이던 결정 요청(동화 성품 이름·태국어 이름·학생 작품·옛 주소)은 그 학교 대화창에도 보이게 한다
update public.control_requests r set school_id = sc.id, topic = 'site_ui', assignee_session = r.source_session
  from public.schools sc
 where sc.slug = 'rungarunsuksa' and r.source_session = 'session_013RZyUq3bukJr2ggdSiQ2vt' and r.kind = 'decision'
   and r.title in ('동화 성품 이름', '룽아룬숙사 공식 태국어 이름', '룽아룬숙사 옛 주소 넘겨주기 시점');
update public.control_requests set assignee_session = source_session where assignee_session is null and source_session is not null;
