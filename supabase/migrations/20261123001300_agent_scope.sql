-- 36차: 작업 토큰 범위 일반화 (ADR 0013 'AI 작업 공간', ADR 0012 토큰을 넓힘)
-- 범위 = 항목 종류(story·page·news) × 선택적 주소 이름(key) 목록 × 권한(read·upload·draft).
-- 공개·설정·구성원·다른 학교는 어떤 토큰으로도 할 수 없다(함수가 없다). 쪽·소식도 시안까지만, 공개는 사람.
-- 34차에 발급한 토큰은 그대로 동작한다: kinds={story}, keys={entry_key}(있으면), perms={read,upload,draft}.

alter table public.agent_tokens
  add column kinds text[] not null default '{story}'
    check (cardinality(kinds) between 1 and 3 and kinds <@ array['story', 'page', 'news']::text[]),
  add column keys text[]
    check (keys is null or (cardinality(keys) between 1 and 30 and array_to_string(keys, ',') ~ '^[a-z0-9][a-z0-9-]{0,59}(,[a-z0-9][a-z0-9-]{0,59})*$')),
  add column perms text[] not null default '{read,upload,draft}'
    check (cardinality(perms) between 1 and 3 and perms <@ array['read', 'upload', 'draft']::text[]);
update public.agent_tokens set keys = array[entry_key] where entry_key is not null and keys is null;
comment on column public.agent_tokens.scope_kind is '34차 값(story). 36차부터 kinds 를 쓴다';
comment on column public.agent_tokens.entry_key is '34차 값. 36차부터 keys 를 쓴다';
grant select (kinds, keys, perms) on public.agent_tokens to authenticated;

alter table public.agent_token_uses drop constraint agent_token_uses_action_check;
alter table public.agent_token_uses add constraint agent_token_uses_action_check
  check (action in ('asset.upload', 'story.version', 'page.version', 'news.version'));

-- ── 명령 맥락: 종류·주소·권한 ─────────────────────────────
create or replace function app.agent_kinds() returns text[]
language sql stable as $$ select string_to_array(nullif(current_setting('agent.kinds', true), ''), ',') $$;
create or replace function app.agent_keys() returns text[]
language sql stable as $$ select string_to_array(nullif(current_setting('agent.keys', true), ''), ',') $$;
revoke all on function app.agent_kinds(), app.agent_keys() from public;
grant execute on function app.agent_kinds(), app.agent_keys() to agent_writer;

-- agent_writer 정책: 함수가 정한 학교 · 종류 · (지정했으면) 주소만
drop policy site_entries_agent_read on public.site_entries;
create policy site_entries_agent_read on public.site_entries for select to agent_writer
  using ((school_id = app.agent_school() and kind = any(app.agent_kinds()) and (app.agent_keys() is null or key = any(app.agent_keys())))
         or app.is_school_admin(school_id));
drop policy site_versions_agent_insert on public.site_entry_versions;
create policy site_versions_agent_insert on public.site_entry_versions for insert to agent_writer
  with check (school_id = app.agent_school() and exists (
    select 1 from public.site_entries e where e.id = entry_id and e.school_id = site_entry_versions.school_id
      and e.kind = any(app.agent_kinds()) and (app.agent_keys() is null or e.key = any(app.agent_keys()))));

-- ── 토큰 확인 (표 소유자 권한). 라이선스가 꺼진 종류는 빼고, 남는 종류가 없으면 무효 ──
drop function app.agent_resolve(text);
create function app.agent_resolve(p_token text)
returns table (token_id uuid, school_id uuid, kinds text[], keys text[], perms text[], label text, created_by uuid,
               expires_at timestamptz, school_name text, agent_kind text)
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare h text;
begin
  if p_token is null or p_token !~ '^agt_[0-9a-f]{64}$' then return; end if;
  h := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  return query
    select t.id, t.school_id, k.allowed, t.keys, t.perms, t.label, t.created_by, t.expires_at, c.name, t.agent_kind
    from public.agent_tokens t join public.schools c on c.id = t.school_id
    cross join lateral (select array(select x from unnest(t.kinds) x where private.site_kind_allowed(t.school_id, x) order by x) as allowed) k
    where t.token_sha256 = h and t.revoked_at is null and t.expires_at > now()
      and c.status <> 'suspended' and cardinality(k.allowed) > 0;
  if found then
    update public.agent_tokens t set last_used_at = now()
     where t.token_sha256 = h and (t.last_used_at is null or t.last_used_at < now() - interval '1 minute');
  end if;
end $$;
revoke all on function app.agent_resolve(text) from public;
grant execute on function app.agent_resolve(text) to agent_writer;

grant create on schema app to agent_writer;
grant create on schema agent to agent_writer;

-- 아래 함수들은 agent_writer 소유다. Supabase 의 마이그레이션 사용자는 이 역할로 SET ROLE 만 할 수 있고(PG16+, INHERIT 없음)
-- 소유자 권한을 물려받지 않으므로, 이 역할로 바꿔서 지우고 다시 만든다. 새로 만든 함수도 자동으로 agent_writer 소유가 된다.
set local role agent_writer;

drop function app.agent_enter(text);
create function app.agent_enter(p_token text,
  out t_id uuid, out t_school uuid, out t_kinds text[], out t_keys text[], out t_perms text[], out t_label text, out t_by uuid,
  out t_expires timestamptz, out t_school_name text, out t_kind text)
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform set_config('agent.school', '', true);
  perform set_config('agent.kinds', '', true);
  perform set_config('agent.keys', '', true);
  select r.token_id, r.school_id, r.kinds, r.keys, r.perms, r.label, r.created_by, r.expires_at, r.school_name, r.agent_kind
    into t_id, t_school, t_kinds, t_keys, t_perms, t_label, t_by, t_expires, t_school_name, t_kind
    from app.agent_resolve(p_token) r;
  if t_id is null then
    raise exception '작업 토큰이 올바르지 않거나, 기한이 지났거나, 폐기되었습니다.' using errcode = '28000';
  end if;
  perform set_config('agent.school', t_school::text, true);
  perform set_config('agent.kinds', array_to_string(t_kinds, ','), true);
  perform set_config('agent.keys', coalesce(array_to_string(t_keys, ','), ''), true);
end $$;

-- 권한 확인 도우미 (함수 안에서만)
create or replace function app.agent_need(p_perms text[], p_need text) returns void
language plpgsql immutable as $$
begin
  if not (p_need = any(p_perms)) then
    raise exception '이 토큰에는 % 권한이 없습니다.', case p_need when 'read' then '읽기' when 'upload' then '파일 올리기' else '시안 저장' end using errcode = '42501';
  end if;
end $$;

-- ── 명령 함수 (일반) ─────────────────────────────────────
create or replace function agent.whoami(p_token text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare c record;
begin
  select * into c from app.agent_enter(p_token);
  return jsonb_build_object('school', c.t_school_name, 'label', c.t_label, 'agent_kind', c.t_kind,
    'kinds', to_jsonb(c.t_kinds), 'keys', to_jsonb(c.t_keys), 'perms', to_jsonb(c.t_perms), 'expires_at', c.t_expires,
    -- 34차 호환
    'scope', array_to_string(c.t_kinds, ','), 'story_key', case when cardinality(c.t_keys) = 1 then c.t_keys[1] end);
end $$;

create or replace function agent.entries(p_token text, p_kind text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare c record; result jsonb;
begin
  select * into c from app.agent_enter(p_token);
  perform app.agent_need(c.t_perms, 'read');
  if not (p_kind = any(c.t_kinds)) then raise exception '이 토큰으로 볼 수 있는 종류가 아닙니다.' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('kind', e.kind, 'key', e.key, 'meta', e.meta, 'title', v.content -> 'title',
           'latest_version', v.version, 'live_version', lv.version) order by e.sort, e.key), '[]')
    into result
    from public.site_entries e
    join lateral (select x.version, x.content from public.site_entry_versions x where x.entry_id = e.id order by x.version desc limit 1) v on true
    left join lateral (select p.version_id from public.site_publications p where p.entry_id = e.id order by p.id desc limit 1) p on true
    left join public.site_entry_versions lv on lv.id = p.version_id
   where e.school_id = c.t_school and e.kind = p_kind;  -- RLS 가 주소 범위를 거른다
  return result;
end $$;

create or replace function agent.entry(p_token text, p_kind text, p_key text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare c record; e record; v record; live integer;
begin
  select * into c from app.agent_enter(p_token);
  perform app.agent_need(c.t_perms, 'read');
  if not (p_kind = any(c.t_kinds)) then raise exception '이 토큰으로 볼 수 있는 종류가 아닙니다.' using errcode = '42501'; end if;
  select x.id, x.kind, x.key, x.meta into e from public.site_entries x where x.school_id = c.t_school and x.kind = p_kind and x.key = p_key;
  if e.id is null then raise exception '이 토큰으로 볼 수 있는 항목이 아닙니다.' using errcode = 'P0002'; end if;
  select x.version, x.content, x.note, x.created_at into v from public.site_entry_versions x where x.entry_id = e.id order by x.version desc limit 1;
  select lv.version into live from public.site_publications p join public.site_entry_versions lv on lv.id = p.version_id
   where p.entry_id = e.id and p.id = (select max(q.id) from public.site_publications q where q.entry_id = e.id);
  return jsonb_build_object('kind', e.kind, 'key', e.key, 'meta', e.meta, 'live_version', live,
    'latest', jsonb_build_object('version', v.version, 'content', v.content, 'note', v.note, 'created_at', v.created_at));
end $$;

create or replace function agent.save_entry(p_token text, p_kind text, p_key text, p_content jsonb, p_note text, p_base_version integer) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare c record; eid uuid; foreign_ref integer; vid uuid; ver integer; latest integer;
begin
  select * into c from app.agent_enter(p_token);
  perform app.agent_need(c.t_perms, 'draft');
  if p_content is null or jsonb_typeof(p_content) <> 'object' then raise exception '내용 형식이 올바르지 않습니다.' using errcode = '22023'; end if;
  select x.id into eid from public.site_entries x where x.school_id = c.t_school and x.kind = p_kind and x.key = p_key;
  if eid is null then raise exception '이 토큰으로 고칠 수 있는 항목이 아닙니다.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(eid::text, 0));
  select max(x.version) into latest from public.site_entry_versions x where x.entry_id = eid;
  if p_base_version is null then raise exception '보고 고친 판 번호(base_version)를 함께 보내 주세요.' using errcode = '22023'; end if;
  if p_base_version <> latest then
    raise exception '그 사이 새 판(%판)이 생겼습니다. 최신 판을 다시 읽어 고친 뒤 저장해 주세요.', latest using errcode = 'P0001';
  end if;
  select count(*) into foreign_ref
    from (select distinct m[1]::uuid as id from regexp_matches(p_content::text, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'g') m) r
   where not exists (select 1 from public.site_assets a where a.id = r.id and a.school_id = c.t_school);
  if foreign_ref > 0 then raise exception '내용에 이 학교에 없는 그림·파일이 있습니다.' using errcode = '22023'; end if;
  insert into public.site_entry_versions(school_id, entry_id, version, content, note, created_by)
    select c.t_school, eid, coalesce(max(x.version), 0) + 1, p_content,
           left('[작업 토큰: ' || c.t_label || '] ' || coalesce(nullif(trim(p_note), ''), '외부 작업'), 300), c.t_by
      from public.site_entry_versions x where x.entry_id = eid
    returning id, version into vid, ver;
  insert into public.agent_token_uses(school_id, token_id, action, target_id, detail)
    values (c.t_school, c.t_id, p_kind || '.version', vid, jsonb_build_object('kind', p_kind, 'key', p_key, 'version', ver));
  return jsonb_build_object('version_id', vid, 'version', ver, 'published', false);
end $$;

-- 34차 동화 함수는 일반 함수로 넘긴다(같은 결과)
create or replace function agent.stories(p_token text) returns jsonb
language sql security definer set search_path = pg_catalog, public, pg_temp as $$ select agent.entries(p_token, 'story') $$;
create or replace function agent.story(p_token text, p_key text) returns jsonb
language sql security definer set search_path = pg_catalog, public, pg_temp as $$ select agent.entry(p_token, 'story', p_key) $$;
create or replace function agent.save_story(p_token text, p_key text, p_content jsonb, p_note text, p_base_version integer) returns jsonb
language sql security definer set search_path = pg_catalog, public, pg_temp as $$ select agent.save_entry(p_token, 'story', p_key, p_content, p_note, p_base_version) $$;

create or replace function agent.assets(p_token text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare c record; result jsonb;
begin
  select * into c from app.agent_enter(p_token);
  if not (c.t_perms && array['read', 'upload']) then perform app.agent_need(c.t_perms, 'read'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'mime', a.mime, 'size_bytes', a.size_bytes,
           'sha256', a.sha256, 'created_at', a.created_at) order by a.created_at desc), '[]')
    into result from (select * from public.site_assets x where x.school_id = c.t_school order by x.created_at desc limit 500) a;
  return result;
end $$;

create or replace function agent.upload_asset(p_token text, p_name text, p_mime text, p_bytes bytea) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare c record; h text; aid uuid; lim integer;
begin
  select * into c from app.agent_enter(p_token);
  perform app.agent_need(c.t_perms, 'upload');
  if p_mime is null or p_mime not in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf') then
    raise exception 'PNG·JPG·WEBP 그림이나 PDF만 올릴 수 있습니다.' using errcode = '22023';
  end if;
  lim := case when p_mime = 'application/pdf' then 4194304 else 5242880 end;
  if p_bytes is null or length(p_bytes) = 0 or length(p_bytes) > lim then
    raise exception '파일이 비었거나 너무 큽니다(PDF 4MB, 그림 5MB 이하).' using errcode = '22023';
  end if;
  if (p_mime = 'application/pdf' and substring(p_bytes from 1 for 5) <> '\x255044462d'::bytea)
     or (p_mime = 'image/png' and substring(p_bytes from 1 for 8) <> '\x89504e470d0a1a0a'::bytea)
     or (p_mime = 'image/jpeg' and substring(p_bytes from 1 for 3) <> '\xffd8ff'::bytea)
     or (p_mime = 'image/webp' and (substring(p_bytes from 1 for 4) <> '\x52494646'::bytea or substring(p_bytes from 9 for 4) <> '\x57454250'::bytea)) then
    raise exception '파일 내용이 형식과 맞지 않습니다.' using errcode = '22023';
  end if;
  h := encode(sha256(p_bytes), 'hex');
  select a.id into aid from public.site_assets a where a.school_id = c.t_school and a.sha256 = h limit 1;
  if aid is not null then return jsonb_build_object('id', aid, 'reused', true); end if;
  insert into public.site_assets(school_id, name, mime, size_bytes, sha256, bytes, created_by)
    values (c.t_school, left(coalesce(nullif(trim(p_name), ''), 'file'), 200), p_mime, length(p_bytes), h, p_bytes, c.t_by)
    returning id into aid;
  insert into public.agent_token_uses(school_id, token_id, action, target_id, detail)
    values (c.t_school, c.t_id, 'asset.upload', aid, jsonb_build_object('mime', p_mime, 'size_bytes', length(p_bytes)));
  return jsonb_build_object('id', aid, 'reused', false);
end $$;

-- ── 발급 (학교 관리자): 종류·주소·권한 ─────────────────────
drop function app.create_agent_token(uuid, text, integer, text, text);
create function app.create_agent_token(p_school uuid, p_label text, p_days integer, p_kinds text[], p_keys text[], p_perms text[], p_agent_kind text)
returns text
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare token text; ks text[] := nullif(p_keys, '{}'); missing text;
begin
  perform set_config('agent.school', '', true);
  perform set_config('agent.kinds', '', true);
  perform set_config('agent.keys', '', true);
  if app.uid() is null or not app.is_school_admin(p_school) then
    raise exception '학교 관리자만 작업 토큰을 발급할 수 있습니다.' using errcode = '42501';
  end if;
  if p_days is null or p_days not in (7, 30, 90) then raise exception '기한은 7·30·90일 가운데 고릅니다.' using errcode = '22023'; end if;
  if p_kinds is null or cardinality(p_kinds) = 0 or not (p_kinds <@ array['story', 'page', 'news']) then
    raise exception '맡길 항목 종류(동화·쪽·소식)를 하나 이상 고릅니다.' using errcode = '22023';
  end if;
  if p_perms is null or cardinality(p_perms) = 0 or not (p_perms <@ array['read', 'upload', 'draft']) then
    raise exception '권한(읽기·파일 올리기·시안 저장)을 하나 이상 고릅니다.' using errcode = '22023';
  end if;
  if not app.has_module(p_school, 'homepage') or ('story' = any(p_kinds) and not app.has_module(p_school, 'stories')) then
    raise exception '이 학교 라이선스에 없는 기능입니다.' using errcode = '42501';
  end if;
  if p_agent_kind is null or p_agent_kind not in ('codex', 'claude-code', 'other') then raise exception '에이전트 종류가 올바르지 않습니다.' using errcode = '22023'; end if;
  if ks is not null then
    select k into missing from unnest(ks) k
     where not exists (select 1 from public.site_entries e where e.school_id = p_school and e.kind = any(p_kinds) and e.key = k) limit 1;
    if missing is not null then raise exception '고른 종류에 그 주소 이름(%)의 항목이 없습니다.', missing using errcode = '22023'; end if;
  end if;
  token := 'agt_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.agent_tokens(school_id, label, kinds, keys, perms, entry_key, agent_kind, token_sha256, created_by, expires_at)
    values (p_school, coalesce(nullif(trim(p_label), ''), '외부 작업'), p_kinds, ks, p_perms,
            case when cardinality(ks) = 1 and p_kinds = array['story'] then ks[1] end, p_agent_kind,
            encode(sha256(convert_to(token, 'UTF8')), 'hex'), app.uid(), now() + make_interval(days => p_days));
  perform app.log_access(p_school, 'agent.token_create', jsonb_build_object('label', p_label, 'days', p_days, 'kinds', p_kinds, 'keys', ks, 'perms', p_perms, 'agent_kind', p_agent_kind));
  return token;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'app.agent_enter(text)', 'app.agent_need(text[], text)',
    'agent.whoami(text)', 'agent.entries(text, text)', 'agent.entry(text, text, text)',
    'agent.save_entry(text, text, text, jsonb, text, integer)',
    'agent.stories(text)', 'agent.story(text, text)', 'agent.save_story(text, text, jsonb, text, integer)',
    'agent.assets(text)', 'agent.upload_asset(text, text, text, bytea)',
    'app.create_agent_token(uuid, text, integer, text[], text[], text[], text)'
  ] loop
    execute format('revoke all on function %s from public', f);
    if f like 'agent.%' then execute format('grant execute on function %s to agent_request', f);
    elsif f like 'app.create_agent_token%' then execute format('grant execute on function %s to authenticated', f);
    end if;
  end loop;
end $$;

reset role;

-- 발급 정책: 34차는 stories 기능을 요구했다. 이제 함수가 종류별로 확인한다
drop policy agent_tokens_writer_insert on public.agent_tokens;
create policy agent_tokens_writer_insert on public.agent_tokens for insert to agent_writer
  with check (app.is_school_admin(school_id) and created_by = app.uid() and app.has_module(school_id, 'homepage'));

-- 34차 정책은 key 하나(agent.key)를 봤다. 정책을 모두 바꿨으니 지운다(남은 의존이 있으면 여기서 멈춘다)
drop function app.agent_key();

revoke create on schema app from agent_writer;
revoke create on schema agent from agent_writer;
