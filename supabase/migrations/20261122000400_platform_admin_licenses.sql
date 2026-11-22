-- 16차: 전체 관리자, Google 로그인(외부 인증), 학교별 라이선스(좌석·모듈), 초대, 접근 기록, 청구 기록
-- 결정(2026-11-22 사용자): 학교 단위로 만들고, 학교 관리자가 좌석 수와 사용할 기능을 등록하며 과금한다.
-- 전체 관리자는 모든 학교에 접근할 수 있다. 접근은 학교가 볼 수 있는 기록으로 남긴다.

-- ── 계정 ─────────────────────────────────────────────────
alter table private.app_users alter column password_hash drop not null;
alter table private.app_users add column auth_subject text unique;           -- Supabase Auth 사용자 ID (Google 등)
alter table private.app_users add column is_platform_admin boolean not null default false;
create unique index app_users_email_lower on private.app_users (lower(email));

create or replace function app.is_platform_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select u.is_platform_admin from private.app_users u where u.id = app.uid()), false)
$$;
revoke all on function app.is_platform_admin() from public;
grant execute on function app.is_platform_admin() to authenticated;

-- 소속 확인: 전체 관리자는 모든 학교에 접근한다. (기존 RLS 정책이 모두 이 함수를 쓴다)
create or replace function app.is_member(target uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.is_platform_admin() or exists (
    select 1 from public.memberships m where m.user_id = app.uid() and m.school_id = target
  )
$$;

create or replace function app.is_school_admin(target uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.is_platform_admin() or exists (
    select 1 from public.memberships m where m.user_id = app.uid() and m.school_id = target and m.role = 'admin'
  )
$$;
revoke all on function app.is_school_admin(uuid) from public;
grant execute on function app.is_school_admin(uuid) to authenticated;

-- ── 학교 상태와 역할 ──────────────────────────────────────
alter table public.schools add column status text not null default 'active' check (status in ('trial', 'active', 'suspended'));
alter table public.memberships drop constraint memberships_role_check;
alter table public.memberships add constraint memberships_role_check check (role in ('admin', 'teacher'));
alter table public.memberships add column created_at timestamptz not null default now();

drop policy memberships_self_read on public.memberships;
create policy memberships_read on public.memberships for select to authenticated
  using (user_id = app.uid() or app.is_member(school_id));

-- ── 모듈 목록과 가격 (전체 관리자가 관리) ────────────────
create table public.module_catalog (
  key text primary key,
  name text not null,
  description text not null,
  monthly_price_per_seat_krw integer not null default 0 check (monthly_price_per_seat_krw >= 0),
  available boolean not null default true,      -- false: 준비 중 (선택 불가)
  required boolean not null default false,      -- true: 항상 포함
  sort integer not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.module_catalog(key, name, description, available, required, sort) values
  ('intake',      '학교 제도 분석', '학교 자료를 읽고 관리자 확인으로 학사 규칙을 확정합니다.', true,  true,  10),
  ('records',     '학사 문서실',   '확정 규칙과 양식으로 문서를 발행하고 발행본을 보존합니다.', true,  false, 20),
  ('ai_analysis', 'AI 분석',       '규칙 기반 분석에 AI 분석을 더합니다. (준비 중)',            false, false, 30),
  ('typography',  '서체 설정',     '학교별 다국어 서체·행간을 정해 문서에 적용합니다. (준비 중)', false, false, 40),
  ('exchange',    '학교 간 교류',  '학교 사이의 교육 교류와 자료 공유. (준비 중)',             false, false, 50);

alter table public.module_catalog enable row level security;
grant select on public.module_catalog to authenticated;
create policy module_catalog_read on public.module_catalog for select to authenticated using (true);

-- ── 라이선스 (버전으로 쌓고 수정하지 않음) ────────────────
create table public.school_licenses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  version integer not null,
  seats integer not null check (seats between 1 and 10000),
  modules text[] not null,
  monthly_estimate_krw integer not null,
  price_snapshot jsonb not null,                -- 계산에 쓴 모듈별 좌석 단가
  note text,
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  unique (school_id, version)
);
create trigger school_licenses_immutable before update or delete on public.school_licenses
  for each row execute function private.reject_change();
alter table public.school_licenses enable row level security;
grant select on public.school_licenses to authenticated;
create policy school_licenses_read on public.school_licenses for select to authenticated using (app.is_member(school_id));

-- ── 초대 ─────────────────────────────────────────────────
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  email text not null,
  role text not null check (role in ('admin', 'teacher')),
  invited_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);
create unique index invitations_pending on public.invitations (school_id, lower(email)) where accepted_at is null and revoked_at is null;
alter table public.invitations enable row level security;
grant select on public.invitations to authenticated;
create policy invitations_read on public.invitations for select to authenticated using (app.is_school_admin(school_id));

-- ── 접근·운영 기록 (학교 관리자도 볼 수 있음) ─────────────
create table public.access_log (
  id bigint generated always as identity primary key,
  school_id uuid references public.schools(id),
  actor uuid not null,
  actor_label text not null,
  action text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create trigger access_log_immutable before update or delete on public.access_log
  for each row execute function private.reject_change();
alter table public.access_log enable row level security;
grant select on public.access_log to authenticated;
create policy access_log_read on public.access_log for select to authenticated
  using (app.is_platform_admin() or (school_id is not null and app.is_school_admin(school_id)));

-- ── 청구 기록 (실제 결제 연동 전: 청구 예정액 확정 기록) ───
create table public.billing_statements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  license_id uuid not null references public.school_licenses(id),
  seats integer not null,
  modules text[] not null,
  amount_krw integer not null,
  status text not null default 'estimated' check (status in ('estimated')),
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  unique (school_id, period)
);
create trigger billing_statements_immutable before update or delete on public.billing_statements
  for each row execute function private.reject_change();
alter table public.billing_statements enable row level security;
grant select on public.billing_statements to authenticated;
create policy billing_read on public.billing_statements for select to authenticated using (app.is_school_admin(school_id));

-- ── 운영 함수 (권한 검사를 함수 안에서 한다) ──────────────
create or replace function private.actor_label() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select u.display_name || case when u.is_platform_admin then ' (전체 관리자)' else '' end
                   from private.app_users u where u.id = app.uid()), '알 수 없음')
$$;

create or replace function app.log_access(target uuid, act text, info jsonb default '{}') returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.is_member(target) then raise exception '권한이 없습니다.' using errcode = '42501'; end if;
  insert into public.access_log(school_id, actor, actor_label, action, detail)
  values (target, app.uid(), private.actor_label(), act, coalesce(info, '{}'));
end $$;

create or replace function private.seats_used(target uuid) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select (select count(*) from public.memberships where school_id = target)::int
       + (select count(*) from public.invitations where school_id = target and accepted_at is null and revoked_at is null)::int
$$;

create or replace function app.seats_used(target uuid) returns integer
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not app.is_member(target) then raise exception '권한이 없습니다.' using errcode = '42501'; end if;
  return private.seats_used(target);
end $$;

-- 라이선스 등록·변경: 학교 관리자 또는 전체 관리자. 새 버전으로 쌓는다.
create or replace function app.set_license(target uuid, new_seats integer, new_modules text[], memo text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  mods text[];
  bad text;
  prices jsonb;
  total integer;
  next_version integer;
  new_id uuid;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 라이선스를 바꿀 수 있습니다.' using errcode = '42501'; end if;
  if new_seats is null or new_seats < 1 or new_seats > 10000 then raise exception '좌석 수는 1~10000 사이여야 합니다.' using errcode = '22023'; end if;
  if new_seats < private.seats_used(target) then
    raise exception '이미 사용 중인 좌석(구성원·대기 중 초대 %석)보다 적게 줄일 수 없습니다.', private.seats_used(target) using errcode = '22023';
  end if;
  select k into bad from unnest(coalesce(new_modules, '{}')) k
    where not exists (select 1 from public.module_catalog c where c.key = k and c.available) limit 1;
  if bad is not null then raise exception '선택할 수 없는 기능입니다: %', bad using errcode = '22023'; end if;
  -- 필수 모듈은 항상 포함, 중복 제거, 목록 순서로 정렬
  select array_agg(c.key order by c.sort) into mods from public.module_catalog c
    where c.available and (c.required or c.key = any(coalesce(new_modules, '{}')));
  select jsonb_object_agg(c.key, c.monthly_price_per_seat_krw), sum(c.monthly_price_per_seat_krw)::int * new_seats
    into prices, total from public.module_catalog c where c.key = any(mods);
  select coalesce(max(version), 0) + 1 into next_version from public.school_licenses where school_id = target;
  insert into public.school_licenses(school_id, version, seats, modules, monthly_estimate_krw, price_snapshot, note)
    values (target, next_version, new_seats, mods, coalesce(total, 0), coalesce(prices, '{}'), memo) returning id into new_id;
  perform app.log_access(target, 'license.set', jsonb_build_object('version', next_version, 'seats', new_seats, 'modules', mods));
  return new_id;
end $$;

-- 구성원 초대: 좌석 안에서만. 이미 가입한 계정이면 바로 구성원으로 추가한다.
create or replace function app.invite_member(target uuid, invite_email text, invite_role text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e text := lower(trim(invite_email));
  lic record;
  existing uuid;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 초대할 수 있습니다.' using errcode = '42501'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception '이메일 형식이 아닙니다.' using errcode = '22023'; end if;
  if invite_role not in ('admin', 'teacher') then raise exception '역할을 선택해 주세요.' using errcode = '22023'; end if;
  select * into lic from public.school_licenses where school_id = target order by version desc limit 1;
  if lic is null then raise exception '라이선스를 먼저 등록해 주세요.' using errcode = '22023'; end if;
  select id into existing from private.app_users where lower(email) = e;
  if existing is not null and exists (select 1 from public.memberships where school_id = target and user_id = existing) then
    raise exception '이미 이 학교의 구성원입니다.' using errcode = '22023';
  end if;
  if exists (select 1 from public.invitations where school_id = target and lower(email) = e and accepted_at is null and revoked_at is null) then
    raise exception '이미 초대한 이메일입니다.' using errcode = '22023';
  end if;
  if private.seats_used(target) >= lic.seats then
    raise exception '좌석이 모두 찼습니다(%석). 좌석 수를 늘린 뒤 초대해 주세요.', lic.seats using errcode = '22023';
  end if;
  if existing is not null then
    insert into public.memberships(user_id, school_id, role) values (existing, target, invite_role);
    perform app.log_access(target, 'member.add', jsonb_build_object('email', e, 'role', invite_role));
    return 'added';
  end if;
  insert into public.invitations(school_id, email, role) values (target, e, invite_role);
  perform app.log_access(target, 'member.invite', jsonb_build_object('email', e, 'role', invite_role));
  return 'invited';
end $$;

create or replace function app.revoke_invitation(target uuid, invitation uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.is_school_admin(target) then raise exception '권한이 없습니다.' using errcode = '42501'; end if;
  update public.invitations set revoked_at = now()
    where id = invitation and school_id = target and accepted_at is null and revoked_at is null;
  if not found then raise exception '초대를 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  perform app.log_access(target, 'member.invite_revoke', jsonb_build_object('invitation', invitation));
end $$;

create or replace function app.remove_member(target uuid, member uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.is_school_admin(target) then raise exception '권한이 없습니다.' using errcode = '42501'; end if;
  if (select role from public.memberships where school_id = target and user_id = member) = 'admin'
     and (select count(*) from public.memberships where school_id = target and role = 'admin') <= 1 then
    raise exception '마지막 학교 관리자는 뺄 수 없습니다.' using errcode = '22023';
  end if;
  delete from public.memberships where school_id = target and user_id = member;
  if not found then raise exception '구성원을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  perform app.log_access(target, 'member.remove', jsonb_build_object('user', member));
end $$;

-- 구성원 목록(이메일 포함): 학교 관리자와 전체 관리자만
create or replace function app.school_members(target uuid)
returns table (user_id uuid, email text, display_name text, role text, joined_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not app.is_school_admin(target) then raise exception '권한이 없습니다.' using errcode = '42501'; end if;
  return query select m.user_id, u.email, u.display_name, m.role, m.created_at
    from public.memberships m join private.app_users u on u.id = m.user_id
    where m.school_id = target order by m.role, u.email;
end $$;

-- ── 전체 관리자 전용 ────────────────────────────────────
create or replace function app.create_school(new_slug text, new_name text, new_locale text, admin_email text,
  new_seats integer, new_modules text[]) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare sid uuid;
begin
  if not app.is_platform_admin() then raise exception '전체 관리자만 학교를 만들 수 있습니다.' using errcode = '42501'; end if;
  if new_slug !~ '^[a-z0-9][a-z0-9-]{1,40}$' then raise exception '학교 주소 이름은 영문 소문자·숫자·하이픈 2~41자입니다.' using errcode = '22023'; end if;
  if coalesce(trim(new_name), '') = '' then raise exception '학교 이름을 입력해 주세요.' using errcode = '22023'; end if;
  if new_locale not in ('ko', 'en', 'th') then raise exception '언어는 ko·en·th 중에서 고릅니다.' using errcode = '22023'; end if;
  insert into public.schools(slug, name, locale, status) values (new_slug, trim(new_name), new_locale, 'trial') returning id into sid;
  perform app.log_access(sid, 'school.create', jsonb_build_object('slug', new_slug));
  perform app.set_license(sid, new_seats, new_modules, '학교 생성 시 등록');
  insert into public.document_templates(school_id, version, title, period_heading, assessment_heading, footer_note)
    values (sid, 1,
      case when new_locale = 'ko' then '학기 학습 보고서' else 'Term Learning Report' end,
      case when new_locale = 'ko' then '학기' else 'Term' end,
      case when new_locale = 'ko' then '평가 기간' else 'Assessment window' end,
      case when new_locale = 'ko' then '검토용' else 'For review only' end);
  perform app.invite_member(sid, admin_email, 'admin');
  return sid;
end $$;

create or replace function app.set_school_status(target uuid, new_status text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.is_platform_admin() then raise exception '전체 관리자만 바꿀 수 있습니다.' using errcode = '42501'; end if;
  if new_status not in ('trial', 'active', 'suspended') then raise exception '상태 값이 올바르지 않습니다.' using errcode = '22023'; end if;
  update public.schools set status = new_status where id = target;
  perform app.log_access(target, 'school.status', jsonb_build_object('status', new_status));
end $$;

create or replace function app.set_module_price(module_key text, price integer) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.is_platform_admin() then raise exception '전체 관리자만 가격을 바꿀 수 있습니다.' using errcode = '42501'; end if;
  if price is null or price < 0 or price > 10000000 then raise exception '가격이 올바르지 않습니다.' using errcode = '22023'; end if;
  update public.module_catalog set monthly_price_per_seat_krw = price, updated_at = now() where key = module_key;
  if not found then raise exception '기능을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  insert into public.access_log(school_id, actor, actor_label, action, detail)
    values (null, app.uid(), private.actor_label(), 'price.set', jsonb_build_object('module', module_key, 'price', price));
end $$;

-- 청구 예정액 확정: 그 시점의 최신 라이선스로 한 달 금액을 기록한다. (실제 결제 아님)
create or replace function app.create_statement(target uuid, bill_period text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare lic record; sid uuid;
begin
  if not app.is_platform_admin() then raise exception '전체 관리자만 청구 기록을 만들 수 있습니다.' using errcode = '42501'; end if;
  select * into lic from public.school_licenses where school_id = target order by version desc limit 1;
  if lic is null then raise exception '라이선스가 없는 학교입니다.' using errcode = '22023'; end if;
  insert into public.billing_statements(school_id, period, license_id, seats, modules, amount_krw)
    values (target, bill_period, lic.id, lic.seats, lic.modules, lic.monthly_estimate_krw) returning id into sid;
  perform app.log_access(target, 'billing.statement', jsonb_build_object('period', bill_period, 'amount', lic.monthly_estimate_krw));
  return sid;
end $$;

-- 전체 관리자 화면용 요약
create or replace function app.platform_overview()
returns table (id uuid, slug text, name text, locale text, status text, seats integer, seats_used integer,
               modules text[], monthly_estimate_krw integer, sources integer, documents integer, open_questions integer)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not app.is_platform_admin() then raise exception '권한이 없습니다.' using errcode = '42501'; end if;
  return query
  select s.id, s.slug, s.name, s.locale, s.status, l.seats, private.seats_used(s.id), l.modules, l.monthly_estimate_krw,
    (select count(*)::int from public.source_files f where f.school_id = s.id and f.archived_at is null),
    (select count(*)::int from public.published_documents d where d.school_id = s.id),
    (select count(*)::int from public.rule_questions q where q.school_id = s.id and q.status = 'open')
  from public.schools s
  left join lateral (select * from public.school_licenses x where x.school_id = s.id order by x.version desc limit 1) l on true
  order by s.created_at;
end $$;

do $$
declare f text;
begin
  foreach f in array array['app.log_access(uuid,text,jsonb)', 'app.set_license(uuid,integer,text[],text)',
    'app.invite_member(uuid,text,text)', 'app.revoke_invitation(uuid,uuid)', 'app.remove_member(uuid,uuid)',
    'app.school_members(uuid)', 'app.create_school(text,text,text,text,integer,text[])', 'app.set_school_status(uuid,text)',
    'app.set_module_price(text,integer)', 'app.create_statement(uuid,text)', 'app.platform_overview()', 'app.seats_used(uuid)']
  loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function private.seats_used(uuid) from public;
revoke all on function private.actor_label() from public;

-- 기존 학교: 운영 중, 1판 라이선스(좌석 5, 기본 모듈)
update public.schools set status = 'active';
insert into public.school_licenses(school_id, version, seats, modules, monthly_estimate_krw, price_snapshot, note, created_by)
select s.id, 1, 5, array['intake', 'records'], 0, '{"intake": 0, "records": 0}',
       '16차 마이그레이션 기본값', coalesce((select m.user_id from public.memberships m where m.school_id = s.id limit 1), gen_random_uuid())
from public.schools s
where not exists (select 1 from public.school_licenses l where l.school_id = s.id);

revoke delete, truncate, references, trigger on all tables in schema public from authenticated;
revoke all on all tables in schema public from anon;

-- ── 로그인한 계정 정보 ───────────────────────────────────
create or replace function app.me()
returns table (id uuid, email text, display_name text, is_platform_admin boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select u.id, u.email, u.display_name, u.is_platform_admin from private.app_users u where u.id = app.uid()
$$;
revoke all on function app.me() from public;
grant execute on function app.me() to authenticated;

-- ── 확정·발행은 학교 관리자만 (교사는 자료 등록과 열람) ────
drop policy school_rules_insert on public.school_rules;
create policy school_rules_insert on public.school_rules for insert to authenticated
  with check (app.is_school_admin(school_id) and confirmed_by = app.uid());
drop policy templates_insert on public.document_templates;
create policy templates_insert on public.document_templates for insert to authenticated
  with check (app.is_school_admin(school_id) and created_by = app.uid());
drop policy documents_insert on public.published_documents;
create policy documents_insert on public.published_documents for insert to authenticated
  with check (app.is_school_admin(school_id) and published_by = app.uid());
drop policy rule_questions_update on public.rule_questions;
create policy rule_questions_update on public.rule_questions for update to authenticated
  using (app.is_member(school_id)) with check (app.is_member(school_id));
