-- 132차: 템플릿 판 검사에 바닥 띠 규칙을 더한다(131차 PR #228 '남은 것').
-- 학교 관리자 화면·API 척도 쓰기(src/lib/grading.ts checkBands floor)와 템플릿 적용 길(applyTemplate)이 같은 규칙을 쓰게 한다.
-- 적용 전 운영 확인(2026-11-28): academic_templates 는 시드 5종 1판뿐이고, 직접 정한 척도 ib_1_7 은 min 0 띠가 있으며
-- 나머지는 모두 바닥 띠가 있는 미리 만든 척도다 → 기존 판은 모두 새 규칙을 지난다.
-- 함수만 바꾸면 CHECK 제약이 기존 행을 다시 보지 않으므로 제약을 다시 걸어 모든 판을 다시 검사한다(어긋난 판이 있으면 이 마이그레이션이 멈춘다).
select set_config('request.jwt.claims', '{}', true);

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
                                                  or jsonb_typeof(b -> 'min') not in ('number', 'null'))
                              -- 132차: 0점까지 덮는 바닥 띠(min ≤ 0)가 있어야 한다. 없으면 그 아래 점수가 app.band_for → null 로
                              -- 등급 없이 이수(completed) 마감 판으로 굳는다. 화면·API 쓰기 길 checkBands({ floor: true })와 같은 규칙
                              and exists (select 1 from jsonb_array_elements(e -> 'bands') b
                                           where jsonb_typeof(b -> 'min') = 'number' and (b ->> 'min')::numeric <= 0))))
    -- 척도 코드는 한 판 안에서 겹치지 않고, 직접 정한 척도의 '왜'는 척도 판과 같은 500자 이내
    and (select count(distinct e ->> 'code') from jsonb_array_elements(m -> 'scales') e) = jsonb_array_length(m -> 'scales')
    and not exists (select 1 from jsonb_array_elements(m -> 'scales') e
                     where e ? 'why' and (jsonb_typeof(e -> 'why') <> 'string' or length(e ->> 'why') > 500))
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

alter table public.academic_templates drop constraint academic_templates_shape;
alter table public.academic_templates add constraint academic_templates_shape check (private.academic_template_ok(title, summary, manifest));
