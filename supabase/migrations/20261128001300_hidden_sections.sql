-- 118차: 학교가 숨길 구획(석차·평점·석차등급·교시 출결)을 학교 사본으로 (ADR 0043 2단계 후속)
-- 템플릿의 hide 는 관제 판이라 학교가 고칠 수 없다. 처음 템플릿을 고를 때 학교 관할 판에 복사하고(학교 사본), 그 뒤에는 학교가 고친다.
-- 화면·발행본은 템플릿이 아니라 이 학교 값만 읽는다(ADR 0027: 학교는 기본판·템플릿을 실시간으로 읽지 않는다).
select set_config('request.jwt.claims', '{}', true);

-- null = 학교가 아직 정하지 않음(템플릿을 고르면 그 hide 를 복사). 빈 배열 = 학교가 '숨김 없음'으로 정함(Codex #191)
alter table public.school_profiles add column hidden_sections text[]
  check (hidden_sections <@ array['rank', 'gpa', 'rank_grade', 'period_attendance']::text[]);

-- app_writer 소유 함수는 그 역할로 다시 정의한다(#171·#173)
grant create on schema app to app_writer;
set local role app_writer;
create or replace function app.set_school_profile(target uuid, p jsonb)
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v integer; prev record; scheme text; labels jsonb; tkey text; tver integer; hidden text[];
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('school-platform:school_profiles'), hashtext(target::text));
  select coalesce(max(version), 0) + 1 into v from public.school_profiles where school_id = target;
  if (p ? 'base_version') and (p ->> 'base_version')::int <> v - 1 then
    raise exception '그 사이 새 판이 생겼습니다. 최신 판을 다시 읽어 고쳐 주세요.' using errcode = 'P0409';
  end if;
  -- 학년 체계·표기·템플릿·숨길 구획은 보내지 않으면 직전 판 값을 잇는다(관할만 고쳐도 지워지지 않게)
  select grade_scheme, grade_labels, template_key, template_version, hidden_sections into prev
    from public.school_profiles where school_id = target order by version desc limit 1;
  scheme := case when p ? 'grade_scheme' then nullif(p ->> 'grade_scheme', '') else prev.grade_scheme end;
  if scheme is not null and scheme not in ('kr', 'us', 'custom') then
    raise exception '학년 체계는 한국식·미국식·커스텀 중 하나입니다.' using errcode = '22023';
  end if;
  labels := case when p ? 'grade_labels' then p -> 'grade_labels' else coalesce(prev.grade_labels, '{}') end;
  if jsonb_typeof(labels) <> 'object' or exists (
       select 1 from jsonb_each(labels) e
        where e.key !~ '^-?[0-9]{1,2}$' or e.key::int not between -3 and 14
           or jsonb_typeof(e.value) <> 'string' or length(trim(e.value #>> '{}')) not between 1 and 40) then
    raise exception '학년 표기는 서수(-3~14)마다 1~40자입니다.' using errcode = '22023';
  end if;
  if p ? 'template_key' then
    tkey := nullif(p ->> 'template_key', '');
    tver := nullif(p ->> 'template_version', '')::int;
    if tkey is not null and not exists (select 1 from public.academic_templates t where t.key = tkey and t.version = tver) then
      raise exception '그 템플릿 판을 찾을 수 없습니다.' using errcode = 'P0002';
    end if;
  else
    tkey := prev.template_key; tver := prev.template_version;
  end if;
  if p ? 'hidden_sections' then
    if jsonb_typeof(p -> 'hidden_sections') <> 'array' or exists (
         select 1 from jsonb_array_elements(p -> 'hidden_sections') e
          where jsonb_typeof(e) <> 'string' or e #>> '{}' not in ('rank', 'gpa', 'rank_grade', 'period_attendance')) then
      raise exception '숨길 구획은 석차·평점·석차등급·교시 출결 중에서 고릅니다.' using errcode = '22023';
    end if;
    select coalesce(array_agg(distinct x order by x), '{}') into hidden from jsonb_array_elements_text(p -> 'hidden_sections') x;
  else
    hidden := prev.hidden_sections;
  end if;
  insert into public.school_profiles(school_id, version, country, sector, accreditation, external_codes, why, grade_scheme, grade_labels, template_key, template_version, hidden_sections)
  values (target, v, nullif(upper(p ->> 'country'), ''), nullif(p ->> 'sector', ''), nullif(trim(p ->> 'accreditation'), ''),
          coalesce(p -> 'external_codes', '{}'), nullif(trim(p ->> 'why'), ''), scheme, labels, tkey, case when tkey is null then null else tver end, hidden);
  return v;
end $$;
reset role;
revoke create on schema app from app_writer;

-- 이미 템플릿을 고른 학교: 고른 판의 hide 를 학교 사본으로 새 관할 판에 복사한다(이전 판은 고치지 않음, Codex #191)
insert into public.school_profiles(school_id, version, country, sector, accreditation, external_codes, why, grade_scheme, grade_labels, template_key, template_version, hidden_sections, created_by)
select p.school_id, p.version + 1, p.country, p.sector, p.accreditation, p.external_codes, '118차: 고른 템플릿의 숨길 구획 복사',
       p.grade_scheme, p.grade_labels, p.template_key, p.template_version,
       (select coalesce(array_agg(distinct x order by x), '{}') from jsonb_array_elements_text(coalesce(t.manifest -> 'hide', '[]')) x),
       p.created_by
  from (select distinct on (school_id) * from public.school_profiles order by school_id, version desc) p
  join public.academic_templates t on t.key = p.template_key and t.version = p.template_version
 where p.hidden_sections is null;
