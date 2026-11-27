-- ADR 0038: 학교별 격리 등급 배정. 학교마다 공용·확장·전용·독립 중 하나를 판(버전)으로 기록한다.
-- 행이 없으면 공용(shared)·운영 중(active). 판은 고치거나 지우지 않고 새 판을 더한다(이력 그대로).
-- 등급을 고르는 것과 실제 이전(새 DB·배포 만들기 → scripts/school-move.mjs)은 따로다.
--   state: planned(정함, 아직 안 옮김) → moving(옮기는 중) → moved(옮김, target_url 로 안내) / active(그 등급으로 운영 중)

create table public.school_placements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  version integer not null check (version >= 1),
  tier text not null check (tier in ('shared', 'extended', 'dedicated', 'independent')),
  state text not null check (state in ('planned', 'moving', 'moved', 'active')),
  target_url text check (target_url is null or (target_url ~ '^https://[a-z0-9.-]+(/.*)?$' and length(target_url) <= 300)),
  reason text not null check (length(btrim(reason)) between 1 and 2000),
  monthly_cost_usd numeric(10, 2) check (monthly_cost_usd is null or monthly_cost_usd >= 0),
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  unique (school_id, version),
  check (state <> 'moved' or target_url is not null),
  check (tier <> 'shared' or state = 'active')
);
comment on table public.school_placements is 'ADR 0038 — 학교 격리 등급 판(관제가 씀, 학교 구성원은 자기 학교만 읽음). 고치지 않고 새 판';
create trigger school_placements_immutable before update or delete on public.school_placements
  for each row execute function private.reject_change();
alter table public.school_placements enable row level security;
grant select on public.school_placements to authenticated;
create policy school_placements_read on public.school_placements for select to authenticated
  using (app.is_member(school_id) or app.is_platform_admin());

-- 명령 함수: 전체 관리자만. base_version 은 보고 고친 판(없으면 0) — 그 사이 새 판이 생겼으면 409(AGENTS.md 10)
create or replace function app.set_school_placement(target uuid, p jsonb) returns integer
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare cur integer; nxt integer;
begin
  if not app.is_platform_admin() then raise exception '전체 관리자만 격리 등급을 정합니다.' using errcode = '42501'; end if;
  if not exists (select 1 from public.schools where id = target) then raise exception '학교를 찾을 수 없습니다.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('school_placements:' || target::text));
  select coalesce(max(version), 0) into cur from public.school_placements where school_id = target;
  if coalesce((p ->> 'base_version')::int, -1) <> cur then
    raise exception '그 사이 새 판이 생겼습니다. 최신 판을 다시 읽어 고쳐 주세요.' using errcode = 'P0409';
  end if;
  nxt := cur + 1;
  insert into public.school_placements(school_id, version, tier, state, target_url, reason, monthly_cost_usd)
  values (target, nxt, p ->> 'tier', p ->> 'state', nullif(p ->> 'target_url', ''), p ->> 'reason',
          nullif(p ->> 'monthly_cost_usd', '')::numeric);
  perform app.log_access(target, 'placement.set', jsonb_build_object('version', nxt, 'tier', p ->> 'tier', 'state', p ->> 'state'));
  return nxt;
end $$;
revoke all on function app.set_school_placement(uuid, jsonb) from public;
grant execute on function app.set_school_placement(uuid, jsonb) to authenticated;
