-- 58차: ADR 0027 관제 기본판 · 학교 복제 · 보고 계약 (논리 분리)
-- · 관제 영역: 기본판(baselines), 학교별 기본판 기록(school_baselines), 갱신 제안(baseline_offers), 보고 스냅샷(school_reports)
-- · 학교 영역: 학교가 가진 사본(code_lists·scales·grading_policies …). 학교 AI는 자기 사본만 바꾼다
-- · 학교 생성 때 최신 기본판을 복제한다(트리거). 이후 관제는 학교 사본을 직접 바꾸지 않고 '제안'만 보낸다(학교가 수락)
-- · 관제는 학교 내부 표를 직접 읽지 않고 보고 계약 함수(app.school_report_v1)로만 모은다
select set_config('request.jwt.claims', '{}', true);

-- ── 관제 영역 ────────────────────────────────────────────
create table public.baselines (
  version integer primary key check (version >= 1),
  title text not null check (length(trim(title)) between 1 and 120),
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  why text check (why is null or length(why) <= 1000),
  created_by uuid,
  created_at timestamptz not null default now()
);
create table public.school_baselines (
  school_id uuid primary key references public.schools(id),
  version integer not null references public.baselines(version),
  instantiated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.baseline_offers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  from_version integer not null,
  to_version integer not null references public.baselines(version),
  items jsonb not null check (jsonb_typeof(items) = 'object'),
  status text not null default 'offered' check (status in ('offered', 'accepted', 'declined', 'held')),
  note text check (note is null or length(note) <= 500),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (school_id, to_version)
);
create table public.school_reports (
  id bigint generated always as identity primary key,
  school_id uuid not null references public.schools(id),
  contract text not null check (contract ~ '^school-report/[0-9]+$'),
  collected_at timestamptz not null default now(),
  data jsonb not null check (jsonb_typeof(data) = 'object')
);
create index school_reports_latest on public.school_reports (school_id, collected_at desc);

create trigger baselines_guard before update or delete on public.baselines for each row execute function private.guard_columns();
create trigger school_reports_guard before update or delete on public.school_reports for each row execute function private.guard_columns();
create trigger school_baselines_guard before delete on public.school_baselines for each row execute function private.guard_columns();
create trigger baseline_offers_guard before delete on public.baseline_offers for each row execute function private.guard_columns();

do $$
declare t text;
begin
  foreach t in array array['baselines', 'school_baselines', 'baseline_offers', 'school_reports'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
create policy baselines_read on public.baselines for select to authenticated using (app.is_platform_admin());
create policy school_baselines_read on public.school_baselines for select to authenticated using (app.is_platform_admin() or app.is_member(school_id));
create policy baseline_offers_read on public.baseline_offers for select to authenticated using (app.is_platform_admin() or app.is_school_admin(school_id));
create policy school_reports_read on public.school_reports for select to authenticated using (app.is_platform_admin() or app.is_school_admin(school_id));

-- ── 기본판 1판 = 지금까지의 플랫폼 기본 코드 + 한·미 척도 + 기본 성적 정책 ──
insert into public.baselines(version, title, manifest, why)
select 1, '기본판 1 (한국 + 미국 기준)', jsonb_build_object(
  'code_lists', coalesce((select jsonb_agg(jsonb_build_object('list_key', list_key, 'code', code, 'label', label, 'sort_order', sort_order,
                                                               'attrs', attrs, 'maps_to', maps_to, 'why', why) order by list_key, sort_order)
                            from public.code_lists where school_id is null), '[]'),
  'scales', jsonb_build_array(
    jsonb_build_object('code', 'kr_achievement', 'kind', 'letter', 'why', '성취평가제 A–E(90/80/70/60/40), 40% 미만 미이수', 'bands', jsonb_build_array(
      jsonb_build_object('code', 'A', 'label', '{"ko":"A","en":"A"}'::jsonb, 'min', 90, 'earns_credit', true),
      jsonb_build_object('code', 'B', 'label', '{"ko":"B","en":"B"}'::jsonb, 'min', 80, 'earns_credit', true),
      jsonb_build_object('code', 'C', 'label', '{"ko":"C","en":"C"}'::jsonb, 'min', 70, 'earns_credit', true),
      jsonb_build_object('code', 'D', 'label', '{"ko":"D","en":"D"}'::jsonb, 'min', 60, 'earns_credit', true),
      jsonb_build_object('code', 'E', 'label', '{"ko":"E","en":"E"}'::jsonb, 'min', 40, 'earns_credit', true),
      jsonb_build_object('code', 'I', 'label', '{"ko":"미이수","en":"Incomplete"}'::jsonb, 'min', 0, 'earns_credit', false))),
    jsonb_build_object('code', 'us_letter', 'kind', 'letter', 'why', '미국 글자 성적 A–F, 4.0 GPA 점수', 'bands', jsonb_build_array(
      jsonb_build_object('code', 'A', 'label', '{"en":"A","ko":"A"}'::jsonb, 'min', 90, 'points', 4, 'earns_credit', true),
      jsonb_build_object('code', 'B', 'label', '{"en":"B","ko":"B"}'::jsonb, 'min', 80, 'points', 3, 'earns_credit', true),
      jsonb_build_object('code', 'C', 'label', '{"en":"C","ko":"C"}'::jsonb, 'min', 70, 'points', 2, 'earns_credit', true),
      jsonb_build_object('code', 'D', 'label', '{"en":"D","ko":"D"}'::jsonb, 'min', 60, 'points', 1, 'earns_credit', true),
      jsonb_build_object('code', 'F', 'label', '{"en":"F","ko":"F"}'::jsonb, 'min', 0, 'points', 0, 'earns_credit', false)))),
  'grading_policy', jsonb_build_object('policy', '{"score_digits":2,"final_digits":0,"stats":{"sd":"population","digits":1}}'::jsonb,
                                       'why', '기본판: 원점수 소수 2자리, 최종 반올림 정수, 모표준편차')
), '지금까지 플랫폼 기본값(코드 목록 school_id 없음)을 기본판으로 옮김. 학교는 이제 기본값을 실시간으로 읽지 않고 자기 사본을 가진다(ADR 0027)';

-- ── 기본판 적용(학교 사본 만들기). 이미 있는 것은 건드리지 않고, 다르면 '부딪침'으로 돌려준다 ──
create or replace function private.baseline_diff(target uuid, manifest jsonb)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare item jsonb; cur record; adds jsonb := '[]'; conflicts jsonb := '[]';
begin
  for item in select * from jsonb_array_elements(coalesce(manifest -> 'code_lists', '[]')) loop
    select label, attrs, maps_to into cur from public.code_lists
     where school_id = target and list_key = item ->> 'list_key' and code = item ->> 'code' and effective_to is null
     order by created_at desc limit 1;
    if not found then adds := adds || jsonb_build_object('kind', 'code', 'item', item);
    elsif cur.label is distinct from item -> 'label' or cur.attrs is distinct from coalesce(item -> 'attrs', '{}') or cur.maps_to is distinct from coalesce(item -> 'maps_to', '{}') then
      conflicts := conflicts || jsonb_build_object('kind', 'code', 'item', item, 'school', jsonb_build_object('label', cur.label, 'attrs', cur.attrs));
    end if;
  end loop;
  for item in select * from jsonb_array_elements(coalesce(manifest -> 'scales', '[]')) loop
    if not exists (select 1 from public.scales where school_id = target and code = item ->> 'code') then
      adds := adds || jsonb_build_object('kind', 'scale', 'item', item);
    elsif (select sv.bands from public.scales s join public.scale_versions sv on sv.scale_id = s.id
            where s.school_id = target and s.code = item ->> 'code' order by sv.version desc limit 1) is distinct from item -> 'bands' then
      conflicts := conflicts || jsonb_build_object('kind', 'scale', 'item', item);
    end if;
  end loop;
  if manifest ? 'grading_policy' and not exists (select 1 from public.grading_policies where school_id = target) then
    adds := adds || jsonb_build_object('kind', 'grading_policy', 'item', manifest -> 'grading_policy');
  end if;
  return jsonb_build_object('add', adds, 'conflicts', conflicts);
end $$;

create or replace function private.baseline_apply(target uuid, adds jsonb)
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare a jsonb; it jsonb; sid uuid; n integer := 0; who uuid := coalesce(app.uid(), '00000000-0000-0000-0000-000000000000');
begin
  for a in select * from jsonb_array_elements(coalesce(adds, '[]')) loop
    it := a -> 'item';
    if a ->> 'kind' = 'code' then
      insert into public.code_lists(school_id, list_key, code, label, sort_order, attrs, maps_to, why, created_by)
      values (target, it ->> 'list_key', it ->> 'code', it -> 'label', coalesce((it ->> 'sort_order')::int, 0),
              coalesce(it -> 'attrs', '{}'), coalesce(it -> 'maps_to', '{}'), it ->> 'why', app.uid())
      on conflict do nothing;
    elsif a ->> 'kind' = 'scale' then
      insert into public.scales(school_id, code, kind, created_by) values (target, it ->> 'code', it ->> 'kind', who)
      on conflict (school_id, code) do nothing returning id into sid;
      if sid is not null then
        insert into public.scale_versions(school_id, scale_id, version, bands, why, created_by) values (target, sid, 1, it -> 'bands', it ->> 'why', who);
      end if;
    elsif a ->> 'kind' = 'grading_policy' then
      insert into public.grading_policies(school_id, version, policy, why, created_by)
      select target, 1, it -> 'policy', it ->> 'why', who where not exists (select 1 from public.grading_policies where school_id = target);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- 학교 생성 때 최신 기본판 복제
create or replace function private.instantiate_baseline(target uuid)
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare b record; d jsonb; n integer;
begin
  select version, manifest into b from public.baselines order by version desc limit 1;
  if b.version is null then return 0; end if;
  d := private.baseline_diff(target, b.manifest);
  n := private.baseline_apply(target, d -> 'add');
  insert into public.school_baselines(school_id, version) values (target, b.version)
  on conflict (school_id) do nothing;
  return n;
end $$;
create or replace function private.schools_instantiate() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform private.instantiate_baseline(new.id);
  return new;
end $$;
create trigger schools_instantiate_baseline after insert on public.schools for each row execute function private.schools_instantiate();

-- 기존 학교: 지금 기본판으로 사본 만들기
do $$
declare s record;
begin
  for s in select id from public.schools loop perform private.instantiate_baseline(s.id); end loop;
end $$;

-- 플랫폼 기본 코드 행(school_id 없음)은 기본판으로 옮겼으므로 지운다. 학교는 이제 자기 사본만 읽는다
alter table public.code_lists disable trigger code_lists_guard;
delete from public.code_lists where school_id is null;
alter table public.code_lists enable trigger code_lists_guard;
alter table public.code_lists alter column school_id set not null;
drop policy code_lists_read on public.code_lists;
create policy code_lists_read on public.code_lists for select to authenticated, app_writer using (app.is_member(school_id));

-- ── 기본판 갱신: 관제가 새 판을 내면 학교마다 제안(추가할 것 · 부딪치는 것)을 만든다. 학교가 수락해야 반영 ──
create or replace function app.publish_baseline(p jsonb)
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v integer; s record; d jsonb;
begin
  if not app.is_platform_admin() then raise exception '전체 관리자(관제)만 기본판을 냅니다.' using errcode = '42501'; end if;
  if jsonb_typeof(p -> 'manifest') <> 'object' or length(trim(coalesce(p ->> 'title', ''))) = 0 then
    raise exception '기본판 제목과 내용이 필요합니다.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('school-platform:baselines'), 0);
  select coalesce(max(version), 0) into v from public.baselines;
  if (p ->> 'base_version') is null or (p ->> 'base_version')::int <> v then
    raise exception '그 사이 새 기본판이 생겼습니다. 최신 판을 다시 읽어 주세요.' using errcode = 'P0409';
  end if;
  insert into public.baselines(version, title, manifest, why, created_by) values (v + 1, trim(p ->> 'title'), p -> 'manifest', nullif(trim(p ->> 'why'), ''), app.uid());
  for s in select sb.school_id, sb.version from public.school_baselines sb where sb.version < v + 1 loop
    d := private.baseline_diff(s.school_id, p -> 'manifest');
    insert into public.baseline_offers(school_id, from_version, to_version, items) values (s.school_id, s.version, v + 1, d)
    on conflict (school_id, to_version) do nothing;
  end loop;
  return v + 1;
end $$;

-- 학교 관리자(또는 학교 AI를 쓰는 관리자)가 결정: accepted = 추가할 것만 반영(부딪치는 것은 학교 값 유지), declined / held
create or replace function app.decide_baseline_offer(target uuid, offer uuid, decision text, decision_note text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare o record; n integer := 0;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 결정합니다.' using errcode = '42501'; end if;
  if decision not in ('accepted', 'declined', 'held') then raise exception '결정은 accepted·declined·held 입니다.' using errcode = '22023'; end if;
  select * into o from public.baseline_offers where id = offer and school_id = target for update;
  if o.id is null then raise exception '기본판 제안을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if o.status in ('accepted', 'declined') then raise exception '이미 결정한 제안입니다.' using errcode = 'P0409'; end if;
  if decision = 'accepted' then
    -- 제안을 만든 뒤 학교가 그 항목을 먼저 만들었을 수 있으니 지금 기준으로 다시 비교한다
    n := private.baseline_apply(target, private.baseline_diff(target, (select manifest from public.baselines where version = o.to_version)) -> 'add');
    update public.school_baselines set version = greatest(version, o.to_version), updated_at = now() where school_id = target;
  end if;
  update public.baseline_offers set status = decision, note = nullif(trim(decision_note), ''), decided_by = app.uid(), decided_at = now() where id = offer;
  return jsonb_build_object('status', decision, 'applied', n);
end $$;

-- ── 보고 계약 1판: 관제가 학교에서 모으는 것은 이것뿐. 학교 내부 구조가 바뀌어도 이 모양은 지킨다 ──
create or replace function app.school_report_v1(target uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare r jsonb;
begin
  if not (app.is_platform_admin() or app.is_school_admin(target)) then raise exception '전체 관리자나 그 학교 관리자만 봅니다.' using errcode = '42501'; end if;
  select jsonb_build_object(
    'contract', 'school-report/1',
    'school', jsonb_build_object('id', s.id, 'slug', s.slug, 'name', s.name, 'locale', s.locale, 'status', s.status),
    'profile', (select jsonb_build_object('country', p.country, 'sector', p.sector, 'accreditation', p.accreditation)
                  from public.school_profiles p where p.school_id = s.id order by p.version desc limit 1),
    'baseline_version', (select version from public.school_baselines where school_id = s.id),
    'modules', (select to_jsonb(l.modules) from public.school_licenses l where l.school_id = s.id order by l.version desc limit 1),
    'counts', jsonb_build_object(
      'members', (select count(*) from public.memberships m where m.school_id = s.id),
      'people', (select count(*) from public.people x where x.school_id = s.id),
      'students_enrolled', (select count(*) from public.enrollments_school e where e.school_id = s.id and e.status = 'enrolled'),
      'staff_active', (select count(*) from public.staff_assignments a where a.school_id = s.id and (a.ends_on is null or a.ends_on > current_date)),
      'offerings', (select count(*) from public.course_offerings o where o.school_id = s.id and o.status <> 'cancelled'),
      'closures', (select count(*) from public.offering_closures c where c.school_id = s.id),
      'site_entries', (select count(*) from public.site_entries se where se.school_id = s.id and se.archived_at is null)),
    'storage', jsonb_build_object(
      'files', (select count(*) from public.site_assets a where a.school_id = s.id),
      'db_site_bytes', (select coalesce(sum(octet_length(a.bytes)), 0) from public.site_assets a where a.school_id = s.id),
      'db_source_bytes', (select coalesce(sum(octet_length(f.original)), 0) from public.source_files f where f.school_id = s.id),
      'r2_bytes', (select coalesce(sum(x.size_bytes), 0) from (select distinct on (a.sha256) a.size_bytes from public.site_assets a
                     where a.school_id = s.id and a.object_key is not null) x),
      'db_only_files', (select count(*) from public.site_assets a where a.school_id = s.id and a.object_key is null)),
    'activity_30d', jsonb_build_object(
      'agent_actions', (select count(*) from public.agent_token_uses u where u.school_id = s.id and u.created_at > now() - interval '30 days'),
      'ai_calls', (select count(*) from public.usage_events e where e.school_id = s.id and e.kind = 'ai' and e.created_at > now() - interval '30 days'),
      'ai_tokens', (select coalesce(sum(e.input_tokens + e.output_tokens), 0) from public.usage_events e where e.school_id = s.id and e.kind = 'ai' and e.created_at > now() - interval '30 days'),
      'ai_cost_usd', (select coalesce(sum(e.cost_usd), 0) from public.usage_events e where e.school_id = s.id and e.kind = 'ai' and e.created_at > now() - interval '30 days')),
    'reported_at', now())
  into r from public.schools s where s.id = target;
  if r is null then raise exception '학교를 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  return r;
end $$;

-- 관제가 모든 학교의 보고를 모아 스냅샷으로 남긴다
create or replace function app.collect_school_reports()
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare s record; n integer := 0;
begin
  if not app.is_platform_admin() then raise exception '전체 관리자(관제)만 모읍니다.' using errcode = '42501'; end if;
  for s in select id from public.schools loop
    insert into public.school_reports(school_id, contract, data) values (s.id, 'school-report/1', app.school_report_v1(s.id));
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function private.baseline_diff(uuid, jsonb), private.baseline_apply(uuid, jsonb), private.instantiate_baseline(uuid), private.schools_instantiate() from public;
revoke all on function app.publish_baseline(jsonb), app.decide_baseline_offer(uuid, uuid, text, text), app.school_report_v1(uuid), app.collect_school_reports() from public, anon;
grant execute on function app.publish_baseline(jsonb), app.decide_baseline_offer(uuid, uuid, text, text), app.school_report_v1(uuid), app.collect_school_reports() to authenticated;
