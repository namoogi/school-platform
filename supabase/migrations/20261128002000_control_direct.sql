-- 133차: 관제가 세션에 직접 지시를 남긴다 (ADR 0050)
-- 선생님 2026-11-28: "너가 관제인데 왜 하위 세션을 관리를 못하는거지?"
--
--  · 지금까지 세션이 당겨 오는 일(/api/control/mine)은 '사람이 쓴 글'만이었다(39차). 관제의 지시는 send_message 로만 갔고,
--    신뢰 기기 확인이 걸린 세션에는 닿지 않았다.
--  · control.direct: 관제가 세션 앞으로 지시(kind 'directive', author 'control')를 남긴다. 새 지시 묶음을 만들거나,
--    이미 그 세션이 맡은 요청에 덧붙인다. 작성자는 '관제'로 남는다(사람이 쓴 것처럼 꾸미지 않는다).
--  · /mine 은 사람 글과 같이 관제 지시도 '그 뒤에 내 답이 없으면' 돌려준다(앱 쪽).

select set_config('request.jwt.claims', '{}', true);

grant create on schema control to control_writer;
set local role control_writer;

create or replace function control.direct(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare r public.control_requests; sess text; rid uuid; body text; ttl text; sch uuid; mid bigint;
begin
  perform control.enter(p_token);
  sess := private.control_session_ref(p ->> 'session');
  if sess is null then raise exception '지시를 받을 세션(session)이 필요합니다.' using errcode = '22023'; end if;
  if not exists (select 1 from public.control_sessions where id = sess and active) then
    raise exception '지시를 받을 세션이 활성 상태가 아닙니다.' using errcode = '22023';
  end if;
  body := trim(coalesce(p ->> 'body', ''));
  if body = '' or length(body) > 20000 then raise exception '지시 본문(body)이 필요합니다(20000자 이내).' using errcode = '22023'; end if;

  if nullif(p ->> 'request', '') is not null then
    -- 이미 있는 요청에 덧붙인다: 그 세션이 맡은(또는 올린) 요청이어야 한다
    -- 형식이 틀린 값을 그대로 캐스팅하면 입력값이 담긴 오류(22P02)가 기록에 남는다. 값 없는 문구로 거부한다
    if (p ->> 'request') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception '요청을 찾을 수 없습니다.' using errcode = '22023';
    end if;
    rid := (p ->> 'request')::uuid;
    select * into r from public.control_requests x where x.id = rid;
    if not found then raise exception '요청을 찾을 수 없습니다.' using errcode = '22023'; end if;
    if coalesce(r.assignee_session, r.source_session) is distinct from sess then
      raise exception '그 요청을 맡은 세션에게만 덧붙일 수 있습니다. 먼저 맡을 세션을 정하세요(assign).' using errcode = '22023';
    end if;
  else
    ttl := trim(coalesce(p ->> 'title', ''));
    if length(ttl) not between 1 and 200 then raise exception '지시 제목(title)이 필요합니다(200자 이내).' using errcode = '22023'; end if;
    -- 학교 세션이면 그 학교 대화로 둔다(학교 관리자 대화창에도 보임). 아니면 관제 주제
    select s.school_id into sch from public.control_sessions s where s.id = sess;
    insert into public.control_requests(kind, title, detail, related, source_session, assignee_session, school_id, topic, status, author, created_by)
      values ('directive', ttl, '', left(coalesce(p ->> 'related', ''), 500), null, sess, sch,
              case when sch is null then 'control' else 'school_ai' end, 'delivered', 'control', '0c1a0de0-0000-4000-8000-000000000001')
      returning * into r;
  end if;
  insert into public.control_messages(request_id, author, kind, body, created_by)
    values (r.id, 'control', 'directive', body, '0c1a0de0-0000-4000-8000-000000000001')
    returning id into mid;
  if r.status in ('done', 'dropped', 'answered', 'review', 'open', 'parked', 'proceeding') and r.kind <> 'decision' then
    update public.control_requests set status = 'delivered' where id = r.id returning * into r;
  end if;
  return private.control_request_json(r) || jsonb_build_object('message_id', mid, 'to', sess);
end $$;

revoke all on function control.direct(text, jsonb) from public, anon, authenticated;
grant execute on function control.direct(text, jsonb) to agent_request;

reset role;
revoke create on schema control from control_writer;
