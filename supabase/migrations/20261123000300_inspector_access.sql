-- 30차: Claude 점검 접근 (읽기 전용)
-- 사용자가 Google 로그인을 대신하지 않아도 Claude 세션이 운영 화면을 보고 점검할 수 있게 한다.
--  · 전용 계정 하나(점검 계정): 전체 관리자처럼 모든 화면을 '읽기'만 한다. 앱이 이 계정의 DB 트랜잭션을 read only 로 연다.
--  · 비밀번호가 없다. 전체 관리자가 발급한 토큰(요청 머리 x-inspector-token)으로만 들어온다.
--  · 토큰은 해시(sha256)만 저장하고, 기한·폐기·마지막 사용 시각을 남긴다. 발급·폐기는 운영 기록(access_log)에 남는다.

insert into private.app_users(id, email, display_name, is_platform_admin)
values ('0c1a0de0-0000-4000-8000-000000000001', 'inspector@onschools.internal', 'Claude 점검(읽기 전용)', true)
on conflict (id) do nothing;

create table private.inspector_tokens (
  id uuid primary key default gen_random_uuid(),
  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  label text not null check (length(trim(label)) between 1 and 80),
  created_by uuid not null references private.app_users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz
);

create or replace function private.is_inspector() returns boolean
language sql stable as $$ select app.uid() = '0c1a0de0-0000-4000-8000-000000000001'::uuid $$;

-- 발급: 전체 관리자(점검 계정 자신은 제외). 토큰 원문은 이때 한 번만 돌려준다.
create or replace function app.create_inspector_token(p_label text, p_days integer default 30) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare token text;
begin
  if not app.is_platform_admin() or private.is_inspector() then raise exception '전체 관리자만 점검 토큰을 발급할 수 있습니다.' using errcode = '42501'; end if;
  if p_days is null or p_days < 1 or p_days > 90 then raise exception '기한은 1~90일입니다.' using errcode = '22023'; end if;
  token := 'insp_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into private.inspector_tokens(token_sha256, label, created_by, expires_at)
    values (encode(sha256(convert_to(token, 'UTF8')), 'hex'), coalesce(nullif(trim(p_label), ''), 'Claude 세션'), app.uid(), now() + make_interval(days => p_days));
  perform app.log_access(null, 'inspector.token_create', jsonb_build_object('label', p_label, 'days', p_days));
  return token;
end $$;

create or replace function app.list_inspector_tokens()
returns table (id uuid, label text, created_at timestamptz, expires_at timestamptz, revoked_at timestamptz, last_used_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not app.is_platform_admin() then raise exception '전체 관리자만 볼 수 있습니다.' using errcode = '42501'; end if;
  return query select t.id, t.label, t.created_at, t.expires_at, t.revoked_at, t.last_used_at from private.inspector_tokens t order by t.created_at desc;
end $$;

create or replace function app.revoke_inspector_token(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.is_platform_admin() or private.is_inspector() then raise exception '전체 관리자만 폐기할 수 있습니다.' using errcode = '42501'; end if;
  update private.inspector_tokens set revoked_at = now() where id = p_id and revoked_at is null;
  perform app.log_access(null, 'inspector.token_revoke', jsonb_build_object('id', p_id));
end $$;

-- 로그인 확인 단계(앱의 asSystem)에서만 부른다: 유효한 토큰이면 점검 계정 id
create or replace function private.inspector_user_for(p_token text) returns uuid
language plpgsql as $$
declare tid uuid;
begin
  select t.id into tid from private.inspector_tokens t
   where t.token_sha256 = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and t.revoked_at is null and t.expires_at > now();
  if tid is null then return null; end if;
  update private.inspector_tokens set last_used_at = now() where id = tid and (last_used_at is null or last_used_at < now() - interval '5 minutes');
  return '0c1a0de0-0000-4000-8000-000000000001'::uuid;
end $$;

revoke all on function app.create_inspector_token(text, integer), app.list_inspector_tokens(), app.revoke_inspector_token(uuid) from public;
grant execute on function app.create_inspector_token(text, integer), app.list_inspector_tokens(), app.revoke_inspector_token(uuid) to authenticated;
