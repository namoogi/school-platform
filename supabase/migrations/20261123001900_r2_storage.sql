-- 43차: 파일 저장소 Cloudflare R2 연결 (ADR 0018)
-- 학교 홈페이지 그림·PDF의 바이트를 DB(bytea) 대신 R2(비공개 버킷)에 둔다. 메타데이터·학교 경계(RLS)·공개 판단은 DB에 그대로.
--  · object_key = 'sha256/<그 파일의 sha256>' 로만 적을 수 있다(다른 파일을 가리킬 수 없음, 같은 내용은 한 번만 저장).
--  · bytes 는 이제 비어 있을 수 있다(R2에만 있는 파일). 둘 중 하나는 반드시 있다.
--  · 파일 행은 여전히 바꾸지 않는다. 예외는 R2 복사 뒤 object_key 를 한 번 채우는 것뿐(DB 사본은 남긴다; 비우기는 따로 결정).
--  · R2 설정(Vercel 환경 변수)이 없으면 앱은 지금처럼 DB에 저장한다.
select set_config('request.jwt.claims', '{}', true);

alter table public.site_assets alter column bytes drop not null;
alter table public.site_assets add column object_key text;
alter table public.site_assets add constraint site_assets_object_key
  check (object_key is null or object_key = 'sha256/' || sha256);
alter table public.site_assets add constraint site_assets_has_bytes
  check (bytes is not null or object_key is not null);

-- 바꾸기 막기 → object_key 를 비어 있을 때 한 번만 채우는 것만 허용
create or replace function private.site_asset_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'site_assets: 파일 기록은 지울 수 없습니다.' using errcode = 'P0001';
  end if;
  if old.object_key is not null or new.object_key is null
     or (to_jsonb(new) - 'object_key') is distinct from (to_jsonb(old) - 'object_key') then
    raise exception 'site_assets: 파일 기록은 고칠 수 없습니다(R2 위치를 한 번 적는 것만).' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger site_assets_immutable on public.site_assets;
create trigger site_assets_guard before update or delete on public.site_assets
  for each row execute function private.site_asset_guard();

-- R2 복사는 전체 관리자만(관리 화면의 '복사' 단추)
grant update (object_key) on public.site_assets to authenticated;
create policy site_assets_platform_copy on public.site_assets for update to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

-- 공개 그림: 공개 판 판단은 그대로, R2 위치를 함께 돌려준다
drop function app.public_asset(text, uuid);
create function app.public_asset(p_slug text, p_asset uuid) returns table (mime text, bytes bytea, sha256 text, object_key text)
language sql stable security definer set search_path = public, pg_temp as $$
  select a.mime, a.bytes, a.sha256, a.object_key from public.site_assets a
  where a.id = p_asset and a.school_id = private.open_site(p_slug)
    and exists (select 1 from private.live_versions(a.school_id) l where l.content::text like '%' || p_asset::text || '%')
$$;
revoke all on function app.public_asset(text, uuid) from public;
grant execute on function app.public_asset(text, uuid) to anon, authenticated;

-- ── 작업 토큰: R2에 먼저 올리고 등록하는 길 (agent_writer 소유, ADR 0012와 같은 방식) ──
grant create on schema agent to agent_writer;
set local role agent_writer;

-- 올리기 전에 토큰·권한만 확인한다(실패하면 R2에 아무것도 쓰지 않는다)
create or replace function agent.can_upload(p_token text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare c record;
begin
  select * into c from app.agent_enter(p_token);
  perform app.agent_need(c.t_perms, 'upload');
  return jsonb_build_object('ok', true);
end $$;

-- R2에 올린 파일을 등록한다. 형식·크기·내용 검사는 앱이 바이트로 먼저 했고(checkUpload), 여기서는 범위와 값 모양을 다시 본다
create or replace function agent.register_asset(p_token text, p_name text, p_mime text, p_size integer, p_sha256 text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare c record; aid uuid; lim integer;
begin
  select * into c from app.agent_enter(p_token);
  perform app.agent_need(c.t_perms, 'upload');
  if p_mime is null or p_mime not in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf') then
    raise exception 'PNG·JPG·WEBP 그림이나 PDF만 올릴 수 있습니다.' using errcode = '22023';
  end if;
  lim := case when p_mime = 'application/pdf' then 4194304 else 5242880 end;
  if p_size is null or p_size < 1 or p_size > lim then
    raise exception '파일이 비었거나 너무 큽니다(PDF 4MB, 그림 5MB 이하).' using errcode = '22023';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then raise exception '파일 해시가 올바르지 않습니다.' using errcode = '22023'; end if;
  select a.id into aid from public.site_assets a where a.school_id = c.t_school and a.sha256 = p_sha256 limit 1;
  if aid is not null then return jsonb_build_object('id', aid, 'reused', true); end if;
  insert into public.site_assets(school_id, name, mime, size_bytes, sha256, bytes, object_key, created_by)
    values (c.t_school, left(coalesce(nullif(trim(p_name), ''), 'file'), 200), p_mime, p_size, p_sha256, null, 'sha256/' || p_sha256, c.t_by)
    returning id into aid;
  insert into public.agent_token_uses(school_id, token_id, action, target_id, detail)
    values (c.t_school, c.t_id, 'asset.upload', aid, jsonb_build_object('mime', p_mime, 'size_bytes', p_size, 'storage', 'r2'));
  return jsonb_build_object('id', aid, 'reused', false);
end $$;

-- 새 함수 권한은 소유자인 동안 정리한다(#48)
revoke all on function agent.can_upload(text) from public;
revoke all on function agent.register_asset(text, text, text, integer, text) from public;
grant execute on function agent.can_upload(text), agent.register_asset(text, text, text, integer, text) to agent_request;

reset role;
revoke create on schema agent from agent_writer;
