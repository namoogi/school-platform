-- 51차: 관제 세션의 학교 작업 권한 (ADR 0024, 사용자 결정 2026-11-24 "관제 세션은 전체에 대한 작업권한이 있어야 해")
-- 관제(점검 토큰)는 어느 학교든 짧은 기한의 학교 작업 토큰을 발급해 기존 AI 작업 API(agent.*)로 일한다.
-- 판 쌓기·base_version·활동 기록 규칙이 그대로 적용되고, 발급은 학교 접근 기록에 남으며,
-- 토큰은 그 학교 'AI 작업 공간' 목록에 '관제 세션'으로 보인다.
select set_config('request.jwt.claims', '{}', true);

create or replace function control.issue_school_token(p_token text, p_slug text, p_kinds text[], p_perms text[], p_days integer, p_label text)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare sid uuid; sname text; tok text; exp timestamptz; insp constant uuid := '0c1a0de0-0000-4000-8000-000000000001';
begin
  if p_token is null or p_token !~ '^insp_[0-9a-f]{64}$' or private.inspector_user_for(p_token) is null then
    raise exception '점검 토큰이 올바르지 않거나, 기한이 지났거나, 폐기되었습니다.' using errcode = '28000';
  end if;
  select s.school_id, c.name into sid, sname from public.site_settings s join public.schools c on c.id = s.school_id
   where s.public_slug = p_slug and c.status <> 'suspended';
  if sid is null then raise exception '그 주소의 학교 홈페이지가 없습니다.' using errcode = 'P0002'; end if;
  if p_days is null or p_days < 1 or p_days > 30 then raise exception '관제 발급 기한은 1~30일입니다.' using errcode = '22023'; end if;
  if p_kinds is null or cardinality(p_kinds) = 0 or not (p_kinds <@ array['story', 'page', 'news']) then
    raise exception '항목 종류는 story·page·news 가운데 고릅니다.' using errcode = '22023';
  end if;
  if p_perms is null or cardinality(p_perms) = 0 or not (p_perms <@ array['read', 'upload', 'create', 'edit', 'archive', 'publish', 'autopublish'])
     or ('autopublish' = any(p_perms) and not ('publish' = any(p_perms))) then
    raise exception '권한은 read·upload·create·edit·archive·publish·autopublish 가운데 고릅니다(자동 공개는 공개와 함께).' using errcode = '22023';
  end if;
  if not ('homepage' = any(private.school_modules(sid))) or ('story' = any(p_kinds) and not ('stories' = any(private.school_modules(sid)))) then
    raise exception '이 학교 라이선스에 없는 기능입니다.' using errcode = '42501';
  end if;
  tok := 'agt_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  exp := now() + make_interval(days => p_days);
  insert into public.agent_tokens(school_id, label, kinds, keys, perms, entry_key, agent_kind, token_sha256, created_by, expires_at)
    values (sid, '관제 세션 · ' || coalesce(nullif(trim(left(p_label, 60)), ''), '학교 작업'), p_kinds, null, p_perms, null, 'claude-code',
            encode(sha256(convert_to(tok, 'UTF8')), 'hex'), insp, exp);
  insert into public.access_log(school_id, actor, actor_label, action, detail)
    values (sid, insp, '관제 세션', 'agent.token_create_control', jsonb_build_object('label', p_label, 'days', p_days, 'kinds', p_kinds, 'perms', p_perms));
  return jsonb_build_object('token', tok, 'school', sname, 'slug', p_slug, 'kinds', p_kinds, 'perms', p_perms, 'expires_at', exp);
end $$;
revoke all on function control.issue_school_token(text, text, text[], text[], integer, text) from public;
grant execute on function control.issue_school_token(text, text, text[], text[], integer, text) to agent_request;
