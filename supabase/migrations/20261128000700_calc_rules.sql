-- ADR 0040: 계산식 판. 학교마다 이수 기준·성적 산출을 선언형 식(JSON)으로 두고 판으로 쌓는다.
-- 식의 모양 검사·계산은 앱(src/lib/calc/expr.ts)이 한다. DB 는 판 쌓기·학교 경계·고치지 않음·409 만 지킨다.
-- code: 학교가 붙이는 이름(예: completion_default, project_pf). 수업 갈래·과목에 어느 식을 쓸지는 다음 단계(마감 연결)에서 정한다.

create table public.calc_rules (
  school_id uuid not null references public.schools(id),
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  version integer not null check (version >= 1),
  title jsonb not null check (jsonb_typeof(title) = 'object'),
  spec jsonb not null check (jsonb_typeof(spec) = 'object' and spec ? 'outputs' and length(spec::text) <= 20000),
  why text check (why is null or length(why) <= 1000),
  author_kind text not null default 'human' check (author_kind in ('human', 'agent')),
  created_by uuid not null default app.uid(),
  created_at timestamptz not null default now(),
  primary key (school_id, code, version)
);
comment on table public.calc_rules is 'ADR 0040 — 학교 계산식 판(이수 기준·성적 산출). 추가만, base_version 409';
create trigger calc_rules_guard before update or delete on public.calc_rules for each row execute function private.reject_change();
alter table public.calc_rules enable row level security;
revoke all on public.calc_rules from public, anon, authenticated;
grant select on public.calc_rules to authenticated;
create policy calc_rules_read on public.calc_rules for select to authenticated using (app.is_member(school_id));

-- 명령 함수: 학교 관리자만. 모양 검사는 앱이 먼저 하고, 여기서는 판 순서(base_version)만 본다
create or replace function app.save_calc_rule(target uuid, p jsonb) returns integer
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v integer; c text := p ->> 'code';
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if c is null or c !~ '^[a-z][a-z0-9_]{1,40}$' then raise exception '계산식 이름은 영문 소문자로 시작하고 소문자·숫자·밑줄만 씁니다.' using errcode = '22023'; end if;
  if jsonb_typeof(p -> 'spec') <> 'object' or not (p -> 'spec') ? 'outputs' then raise exception '계산식에는 결과 칸(outputs)이 있어야 합니다.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('school-platform:calc_rules'), hashtext(target::text || ':' || c));
  select coalesce(max(version), 0) into v from public.calc_rules where school_id = target and code = c;
  if (p ->> 'base_version') is null or (p ->> 'base_version')::int <> v then
    raise exception '그 사이 새 판이 생겼습니다. 최신 판을 다시 읽어 고쳐 주세요.' using errcode = 'P0409';
  end if;
  insert into public.calc_rules(school_id, code, version, title, spec, why)
  values (target, c, v + 1, coalesce(p -> 'title', jsonb_build_object('ko', c)), p -> 'spec', nullif(btrim(p ->> 'why'), ''));
  perform app.log_access(target, 'calc_rule.save', jsonb_build_object('code', c, 'version', v + 1));
  return v + 1;
end $$;
revoke all on function app.save_calc_rule(uuid, jsonb) from public;
grant execute on function app.save_calc_rule(uuid, jsonb) to authenticated;
