-- 125차: R2로 옮긴 홈페이지 파일의 DB 사본 비우기 (ADR 0018 '비우기는 따로 결정' → 2026-11-28 사용자 지시 "db에 남은 원본 파일도 비워줘")
-- 파일 행은 여전히 고치지 않는다. 허용하는 변화는 두 가지뿐이다.
--  (1) R2 복사 뒤 object_key 를 비어 있을 때 한 번 채우기(43차 그대로)
--  (2) object_key 가 이미 있는 행에서 bytes 만 비우기(이번에 더함). 앱은 R2 객체를 내려받아 sha256 이 같은지 확인한 뒤에만 이 일을 한다.
-- 누가: 전체 관리자만(43차 정책 site_assets_platform_copy 그대로, 열 권한만 bytes 를 더한다).
create or replace function private.site_asset_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'site_assets: 파일 기록은 지울 수 없습니다.' using errcode = 'P0001';
  end if;
  -- (1) 위치를 한 번 적기
  if old.object_key is null and new.object_key is not null
     and (to_jsonb(new) - 'object_key') is not distinct from (to_jsonb(old) - 'object_key') then
    return new;
  end if;
  -- (2) R2 위치가 있는 행의 DB 사본만 비우기
  if old.object_key is not null and new.object_key is not distinct from old.object_key
     and old.bytes is not null and new.bytes is null
     and (to_jsonb(new) - 'bytes') is not distinct from (to_jsonb(old) - 'bytes') then
    return new;
  end if;
  raise exception 'site_assets: 파일 기록은 고칠 수 없습니다(R2 위치를 한 번 적거나, R2에 있는 파일의 DB 사본을 비우는 것만).' using errcode = 'P0001';
end $$;
grant update (bytes) on public.site_assets to authenticated;
