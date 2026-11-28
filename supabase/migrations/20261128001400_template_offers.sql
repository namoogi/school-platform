-- 121차: 학사 관리 템플릿 새 판 → 학교에 '제안' (ADR 0043 3단계, ADR 0027 기본판 제안과 같은 모양)
-- · 관제가 템플릿 새 판을 내면, 그 템플릿을 쓰는 학교마다 제안 1건이 생긴다(학교 사본은 바뀌지 않음)
-- · 학교 관리자가 수락·보류·거절한다. 수락 = 앱이 같은 트랜잭션에서 새 판을 적용(빠진 것만 더함)한 뒤 기록
-- · 템플릿 표는 외래키로 묶지 않는다(학교 관할 판과 같음, 학교 이전 때 관제 표를 끌고 가지 않게). 있는지는 함수가 본다
select set_config('request.jwt.claims', '{}', true);

create table public.academic_template_offers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  template_key text not null check (template_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  from_version integer not null check (from_version >= 1),
  to_version integer not null check (to_version > from_version),
  status text not null default 'offered' check (status in ('offered', 'accepted', 'declined', 'held')),
  note text check (note is null or length(note) <= 500),
  -- 더 높은 판을 수락할 때 함께 닫힌 제안은 그 판 번호를 남긴다(화면이 언어마다 '새 판과 함께 반영'으로 그림)
  included_in integer check (included_in is null or included_in > to_version),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (school_id, template_key, to_version)
);
create index academic_template_offers_open on public.academic_template_offers (school_id) where status in ('offered', 'held');
create trigger academic_template_offers_guard before delete on public.academic_template_offers for each row execute function private.guard_columns();

alter table public.academic_template_offers enable row level security;
revoke all on public.academic_template_offers from public, anon, authenticated;
grant select on public.academic_template_offers to authenticated;
create policy academic_template_offers_read on public.academic_template_offers for select to authenticated
  using (app.is_platform_admin() or app.is_member(school_id));

-- 그 템플릿을 지금 쓰는(최신 관할 판의 키가 같고 판이 낮은) 학교마다 제안을 만든다
create or replace function private.offer_academic_template(k text, v integer) returns integer
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare n integer;
begin
  insert into public.academic_template_offers(school_id, template_key, from_version, to_version)
  select p.school_id, k, p.template_version, v
    from (select distinct on (school_id) school_id, template_key, template_version from public.school_profiles order by school_id, version desc) p
   where p.template_key = k and p.template_version < v
  on conflict (school_id, template_key, to_version) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function private.offer_academic_template(text, integer) from public, anon, authenticated;

-- 학교 관할 판이 새로 생길 때마다(처음 고르기·다른 템플릿으로 바꾸기·옛 화면에서 본 판 고르기 등 어떤 길이든)
-- 그 템플릿의 더 높은 판이 이미 있으면 제안을 만든다(새 판 공개와 학교 선택이 엇갈려도 빠지지 않게, Codex 199번 PR 검토)
create or replace function private.offer_on_school_profile() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v integer;
begin
  if new.template_key is null or new.template_version is null then return null; end if;
  -- 새 판 내기(app.publish_academic_template)와 같은 잠금: 둘이 동시에 돌면 한쪽이 끝날 때까지 기다린 뒤
  -- 새 문장으로 다시 읽으므로 서로를 놓치지 않는다(Codex 199번 PR 검토)
  perform pg_advisory_xact_lock(hashtext('school-platform:academic_templates'), hashtext(new.template_key));
  select max(version) into v from public.academic_templates where key = new.template_key;
  if v > new.template_version then
    insert into public.academic_template_offers(school_id, template_key, from_version, to_version)
    values (new.school_id, new.template_key, new.template_version, v)
    on conflict (school_id, template_key, to_version) do nothing;
  end if;
  return null;
end $$;
revoke all on function private.offer_on_school_profile() from public, anon, authenticated;
create trigger school_profiles_template_offer after insert on public.school_profiles
  for each row execute function private.offer_on_school_profile();

create or replace function app.publish_academic_template(p jsonb)
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare k text := p ->> 'key'; v integer; so integer;
begin
  if not app.is_platform_admin() then raise exception '전체 관리자만 템플릿을 냅니다.' using errcode = '42501'; end if;
  if coalesce(k, '') !~ '^[a-z][a-z0-9_]{1,40}$' then raise exception '템플릿 키가 올바르지 않습니다.' using errcode = '22023'; end if;
  if not (p ? 'base_version') then raise exception '보고 고친 판 번호(base_version)를 함께 보내 주세요.' using errcode = '22023'; end if;
  if not private.academic_template_ok(p -> 'title', coalesce(p -> 'summary', '{}'), p -> 'manifest') then
    raise exception '템플릿 내용이 올바르지 않습니다(학년 체계·학교급·학기·척도·출결 단위·서식·숨길 구획).' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('school-platform:academic_templates'), hashtext(k));
  select coalesce(max(version), 0) + 1, coalesce(max(sort_order), 0) into v, so from public.academic_templates where key = k;
  if (p ->> 'base_version')::int <> v - 1 then
    raise exception '그 사이 새 판이 생겼습니다. 최신 판을 다시 읽어 고쳐 주세요.' using errcode = 'P0409';
  end if;
  insert into public.academic_templates(key, version, sort_order, title, summary, manifest, why, created_by)
  values (k, v, coalesce((p ->> 'sort_order')::int, so), p -> 'title', coalesce(p -> 'summary', '{}'), p -> 'manifest', nullif(trim(p ->> 'why'), ''), app.uid());
  -- 121차: 그 템플릿을 쓰는 학교에 새 판 제안(학교 사본은 그대로)
  perform private.offer_academic_template(k, v);
  return v;
end $$;

-- 학교 관리자가 결정한다. 수락은 앱이 같은 트랜잭션에서 그 판을 적용한 뒤에만 된다(적용 없이 '수락'만 남지 않게).
-- 거절·보류한 제안은 나중에 수락으로 바꿀 수 있다. 수락은 끝 상태다.
create or replace function app.decide_template_offer(target uuid, offer uuid, decision text, decision_note text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare o record; cur record; before record;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 결정합니다.' using errcode = '42501'; end if;
  if decision not in ('accepted', 'declined', 'held') then raise exception '결정은 accepted·declined·held 입니다.' using errcode = '22023'; end if;
  select * into o from public.academic_template_offers where id = offer and school_id = target for update;
  if o.id is null then raise exception '템플릿 새 판 제안을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if o.status = 'accepted' then raise exception '이미 수락한 제안입니다.' using errcode = 'P0409'; end if;
  -- 이 트랜잭션 전의 학교 판(before)과 지금 판(cur). 관할 판의 created_at 은 트랜잭션 시작 시각(now())이다
  select template_key, template_version, created_at into cur from public.school_profiles where school_id = target order by version desc limit 1;
  select template_key, template_version into before from public.school_profiles where school_id = target and created_at < now() order by version desc limit 1;
  if decision = 'accepted' then
    -- 수락은 '이 트랜잭션에서 그 템플릿의 낮은 판 → 바로 이 판'으로 적용된 경우만(적용 없이 기록만 남기거나 지난 제안을 수락하지 못하게, Codex 199번 PR 검토)
    if before.template_key is distinct from o.template_key or cur.template_key is distinct from o.template_key then
      raise exception '학교가 다른 템플릿으로 바꿔 이 제안은 쓸 수 없습니다.' using errcode = 'P0409';
    end if;
    if before.template_version >= o.to_version then
      raise exception '학교가 이미 그 판 이상을 써서 지난 제안입니다.' using errcode = 'P0409';
    end if;
    if cur.created_at <> now() or cur.template_version <> o.to_version then
      raise exception '템플릿 새 판을 먼저 적용해야 수락할 수 있습니다.' using errcode = '22023';
    end if;
    -- 더 낮은 판의 열린 제안은 이번 판에 함께 담겼다
    update public.academic_template_offers set status = 'accepted', included_in = o.to_version, decided_by = app.uid(), decided_at = now()
     where school_id = target and template_key = o.template_key and to_version < o.to_version and status <> 'accepted';
  elsif cur.template_key is distinct from o.template_key then
    raise exception '학교가 다른 템플릿으로 바꿔 이 제안은 쓸 수 없습니다.' using errcode = 'P0409';
  elsif cur.template_version >= o.to_version then
    -- 학교가 이미 그 판 이상을 쓰면(다른 템플릿을 거쳐 최신 판으로 돌아온 경우 등) 지난 제안이다(Codex 199번 PR 검토)
    raise exception '학교가 이미 그 판 이상을 써서 지난 제안입니다.' using errcode = 'P0409';
  end if;
  update public.academic_template_offers set status = decision, note = nullif(trim(decision_note), ''), decided_by = app.uid(), decided_at = now() where id = offer;
  return jsonb_build_object('status', decision, 'to_version', o.to_version);
end $$;
revoke all on function app.decide_template_offer(uuid, uuid, text, text) from public, anon;
grant execute on function app.decide_template_offer(uuid, uuid, text, text) to authenticated;

-- 이미 나온 새 판: 지금 쓰는 판보다 높은 최신 판이 있는 학교에 제안을 채운다
do $$
declare r record;
begin
  for r in select key, max(version) as v from public.academic_templates group by key loop
    perform private.offer_academic_template(r.key, r.v);
  end loop;
end $$;

-- 제안 카드가 새 판의 '바뀐 이유'를 보이도록 판 하나 읽기에 why 를 더한다(반환 모양이 바뀌어 지우고 다시 만든다)
drop function app.academic_template(text, integer);
create function app.academic_template(p_key text, p_version integer)
returns table (key text, version integer, sort_order integer, title jsonb, summary jsonb, manifest jsonb, why text)
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select t.key, t.version, t.sort_order, t.title, t.summary, t.manifest, t.why
    from public.academic_templates t
   where app.uid() is not null and t.key = p_key and t.version = p_version
$$;
revoke all on function app.academic_template(text, integer) from public, anon;
grant execute on function app.academic_template(text, integer) to authenticated;
