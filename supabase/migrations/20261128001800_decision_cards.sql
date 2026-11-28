-- 130차: 결정 카드 표준 (ADR 0048) — 사람이 읽고 바로 고를 수 있는 결정 요청
-- 선생님 2026-11-28: "결국 병목은 사람의 판단에서 일어나는 것인데 이 부분이 문제가 된다." → "그래. 그렇게 진행하고"
--
--  · 문 종류(door): one_way(되돌리기 어려움 → 사람을 기다림) · default(기한까지 반대 없으면 추천안으로 진행) · notice(알림만)
--  · 카드 칸: ask(예/아니오로 답할 한 줄 질문, 120자) · default_action(답이 없으면 할 일) · due_at(기한)
--             changes · unchanged · undo (승인하면 바뀌는 것 / 안 바뀌는 것 / 되돌리는 길, 각 한 줄)
--  · 세션이 올리는 결정 요청(control.file_request)은 이 칸을 갖춰야 한다. 빠지면 무엇이 빠졌는지와 안내 문서를 알려 준다.
--  · 사람이 쓰는 지시·대화와 이미 있는 요청은 그대로다(칸은 비어 있음).

select set_config('request.jwt.claims', '{}', true);

alter table public.control_requests
  add column door text check (door in ('one_way', 'default', 'notice')),
  add column ask text check (ask is null or length(trim(ask)) between 1 and 120),
  add column default_action text check (default_action is null or length(default_action) <= 500),
  add column due_at timestamptz,
  add column changes text check (changes is null or length(changes) <= 300),
  add column unchanged text check (unchanged is null or length(unchanged) <= 300),
  add column undo text check (undo is null or length(undo) <= 300);

-- 마이그레이션 사용자 소유(private) 함수는 역할을 바꾸기 전에 고친다
create or replace function private.control_request_json(r public.control_requests) returns jsonb
language sql stable set search_path = pg_catalog, public, pg_temp as $$
  select jsonb_build_object('id', r.id, 'no', r.no, 'kind', r.kind, 'title', r.title, 'detail', r.detail, 'options', r.options,
    'recommended', r.recommended, 'reversible', r.reversible, 'related', r.related, 'status', r.status, 'topic', r.topic,
    'school_id', r.school_id, 'school', (select jsonb_build_object('slug', s.slug, 'name', s.name) from public.schools s where s.id = r.school_id),
    'source_session', r.source_session, 'assignee_session', r.assignee_session, 'lab_item_id', r.lab_item_id,
    'door', r.door, 'ask', r.ask, 'default_action', r.default_action, 'due_at', r.due_at,
    'changes', r.changes, 'unchanged', r.unchanged, 'undo', r.undo,
    'created_at', r.created_at, 'updated_at', r.updated_at)
$$;

-- 카드 칸은 올린 뒤 고치지 않는다. 검사는 control.file_request 에만 있으므로, 직접 UPDATE(학교 관리자 RLS 경로 포함)로
-- 알림을 기한 지난 기한 진행 카드로 바꾸거나 default_action 을 갈아 끼우지 못하게 한다.
create or replace function private.control_card_guard() returns trigger
language plpgsql set search_path = pg_catalog, public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    -- 카드는 검사하는 함수(control.file_request, control_writer 소유)로만 들어온다. 직접 INSERT(학교 관리자 RLS 경로 등)는 카드 칸을 비워야 한다
    if current_user <> 'control_writer'
       and (new.door, new.ask, new.default_action, new.due_at, new.changes, new.unchanged, new.undo) is distinct from
           (null::text, null::text, null::text, null::timestamptz, null::text, null::text, null::text) then
      raise exception '결정 카드는 control.file_request 로만 올립니다.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if (new.door, new.ask, new.default_action, new.due_at, new.changes, new.unchanged, new.undo)
     is distinct from (old.door, old.ask, old.default_action, old.due_at, old.changes, old.unchanged, old.undo)
     -- 카드의 선택지·추천안, 그리고 누가 받는지(학교·주제·올린 세션)도 결정의 일부다. 받는 곳을 바꾸면 기한 지난
     -- 추천안이 다른 세션(다른 학교 세션 포함)으로 간다
     or (old.door is not null and (new.options, new.recommended, new.reversible, new.source_session, new.school_id, new.topic)
                                  is distinct from (old.options, old.recommended, old.reversible, old.source_session, old.school_id, old.topic))
     -- 맡은 세션은 관제의 배정 함수(control.assign, control_writer)로만 바꾼다
     or (old.door is not null and new.assignee_session is distinct from old.assignee_session and current_user <> 'control_writer') then
    raise exception '결정 카드의 내용은 올린 뒤 고칠 수 없습니다. 새 카드로 올려 주세요.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger control_requests_card_guard before insert or update on public.control_requests
  for each row execute function private.control_card_guard();

grant create on schema control to control_writer;
-- 함수는 control_writer 소유다(41차). 마이그레이션 사용자는 이 역할로 SET ROLE 만 할 수 있으므로 바꿔서 다시 만든다
set local role control_writer;

-- 결정 요청 올리기 — 결정 카드 형식(docs/automation/DECISION-CARDS.md)을 갖춰야 한다
create or replace function control.file_request(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare r public.control_requests; src text; st text; opts jsonb; sch uuid; tp text;
        dr text; q text; dflt text; due timestamptz; chg text; unchg text; und text; rev boolean;
begin
  perform control.enter(p_token);
  src := private.control_session_ref(p ->> 'source_session');
  sch := private.control_school_ref(p ->> 'school');
  tp := coalesce(nullif(p ->> 'topic', ''), case when sch is null then 'control' else 'site_ui' end);
  if tp not in ('control', 'school_ai', 'site_ui', 'system') then raise exception '주제는 control·school_ai·site_ui·system 가운데 하나입니다.' using errcode = '22023'; end if;
  if tp = 'control' and sch is not null then raise exception '학교 일은 주제를 school_ai·site_ui·system 으로 올려 주세요.' using errcode = '22023'; end if;
  if tp in ('school_ai', 'site_ui') and sch is null then raise exception '학교 주제에는 school(slug)이 필요합니다.' using errcode = '22023'; end if;

  -- 같은 세션·같은 제목의 열린 요청이 있으면 그 요청을 돌려준다(다시 올려도 겹치지 않게)
  select * into r from public.control_requests x
   where x.source_session is not distinct from src and x.title = trim(p ->> 'title') and x.status in ('open', 'proceeding', 'parked') limit 1;
  if found then return private.control_request_json(r) || jsonb_build_object('existing', true); end if;

  -- ── 결정 카드 ─────────────────────────────────────────
  dr := nullif(trim(coalesce(p ->> 'door', '')), '');
  if dr is null or dr not in ('one_way', 'default', 'notice') then
    raise exception '결정 카드의 door 는 one_way(되돌리기 어려움)·default(기한까지 반대 없으면 진행)·notice(알림) 가운데 하나입니다. docs/automation/DECISION-CARDS.md' using errcode = '22023';
  end if;
  q := nullif(trim(coalesce(p ->> 'ask', '')), '');
  dflt := nullif(trim(coalesce(p ->> 'default_action', '')), '');
  chg := nullif(trim(coalesce(p ->> 'changes', '')), '');
  unchg := nullif(trim(coalesce(p ->> 'unchanged', '')), '');
  und := nullif(trim(coalesce(p ->> 'undo', '')), '');
  -- 바뀌는 것·안 바뀌는 것·되돌리는 길은 훑어 읽는 한 줄이다
  if chg ~ '[\r\n]' or unchg ~ '[\r\n]' or und ~ '[\r\n]' then
    raise exception '결정 카드의 changes·unchanged·undo 는 각각 한 줄로 씁니다. 자세한 설명은 detail 에 둡니다.' using errcode = '22023';
  end if;
  if chg is null or length(chg) > 300 then
    raise exception '결정 카드에는 changes(승인하면 바뀌는 것, 300자 이내)가 필요합니다.' using errcode = '22023';
  end if;
  if dr in ('one_way', 'default') then
    if q is null or length(q) > 120 or q !~ '[?？]$' or q ~ '[\r\n]' then
      raise exception '결정 카드의 ask 는 예/아니오로 답할 수 있는 한 줄 질문(120자 이내, 물음표로 끝남)입니다.' using errcode = '22023';
    end if;
    if unchg is null or und is null or length(unchg) > 300 or length(und) > 300 then
      raise exception '결정 카드에는 unchanged(안 바뀌는 것)와 undo(되돌리는 길)가 필요합니다(각 300자 이내).' using errcode = '22023';
    end if;
  elsif q is not null or dflt is not null or nullif(p ->> 'recommended', '') is not null then
    -- 알림에 질문·기본 동작·추천안을 실으면 결정이 알림 묶음에 숨는다
    raise exception '알림(notice) 카드에는 ask·default_action·recommended 를 두지 않습니다. 물을 것이 있으면 default 나 one_way 로 올려 주세요.' using errcode = '22023';
  end if;
  if (unchg is not null and length(unchg) > 300) or (und is not null and length(und) > 300) then
    raise exception '결정 카드에는 unchanged(안 바뀌는 것)와 undo(되돌리는 길)가 필요합니다(각 300자 이내).' using errcode = '22023';
  end if;
  if dr = 'default' then
    -- ISO 8601 + 시간대 표시(Z 또는 +09:00)만 받는다. 'tomorrow'·날짜만 같은 값은 DB 시간대로 해석돼 기한이 어긋난다
    if jsonb_typeof(p -> 'due_at') = 'string'
       and p ->> 'due_at' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})$' then
      begin
        due := (p ->> 'due_at')::timestamptz;
      exception when others then due := null;
      end;
    end if;
    if due is null or due <= now() or due > now() + interval '30 days' then
      raise exception '기한까지 진행(default) 카드에는 앞으로 30일 안의 due_at(ISO 8601, 시간대 포함)이 필요합니다.' using errcode = '22023';
    end if;
    -- 기한이 지나면 맡은 세션이 /mine 으로 받아 실행한다. 맡을 세션이 없으면 실행될 길이 없다
    if src is null then
      raise exception '기한까지 진행(default) 카드에는 맡을 세션(source_session)이 필요합니다.' using errcode = '22023';
    end if;
    if dflt is null or length(dflt) > 500 then
      raise exception '기한까지 진행(default) 카드에는 default_action(답이 없으면 할 일, 500자 이내)이 필요합니다.' using errcode = '22023';
    end if;
  elsif p ? 'due_at' and nullif(p ->> 'due_at', '') is not null then
    raise exception '기한(due_at)은 기한까지 진행(default) 카드에만 씁니다.' using errcode = '22023';
  end if;
  if dr = 'one_way' and dflt is not null then
    -- 한쪽 문은 사람을 기다린다. 답이 없을 때 할 일을 받아 두면 실행되지 않을 약속이 된다
    raise exception 'default_action 은 기한까지 진행(default) 카드에만 씁니다. 한쪽 문(one_way)은 사람의 답을 기다립니다.' using errcode = '22023';
  end if;
  -- 문 종류와 되돌릴 수 있는지는 같은 말이다. 엇갈리면 분류를 다시 보게 한다
  rev := dr <> 'one_way';
  if p ? 'reversible' and jsonb_typeof(p -> 'reversible') <> 'null'
     and (jsonb_typeof(p -> 'reversible') <> 'boolean' or (p ->> 'reversible')::boolean <> rev) then
    raise exception 'reversible 과 door 가 엇갈립니다. 되돌리기 어려우면 one_way, 되돌릴 수 있으면 default·notice 입니다.' using errcode = '22023';
  end if;
  st := case dr when 'one_way' then 'parked' else 'proceeding' end;

  opts := coalesce(p -> 'options', '[]'::jsonb);
  if jsonb_typeof(opts) <> 'array' or exists (select 1 from jsonb_array_elements(opts) o
       where jsonb_typeof(o) <> 'object' or coalesce(o ->> 'key', '') !~ '^[A-Za-z0-9_-]{1,20}$' or length(trim(coalesce(o ->> 'label', ''))) not between 1 and 200)
     -- 같은 key 가 둘이면 어느 안을 골랐는지 알 수 없다
     or (select count(distinct o ->> 'key') from jsonb_array_elements(opts) o) <> jsonb_array_length(opts) then
    raise exception '선택지는 [{key, label, detail}] 모양으로 보내 주세요(최대 8개).' using errcode = '22023';
  end if;
  if dr in ('one_way', 'default') and jsonb_array_length(opts) not between 2 and 4 then
    raise exception '결정 카드의 선택지는 2~4개이고, 추천안(recommended)을 하나 고릅니다.' using errcode = '22023';
  end if;
  if dr = 'notice' and jsonb_array_length(opts) > 0 then
    raise exception '알림(notice) 카드에는 선택지를 두지 않습니다. 고를 일이 있으면 default 로 올려 주세요.' using errcode = '22023';
  end if;
  if dr in ('one_way', 'default') and nullif(p ->> 'recommended', '') is null then
    raise exception '결정 카드의 선택지는 2~4개이고, 추천안(recommended)을 하나 고릅니다.' using errcode = '22023';
  end if;
  if nullif(p ->> 'recommended', '') is not null and not exists (select 1 from jsonb_array_elements(opts) o where o ->> 'key' = p ->> 'recommended') then
    raise exception '추천안(recommended)은 선택지 key 가운데 하나여야 합니다.' using errcode = '22023';
  end if;

  insert into public.control_requests(kind, title, detail, options, recommended, reversible, related, source_session, assignee_session,
                                      school_id, topic, status, author, created_by,
                                      door, ask, default_action, due_at, changes, unchanged, undo)
    values ('decision', trim(coalesce(p ->> 'title', '')), coalesce(p ->> 'detail', ''), opts, nullif(p ->> 'recommended', ''),
            rev, coalesce(p ->> 'related', ''), src, src, sch, tp, st,
            case when src is null then 'control' else 'session' end, '0c1a0de0-0000-4000-8000-000000000001',
            dr, q, dflt, due, chg, unchg, und)
    returning * into r;
  return private.control_request_json(r);
end $$;

reset role;
revoke create on schema control from control_writer;
