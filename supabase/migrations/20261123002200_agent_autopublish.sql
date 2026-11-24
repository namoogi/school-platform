-- 45차: 작업 토큰 '자동 공개' 권한 (ADR 0020)
-- autopublish 가 있는 토큰으로 만들거나 새 판을 저장하면, 앱이 같은 트랜잭션 안에서 그 판을 바로 공개한다(agent.publish_entry).
-- 공개 권한(publish)과 함께만 줄 수 있다. 공개 기록·활동 기록은 지금과 같이 남고(책임자 = 발급 관리자), 사람은 언제든 내린다.
select set_config('request.jwt.claims', '{}', true);

alter table public.agent_tokens drop constraint agent_tokens_perms_check;
alter table public.agent_tokens add constraint agent_tokens_perms_check
  check (cardinality(perms) between 1 and 7 and perms <@ array['read', 'upload', 'create', 'edit', 'archive', 'publish', 'autopublish']::text[]
         and (not ('autopublish' = any(perms)) or 'publish' = any(perms)));

-- 발급 함수는 agent_writer 소유(ADR 0012). 그 역할로 바꿔서 다시 만든다
grant create on schema app to agent_writer;
set local role agent_writer;

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
  if p_perms is null or cardinality(p_perms) = 0 or not (p_perms <@ array['read', 'upload', 'create', 'edit', 'archive', 'publish', 'autopublish']) then
    raise exception '권한(읽기·파일 올리기·만들기·고치기·보관·공개·자동 공개)을 하나 이상 고릅니다.' using errcode = '22023';
  end if;
  if 'autopublish' = any(p_perms) and not ('publish' = any(p_perms)) then
    raise exception '자동 공개는 공개 권한과 함께 고릅니다.' using errcode = '22023';
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

reset role;
revoke create on schema app from agent_writer;
