-- 109차: 학년 체계(한국식·미국식·커스텀) + 반이 학년(grade_levels)을 가리킴 (ADR 0043)
-- 학년 서수(ordinal)는 F1에서 이미 정규 자리(PK=-1, K=0, 1~12)다. 학년 체계는 '그 서수를 어떻게 부를지'를 학교 관할 판에 둔다.
--   kr: 초1~초6·중1~중3·고1~고3 / us: K·Grade 1~12 / custom: 학교가 학년마다 적은 표기(grade_levels.label)를 그대로 쓴다.
-- 경계는 F1과 같다: 판은 추가만, 쓰기는 app_writer 소유 명령 함수로만, 학교 표끼리는 복합 외래키.
select set_config('request.jwt.claims', '{}', true);

alter table public.school_profiles add column grade_scheme text
  check (grade_scheme is null or grade_scheme in ('kr', 'us', 'custom'));
-- 커스텀 표기는 학년 행을 고치지 않고 판에 둔다: { "서수": "표기" } (예: {"1":"씨앗반"}). 학년 행은 바꿀 수 없는 기록이라서다.
alter table public.school_profiles add column grade_labels jsonb not null default '{}'
  check (jsonb_typeof(grade_labels) = 'object');

-- 반은 학년도·학교급별로 있었고 학년은 학교급 안의 순번(1~12)뿐이었다. 학년 행을 함께 가리켜 정규 서수와 이어 준다(빈 값 = 예전 반).
alter table public.homerooms add column grade_level_id uuid;
alter table public.homerooms add constraint homerooms_grade_level_fk
  foreign key (grade_level_id, school_id) references public.grade_levels(id, school_id);
create index homerooms_grade_level on public.homerooms (school_id, grade_level_id);

create or replace function app.set_school_profile(target uuid, p jsonb)
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v integer; prev text; prev_labels jsonb; scheme text; labels jsonb;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('school-platform:school_profiles'), hashtext(target::text));
  select coalesce(max(version), 0) + 1 into v from public.school_profiles where school_id = target;
  if (p ? 'base_version') and (p ->> 'base_version')::int <> v - 1 then
    raise exception '그 사이 새 판이 생겼습니다. 최신 판을 다시 읽어 고쳐 주세요.' using errcode = 'P0409';
  end if;
  -- 학년 체계를 보내지 않으면 직전 판 값을 잇는다(관할만 고쳐도 체계가 지워지지 않게)
  select grade_scheme, grade_labels into prev, prev_labels from public.school_profiles where school_id = target order by version desc limit 1;
  scheme := case when p ? 'grade_scheme' then nullif(p ->> 'grade_scheme', '') else prev end;
  if scheme is not null and scheme not in ('kr', 'us', 'custom') then
    raise exception '학년 체계는 한국식·미국식·커스텀 중 하나입니다.' using errcode = '22023';
  end if;
  labels := case when p ? 'grade_labels' then p -> 'grade_labels' else coalesce(prev_labels, '{}') end;
  if jsonb_typeof(labels) <> 'object' or exists (
       select 1 from jsonb_each(labels) e
        where e.key !~ '^-?[0-9]{1,2}$' or e.key::int not between -3 and 14
           or jsonb_typeof(e.value) <> 'string' or length(trim(e.value #>> '{}')) not between 1 and 40) then
    raise exception '학년 표기는 서수(-3~14)마다 1~40자입니다.' using errcode = '22023';
  end if;
  insert into public.school_profiles(school_id, version, country, sector, accreditation, external_codes, why, grade_scheme, grade_labels)
  values (target, v, nullif(upper(p ->> 'country'), ''), nullif(p ->> 'sector', ''), nullif(trim(p ->> 'accreditation'), ''),
          coalesce(p -> 'external_codes', '{}'), nullif(trim(p ->> 'why'), ''), scheme, labels);
  return v;
end $$;

-- 학년 행으로 반을 만든다. 학교급·학교급 안 순번은 학년 행에서 정한다(클라이언트가 고르지 않음).
create or replace function app.add_grade_homeroom(target uuid, year_id uuid, grade_level uuid, homeroom_name text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare g record; pos integer; nid uuid;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  if length(trim(coalesce(homeroom_name, ''))) not between 1 and 60 then
    raise exception '반 이름은 1~60자입니다.' using errcode = '22023';
  end if;
  select id, school_level_id, ordinal into g from public.grade_levels where id = grade_level and school_id = target;
  if g.id is null then raise exception '이 학교의 학년을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if g.school_level_id is null then raise exception '학교급에 속한 학년만 반을 만들 수 있습니다.' using errcode = '22023'; end if;
  select count(*) into pos from public.grade_levels
   where school_id = target and school_level_id = g.school_level_id and ordinal <= g.ordinal;
  if pos not between 1 and 12 then raise exception '학년은 1~12 사이입니다.' using errcode = '22023'; end if;
  begin
    insert into public.homerooms(school_id, academic_year_id, school_level_id, grade, name, grade_level_id)
    values (target, year_id, g.school_level_id, pos, trim(homeroom_name), g.id) returning id into nid;
  exception
    when foreign_key_violation then raise exception '이 학교의 학교급·학년도를 찾을 수 없습니다.' using errcode = 'P0002';
    when unique_violation then raise exception '같은 이름의 반이 이미 있습니다.' using errcode = '23505';
  end;
  return nid;
end $$;

grant create on schema app to app_writer;
do $$
declare f text;
begin
  foreach f in array array['app.set_school_profile(uuid, jsonb)', 'app.add_grade_homeroom(uuid, uuid, uuid, text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
    execute format('alter function %s owner to app_writer', f);
  end loop;
end $$;
revoke create on schema app from app_writer;
