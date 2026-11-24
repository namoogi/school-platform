-- 44차: R2 키에 학교 경계 (ADR 0019 단계 A1)
-- 새 키: 's/<school_id>/<sha256>'. 같은 학교 안에서만 중복 제거하고, 학교를 떼어 낼 때(내보내기·삭제) 접두어로 다룬다.
-- 예전 키 'sha256/<sha256>'도 그대로 유효(이미 적힌 것이 있어도 깨지지 않음). 바이트 이동은 없다.
select set_config('request.jwt.claims', '{}', true);

alter table public.site_assets drop constraint site_assets_object_key;
alter table public.site_assets add constraint site_assets_object_key
  check (object_key is null or object_key = 'sha256/' || sha256 or object_key = 's/' || school_id::text || '/' || sha256);

grant create on schema agent to agent_writer;
set local role agent_writer;

-- 올리기 전 확인: 학교 id 를 돌려줘 앱이 학교 접두어로 R2에 올린다
drop function agent.can_upload(text);
create function agent.can_upload(p_token text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare c record;
begin
  select * into c from app.agent_enter(p_token);
  perform app.agent_need(c.t_perms, 'upload');
  return jsonb_build_object('ok', true, 'school_id', c.t_school);
end $$;

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
    values (c.t_school, left(coalesce(nullif(trim(p_name), ''), 'file'), 200), p_mime, p_size, p_sha256, null,
            's/' || c.t_school::text || '/' || p_sha256, c.t_by)
    returning id into aid;
  insert into public.agent_token_uses(school_id, token_id, action, target_id, detail)
    values (c.t_school, c.t_id, 'asset.upload', aid, jsonb_build_object('mime', p_mime, 'size_bytes', p_size, 'storage', 'r2'));
  return jsonb_build_object('id', aid, 'reused', false);
end $$;

revoke all on function agent.can_upload(text) from public;
grant execute on function agent.can_upload(text) to agent_request;

reset role;
revoke create on schema agent from agent_writer;
