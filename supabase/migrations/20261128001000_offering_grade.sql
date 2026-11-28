-- 110차: 수업(개설)에 학년 칸 + 학기 시작 자동 수강을 학년 단위로 (ADR 0043 2절 앞당김, 관제 승인 #26)
-- 학년은 학년 행(grade_levels) id로 가리키고 학교 칸까지 묶는 복합 외래키로 둔다(지침 1·7). 비워 두면 예전처럼 학교급 전체.
-- 학년의 정체는 서수다(109차): 학생의 학년은 그 학년도 반 배정 → 반의 학년 행 → 서수로 정하고, 수업 학년의 서수와 맞춘다.
-- 기존 수업은 바꾸지 않는다(새 칸은 빈 값).
select set_config('request.jwt.claims', '{}', true);

alter table public.course_offerings add column grade_level_id uuid;
alter table public.course_offerings add constraint course_offerings_grade_level_fk
  foreign key (grade_level_id, school_id) references public.grade_levels(id, school_id);
create index course_offerings_grade_level on public.course_offerings (school_id, grade_level_id);

-- app_writer 소유 함수는 그 역할로 바꿔 다시 정의한다(운영 마이그레이션 역할은 슈퍼유저가 아님, #171·#173)
grant create on schema app to app_writer;
set local role app_writer;

-- 학년 인자를 더하려면 서명이 바뀐다. 옛 서명을 남기면 9개 인자 호출이 모호해지므로 지우고 다시 만든다(실행 권한은 아래에서 다시 준다)
drop function app.create_offering(uuid, uuid, uuid, uuid, uuid, numeric, boolean, text, integer);
create function app.create_offering(target uuid, term uuid, subject uuid, course_type uuid, level_id uuid,
  offering_credits numeric, offering_pass_fail boolean default false, offering_section text default '', offering_capacity integer default null,
  offering_grade uuid default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare r record; nid uuid;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if offering_credits is null or offering_credits < 0 or offering_credits > 99 then
    raise exception '학점은 0~99 사이입니다.' using errcode = '22023';
  end if;
  if offering_capacity is not null and offering_capacity < 1 then raise exception '정원은 1 이상입니다.' using errcode = '22023'; end if;
  if length(coalesce(offering_section, '')) > 20 then raise exception '분반 이름은 20자 이내입니다.' using errcode = '22023'; end if;
  -- 학년은 그 학교급의 학년이어야 한다(다른 학교·다른 학교급 학년 거부)
  if offering_grade is not null and not exists (
       select 1 from public.grade_levels g where g.id = offering_grade and g.school_id = target and g.school_level_id = level_id) then
    raise exception '이 학교급의 학년을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  select id, creation_trigger, pass_fail_allowed into r from public.course_type_rules
    where course_type_id = course_type and school_id = target order by version desc limit 1;
  if r.id is null then raise exception '이 갈래의 규칙 판이 없습니다. 먼저 규칙을 정해 주세요.' using errcode = 'P0002'; end if;
  if coalesce(offering_pass_fail, false) and not r.pass_fail_allowed then
    raise exception '이 갈래는 P/F를 허용하지 않습니다.' using errcode = '22023';
  end if;
  begin
    insert into public.course_offerings(school_id, term_id, subject_id, course_type_id, rule_id, school_level_id, section,
      credits, pass_fail, capacity, status, grade_level_id)
    values (target, term, subject, course_type, r.id, level_id, coalesce(offering_section, ''), offering_credits,
      coalesce(offering_pass_fail, false), offering_capacity, case when r.creation_trigger = 'application_close' then 'open' else 'planned' end,
      offering_grade)
    returning id into nid;
  exception
    when foreign_key_violation then
      raise exception '이 학교의 학기·과목·학교급을 찾을 수 없습니다.' using errcode = 'P0002';
    when unique_violation then
      raise exception '같은 학기에 같은 과목·분반이 이미 있습니다.' using errcode = 'P0001';
  end;
  return nid;
end $$;
revoke all on function app.create_offering(uuid, uuid, uuid, uuid, uuid, numeric, boolean, text, integer, uuid) from public, anon;
grant execute on function app.create_offering(uuid, uuid, uuid, uuid, uuid, numeric, boolean, text, integer, uuid) to authenticated;

-- 학기 시작: 계기가 term_start인 계획 개설을 활성화하고 학생을 수강 확정한다.
-- 학년이 없는 수업은 예전처럼 학기 시작일에 그 학교급 학적이 있는 학생 모두,
-- 학년이 있는 수업은 그중 그 학년도 반 배정(학기 시작일 기준)의 학년 서수가 수업 학년 서수와 같은 학생만.
create or replace function app.start_term(target uuid, term uuid)
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare d date; yr uuid; n integer := 0; o record;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  select coalesce(starts_on, current_date), academic_year_id into d, yr from public.terms where id = term and school_id = target;
  if d is null then raise exception '학기를 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  for o in
    select c.id, c.school_level_id, g.ordinal as grade_ordinal from public.course_offerings c
      join public.course_type_rules r on r.id = c.rule_id and r.school_id = c.school_id
      left join public.grade_levels g on g.id = c.grade_level_id and g.school_id = c.school_id
     where c.school_id = target and c.term_id = term and c.status = 'planned' and r.creation_trigger = 'term_start'
     order by c.id for update of c
  loop
    insert into public.offering_enrollments(school_id, offering_id, person_id, status, source)
    select target, o.id, e.person_id, 'enrolled', 'required'
      from public.enrollments_school e
     where e.school_id = target and e.school_level_id = o.school_level_id and daterange(e.starts_on, e.ends_on, '[)') @> d
       and (o.grade_ordinal is null or exists (
             select 1 from public.homeroom_assignments ha
               join public.homerooms h on h.id = ha.homeroom_id and h.school_id = ha.school_id
               join public.grade_levels hg on hg.id = h.grade_level_id and hg.school_id = h.school_id
              where ha.school_id = target and ha.person_id = e.person_id and ha.academic_year_id = yr
                and daterange(ha.starts_on, ha.ends_on, '[)') @> d and hg.ordinal = o.grade_ordinal))
    on conflict (offering_id, person_id) do nothing;
    update public.course_offerings set status = 'active', activated_at = now(), revision = revision + 1 where id = o.id and school_id = target;
    n := n + 1;
  end loop;
  return n;
end $$;
reset role;
revoke create on schema app from app_writer;
