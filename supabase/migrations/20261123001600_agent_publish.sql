-- 40차: 작업 토큰 '공개' 권한 (ADR 0016)
-- 사용자 결정(2026-11-23): "사이트에서 공개를 누르지 않더라도 AI를 통해 공개 지시를 하면 공개하도록. 자동으로 생성 후 바로 공개되지는 않더라도."
--  · 권한 publish: 에이전트가 공개(지정한 판, 없으면 최신 판) · 공개 내림을 바로 한다. 만들기·고치기는 여전히 시안으로만 저장되고 저절로 공개되지 않는다.
--  · 범위(학교 · 종류 · 주소)는 그대로. 보관한 항목은 공개할 수 없다. 되살리기·설정·구성원·다른 학교는 여전히 사람만.
--  · 공개 기록(site_publications)은 추가만, 책임자(published_by)는 토큰을 발급한 관리자, 활동 기록에 남긴다.

alter table public.agent_tokens drop constraint agent_tokens_perms_check;
alter table public.agent_tokens add constraint agent_tokens_perms_check
  check (cardinality(perms) between 1 and 6 and perms <@ array['read', 'upload', 'create', 'edit', 'archive', 'publish']::text[]);

alter table public.agent_token_uses drop constraint agent_token_uses_action_check;
alter table public.agent_token_uses add constraint agent_token_uses_action_check
  check (action ~ '^(asset\.upload|(story|page|news)\.(version|create|meta|archive|publish|unpublish))$');

grant insert on public.site_publications to agent_writer;
grant usage on sequence public.site_publications_id_seq to agent_writer;
create policy site_publications_agent_insert on public.site_publications for insert to agent_writer
  with check (school_id = app.agent_school() and exists (
    select 1 from public.site_entries e where e.id = entry_id and e.school_id = site_publications.school_id and e.archived_at is null
      and e.kind = any(app.agent_kinds()) and (app.agent_keys() is null or e.key = any(app.agent_keys()))));

grant create on schema app to agent_writer;
grant create on schema agent to agent_writer;
set local role agent_writer;

create or replace function app.agent_need(p_perms text[], p_need text) returns void
language plpgsql immutable as $$
begin
  if not (p_need = any(p_perms)) then
    raise exception '이 토큰에는 % 권한이 없습니다.',
      case p_need when 'read' then '읽기' when 'upload' then '파일 올리기' when 'create' then '만들기' when 'edit' then '고치기' when 'archive' then '보관' when 'publish' then '공개' else p_need end
      using errcode = '42501';
  end if;
end $$;

-- 공개: p_version 이 비면 최신 판. 학교·종류·주소 범위와 보관 여부는 함수와 RLS가 함께 확인한다
create or replace function agent.publish_entry(p_token text, p_kind text, p_key text, p_version integer) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare c record; eid uuid; vid uuid; ver integer;
begin
  select * into c from app.agent_enter(p_token);
  perform app.agent_need(c.t_perms, 'publish');
  eid := case when p_kind = any(c.t_kinds) then app.agent_entry_id(c.t_school, p_kind, p_key) end;
  if eid is null then raise exception '이 토큰으로 공개할 수 있는 항목이 아닙니다.' using errcode = '42501'; end if;
  select x.id, x.version into vid, ver from public.site_entry_versions x
   where x.entry_id = eid and (p_version is null or x.version = p_version) order by x.version desc limit 1;
  if vid is null then raise exception '그 판(%판)이 없습니다.', p_version using errcode = 'P0002'; end if;
  insert into public.site_publications(school_id, entry_id, version_id, published_by) values (c.t_school, eid, vid, c.t_by);
  insert into public.agent_token_uses(school_id, token_id, action, target_id, detail)
    values (c.t_school, c.t_id, p_kind || '.publish', vid, jsonb_build_object('kind', p_kind, 'key', p_key, 'version', ver));
  return jsonb_build_object('key', p_key, 'version', ver, 'published', true);
end $$;

create or replace function agent.unpublish_entry(p_token text, p_kind text, p_key text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare c record; eid uuid;
begin
  select * into c from app.agent_enter(p_token);
  perform app.agent_need(c.t_perms, 'publish');
  eid := case when p_kind = any(c.t_kinds) then app.agent_entry_id(c.t_school, p_kind, p_key) end;
  if eid is null then raise exception '이 토큰으로 공개를 내릴 수 있는 항목이 아닙니다.' using errcode = '42501'; end if;
  insert into public.site_publications(school_id, entry_id, version_id, published_by) values (c.t_school, eid, null, c.t_by);
  insert into public.agent_token_uses(school_id, token_id, action, target_id, detail)
    values (c.t_school, c.t_id, p_kind || '.unpublish', eid, jsonb_build_object('kind', p_kind, 'key', p_key));
  return jsonb_build_object('key', p_key, 'published', false);
end $$;

create or replace function app.create_agent_token(p_school uuid, p_label text, p_days integer, p_kinds text[], p_keys text[], p_perms text[], p_agent_kind text)
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
  if p_days is not null and p_days not in (7, 30, 90, 365) then raise exception '기한은 7·30·90·365일 또는 무기한입니다.' using errcode = '22023'; end if;
  if p_kinds is null or cardinality(p_kinds) = 0 or not (p_kinds <@ array['story', 'page', 'news']) then
    raise exception '맡길 항목 종류(동화·쪽·소식)를 하나 이상 고릅니다.' using errcode = '22023';
  end if;
  if p_perms is null or cardinality(p_perms) = 0 or not (p_perms <@ array['read', 'upload', 'create', 'edit', 'archive', 'publish']) then
    raise exception '권한(읽기·파일 올리기·만들기·고치기·보관·공개)을 하나 이상 고릅니다.' using errcode = '22023';
  end if;
  if not app.has_module(p_school, 'homepage') or ('story' = any(p_kinds) and not app.has_module(p_school, 'stories')) then
    raise exception '이 학교 라이선스에 없는 기능입니다.' using errcode = '42501';
  end if;
  if p_agent_kind is null or p_agent_kind not in ('codex', 'claude-code', 'other') then raise exception '에이전트 종류가 올바르지 않습니다.' using errcode = '22023'; end if;
  -- 주소 목록: 고치기·읽기는 있는 항목만, 만들기 권한이 있으면 아직 없는 주소도 미리 정해 둘 수 있다
  if ks is not null then
    if exists (select 1 from unnest(ks) k where k !~ '^[a-z0-9][a-z0-9-]{0,59}$') then raise exception '주소 이름이 올바르지 않습니다.' using errcode = '22023'; end if;
    if not ('create' = any(p_perms)) then
      select k into missing from unnest(ks) k
       where not exists (select 1 from public.site_entries e where e.school_id = p_school and e.kind = any(p_kinds) and e.key = k) limit 1;
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

do $$
declare f text;
begin
  foreach f in array array['app.agent_need(text[], text)', 'agent.publish_entry(text, text, text, integer)', 'agent.unpublish_entry(text, text, text)',
                           'app.create_agent_token(uuid, text, integer, text[], text[], text[], text)'] loop
    execute format('revoke all on function %s from public', f);
    if f like 'agent.%' then execute format('grant execute on function %s to agent_request', f);
    elsif f like 'app.create_agent_token%' then execute format('grant execute on function %s to authenticated', f);
    end if;
  end loop;
end $$;

reset role;
revoke create on schema app from agent_writer;
revoke create on schema agent from agent_writer;
