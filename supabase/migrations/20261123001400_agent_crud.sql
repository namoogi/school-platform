-- 38차: 작업 토큰 권한 확장 (ADR 0014)
--  · 권한: read(읽기) · upload(파일 올리기) · create(새 항목 + 첫 판) · edit(새 판 = 내용·구조, 항목 정보) · archive(보관)
--    36차의 draft 는 edit 로 옮긴다(이미 발급한 토큰은 읽기·고치기(+파일 올리기) 그대로 쓸 수 있다).
--  · 보관 = 소프트 삭제: site_entries.archived_at. 판·공개 기록·자산은 지우지 않는다(AGENTS.md 4).
--    보관한 항목은 공개 화면·공개 목록에서 빠진다. 공개 중인 항목은 에이전트가 보관할 수 없다. 되살리기는 학교 관리자만.
--  · 기한: 7·30·90·365일 또는 무기한(expires_at null). 학교 관리자가 기한을 연장할 수 있다(토큰 값은 그대로, 운영 기록에 이전·새 기한).
--  · 공개·공개 내림·설정·구성원·다른 학교는 여전히 어떤 토큰으로도 할 수 없다.

-- ── 토큰: 권한 · 기한 ─────────────────────────────────────
alter table public.agent_tokens drop constraint agent_tokens_perms_check;
update public.agent_tokens set perms = array_replace(perms, 'draft', 'edit') where 'draft' = any(perms);
alter table public.agent_tokens add constraint agent_tokens_perms_check
  check (cardinality(perms) between 1 and 5 and perms <@ array['read', 'upload', 'create', 'edit', 'archive']::text[]);
alter table public.agent_tokens alter column expires_at drop not null;
comment on column public.agent_tokens.expires_at is '비어 있으면 무기한(폐기 전까지). 38차';
grant update (expires_at) on public.agent_tokens to agent_writer;

alter table public.agent_token_uses drop constraint agent_token_uses_action_check;
alter table public.agent_token_uses add constraint agent_token_uses_action_check
  check (action ~ '^(asset\.upload|(story|page|news)\.(version|create|meta|archive))$');

-- ── 항목 보관 ─────────────────────────────────────────────
alter table public.site_entries
  add column archived_at timestamptz,
  add column archived_by uuid references private.app_users(id),
  add column archived_by_token uuid references public.agent_tokens(id);

-- 방문자: 보관한 항목은 지금 공개된 판이 있어도 내주지 않는다(사람이 공개를 내린 뒤에만 보관되지만 이중으로 막는다)
create or replace function private.live_versions(target uuid)
returns table (entry_id uuid, kind text, key text, visibility text, sort integer, meta jsonb, version_id uuid, version integer, content jsonb, published_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select e.id, e.kind, e.key, e.visibility, e.sort, e.meta, v.id, v.version, v.content, p.published_at
  from public.site_entries e
  join lateral (select * from public.site_publications x where x.entry_id = e.id order by x.id desc limit 1) p on true
  join public.site_entry_versions v on v.id = p.version_id
  where e.school_id = target and e.archived_at is null and private.site_kind_allowed(target, e.kind)
$$;

-- agent_writer: 범위 안에서 새 항목 넣기 · 항목 정보·순서·보관 바꾸기
grant insert on public.site_entries to agent_writer;
grant update (meta, sort, archived_at, archived_by_token) on public.site_entries to agent_writer;
create policy site_entries_agent_insert on public.site_entries for insert to agent_writer
  with check (school_id = app.agent_school() and kind = any(app.agent_kinds()) and (app.agent_keys() is null or key = any(app.agent_keys())));
create policy site_entries_agent_update on public.site_entries for update to agent_writer
  using (school_id = app.agent_school() and kind = any(app.agent_kinds()) and (app.agent_keys() is null or key = any(app.agent_keys())))
  with check (school_id = app.agent_school() and kind = any(app.agent_kinds()) and (app.agent_keys() is null or key = any(app.agent_keys())));

-- ── 토큰 확인: 무기한 허용 (표 소유자 함수) ────────────────
create or replace function app.agent_resolve(p_token text)
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
    where t.token_sha256 = h and t.revoked_at is null and (t.expires_at is null or t.expires_at > now())
      and c.status <> 'suspended' and cardinality(k.allowed) > 0;
  if found then
    update public.agent_tokens t set last_used_at = now()
     where t.token_sha256 = h and (t.last_used_at is null or t.last_used_at < now() - interval '1 minute');
  end if;
end $$;

-- 전체 관리자: 모든 학교 토큰 (연례 점검용, 해시 없음)
create or replace function app.platform_agent_tokens()
returns table (id uuid, school_id uuid, school_name text, label text, kinds text[], keys text[], perms text[], agent_kind text,
               created_at timestamptz, expires_at timestamptz, revoked_at timestamptz, last_used_at timestamptz)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if not app.is_platform_admin() then raise exception '전체 관리자만 볼 수 있습니다.' using errcode = '42501'; end if;
  return query select t.id, t.school_id, c.name, t.label, t.kinds, t.keys, t.perms, t.agent_kind, t.created_at, t.expires_at, t.revoked_at, t.last_used_at
    from public.agent_tokens t join public.schools c on c.id = t.school_id
    order by t.revoked_at is not null, t.expires_at nulls last, c.name;
end $$;
revoke all on function app.platform_agent_tokens() from public, anon;
grant execute on function app.platform_agent_tokens() to authenticated;

-- ── agent_writer 소유 함수 (36차와 같은 이유로 그 역할로 바꿔서 만든다) ──
grant create on schema app to agent_writer;
grant create on schema agent to agent_writer;
set local role agent_writer;

create or replace function app.agent_need(p_perms text[], p_need text) returns void
language plpgsql immutable as $$
begin
  if not (p_need = any(p_perms)) then
    raise exception '이 토큰에는 % 권한이 없습니다.',
      case p_need when 'read' then '읽기' when 'upload' then '파일 올리기' when 'create' then '만들기' when 'edit' then '고치기' when 'archive' then '보관' else p_need end
      using errcode = '42501';
  end if;
end $$;

-- 보관하지 않은 범위 안 항목 id (없으면 null)
create or replace function app.agent_entry_id(p_school uuid, p_kind text, p_key text) returns uuid
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select x.id from public.site_entries x where x.school_id = p_school and x.kind = p_kind and x.key = p_key and x.archived_at is null
$$;

create or replace function agent.entries(p_token text, p_kind text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare c record; result jsonb;
begin
  select * into c from app.agent_enter(p_token);
  perform app.agent_need(c.t_perms, 'read');
  if not (p_kind = any(c.t_kinds)) then raise exception '이 토큰으로 볼 수 있는 종류가 아닙니다.' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('kind', e.kind, 'key', e.key, 'meta', e.meta, 'sort', e.sort, 'title', v.content -> 'title',
           'latest_version', v.version, 'live_version', lv.version) order by e.sort, e.key), '[]')
    into result
    from public.site_entries e
    join lateral (select x.version, x.content from public.site_entry_versions x where x.entry_id = e.id order by x.version desc limit 1) v on true
    left join lateral (select p.version_id from public.site_publications p where p.entry_id = e.id order by p.id desc limit 1) p on true
    left join public.site_entry_versions lv on lv.id = p.version_id
   where e.school_id = c.t_school and e.kind = p_kind and e.archived_at is null;
  return result;
end $$;

create or replace function agent.entry(p_token text, p_kind text, p_key text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare c record; e record; v record; live integer;
begin
  select * into c from app.agent_enter(p_token);
  perform app.agent_need(c.t_perms, 'read');
  if not (p_kind = any(c.t_kinds)) then raise exception '이 토큰으로 볼 수 있는 종류가 아닙니다.' using errcode = '42501'; end if;
  select x.id, x.kind, x.key, x.meta, x.sort into e from public.site_entries x
   where x.id = app.agent_entry_id(c.t_school, p_kind, p_key);
  if e.id is null then raise exception '이 토큰으로 볼 수 있는 항목이 아닙니다.' using errcode = 'P0002'; end if;
  select x.version, x.content, x.note, x.created_at into v from public.site_entry_versions x where x.entry_id = e.id order by x.version desc limit 1;
  select lv.version into live from public.site_publications p join public.site_entry_versions lv on lv.id = p.version_id
   where p.entry_id = e.id and p.id = (select max(q.id) from public.site_publications q where q.entry_id = e.id);
  return jsonb_build_object('kind', e.kind, 'key', e.key, 'meta', e.meta, 'sort', e.sort, 'live_version', live,
    'latest', jsonb_build_object('version', v.version, 'content', v.content, 'note', v.note, 'created_at', v.created_at));
end $$;

-- 내용이 가리키는 그림·파일이 모두 이 학교 것인지
create or replace function app.agent_check_refs(p_school uuid, p_content jsonb) returns void
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if p_content is null or jsonb_typeof(p_content) <> 'object' then raise exception '내용 형식이 올바르지 않습니다.' using errcode = '22023'; end if;
  if exists (select 1 from (select distinct m[1]::uuid as id from regexp_matches(p_content::text, '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'g') m) r
              where not exists (select 1 from public.site_assets a where a.id = r.id and a.school_id = p_school)) then
    raise exception '내용에 이 학교에 없는 그림·파일이 있습니다.' using errcode = '22023';
  end if;
end $$;

-- 항목 정보: 허용한 칸만(동화: virtue·character·text_in_image)
create or replace function app.agent_clean_meta(p_kind text, p_meta jsonb, p_base jsonb) returns jsonb
language plpgsql immutable as $$
declare m jsonb := coalesce(p_base, '{}');
begin
  if p_kind <> 'story' or p_meta is null or jsonb_typeof(p_meta) <> 'object' then return m; end if;
  if p_meta ? 'virtue' then m := m || jsonb_build_object('virtue', left(trim(coalesce(p_meta ->> 'virtue', '')), 60)); end if;
  if p_meta ? 'character' then m := m || jsonb_build_object('character', left(trim(coalesce(p_meta ->> 'character', '')), 120)); end if;
  if p_meta ? 'text_in_image' then
    m := case when p_meta ->> 'text_in_image' = 'true' then m || '{"text_in_image": "true"}' else m - 'text_in_image' end;
  end if;
  return m;
end $$;

-- 새 판 저장 = 전체 내용(구조 포함). 활동 기록에 블록 수·순서 변화 요약
create or replace function agent.save_entry(p_token text, p_kind text, p_key text, p_content jsonb, p_note text, p_base_version integer) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare c record; eid uuid; vid uuid; ver integer; latest integer; old jsonb; before_types text[]; after_types text[];
begin
  select * into c from app.agent_enter(p_token);
  perform app.agent_need(c.t_perms, 'edit');
  eid := case when p_kind = any(c.t_kinds) then app.agent_entry_id(c.t_school, p_kind, p_key) end;
  if eid is null then raise exception '이 토큰으로 고칠 수 있는 항목이 아닙니다.' using errcode = '42501'; end if;
  perform app.agent_check_refs(c.t_school, p_content);
  perform pg_advisory_xact_lock(hashtextextended(eid::text, 0));
  select x.version, x.content into latest, old from public.site_entry_versions x where x.entry_id = eid order by x.version desc limit 1;
  if p_base_version is null then raise exception '보고 고친 판 번호(base_version)를 함께 보내 주세요.' using errcode = '22023'; end if;
  if p_base_version <> latest then
    raise exception '그 사이 새 판(%판)이 생겼습니다. 최신 판을 다시 읽어 고친 뒤 저장해 주세요.', latest using errcode = 'P0001';
  end if;
  before_types := array(select b ->> 'type' from jsonb_array_elements(coalesce(old -> 'blocks', '[]')) b);
  after_types := array(select b ->> 'type' from jsonb_array_elements(coalesce(p_content -> 'blocks', '[]')) b);
  insert into public.site_entry_versions(school_id, entry_id, version, content, note, created_by)
    values (c.t_school, eid, latest + 1, p_content,
            left('[작업 토큰: ' || c.t_label || '] ' || coalesce(nullif(trim(p_note), ''), '외부 작업'), 300), c.t_by)
    returning id, version into vid, ver;
  insert into public.agent_token_uses(school_id, token_id, action, target_id, detail)
    values (c.t_school, c.t_id, p_kind || '.version', vid, jsonb_build_object('kind', p_kind, 'key', p_key, 'version', ver,
      'blocks_before', cardinality(before_types), 'blocks_after', cardinality(after_types), 'structure_changed', before_types is distinct from after_types));
  return jsonb_build_object('version_id', vid, 'version', ver, 'published', false);
end $$;

-- 새 항목 + 첫 판(시안). 같은 주소가 있으면(보관한 것 포함) 409
create or replace function agent.create_entry(p_token text, p_kind text, p_key text, p_content jsonb, p_meta jsonb, p_note text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare c record; eid uuid; vid uuid;
begin
  select * into c from app.agent_enter(p_token);
  perform app.agent_need(c.t_perms, 'create');
  if not (p_kind = any(c.t_kinds)) then raise exception '이 토큰으로 만들 수 있는 종류가 아닙니다.' using errcode = '42501'; end if;
  if p_key is null or p_key !~ '^[a-z0-9][a-z0-9-]{0,59}$' then raise exception '주소 이름은 영문 소문자·숫자·하이픈 60자 이하입니다.' using errcode = '22023'; end if;
  if c.t_keys is not null and not (p_key = any(c.t_keys)) then raise exception '이 토큰은 고른 주소로만 만들 수 있습니다.' using errcode = '42501'; end if;
  perform app.agent_check_refs(c.t_school, p_content);
  perform pg_advisory_xact_lock(hashtextextended(c.t_school::text || p_kind || p_key, 0));
  if exists (select 1 from public.site_entries x where x.school_id = c.t_school and x.kind = p_kind and x.key = p_key) then
    raise exception '같은 주소 이름(%)이 이미 있습니다(보관함 포함). 다른 이름을 쓰거나 학교 관리자에게 물어 주세요.', p_key using errcode = 'P0001';
  end if;
  insert into public.site_entries(school_id, kind, key, visibility, meta, sort, created_by)
    values (c.t_school, p_kind, p_key, 'public', app.agent_clean_meta(p_kind, p_meta, '{}'), 0, c.t_by) returning id into eid;
  insert into public.site_entry_versions(school_id, entry_id, version, content, note, created_by)
    values (c.t_school, eid, 1, p_content, left('[작업 토큰: ' || c.t_label || '] ' || coalesce(nullif(trim(p_note), ''), '처음 만듦'), 300), c.t_by)
    returning id into vid;
  insert into public.agent_token_uses(school_id, token_id, action, target_id, detail)
    values (c.t_school, c.t_id, p_kind || '.create', eid, jsonb_build_object('kind', p_kind, 'key', p_key, 'version', 1));
  return jsonb_build_object('key', p_key, 'version_id', vid, 'version', 1, 'published', false);
end $$;

-- 항목 정보(동화 성품 이름·주인공·그림 안 글)·순서
create or replace function agent.update_meta(p_token text, p_kind text, p_key text, p_meta jsonb, p_sort integer) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare c record; eid uuid; m jsonb;
begin
  select * into c from app.agent_enter(p_token);
  perform app.agent_need(c.t_perms, 'edit');
  eid := case when p_kind = any(c.t_kinds) then app.agent_entry_id(c.t_school, p_kind, p_key) end;
  if eid is null then raise exception '이 토큰으로 고칠 수 있는 항목이 아닙니다.' using errcode = '42501'; end if;
  if p_sort is not null and (p_sort < 0 or p_sort > 9999) then raise exception '순서는 0~9999입니다.' using errcode = '22023'; end if;
  update public.site_entries x set meta = app.agent_clean_meta(p_kind, p_meta, x.meta), sort = coalesce(p_sort, x.sort)
   where x.id = eid returning x.meta into m;
  insert into public.agent_token_uses(school_id, token_id, action, target_id, detail)
    values (c.t_school, c.t_id, p_kind || '.meta', eid, jsonb_build_object('kind', p_kind, 'key', p_key, 'sort', p_sort));
  return jsonb_build_object('key', p_key, 'meta', m, 'sort', (select sort from public.site_entries where id = eid));
end $$;

-- 보관(소프트 삭제). 공개 중이면 409. 판·공개 기록·자산은 그대로 남는다
create or replace function agent.archive_entry(p_token text, p_kind text, p_key text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare c record; eid uuid;
begin
  select * into c from app.agent_enter(p_token);
  perform app.agent_need(c.t_perms, 'archive');
  eid := case when p_kind = any(c.t_kinds) then app.agent_entry_id(c.t_school, p_kind, p_key) end;
  if eid is null then raise exception '이 토큰으로 보관할 수 있는 항목이 아닙니다.' using errcode = '42501'; end if;
  if (select p.version_id from public.site_publications p where p.entry_id = eid order by p.id desc limit 1) is not null then
    raise exception '공개 중인 항목은 보관할 수 없습니다. 학교 관리자가 공개를 내린 뒤 보관해 주세요.' using errcode = 'P0001';
  end if;
  update public.site_entries x set archived_at = now(), archived_by_token = c.t_id where x.id = eid;
  insert into public.agent_token_uses(school_id, token_id, action, target_id, detail)
    values (c.t_school, c.t_id, p_kind || '.archive', eid, jsonb_build_object('kind', p_kind, 'key', p_key));
  return jsonb_build_object('key', p_key, 'archived', true);
end $$;

-- 발급: 기한 7·30·90·365일 또는 무기한(null), 권한 5가지
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
  if p_perms is null or cardinality(p_perms) = 0 or not (p_perms <@ array['read', 'upload', 'create', 'edit', 'archive']) then
    raise exception '권한(읽기·파일 올리기·만들기·고치기·보관)을 하나 이상 고릅니다.' using errcode = '22023';
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

-- 기한 연장: 토큰 값은 그대로, 남은 기한 끝(지났으면 지금)부터 늘린다. null = 무기한. 폐기한 토큰은 안 된다
create or replace function app.extend_agent_token(p_school uuid, p_id uuid, p_days integer) returns timestamptz
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare old timestamptz; neu timestamptz; rev timestamptz;
begin
  perform set_config('agent.school', '', true);
  if app.uid() is null or not app.is_school_admin(p_school) then raise exception '학교 관리자만 연장할 수 있습니다.' using errcode = '42501'; end if;
  if p_days is not null and p_days not in (7, 30, 90, 365) then raise exception '기한은 7·30·90·365일 또는 무기한입니다.' using errcode = '22023'; end if;
  select t.expires_at, t.revoked_at into old, rev from public.agent_tokens t where t.id = p_id and t.school_id = p_school for update;
  if not found then raise exception '토큰을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if rev is not null then raise exception '폐기한 토큰은 연장할 수 없습니다. 새로 발급해 주세요.' using errcode = 'P0001'; end if;
  neu := case when p_days is null then null else greatest(coalesce(old, now()), now()) + make_interval(days => p_days) end;
  update public.agent_tokens set expires_at = neu where id = p_id and school_id = p_school;
  perform app.log_access(p_school, 'agent.token_extend', jsonb_build_object('id', p_id, 'from', old, 'to', neu, 'days', p_days));
  return neu;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'app.agent_need(text[], text)', 'app.agent_entry_id(uuid, text, text)', 'app.agent_check_refs(uuid, jsonb)', 'app.agent_clean_meta(text, jsonb, jsonb)',
    'agent.entries(text, text)', 'agent.entry(text, text, text)', 'agent.save_entry(text, text, text, jsonb, text, integer)',
    'agent.create_entry(text, text, text, jsonb, jsonb, text)', 'agent.update_meta(text, text, text, jsonb, integer)', 'agent.archive_entry(text, text, text)',
    'app.create_agent_token(uuid, text, integer, text[], text[], text[], text)', 'app.extend_agent_token(uuid, uuid, integer)'
  ] loop
    execute format('revoke all on function %s from public', f);
    if f like 'agent.%' then execute format('grant execute on function %s to agent_request', f);
    elsif f like 'app.create_agent_token%' or f like 'app.extend_agent_token%' then execute format('grant execute on function %s to authenticated', f);
    end if;
  end loop;
end $$;

reset role;
revoke create on schema app from agent_writer;
revoke create on schema agent from agent_writer;
