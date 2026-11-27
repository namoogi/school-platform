-- ADR 0042: 마감 연결. 수업 마감이 학교가 고른 계산식 판(ADR 0040)의 결과로 성취도·이수·학점을 굳힌다.
-- 계산은 앱(src/lib/calc/expr.ts)이 한다. DB 는 입력을 원장에서 직접 조립해(app.offering_calc_inputs) 앱이 쓴 입력과 같은지 대조하고,
-- 계산식 판 번호·식·입력·결과를 마감 판에 함께 얼린다. 그래서 나중에 누구든 같은 식에 같은 입력을 넣어 결과를 다시 확인할 수 있다.
-- 계산식 없이 마감하면 지금처럼 척도(band_for)로 굳힌다(이전 동작 그대로).

-- ── 보충 이수 사건: 최소 성취수준 보장지도(achievement)·과목 출석 미달 추가학습(attendance) ──
-- 학사 사실은 추가만(ADR 0025). 정정은 같은 자리에 새 사건(가장 최근이 현재 값)
create table public.remediation_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  offering_id uuid not null,
  person_id uuid not null,
  kind text not null check (kind in ('achievement', 'attendance')),
  completed boolean not null,
  note text check (note is null or length(note) <= 500),
  recorded_by uuid not null default app.uid(),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (id, school_id),
  foreign key (offering_id, school_id) references public.course_offerings(id, school_id),
  foreign key (person_id, school_id) references public.people(id, school_id)
);
comment on table public.remediation_events is 'ADR 0042 — 보충 이수 사건(보장지도·추가학습). 추가만, 최근 사건이 현재 값';
-- 추가만: 고치기·지우기를 DB 가 막는다(다른 학사 사건 원장과 같은 장치)
create trigger remediation_events_guard before update or delete on public.remediation_events for each row execute function private.guard_columns();
create index remediation_events_lookup on public.remediation_events (offering_id, person_id, kind, recorded_at desc);
alter table public.remediation_events enable row level security;
revoke all on public.remediation_events from public, anon, authenticated;
grant select on public.remediation_events to authenticated, app_writer;
grant insert on public.remediation_events to app_writer;
create policy remediation_events_read on public.remediation_events for select to authenticated, app_writer using (app.is_member(school_id));
create policy remediation_events_insert on public.remediation_events for insert to app_writer with check (app.is_member(school_id));

-- 마감 판에 계산식 판 번호·식, 결과 행에 계산 입력을 얼린다(nullable: 계산식 없이 마감한 판)
alter table public.offering_closures add column calc_code text, add column calc_version integer, add column calc_spec jsonb;
alter table public.offering_closures add constraint offering_closures_calc_check
  check ((calc_code is null) = (calc_version is null) and (calc_code is null) = (calc_spec is null));
alter table public.closure_results add column calc_input jsonb;

-- 마감 함수(app_writer 소유)가 계산식 판을 읽는다
grant select on public.calc_rules to app_writer;
create policy calc_rules_read_writer on public.calc_rules for select to app_writer using (app.is_member(school_id));

-- ── 계산 입력 조립: 수강생마다 계산식 입력(ADR 0040 입력 모양). 앱은 이것으로 계산하고, 마감은 이것과 대조한다 ──
-- items: 과목 총괄 축 평가 항목(코드 → 점수·만점·가중치) / competencies: 역량 축 수준 코드 / attendance.rate: 이 수업 교시 출결
-- course.pass_fail: 개설 P/F 또는 학생 선택 / support: 보충 이수 최근 사건 / credits: 개설 학점
create or replace function app.offering_calc_inputs(target uuid, offering uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
declare o record; e record; res jsonb := '{}'; items jsonb; comps jsonb; tot integer; pres integer; sup jsonb;
begin
  if not private.can_grade(target, offering) then raise exception '이 수업을 맡은 교사나 학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  select id, credits, pass_fail into o from public.course_offerings where id = offering and school_id = target;
  if o.id is null then raise exception '개설을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  for e in select en.person_id, en.pass_fail_choice from public.offering_enrollments en
            where en.offering_id = offering and en.school_id = target and en.status = 'enrolled' order by en.person_id loop
    select coalesce(jsonb_object_agg(a.code, jsonb_build_object('score', r.score, 'max', a.max_score, 'weight', a.weight)), '{}')
      into items
      from public.assessments a left join public.current_assessment_results r on r.assessment_id = a.id and r.person_id = e.person_id
     where a.offering_id = offering and a.school_id = target and a.archived_at is null and a.axis = 'course';
    select coalesce(jsonb_agg(r.level_code order by a.code), '[]') into comps
      from public.assessments a join public.current_assessment_results r on r.assessment_id = a.id and r.person_id = e.person_id
     where a.offering_id = offering and a.school_id = target and a.archived_at is null and a.axis = 'competency' and r.level_code is not null;
    -- 과목 출석률: 이 수업 교시 기록 중 결석·결과가 아닌 것의 비율. 출석인정 사유는 출석으로 친다(F3). 기록이 없으면 null.
    -- 잘라내지 않는다(Codex #169 P2): float8 로 나누면 앱(JS)의 2/3·1/3 과 같은 값이 되어 경계 비교가 맞고, JSON 왕복에도 글자가 같다
    select count(*), count(*) filter (where a.kind_code not in ('absent', 'class_absent')
             or exists (select 1 from public.code_lists c where c.school_id = target and c.list_key = 'attendance_reason' and c.code = a.reason_code
                         -- 그 출결 날짜에 유효한 코드 판만 본다(옛 판·새 판이 같은 코드를 쓴다, Codex #169)
                         and (c.effective_from is null or c.effective_from <= a.day) and (c.effective_to is null or a.day < c.effective_to)
                         and coalesce((c.attrs ->> 'counts_present')::boolean, false)))
      into tot, pres
      from public.current_attendance a
     where a.school_id = target and a.person_id = e.person_id and a.offering_id = offering and a.scope = 'period';
    select coalesce(jsonb_object_agg(x.kind, x.completed), '{}') into sup
      from (select distinct on (kind) kind, completed from public.remediation_events
             where school_id = target and offering_id = offering and person_id = e.person_id order by kind, recorded_at desc, id) x;
    res := res || jsonb_build_object(e.person_id::text, jsonb_build_object(
      'items', items, 'competencies', comps,
      'attendance', jsonb_build_object('rate', case when tot > 0 then pres::float8 / tot end),
      'course', jsonb_build_object('pass_fail', o.pass_fail or coalesce(e.pass_fail_choice, false)),
      'support', sup, 'credits', o.credits));
  end loop;
  return res;
end $$;

-- ── 보충 이수 기록: 담당 교사·학교 관리자. 수강 중인 학생만 ──
create or replace function app.record_remediation(target uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare off uuid := nullif(p ->> 'offering_id', '')::uuid; per uuid := nullif(p ->> 'person_id', '')::uuid; rid uuid;
begin
  if off is null or not private.can_grade(target, off) then raise exception '이 수업을 맡은 교사나 학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if coalesce(p ->> 'kind', '') not in ('achievement', 'attendance') then raise exception '보충 이수 종류는 achievement(보장지도)·attendance(추가학습)입니다.' using errcode = '22023'; end if;
  if coalesce(jsonb_typeof(p -> 'completed'), '') <> 'boolean' then raise exception '보충 이수 여부(completed)는 참·거짓입니다.' using errcode = '22023'; end if;
  if not exists (select 1 from public.offering_enrollments where offering_id = off and person_id = per and school_id = target and status = 'enrolled') then
    raise exception '이 수업을 수강 중인 학생이 아닙니다.' using errcode = 'P0002';
  end if;
  insert into public.remediation_events(school_id, offering_id, person_id, kind, completed, note)
  values (target, off, per, p ->> 'kind', (p ->> 'completed')::boolean, nullif(btrim(p ->> 'note'), ''))
  returning id into rid;
  perform app.log_access(target, 'remediation.record', jsonb_build_object('offering', off, 'kind', p ->> 'kind', 'completed', (p ->> 'completed')::boolean));
  return rid;
end $$;

-- ── 수업 마감: 기존 함수는 app_writer 소유(F2). 운영 마이그레이션 역할은 슈퍼유저가 아니라 소유 역할로 바꿔서 다시 만든다(45차 agent_autopublish 와 같은 방식).
-- create or replace 는 기존 실행 권한을 그대로 둔다
grant create on schema app to app_writer;
set local role app_writer;
-- ── 수업 마감: p.calc = { code, version, results: { person_id: { input, score, level, passed } } } 가 있으면 계산식 결과로 굳힌다 ──
create or replace function app.close_offering(target uuid, offering uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  o record; cur record; pol record; sc_id uuid; sc_ver integer; sc_bands jsonb; cid uuid; v integer; rk text := p ->> 'request_key';
  sdigits integer; fdigits integer; sd_kind text; e record; raw numeric; fin numeric; band jsonb; st text; pf boolean; inst boolean;
  total_w numeric; got_w numeric; missing boolean; n integer; m numeric; s numeric; earned numeric;
  calc jsonb := p -> 'calc'; c_code text; c_ver integer; c_spec jsonb; inputs jsonb; r jsonb; lv text; ok jsonb; inp jsonb;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 마감합니다.' using errcode = '42501'; end if;
  select id, credits, pass_fail into o from public.course_offerings where id = offering and school_id = target;
  if o.id is null then raise exception '개설을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if coalesce(rk, '') !~ '^[A-Za-z0-9_.:-]{8,80}$' then raise exception '요청 키(request_key)가 필요합니다.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('school-platform:closures'), hashtext(offering::text));
  select id, offering_id, version into cur from public.offering_closures where school_id = target and request_key = rk;
  if cur.id is not null then
    if cur.offering_id <> offering then raise exception '같은 요청 키를 다른 수업에 썼습니다.' using errcode = 'P0409'; end if;
    return jsonb_build_object('id', cur.id, 'version', cur.version, 'repeated', true);
  end if;
  select id, version into cur from public.offering_closures where offering_id = offering order by version desc limit 1;
  v := coalesce(cur.version, 0);
  if (p ->> 'base_version') is null or (p ->> 'base_version')::int <> v then
    raise exception '그 사이 새 마감 판이 생겼습니다. 최신 판을 다시 읽어 주세요.' using errcode = 'P0409';
  end if;
  if v > 0 and length(trim(coalesce(p ->> 'reason', ''))) = 0 then raise exception '정정 마감에는 사유가 필요합니다.' using errcode = '22023'; end if;
  select version, policy into pol from public.grading_policies where school_id = target order by version desc limit 1;
  sdigits := coalesce((pol.policy ->> 'score_digits')::int, 2);
  fdigits := coalesce((pol.policy ->> 'final_digits')::int, 0);
  sd_kind := coalesce(pol.policy -> 'stats' ->> 'sd', 'population');
  if nullif(p ->> 'scale_id', '') is not null then
    select s2.id, sv.version, sv.bands into sc_id, sc_ver, sc_bands from public.scales s2 join public.scale_versions sv on sv.scale_id = s2.id
     where s2.id = (p ->> 'scale_id')::uuid and s2.school_id = target order by sv.version desc limit 1;
    if sc_id is null then raise exception '척도를 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  end if;
  if calc is not null and jsonb_typeof(calc) = 'object' then
    c_code := calc ->> 'code';
    c_ver := case when (calc ->> 'version') ~ '^[0-9]{1,6}$' then (calc ->> 'version')::int end;
    select spec into c_spec from public.calc_rules where school_id = target and code = c_code and version = c_ver;
    if c_spec is null then raise exception '계산식 판을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
    if jsonb_typeof(calc -> 'results') <> 'object' then raise exception '계산 결과(results)가 필요합니다.' using errcode = '22023'; end if;
    -- 입력은 DB 가 원장에서 다시 조립한다. 앱이 계산에 쓴 입력과 하나라도 다르면 거부(그 사이 점수·출결·보충 이수가 바뀐 것)
    inputs := app.offering_calc_inputs(target, offering);
    if exists (select 1 from jsonb_object_keys(calc -> 'results') k where not inputs ? k) then
      raise exception '수강 중이 아닌 학생의 계산 결과가 들어 있습니다.' using errcode = '22023';
    end if;
  end if;
  insert into public.offering_closures(school_id, offering_id, version, previous_id, reason, request_key, policy_version, policy, scale_id, scale_version, bands, credits, pass_fail,
                                       calc_code, calc_version, calc_spec)
  values (target, offering, v + 1, cur.id, nullif(trim(p ->> 'reason'), ''), rk, pol.version, coalesce(pol.policy, '{}'), sc_id, sc_ver, sc_bands, o.credits, o.pass_fail,
          case when c_spec is not null then c_code end, case when c_spec is not null then c_ver end, c_spec)
  returning id into cid;

  for e in select en.person_id, en.status, en.pass_fail_choice from public.offering_enrollments en
            where en.offering_id = offering and en.status in ('enrolled', 'withdrawn') loop
    pf := o.pass_fail or coalesce(e.pass_fail_choice, false);
    inp := null;
    if c_spec is not null and e.status = 'enrolled' then
      r := calc -> 'results' -> e.person_id::text;
      inp := inputs -> e.person_id::text;
      if r is null then raise exception '계산 결과가 빠진 학생이 있습니다. 다시 계산해 주세요.' using errcode = 'P0409'; end if;
      if (r -> 'input') is distinct from inp then raise exception '그 사이 점수·출결·보충 이수가 바뀌었습니다. 다시 계산해 주세요.' using errcode = 'P0409'; end if;
      if coalesce(jsonb_typeof(r -> 'score'), 'null') not in ('number', 'null') or abs(coalesce((r ->> 'score')::numeric, 0)) >= 100000
         or coalesce(jsonb_typeof(r -> 'passed'), 'null') not in ('boolean', 'null')
         or coalesce(jsonb_typeof(r -> 'level'), 'null') not in ('string', 'null') then
        raise exception '계산 결과의 모양이 틀렸습니다.' using errcode = '22023';
      end if;
      lv := r ->> 'level';
      if lv is not null and lv !~ '^[A-Za-z0-9+\-]{1,8}$' then raise exception '계산 결과의 등급은 영문·숫자 8자 이하입니다.' using errcode = '22023'; end if;
      -- 얼린 값으로 다시 계산했을 때 똑같아야 하므로 몰래 반올림하지 않는다. 소수 셋째 자리 이하가 있으면 식에 round 를 적게 한다(Codex #169 P2)
      if (r ->> 'score') is not null and (r ->> 'score')::numeric <> round((r ->> 'score')::numeric, 2) then
        raise exception '계산 결과 점수는 소수 둘째 자리까지입니다. 식에 반올림(round)을 넣어 주세요.' using errcode = '22023';
      end if;
      raw := (r ->> 'score')::numeric; fin := raw;
      -- 이수 판정 칸(passed)이 없는 식(중학교처럼 과목 이수 판정이 없는 학교)은 점수나 등급이 있으면 이수, 없으면 미완료(Codex #169 P1).
      -- passed 칸이 있는데 값이 null 이면(자료 없음) 미완료다
      st := case when not (c_spec -> 'outputs') ? 'passed' then case when raw is not null or lv is not null then 'completed' else 'incomplete' end
                 when (r ->> 'passed') = 'true' then 'completed' when (r ->> 'passed') = 'false' then 'failed' else 'incomplete' end;
      band := case when lv is not null then jsonb_build_object('code', lv) end;
    else
      -- 계산식 없이 마감(이전 동작): 과목 총괄 축 가중 원점수 Σ(점수/만점×가중) / Σ가중 × 100. 빠진 결과가 있으면 미완료
      select coalesce(sum(a.weight), 0),
             coalesce(sum(case when r2.score is not null then r2.score / a.max_score * a.weight end), 0),
             bool_or(r2.score is null)
        into total_w, got_w, missing
        from public.assessments a left join public.current_assessment_results r2 on r2.assessment_id = a.id and r2.person_id = e.person_id
       where a.offering_id = offering and a.archived_at is null and a.axis = 'course' and a.weight > 0;
      raw := case when total_w > 0 and not coalesce(missing, true) then round(got_w / total_w * 100, sdigits) end;
      fin := case when raw is not null then round(raw, fdigits) end;
      band := case when sc_id is not null then app.band_for(sc_bands, fin) end;
      if raw is null then st := 'incomplete';
      elsif band is not null and coalesce((band ->> 'earns_credit')::boolean, true) = false then st := 'failed';
      else st := 'completed';
      end if;
    end if;
    if e.status = 'withdrawn' then st := 'withdrawn'; end if;
    earned := case when st = 'completed' then o.credits else 0 end;
    inst := st in ('completed', 'failed') and not pf and fin is not null;
    insert into public.closure_results(school_id, closure_id, person_id, raw_score, final_score, level_code, attempt_status, credits_attempted, credits_earned, in_stats, calc_input)
    values (target, cid, e.person_id, raw, fin, band ->> 'code', st, case when e.status = 'withdrawn' then 0 else o.credits end, earned, inst, inp);
  end loop;

  select count(*), round(avg(final_score), coalesce((pol.policy -> 'stats' ->> 'digits')::int, 1)),
         round(case when sd_kind = 'sample' then stddev_samp(final_score) else stddev_pop(final_score) end, coalesce((pol.policy -> 'stats' ->> 'digits')::int, 1))
    into n, m, s from public.closure_results where closure_id = cid and in_stats;
  insert into public.closure_stats(school_id, closure_id, n, mean, sd) values (target, cid, n, m, s);
  return jsonb_build_object('id', cid, 'version', v + 1, 'repeated', false, 'calc', c_spec is not null);
end $$;
reset role;
revoke create on schema app from app_writer;

-- ── 마감과 쓰기를 줄 세운다(Codex #169 P1) ──
-- 마감은 수업 단위 잠금을 혼자(exclusive) 잡는다. 마감 입력이 되는 쓰기(평가 결과·이 수업 교시 출결·보충 이수)는 같은 잠금을 함께(shared) 잡는다.
-- 그래서 마감은 진행 중인 쓰기가 끝난 뒤 원장을 읽고, 마감 뒤에 들어오는 결과 쓰기는 '마감 뒤 정정' 규칙을 다시 확인받는다.
create or replace function private.closure_input_lock() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  -- 이 수업 교시 출결·보충 이수: 마감과 줄만 선다
  if new.offering_id is not null then
    perform pg_advisory_xact_lock_shared(hashtext('school-platform:closures'), hashtext(new.offering_id::text));
  end if;
  return new;
end $$;
create or replace function private.closure_result_lock() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare off uuid;
begin
  select a.offering_id into off from public.assessments a where a.id = new.assessment_id;
  perform pg_advisory_xact_lock_shared(hashtext('school-platform:closures'), hashtext(off::text));
  -- 잠금을 기다리는 사이 마감됐으면, 결과는 학교 관리자가 사유와 함께 고치는 경우만 받는다(record_result 와 같은 규칙)
  if app.offering_closed(off) and (not app.is_school_admin(new.school_id) or length(trim(coalesce(new.reason, ''))) = 0) then
    raise exception '마감한 수업의 결과는 학교 관리자가 사유와 함께 정정합니다.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function private.closure_input_lock() from public, anon, authenticated;
revoke all on function private.closure_result_lock() from public, anon, authenticated;
create trigger assessment_results_closure_lock before insert on public.assessment_results for each row execute function private.closure_result_lock();
create trigger attendance_events_closure_lock before insert on public.attendance_events for each row execute function private.closure_input_lock();
create trigger remediation_events_closure_lock before insert on public.remediation_events for each row execute function private.closure_input_lock();

grant create on schema app to app_writer;
do $$
declare f text;
begin
  foreach f in array array['app.offering_calc_inputs(uuid, uuid)', 'app.record_remediation(uuid, jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
    execute format('alter function %s owner to app_writer', f);
  end loop;
end $$;
revoke create on schema app from app_writer;
