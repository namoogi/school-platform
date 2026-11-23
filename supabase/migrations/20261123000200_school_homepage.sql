-- 27차: 학교 홈페이지 · 성품 동화 (ADR 0008)
-- 학교마다 공개 홈페이지를 두고, 화면 단위(쪽·소식·동화)를 '시안 판'으로 쌓은 뒤 관리자가 공개한다.
--  · 모든 표에 school_id + 복합 외래키, 읽기·쓰기 RLS는 학교 소속으로 검증 (AGENTS.md 1)
--  · 판(site_entry_versions)·공개 기록(site_publications)·그림(site_assets)은 고치거나 지우지 않는다 (AGENTS.md 4)
--  · 방문자(로그인 없음)는 anon 역할로 공개 함수만 부른다. 함수는 '지금 공개된 판'만 돌려준다.
--  · 라이선스: page·news 는 homepage, story 는 stories 기능이 켜진 학교만 쓴다.

insert into public.module_catalog(key, name, description, available, required, sort) values
  ('homepage', '학교 홈페이지', '다국어 공개 홈페이지를 만들고 화면 단위로 시안을 쌓아 공개합니다.', true, false, 25),
  ('stories',  '성품 동화',     '성품 캐릭터 동화를 시안으로 만들고 확정본만 홈페이지에 공개합니다.', true, false, 26)
on conflict (key) do nothing;

-- 학교의 현재 라이선스 기능 목록 (권한 판단용, 내부 전용)
create or replace function private.school_modules(target uuid) returns text[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select l.modules from public.school_licenses l where l.school_id = target order by l.version desc limit 1), '{}')
$$;

create or replace function private.site_kind_allowed(target uuid, entry_kind text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select case entry_kind when 'story' then 'stories' = any(private.school_modules(target)) and 'homepage' = any(private.school_modules(target))
                         else 'homepage' = any(private.school_modules(target)) end
$$;

-- RLS 정책에서 쓰는 판단 함수 (authenticated 실행 가능, 자기 학교만 참이 됨)
create or replace function app.has_module(target uuid, module_key text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.is_member(target) and module_key = any(private.school_modules(target))
$$;
create or replace function app.site_kind_allowed(target uuid, entry_kind text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.is_member(target) and private.site_kind_allowed(target, entry_kind)
$$;
revoke all on function app.has_module(uuid, text), app.site_kind_allowed(uuid, text) from public;
grant execute on function app.has_module(uuid, text), app.site_kind_allowed(uuid, text) to authenticated;

-- ── 사이트 설정 (학교당 한 행) ────────────────────────────
create table public.site_settings (
  school_id uuid primary key references public.schools(id),
  public_slug text not null unique check (public_slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  default_lang text not null default 'ko' check (default_lang in ('ko', 'en', 'th')),
  langs text[] not null default '{ko}' check (langs <@ array['ko', 'en', 'th']::text[] and cardinality(langs) between 1 and 3),
  theme text not null default 'campus' check (theme in ('campus', 'dawn')),
  site_title jsonb not null default '{}' check (jsonb_typeof(site_title) = 'object'),
  is_open boolean not null default false,
  updated_at timestamptz not null default now(),
  check (default_lang = any(langs))
);

-- ── 화면 단위: 쪽(page) · 소식(news) · 동화(story) ─────────
create table public.site_entries (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  kind text not null check (kind in ('page', 'news', 'story')),
  key text not null check (key ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  visibility text not null default 'public' check (visibility in ('public', 'unlisted')),
  sort integer not null default 0,
  meta jsonb not null default '{}' check (jsonb_typeof(meta) = 'object'),
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  unique (school_id, kind, key),
  unique (id, school_id)
);

-- 판: 고칠 때마다 새 판을 더한다(기존 판은 그대로)
create table public.site_entry_versions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  entry_id uuid not null,
  version integer not null check (version >= 1),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  note text check (note is null or length(note) <= 300),
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default clock_timestamp(),
  unique (entry_id, version),
  unique (id, school_id),
  unique (id, entry_id, school_id),
  foreign key (entry_id, school_id) references public.site_entries(id, school_id)
);

-- 공개 기록: 마지막 행이 지금 상태. version_id 가 비면 '공개 내림'
create table public.site_publications (
  id bigint generated always as identity primary key,
  school_id uuid not null,
  entry_id uuid not null,
  version_id uuid,
  published_by uuid not null default app.uid(),
  published_at timestamptz not null default clock_timestamp(),
  foreign key (entry_id, school_id) references public.site_entries(id, school_id),
  foreign key (version_id, entry_id, school_id) references public.site_entry_versions(id, entry_id, school_id)
);
create index site_publications_entry on public.site_publications (entry_id, id desc);

-- 그림: 홈페이지·동화에 쓰는 이미지 (SVG는 받지 않는다: 같은 출처에서 스크립트 실행 위험)
create table public.site_assets (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  name text not null check (length(name) between 1 and 200),
  mime text not null check (mime in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes bytea not null,
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  unique (id, school_id)
);

create trigger site_entry_versions_immutable before update or delete on public.site_entry_versions
  for each row execute function private.reject_change();
create trigger site_publications_immutable before update or delete on public.site_publications
  for each row execute function private.reject_change();
create trigger site_assets_immutable before update or delete on public.site_assets
  for each row execute function private.reject_change();

-- ── RLS: 학교 구성원만 읽고, 기능이 켜진 학교에서만 쓴다 ─────
alter table public.site_settings enable row level security;
alter table public.site_entries enable row level security;
alter table public.site_entry_versions enable row level security;
alter table public.site_publications enable row level security;
alter table public.site_assets enable row level security;

create policy site_settings_read on public.site_settings for select to authenticated using (app.is_member(school_id));
create policy site_settings_insert on public.site_settings for insert to authenticated
  with check (app.is_school_admin(school_id) and app.has_module(school_id, 'homepage'));
create policy site_settings_update on public.site_settings for update to authenticated
  using (app.is_school_admin(school_id)) with check (app.is_school_admin(school_id) and app.has_module(school_id, 'homepage'));

create policy site_entries_read on public.site_entries for select to authenticated using (app.is_member(school_id));
-- 시안은 교사도 만든다(기능이 켜진 학교 구성원). 공개는 학교 관리자만.
create policy site_entries_insert on public.site_entries for insert to authenticated
  with check (app.is_member(school_id) and app.site_kind_allowed(school_id, kind));
create policy site_entries_update on public.site_entries for update to authenticated
  using (app.is_school_admin(school_id)) with check (app.is_school_admin(school_id) and app.site_kind_allowed(school_id, kind));

create policy site_versions_read on public.site_entry_versions for select to authenticated using (app.is_member(school_id));
create policy site_versions_insert on public.site_entry_versions for insert to authenticated
  with check (app.is_member(school_id) and exists (
    select 1 from public.site_entries e where e.id = entry_id and e.school_id = site_entry_versions.school_id
      and app.site_kind_allowed(e.school_id, e.kind)));

create policy site_publications_read on public.site_publications for select to authenticated using (app.is_member(school_id));
create policy site_publications_insert on public.site_publications for insert to authenticated
  with check (app.is_school_admin(school_id) and exists (
    select 1 from public.site_entries e where e.id = entry_id and e.school_id = site_publications.school_id
      and app.site_kind_allowed(e.school_id, e.kind)));

create policy site_assets_read on public.site_assets for select to authenticated using (app.is_member(school_id));
create policy site_assets_insert on public.site_assets for insert to authenticated
  with check (app.is_member(school_id) and app.has_module(school_id, 'homepage'));

grant select, insert, update on public.site_settings, public.site_entries to authenticated;
grant select, insert on public.site_entry_versions, public.site_publications, public.site_assets to authenticated;
grant usage on sequence public.site_publications_id_seq to authenticated;

-- ── 방문자용 공개 함수 (anon · authenticated) ────────────────
-- 열린 사이트: 설정이 공개 상태이고, 학교가 이용 중지가 아니며, homepage 기능이 켜져 있어야 한다.
create or replace function private.open_site(p_slug text) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select s.school_id from public.site_settings s join public.schools c on c.id = s.school_id
  where s.public_slug = p_slug and s.is_open and c.status <> 'suspended' and 'homepage' = any(private.school_modules(s.school_id))
$$;

-- 항목별 지금 공개된 판 (마지막 공개 기록이 '내림'이면 제외)
create or replace function private.live_versions(target uuid)
returns table (entry_id uuid, kind text, key text, visibility text, sort integer, meta jsonb, version_id uuid, version integer, content jsonb, published_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select e.id, e.kind, e.key, e.visibility, e.sort, e.meta, v.id, v.version, v.content, p.published_at
  from public.site_entries e
  join lateral (select * from public.site_publications x where x.entry_id = e.id order by x.id desc limit 1) p on true
  join public.site_entry_versions v on v.id = p.version_id
  where e.school_id = target and private.site_kind_allowed(target, e.kind)
$$;

create or replace function app.public_site(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare sid uuid; result jsonb;
begin
  sid := private.open_site(p_slug);
  if sid is null then return null; end if;
  select jsonb_build_object(
    'slug', s.public_slug, 'school', c.name, 'default_lang', s.default_lang, 'langs', to_jsonb(s.langs), 'theme', s.theme,
    'title', s.site_title,
    'stories', 'stories' = any(private.school_modules(sid)),
    'nav', coalesce((select jsonb_agg(jsonb_build_object('key', l.key, 'title', l.content -> 'title') order by l.sort, l.key)
                     from private.live_versions(sid) l where l.kind = 'page' and l.visibility = 'public' and l.key <> 'home'), '[]'::jsonb),
    'has_news', exists (select 1 from private.live_versions(sid) l where l.kind = 'news' and l.visibility = 'public'))
  into result
  from public.site_settings s join public.schools c on c.id = s.school_id where s.school_id = sid;
  return result;
end $$;

create or replace function app.public_entry(p_slug text, entry_kind text, entry_key text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('kind', l.kind, 'key', l.key, 'visibility', l.visibility, 'meta', l.meta,
                            'version', l.version, 'content', l.content, 'published_at', l.published_at)
  from private.live_versions(private.open_site(p_slug)) l
  where l.kind = entry_kind and l.key = entry_key
$$;

create or replace function app.public_list(p_slug text, entry_kind text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', l.key, 'meta', l.meta, 'title', l.content -> 'title',
                            'summary', l.content -> 'summary', 'cover', l.content -> 'cover', 'published_at', l.published_at)
                  order by l.sort, l.published_at desc), '[]'::jsonb)
  from private.live_versions(private.open_site(p_slug)) l
  where l.kind = entry_kind and l.visibility = 'public'
$$;

-- 그림은 '지금 공개된 판'이 가리키는 것만 내준다(시안에만 쓰인 그림은 방문자에게 보이지 않음)
create or replace function app.public_asset(p_slug text, p_asset uuid) returns table (mime text, bytes bytea, sha256 text)
language sql stable security definer set search_path = public, pg_temp as $$
  select a.mime, a.bytes, a.sha256 from public.site_assets a
  where a.id = p_asset and a.school_id = private.open_site(p_slug)
    and exists (select 1 from private.live_versions(a.school_id) l where l.content::text like '%' || p_asset::text || '%')
$$;

revoke all on function app.public_site(text), app.public_entry(text, text, text), app.public_list(text, text), app.public_asset(text, uuid) from public;
grant usage on schema app to anon;
grant execute on function app.public_site(text), app.public_entry(text, text, text), app.public_list(text, text), app.public_asset(text, uuid) to anon, authenticated;
