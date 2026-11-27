-- ADR 0037: 언어는 목록 표로. 언어를 더할 때 코드·구조를 바꾸지 않는다.
-- languages: 쓸 수 있는 언어 목록(관제가 더함). ui_messages: 화면 문구 번역 사전(이름표 × 언어).
-- 기준 문구(한국어)는 코드의 목록(src/lib/i18n/catalog.ts)에 있고, 다른 언어는 모두 이 사전에서 읽는다.
-- 번역이 없으면 대체 순서(언어 → fallback → 영어 → 한국어)로 보여 준다.

create table public.languages (
  code text primary key check (code ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  native_name text not null check (length(native_name) between 1 and 60),
  direction text not null default 'ltr' check (direction in ('ltr', 'rtl')),
  fallback text references public.languages(code) on update cascade,
  active boolean not null default true,
  sort integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fallback is null or fallback <> code)
);
comment on table public.languages is 'ADR 0037 — 쓸 수 있는 언어 목록(관제 영역). 누구나 읽고, 전체 관리자만 명령 함수로 바꾼다.';

create table public.ui_messages (
  lang text not null references public.languages(code) on update cascade on delete cascade,
  key text not null check (key ~ '^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_-]+)+$' and length(key) <= 120),
  text text not null check (length(text) between 1 and 4000),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (lang, key)
);
comment on table public.ui_messages is 'ADR 0037 — 화면 문구 번역 사전(관제 영역). 화면 문구는 비밀이 아니므로 누구나 읽는다(로그인 화면 포함).';

alter table public.languages enable row level security;
alter table public.ui_messages enable row level security;
grant select on public.languages, public.ui_messages to anon, authenticated;
create policy languages_read on public.languages for select to anon, authenticated using (true);
create policy ui_messages_read on public.ui_messages for select to anon, authenticated using (true);

-- 사용자 화면 언어(없으면 학교·브라우저·기본 순)
alter table public.user_preferences add column ui_lang text references public.languages(code) on update cascade on delete set null;

insert into public.languages(code, native_name, direction, fallback, sort) values
  ('ko', '한국어', 'ltr', null, 10),
  ('en', 'English', 'ltr', null, 20);
insert into public.languages(code, native_name, direction, fallback, sort) values
  ('th', 'ไทย', 'ltr', 'en', 30);

-- 명령 함수: 전체 관리자만. 언어 추가·고치기
create or replace function app.save_language(p jsonb) returns text
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare c text := p ->> 'code';
begin
  if not app.is_platform_admin() then raise exception '전체 관리자만 언어를 바꿉니다.' using errcode = '42501'; end if;
  insert into public.languages(code, native_name, direction, fallback, active, sort)
  values (c, p ->> 'native_name', coalesce(p ->> 'direction', 'ltr'), nullif(p ->> 'fallback', ''),
          coalesce((p ->> 'active')::boolean, true), coalesce((p ->> 'sort')::int, 100))
  on conflict (code) do update set native_name = excluded.native_name, direction = excluded.direction,
    fallback = excluded.fallback, active = excluded.active, sort = excluded.sort, updated_at = now();
  return c;
end $$;

-- 명령 함수: 번역 묶음 넣기. overwrite=false 면 이미 있는 번역은 두고 빈 것만 채운다(배포 때 기본 묶음 넣기에도 씀)
create or replace function app.save_ui_messages(p_lang text, p_messages jsonb, p_overwrite boolean default true) returns integer
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare n integer;
begin
  if not app.is_platform_admin() then raise exception '전체 관리자만 번역을 바꿉니다.' using errcode = '42501'; end if;
  if jsonb_typeof(p_messages) <> 'object' then raise exception '번역은 {이름표: 글자} 형태입니다.' using errcode = '22023'; end if;
  insert into public.ui_messages(lang, key, text, updated_by)
  select p_lang, k, v, app.uid() from jsonb_each_text(p_messages) as e(k, v) where btrim(v) <> ''
  on conflict (lang, key) do update set text = excluded.text, updated_by = excluded.updated_by, updated_at = now()
    where p_overwrite;
  get diagnostics n = row_count;
  update public.languages set updated_at = now() where code = p_lang;
  return n;
end $$;

revoke all on function app.save_language(jsonb), app.save_ui_messages(text, jsonb, boolean) from public;
grant execute on function app.save_language(jsonb), app.save_ui_messages(text, jsonb, boolean) to authenticated;
