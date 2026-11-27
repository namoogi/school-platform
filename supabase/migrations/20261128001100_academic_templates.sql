-- 111차: 학사 관리 템플릿 5종 (ADR 0043 2단계)
-- 템플릿은 관제 영역의 판(ADR 0027 기본판의 한 갈래)이다. 학교는 템플릿을 실시간으로 읽어 쓰지 않는다:
-- 고르면 그 판의 내용이 학교 사본(학교급·학년·학기 구조·척도)으로 만들어지고, 그 뒤 학교·학교 AI는 사본만 고친다.
-- 학교가 어느 템플릿 몇 판에서 시작했는지는 학교 관할 판(school_profiles)에 남는다(학교 이전 때 관제 표를 끌고 가지 않게 외래키 없이 키·판만).
select set_config('request.jwt.claims', '{}', true);

create table public.academic_templates (
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  version integer not null check (version >= 1),
  sort_order integer not null default 0,
  title jsonb not null check (jsonb_typeof(title) = 'object' and title ? 'ko'),
  summary jsonb not null check (jsonb_typeof(summary) = 'object'),
  -- manifest: { grade_scheme, levels[], periods[{id,label}], scales[{code, preset} | {code, kind, bands, why}],
  --             calc_samples[](계산식 견본 이름만, ADR 0040·0041), attendance, outputs[](출력 서식), hide[](숨길 구획) }
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  why text check (why is null or length(why) <= 500),
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (key, version)
);
create trigger academic_templates_guard before update or delete on public.academic_templates
  for each row execute function private.guard_columns();
alter table public.academic_templates enable row level security;
-- 표는 전체 관리자만 직접 읽는다. 학교는 아래 읽기 함수로 최신 판만 본다(관제 표를 학교 역할에 열지 않음)
create policy academic_templates_read on public.academic_templates for select to authenticated using (app.is_platform_admin());
grant select on public.academic_templates to authenticated;

insert into public.academic_templates(key, version, sort_order, title, summary, manifest, why) values
  ('kr_general', 1, 1, $j${"ko":"한국 일반 초·중·고","en":"Korean K-12 (general)"}$j$::jsonb, $j${"ko":"초1~고3, 두 학기, 중·고 성취평가(A–E), 자체 학생부","en":"Elementary 1–High 3, two semesters, achievement grades A–E, school record"}$j$::jsonb, $j${"grade_scheme":"kr","levels":["elementary","middle","high"],"periods":[{"id":"s1","label":"1학기"},{"id":"s2","label":"2학기"}],"scales":[{"code":"kr_achievement","preset":"kr_achievement"},{"code":"kr_elective","preset":"kr_elective"}],"calc_samples":["kr_high_common","kr_high_elective","kr_middle"],"attendance":"day_period","outputs":["kr_alt_record"],"hide":[]}$j$::jsonb, '111차 첫 판(ADR 0043)'),
  ('kr_alternative', 1, 2, $j${"ko":"한국 대안학교(프로젝트·P/F)","en":"Korean alternative (projects, pass/fail)"}$j$::jsonb, $j${"ko":"학교급 구성은 자유, 두 학기, P/F + 역량·서술 중심, 석차·평점 숨김","en":"Flexible levels, two semesters, pass/fail with competencies and narratives; no rank or GPA"}$j$::jsonb, $j${"grade_scheme":"kr","levels":["elementary","middle","high"],"periods":[{"id":"s1","label":"1학기"},{"id":"s2","label":"2학기"}],"scales":[{"code":"pass_fail","preset":"pass_fail"}],"calc_samples":["pass_fail_project","competency_mastery"],"attendance":"day","outputs":["kr_alt_record","en_record"],"hide":["rank","gpa"]}$j$::jsonb, '111차 첫 판(ADR 0043)'),
  ('us_k12', 1, 3, $j${"ko":"미국 K-12","en":"US K-12"}$j$::jsonb, $j${"ko":"K~Grade 12, 두 학기, 글자 성적·GPA, 성적증명서·학교 소개서","en":"K–Grade 12, two semesters, letter grades and GPA, transcript and school profile"}$j$::jsonb, $j${"grade_scheme":"us","levels":["elementary","middle","high"],"periods":[{"id":"s1","label":"Fall"},{"id":"s2","label":"Spring"}],"scales":[{"code":"us_letter","preset":"us_letter"},{"code":"us_plus_minus","preset":"us_plus_minus"}],"calc_samples":["us_letter_plus_minus","us_letter_pf"],"attendance":"day_period","outputs":["us_transcript","us_school_profile"],"hide":["rank_grade"]}$j$::jsonb, '111차 첫 판(ADR 0043)'),
  ('international', 1, 4, $j${"ko":"국제학교(IB·AP 혼합)","en":"International (IB and AP)"}$j$::jsonb, $j${"ko":"K~Grade 12, 두 학기, 글자 성적 + IB 1–7, 성적증명서·영어 학업 기록","en":"K–Grade 12, two semesters, letter grades plus IB 1–7, transcript and academic record"}$j$::jsonb, $j${"grade_scheme":"us","levels":["elementary","middle","high"],"periods":[{"id":"s1","label":"Fall"},{"id":"s2","label":"Spring"}],"scales":[{"code":"us_letter","preset":"us_letter"},{"code":"ib_1_7","kind":"level","why":"IB 과목 점수 1–7(7 최고). 분할점은 과목·학교마다 다르다(학교가 고친다)","bands":[{"code":"7","label":{"ko":"7","en":"7"},"min":90,"earns_credit":true},{"code":"6","label":{"ko":"6","en":"6"},"min":80,"earns_credit":true},{"code":"5","label":{"ko":"5","en":"5"},"min":70,"earns_credit":true},{"code":"4","label":{"ko":"4","en":"4"},"min":60,"earns_credit":true},{"code":"3","label":{"ko":"3","en":"3"},"min":50,"earns_credit":true},{"code":"2","label":{"ko":"2","en":"2"},"min":40,"earns_credit":false},{"code":"1","label":{"ko":"1","en":"1"},"min":0,"earns_credit":false}]}],"calc_samples":["us_letter_plus_minus","weighted_average"],"attendance":"period","outputs":["us_transcript","en_record"],"hide":["rank_grade"]}$j$::jsonb, '111차 첫 판(ADR 0043)'),
  ('homeschool', 1, 5, $j${"ko":"홈스쿨 공동체","en":"Homeschool co-op"}$j$::jsonb, $j${"ko":"초등·중등, 세 텀, P/F + 서술, 영어 학업 기록, 석차·평점·교시 출결 숨김","en":"Elementary and middle, three terms, pass/fail with narratives, academic record; no rank, GPA or period attendance"}$j$::jsonb, $j${"grade_scheme":"kr","levels":["elementary","middle"],"periods":[{"id":"t1","label":"1텀"},{"id":"t2","label":"2텀"},{"id":"t3","label":"3텀"}],"scales":[{"code":"pass_fail","preset":"pass_fail"}],"calc_samples":["pass_fail_project"],"attendance":"day","outputs":["en_record"],"hide":["rank","gpa","period_attendance"]}$j$::jsonb, '111차 첫 판(ADR 0043)');

-- 학교가 고른 템플릿(키·판). 체계·표기처럼 보내지 않으면 직전 판 값을 잇는다
alter table public.school_profiles add column template_key text check (template_key is null or template_key ~ '^[a-z][a-z0-9_]{1,40}$');
alter table public.school_profiles add column template_version integer check (template_version is null or template_version >= 1);
alter table public.school_profiles add constraint school_profiles_template_pair check ((template_key is null) = (template_version is null));

-- 학교 구성원이 보는 템플릿 목록: 키마다 최신 판(전체 관리자가 아니어도 이 함수로만)
create or replace function app.academic_templates()
returns table (key text, version integer, sort_order integer, title jsonb, summary jsonb, manifest jsonb)
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select distinct on (t.key) t.key, t.version, t.sort_order, t.title, t.summary, t.manifest
    from public.academic_templates t
   where app.uid() is not null
   order by t.key, t.version desc
$$;

-- 템플릿 판 모양 검사: 학교 화면이 이 모양을 믿고 그리므로 낼 때 막는다(Codex #180)
create or replace function private.academic_template_ok(title jsonb, summary jsonb, m jsonb) returns boolean
language sql immutable set search_path = pg_catalog, public, pg_temp as $$
  select coalesce(
    -- 제목·설명: 언어 코드 → 비지 않은 글(화면이 그대로 그린다)
    jsonb_typeof(title) = 'object' and jsonb_typeof(title -> 'ko') = 'string'
    and not exists (select 1 from jsonb_each(title) e where e.key !~ '^[a-z]{2}$' or jsonb_typeof(e.value) <> 'string' or length(trim(e.value #>> '{}')) not between 1 and 120)
    and jsonb_typeof(summary) = 'object'
    and not exists (select 1 from jsonb_each(summary) e where e.key !~ '^[a-z]{2}$' or jsonb_typeof(e.value) <> 'string' or length(trim(e.value #>> '{}')) not between 1 and 500)
    and jsonb_typeof(m) = 'object'
    and m ->> 'grade_scheme' in ('kr', 'us', 'custom')
    and jsonb_typeof(m -> 'levels') = 'array' and jsonb_array_length(m -> 'levels') between 1 and 3
    and not exists (select 1 from jsonb_array_elements(m -> 'levels') e where e #>> '{}' not in ('elementary', 'middle', 'high') or jsonb_typeof(e) <> 'string')
    and jsonb_typeof(m -> 'periods') = 'array' and jsonb_array_length(m -> 'periods') between 1 and 12
    and not exists (select 1 from jsonb_array_elements(m -> 'periods') e
                     where jsonb_typeof(e -> 'id') <> 'string' or jsonb_typeof(e -> 'label') <> 'string'
                        or e ->> 'id' !~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$' or length(trim(e ->> 'label')) not between 1 and 60)
    -- 학기 열쇠는 겹치지 않는다(학기 구조 판 검사 validatePeriodValue 와 같음)
    and (select count(distinct e ->> 'id') from jsonb_array_elements(m -> 'periods') e) = jsonb_array_length(m -> 'periods')
    and jsonb_typeof(m -> 'scales') = 'array'
    -- 척도: 미리 만든 척도 이름(src/lib/grading.ts SCALE_PRESETS 와 같은 목록) 또는 종류 + 띠 1~30개(코드·표기·하한)
    and not exists (select 1 from jsonb_array_elements(m -> 'scales') e
                     where jsonb_typeof(e) <> 'object' or coalesce(e ->> 'code', '') !~ '^[a-z][a-z0-9_]{1,40}$'
                        or not (
                          (e ->> 'preset') in ('kr_achievement', 'us_letter', 'kr_elective', 'kr_arts_pe', 'kr_science_lab', 'us_plus_minus', 'pass_fail')
                          or (not (e ? 'preset')
                              and e ->> 'kind' in ('letter', 'level', 'pass_fail', 'percent', 'points')
                              and jsonb_typeof(e -> 'bands') = 'array' and jsonb_array_length(e -> 'bands') between 1 and 30
                              and not exists (select 1 from jsonb_array_elements(e -> 'bands') b
                                               -- 척도 쓰기(app.save_scale 띠 코드, grading.ts ltext 표기)와 같은 규칙
                                               where jsonb_typeof(b) <> 'object' or coalesce(b ->> 'code', '') !~ '^[A-Za-z0-9+\-]{1,8}$'
                                                  or jsonb_typeof(b -> 'label') <> 'object'
                                                  or not exists (select 1 from jsonb_each(b -> 'label') l where l.key ~ '^[a-z]{2}$' and jsonb_typeof(l.value) = 'string' and length(trim(l.value #>> '{}')) > 0)
                                                  or jsonb_typeof(b -> 'min') not in ('number', 'null')))))
    and m ->> 'attendance' in ('day', 'period', 'day_period')
    and jsonb_typeof(m -> 'calc_samples') = 'array'
    and not exists (select 1 from jsonb_array_elements(m -> 'calc_samples') e where jsonb_typeof(e) <> 'string')
    and jsonb_typeof(m -> 'outputs') = 'array'
    and not exists (select 1 from jsonb_array_elements(m -> 'outputs') e where e #>> '{}' not in ('kr_alt_record', 'us_transcript', 'us_school_profile', 'th_por_por_1', 'en_record') or jsonb_typeof(e) <> 'string')
    and jsonb_typeof(m -> 'hide') = 'array'
    and not exists (select 1 from jsonb_array_elements(m -> 'hide') e where e #>> '{}' not in ('rank', 'gpa', 'rank_grade', 'period_attendance') or jsonb_typeof(e) <> 'string'),
    false)
$$;
revoke all on function private.academic_template_ok(jsonb, jsonb, jsonb) from public, anon, authenticated;
-- 시드 5종도 같은 검사를 지난다(표 제약)
alter table public.academic_templates add constraint academic_templates_shape check (private.academic_template_ok(title, summary, manifest));

-- 관제가 템플릿 새 판을 낸다(지침 10: 보고 고친 판, 낡으면 409). 학교 사본은 바뀌지 않는다
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
  return v;
end $$;

-- 관할 판 쓰기에 템플릿 키·판을 더한다(app_writer 소유 함수 → 그 역할로 다시 정의, #171·#173)
grant create on schema app to app_writer;
set local role app_writer;
create or replace function app.set_school_profile(target uuid, p jsonb)
returns integer language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare v integer; prev record; scheme text; labels jsonb; tkey text; tver integer;
begin
  if not app.is_school_admin(target) then raise exception '학교 관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('school-platform:school_profiles'), hashtext(target::text));
  select coalesce(max(version), 0) + 1 into v from public.school_profiles where school_id = target;
  if (p ? 'base_version') and (p ->> 'base_version')::int <> v - 1 then
    raise exception '그 사이 새 판이 생겼습니다. 최신 판을 다시 읽어 고쳐 주세요.' using errcode = 'P0409';
  end if;
  -- 학년 체계·표기·템플릿은 보내지 않으면 직전 판 값을 잇는다(관할만 고쳐도 지워지지 않게)
  select grade_scheme, grade_labels, template_key, template_version into prev
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
  insert into public.school_profiles(school_id, version, country, sector, accreditation, external_codes, why, grade_scheme, grade_labels, template_key, template_version)
  values (target, v, nullif(upper(p ->> 'country'), ''), nullif(p ->> 'sector', ''), nullif(trim(p ->> 'accreditation'), ''),
          coalesce(p -> 'external_codes', '{}'), nullif(trim(p ->> 'why'), ''), scheme, labels, tkey, case when tkey is null then null else tver end);
  return v;
end $$;
reset role;
revoke create on schema app from app_writer;

-- set_school_profile(app_writer 소유)이 템플릿 판이 있는지 볼 수 있게
grant select on public.academic_templates to app_writer;
create policy academic_templates_writer on public.academic_templates for select to app_writer using (true);

-- 템플릿 읽기·내기 함수는 관제 표 소유 역할(마이그레이션 역할)이 소유한다(app.publish_baseline 과 같음)
revoke all on function app.academic_templates() from public, anon;
grant execute on function app.academic_templates() to authenticated;
revoke all on function app.publish_academic_template(jsonb) from public, anon;
grant execute on function app.publish_academic_template(jsonb) to authenticated;
