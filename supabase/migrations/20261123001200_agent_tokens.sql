-- 34차: 외부 작업 토큰 (ADR 0012) — 동화 전용, 시안만
-- 학교 관리자가 발급한 토큰으로 외부 에이전트(Codex 등)가 그 학교의 성품 동화에 그림·PDF를 올리고 '새 판(시안)'을 저장한다.
--  · 토큰은 sha256만 저장한다. 기한 7·30·90일, 폐기, 마지막 사용 시각, 사용 기록(추가만).
--  · 토큰 요청은 표 권한이 전혀 없는 역할(agent_request)로 돌고, agent 스키마의 명령 함수만 부를 수 있다.
--  · 명령 함수는 제한 역할(agent_writer: 로그인·BYPASSRLS 없음)이 소유한다. 함수가 토큰을 확인해 학교·동화 범위를 정하면
--    agent_writer 에 걸린 RLS가 그 학교의 story 항목만 다시 허용한다(함수 실수와 무관한 두 번째 담).
--  · 공개·설정·쪽·소식·새 항목 만들기·다른 학교는 함수가 없으므로 할 수 없다.
--  · site_assets 에 PDF(application/pdf, 4MB 이하, %PDF- 머리)를 허용한다. 내용 검사는 앱(src/lib/pdf-check.ts)이 먼저 한다.

-- ── 역할 ────────────────────────────────────────────────
do $$
declare r text;
begin
  if not exists (select 1 from pg_roles where rolname = 'agent_writer') then
    create role agent_writer nologin nosuperuser nobypassrls nocreaterole nocreatedb noinherit noreplication;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'agent_request') then
    create role agent_request nologin nosuperuser nobypassrls nocreaterole nocreatedb noinherit noreplication;
  end if;
  -- 앱 연결 사용자가 agent_request 로 SET ROLE 하고, 함수 소유자를 agent_writer 로 바꿀 수 있어야 한다. (ADR 0004 app_writer 와 같은 방식)
  if not (select rolsuper from pg_roles where rolname = current_user) then
    foreach r in array array['agent_writer', 'agent_request'] loop
      if current_setting('server_version_num')::int >= 160000 then
        if not pg_has_role(current_user, r, 'SET') then
          execute format('grant %I to %I with inherit false, set true', r, current_user);
        end if;
      elsif not pg_has_role(current_user, r, 'MEMBER') then
        execute format('grant %I to %I', r, current_user);
      end if;
    end loop;
  end if;
  if pg_has_role('authenticated', 'agent_writer', 'MEMBER') or pg_has_role('anon', 'agent_writer', 'MEMBER')
     or pg_has_role('agent_request', 'agent_writer', 'MEMBER') then
    raise exception 'authenticated/anon/agent_request 가 agent_writer 의 구성원이면 안 됩니다.';
  end if;
end $$;

-- ── PDF 허용 ─────────────────────────────────────────────
alter table public.site_assets drop constraint site_assets_mime_check;
alter table public.site_assets add constraint site_assets_mime_check
  check (mime in ('image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'));
alter table public.site_assets add constraint site_assets_pdf_check
  check (mime <> 'application/pdf' or (size_bytes <= 4194304 and substring(bytes from 1 for 5) = '\x255044462d'::bytea));

-- ── 토큰 표 ──────────────────────────────────────────────
create table public.agent_tokens (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  label text not null check (length(trim(label)) between 1 and 80),
  scope_kind text not null default 'story' check (scope_kind = 'story'),
  entry_key text check (entry_key is null or entry_key ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  agent_kind text not null default 'codex' check (agent_kind in ('codex', 'claude-code', 'other')), -- ADR 0013: 어떤 에이전트에게 주는지
  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references private.app_users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  unique (id, school_id)
);

-- 토큰으로 한 일 (추가만)
create table public.agent_token_uses (
  id bigint generated always as identity primary key,
  school_id uuid not null,
  token_id uuid not null,
  action text not null check (action in ('asset.upload', 'story.version')),
  target_id uuid,
  detail jsonb not null default '{}' check (jsonb_typeof(detail) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (token_id, school_id) references public.agent_tokens(id, school_id)
);
create index agent_token_uses_token on public.agent_token_uses (token_id, id desc);
create trigger agent_token_uses_immutable before update or delete on public.agent_token_uses
  for each row execute function private.reject_change();
-- 토큰 행은 지우지 않는다(폐기 시각만 남김)
create or replace function private.reject_delete() returns trigger language plpgsql as $$
begin raise exception '%: 기록은 지울 수 없습니다.', tg_table_name using errcode = 'P0001'; end $$;
create trigger agent_tokens_no_delete before delete on public.agent_tokens for each row execute function private.reject_delete();

alter table public.agent_tokens enable row level security;
alter table public.agent_token_uses enable row level security;

-- Supabase 기본 권한이 새 표에 모두를 주므로 먼저 거두고, 필요한 것만 준다. 해시 열은 사람에게도 보이지 않는다.
revoke all on public.agent_tokens, public.agent_token_uses from public, anon, authenticated;
grant select (id, school_id, label, scope_kind, entry_key, agent_kind, created_by, created_at, expires_at, revoked_at, last_used_at)
  on public.agent_tokens to authenticated;
grant select on public.agent_token_uses to authenticated;
create policy agent_tokens_read on public.agent_tokens for select to authenticated using (app.is_school_admin(school_id));
create policy agent_token_uses_read on public.agent_token_uses for select to authenticated using (app.is_school_admin(school_id));

-- ── 명령 맥락 (함수 안에서만 정해진다) ─────────────────────
create or replace function app.agent_school() returns uuid
language sql stable as $$ select nullif(current_setting('agent.school', true), '')::uuid $$;
create or replace function app.agent_key() returns text
language sql stable as $$ select nullif(current_setting('agent.key', true), '') $$;
revoke all on function app.agent_school(), app.agent_key() from public;

grant usage on schema public, app to agent_writer;
grant execute on function app.uid(), app.is_member(uuid), app.is_school_admin(uuid), app.is_platform_admin(),
  app.has_module(uuid, text), app.log_access(uuid, text, jsonb), app.agent_school(), app.agent_key() to agent_writer;

-- agent_writer 가 볼 수 있는 것: 토큰 맥락의 학교 · story · (지정했으면) 그 key 만
grant select, insert on public.agent_tokens to agent_writer;
grant update (revoked_at) on public.agent_tokens to agent_writer;
grant select, insert on public.agent_token_uses to agent_writer;
grant usage on sequence public.agent_token_uses_id_seq to agent_writer;
create policy agent_tokens_writer_read on public.agent_tokens for select to agent_writer using (app.is_school_admin(school_id));
create policy agent_tokens_writer_insert on public.agent_tokens for insert to agent_writer
  with check (app.is_school_admin(school_id) and created_by = app.uid() and app.has_module(school_id, 'stories'));
create policy agent_tokens_writer_revoke on public.agent_tokens for update to agent_writer
  using (app.is_school_admin(school_id)) with check (app.is_school_admin(school_id));
create policy agent_token_uses_writer_read on public.agent_token_uses for select to agent_writer using (school_id = app.agent_school());
create policy agent_token_uses_writer_insert on public.agent_token_uses for insert to agent_writer with check (school_id = app.agent_school());

grant select on public.site_entries, public.site_entry_versions, public.site_publications, public.site_assets to agent_writer;
grant insert on public.site_entry_versions, public.site_assets to agent_writer;
create policy site_entries_agent_read on public.site_entries for select to agent_writer
  using ((school_id = app.agent_school() and kind = 'story' and (app.agent_key() is null or key = app.agent_key()))
         or (kind = 'story' and app.is_school_admin(school_id)));
create policy site_versions_agent_read on public.site_entry_versions for select to agent_writer
  using (school_id = app.agent_school() and exists (select 1 from public.site_entries e where e.id = entry_id and e.school_id = site_entry_versions.school_id));
create policy site_versions_agent_insert on public.site_entry_versions for insert to agent_writer
  with check (school_id = app.agent_school() and exists (
    select 1 from public.site_entries e where e.id = entry_id and e.school_id = site_entry_versions.school_id
      and e.kind = 'story' and (app.agent_key() is null or e.key = app.agent_key())));
create policy site_publications_agent_read on public.site_publications for select to agent_writer using (school_id = app.agent_school());
create policy site_assets_agent_read on public.site_assets for select to agent_writer using (school_id = app.agent_school());
create policy site_assets_agent_insert on public.site_assets for insert to agent_writer
  with check (school_id = app.agent_school() and mime in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf'));

-- ── 토큰 확인 (표 소유자 권한: 해시로 찾고 마지막 사용 시각을 남긴다). agent_writer 만 부른다 ──
create or replace function app.agent_resolve(p_token text)
returns table (token_id uuid, school_id uuid, entry_key text, label text, created_by uuid, expires_at timestamptz, school_name text, agent_kind text)
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare h text;
begin
  if p_token is null or p_token !~ '^agt_[0-9a-f]{64}$' then return; end if;
  h := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  return query
    select t.id, t.school_id, t.entry_key, t.label, t.created_by, t.expires_at, c.name, t.agent_kind
    from public.agent_tokens t join public.schools c on c.id = t.school_id
    where t.token_sha256 = h and t.revoked_at is null and t.expires_at > now()
      and c.status <> 'suspended' and private.site_kind_allowed(t.school_id, 'story');
  if found then
    update public.agent_tokens t set last_used_at = now()
     where t.token_sha256 = h and (t.last_used_at is null or t.last_used_at < now() - interval '1 minute');
  end if;
end $$;
revoke all on function app.agent_resolve(text) from public;
grant execute on function app.agent_resolve(text) to agent_writer;

-- ── 명령 함수 (agent 스키마: agent_request 는 이 스키마만 쓸 수 있다) ──
create schema if not exists agent;
revoke all on schema agent from public;
grant usage on schema agent to agent_request, agent_writer;
grant create on schema agent to agent_writer;
grant create on schema app to agent_writer;

-- 토큰 확인 + 맥락 정하기. 실패하면 28000(인증 실패)
create or replace function app.agent_enter(p_token text,
  out t_id uuid, out t_school uuid, out t_key text, out t_label text, out t_by uuid, out t_expires timestamptz, out t_school_name text, out t_kind text)
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform set_config('agent.school', '', true);
  perform set_config('agent.key', '', true);
  select r.token_id, r.school_id, r.entry_key, r.label, r.created_by, r.expires_at, r.school_name, r.agent_kind
    into t_id, t_school, t_key, t_label, t_by, t_expires, t_school_name, t_kind
    from app.agent_resolve(p_token) r;
  if t_id is null then
    raise exception '작업 토큰이 올바르지 않거나, 기한이 지났거나, 폐기되었습니다.' using errcode = '28000';
  end if;
  perform set_config('agent.school', t_school::text, true);
  perform set_config('agent.key', coalesce(t_key, ''), true);
end $$;

create or replace function agent.whoami(p_token text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare c record;
begin
  select * into c from app.agent_enter(p_token);
  return jsonb_build_object('school', c.t_school_name, 'label', c.t_label, 'agent_kind', c.t_kind, 'scope', 'story', 'story_key', c.t_key,
    'expires_at', c.t_expires, 'can', jsonb_build_array('stories.read', 'story.version', 'assets.read', 'assets.upload'));
end $$;

create or replace function agent.stories(p_token text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare c record; result jsonb;
begin
  select * into c from app.agent_enter(p_token);
  select coalesce(jsonb_agg(jsonb_build_object('key', e.key, 'meta', e.meta, 'title', v.content -> 'title',
           'latest_version', v.version, 'live_version', lv.version) order by e.sort, e.key), '[]')
    into result
    from public.site_entries e
    join lateral (select x.version, x.content from public.site_entry_versions x where x.entry_id = e.id order by x.version desc limit 1) v on true
    left join lateral (select p.version_id from public.site_publications p where p.entry_id = e.id order by p.id desc limit 1) p on true
    left join public.site_entry_versions lv on lv.id = p.version_id
   where e.school_id = c.t_school and e.kind = 'story';
  return result;
end $$;

create or replace function agent.story(p_token text, p_key text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare c record; e record; v record; live integer;
begin
  select * into c from app.agent_enter(p_token);
  select x.id, x.key, x.meta into e from public.site_entries x where x.school_id = c.t_school and x.kind = 'story' and x.key = p_key;
  if e.id is null then raise exception '이 토큰으로 볼 수 있는 동화가 아닙니다.' using errcode = 'P0002'; end if;
  select x.version, x.content, x.note, x.created_at into v from public.site_entry_versions x where x.entry_id = e.id order by x.version desc limit 1;
  select lv.version into live from public.site_publications p join public.site_entry_versions lv on lv.id = p.version_id
   where p.entry_id = e.id and p.id = (select max(q.id) from public.site_publications q where q.entry_id = e.id);
  return jsonb_build_object('key', e.key, 'meta', e.meta, 'live_version', live,
    'latest', jsonb_build_object('version', v.version, 'content', v.content, 'note', v.note, 'created_at', v.created_at));
end $$;

create or replace function agent.assets(p_token text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare c record; result jsonb;
begin
  select * into c from app.agent_enter(p_token);
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'mime', a.mime, 'size_bytes', a.size_bytes,
           'sha256', a.sha256, 'created_at', a.created_at) order by a.created_at desc), '[]')
    into result from (select * from public.site_assets x where x.school_id = c.t_school order by x.created_at desc limit 500) a;
  return result;
end $$;

-- 그림·PDF 올리기. 같은 내용(sha256)이 이미 있으면 그것을 돌려준다
create or replace function agent.upload_asset(p_token text, p_name text, p_mime text, p_bytes bytea) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare c record; h text; aid uuid; lim integer;
begin
  select * into c from app.agent_enter(p_token);
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

-- 범위 안 동화의 새 판(시안) 저장. 공개는 하지 않는다. 내용 검사는 앱이 먼저 하고(validateContent),
-- 여기서는 내용이 가리키는 그림이 모두 이 학교 것인지 확인한다.
-- ADR 0013 병행 규칙: p_base_version(보고 고친 판)이 지금 최신 판이 아니면 거부한다(P0001 → 409). 사람 편집·다른 에이전트의 판을 덮지 않게.
create or replace function agent.save_story(p_token text, p_key text, p_content jsonb, p_note text, p_base_version integer) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare c record; eid uuid; foreign_ref integer; vid uuid; ver integer; latest integer;
begin
  select * into c from app.agent_enter(p_token);
  if p_content is null or jsonb_typeof(p_content) <> 'object' then raise exception '내용 형식이 올바르지 않습니다.' using errcode = '22023'; end if;
  select x.id into eid from public.site_entries x where x.school_id = c.t_school and x.kind = 'story' and x.key = p_key;
  if eid is null then raise exception '이 토큰으로 고칠 수 있는 동화가 아닙니다.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(eid::text, 0)); -- 같은 동화에 동시에 저장할 때 판 번호 확인을 차례로
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
    values (c.t_school, c.t_id, 'story.version', vid, jsonb_build_object('key', p_key, 'version', ver));
  return jsonb_build_object('version_id', vid, 'version', ver, 'published', false);
end $$;

-- ── 학교 관리자: 발급 · 폐기 (원문은 발급 때 한 번만 돌려준다) ──
create or replace function app.create_agent_token(p_school uuid, p_label text, p_days integer, p_entry_key text default null, p_agent_kind text default 'codex') returns text
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare token text; k text := nullif(trim(coalesce(p_entry_key, '')), '');
begin
  perform set_config('agent.school', '', true);
  perform set_config('agent.key', '', true);
  if app.uid() is null or not app.is_school_admin(p_school) then
    raise exception '학교 관리자만 작업 토큰을 발급할 수 있습니다.' using errcode = '42501';
  end if;
  if not app.has_module(p_school, 'stories') then raise exception '성품 동화 기능이 켜진 학교만 발급할 수 있습니다.' using errcode = '42501'; end if;
  if p_days is null or p_days not in (7, 30, 90) then raise exception '기한은 7·30·90일 가운데 고릅니다.' using errcode = '22023'; end if;
  if k is not null and not exists (select 1 from public.site_entries e where e.school_id = p_school and e.kind = 'story' and e.key = k) then
    raise exception '그 주소 이름의 동화가 없습니다.' using errcode = '22023';
  end if;
  if p_agent_kind is null or p_agent_kind not in ('codex', 'claude-code', 'other') then raise exception '에이전트 종류가 올바르지 않습니다.' using errcode = '22023'; end if;
  token := 'agt_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.agent_tokens(school_id, label, entry_key, agent_kind, token_sha256, created_by, expires_at)
    values (p_school, coalesce(nullif(trim(p_label), ''), '외부 작업'), k, p_agent_kind, encode(sha256(convert_to(token, 'UTF8')), 'hex'), app.uid(),
            now() + make_interval(days => p_days));
  perform app.log_access(p_school, 'agent.token_create', jsonb_build_object('label', p_label, 'days', p_days, 'story_key', k, 'agent_kind', p_agent_kind));
  return token;
end $$;

create or replace function app.revoke_agent_token(p_school uuid, p_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform set_config('agent.school', '', true);
  perform set_config('agent.key', '', true);
  if app.uid() is null or not app.is_school_admin(p_school) then
    raise exception '학교 관리자만 폐기할 수 있습니다.' using errcode = '42501';
  end if;
  update public.agent_tokens set revoked_at = now() where id = p_id and school_id = p_school and revoked_at is null;
  perform app.log_access(p_school, 'agent.token_revoke', jsonb_build_object('id', p_id));
end $$;

-- 권한 정리 → 소유자를 agent_writer 로. (비슈퍼유저는 바뀐 소유자가 준 권한을 회수할 수 없으므로 순서 유지)
do $$
declare f text;
begin
  foreach f in array array[
    'app.agent_enter(text)',
    'agent.whoami(text)', 'agent.stories(text)', 'agent.story(text, text)', 'agent.assets(text)',
    'agent.upload_asset(text, text, text, bytea)', 'agent.save_story(text, text, jsonb, text, integer)',
    'app.create_agent_token(uuid, text, integer, text, text)', 'app.revoke_agent_token(uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    if f like 'agent.%' then execute format('grant execute on function %s to agent_request', f);
    elsif f like 'app.%agent_token%' then execute format('grant execute on function %s to authenticated', f);
    end if;
    execute format('alter function %s owner to agent_writer', f);
  end loop;
end $$;
revoke create on schema app from agent_writer;
revoke create on schema agent from agent_writer;
