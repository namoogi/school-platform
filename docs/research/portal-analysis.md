# 드리미포털 구조 분석과 새 플랫폼 반영 (2026-11-22)

- 출처: 사용자 컴퓨터의 **Dreamy Portal** Claude 세션이 드리미포털 저장소를 읽기 전용으로 정리해 보낸 3부 요약(마이그레이션 550개 파싱 기준, 2026-11-22). 이 저장소는 드리미포털 코드·DB에 접근하지 않았다.
- 실명·연락처·성적·비밀 값은 받지 않았고 여기에도 없다. 표·열·규칙·파일 이름만 적는다.
- 수치는 그날 잰 값이다. 다시 쓸 때는 드리미포털 쪽에서 다시 재야 한다.
- 대상: 학교 홈페이지 · 학생 포털 · 학생부. 설계·제약·로직은 **참고**하고 표를 그대로 옮기지 않는다(AGENTS.md 독립 인프라).

## 1. 한눈에

| 항목 | 드리미포털 | 새 플랫폼에 주는 뜻 |
| --- | --- | --- |
| 학교 개념 | `school_id`·`tenant_id`·`org_id`를 쓰는 마이그레이션 0개, 표 338개 | 모든 표에 학교 열쇠가 먼저 (이미 RLS로 구현, ADR 0001) |
| 배포 | 앱 셋(포털 `web/`, 학생부 `grade/`, 홈페이지 `homepage/`)이 **한 Supabase DB의 같은 표를 직접 읽음**. 소유권은 코드 규약뿐 | 모듈 경계를 DB 권한·함수로 강제. 한 앱 안의 모듈로 시작 |
| 스키마 | public 211 · grade 70 · admission 20 · www 12 · way 11 · class_public 10 · library 3 · mission_school 1 | 모듈별 스키마 대신 공통 핵심(학교·사람·학기·수업) + 모듈 표 |
| 외래키 | 182개(표 338개 대비 적음). 이음 다수가 앱 코드에만 | 모든 참조를 FK, 학교 간 참조는 복합 FK |
| 사람 참조 | **이름·메일 문자열로 사람을 가리키는 열 180개** | 사람·수업·학교는 id로만, 이름은 표시용 조인 |
| 마이그레이션 | 번호 매김 `NNNN_<앱>_<슬러그>.sql`, **번호 겹침 14개**(예약 도구를 만든 뒤에도 또 겹침) | 타임스탬프 + CI 문지기(이 PR에서 추가) |

## 2. 모듈별 요약

### 2-1. 학교 홈페이지 (`www` 12표)
- `sections(page, key, title, sort, published, updated_by, updated_at)`: 쪽·칸 단위 글, `page+key`가 자리 열쇠
- `gallery`, `videos`, `media_tags`, `media_tag_vocab`, `archive_content`, `inquiries`, `decisions`, `change_log`, `homepage_editors`, `mission_admins`, `page_views(path, ts, referrer, device, ua)`
- 홈페이지가 포털의 `class_public`(수업 아카이브 공개면)을 함께 읽음

### 2-2. 학생 포털 (`public` 211표)
- 묶음: 학생부 기재 `sr_*` 13, `studio_*` 10, `meal_*` 9, `book_*` 8, `clau_*`(AI 대화) 8, `dbooks_*` 8, `survey_*` 7, `class_*` 6, `dev_*`(공용 API 허가·사용량) 6, `library_*`·`loop_*` 6씩 등
- `class_archive(subject, teacher, year, semester, description, book_list, capacity, stable_key, source)`: `class_id`로 `grade.courses`와 연결
- `class_roster(class_id, role, name, status)`: 사람을 이름 문자열로 저장

### 2-3. 학생부 (`grade` 70표 + `public.sr_*` 13표)
- 수업·학기: `courses(year, semester, type[선택·창의·필수], name, teacher_email, teacher_name, credits, pass_fail, status, block, school_level[중·고], scores_locked …)`, `course_students`, `course_weeks/assignments/attendance/submissions/materials/modules/editors`, 시간표 `timetable_slot/week/override`, `term_class_assignment`, `band_terms`, `block_choices`
- 기재 항목: `sr_course_results(student_id, grade, semester, subject_group, area_key, course_name, achievement, avg_score, source_course_id, stat_mean, stat_sd, stat_n, stat_frozen_at, stat_frozen_why …)`, `sr_attendance`, `sr_awards`, `sr_behavior_opinions`, `sr_certifications`, `sr_club_entries`, `sr_course_display_overrides`, `sr_change_log`
- 발행 보존: `grade.record_snapshots(student_id, format, grid jsonb)` — 1~4기는 이 스냅샷이 화면에 그려짐. `student_transcript`에는 `student_name`과 `student_id`가 둘 다 남음(이관 중단 흔적)

### 2-4. 권한·인증
- `allowed_users`(화이트리스트), `profiles`(auth 사용자 연결, 로그인 때 upsert), `module_admins`(모듈 단위 관리자: grade·admission·www·media), `audit_log`, `school_record_permissions`
- 역할 student·teacher·admin, JWT에 역할 없음(표 조회). SQL 헬퍼 `is_admin()`, `is_staff()`, `is_module_admin(module)`, `is_assigned_teacher(...)`, `current_user_role()`
- 로그인: Google OAuth → 화이트리스트 확인 → profiles upsert·감사 → **매 요청마다 세션+화이트리스트 재확인**(해제 즉시 차단)
- RLS 켠 표 314, 정책 159: 정책 없는 표는 service_role 전용(의도). 새 앱에 service_role 키를 배포하지 않는 규칙
- 학생부 성적 저장 = 담당 교사·배정자·관리자, 학기 전환 = 관리자. 외부 강사 일부는 이름으로만 매칭

## 3. 실제로 겪은 문제와 교훈

| # | 사건 | 원인 | 새 플랫폼 대응 |
| --- | --- | --- | --- |
| L1 | 과목 표기명을 바꾸자 학생이 자기 반 통계(평균·표준편차)에서 빠짐 | 통계를 화면에서 매번 계산, 모집단 키 = `과목명\|학년\|학기` | 모집단 키는 **수업 id**. 발행 때 통계를 스냅샷에 함께 얼림. 모집단 제외(교환학생·테스터)는 별도 표에 사유와 함께 |
| L2 | 표기 변경이 잦음 | 미인가 대안학교라 대학 제출용 **발행 표기명 ≠ 실제 과목명**인데 한 칸 | 실제 과목과 발행 표기를 다른 표로, 표기는 판(version)으로 |
| L3 | 필수과목 30개가 아카이브와 끊김 | 갈래마다 자리 생기는 계기가 다름(선택=신청 마감, 창의=승인, 필수=없음) | 갈래별 수명주기를 학교 설정으로 명시하고, 계기가 없는 갈래도 기본 계기(학기 시작) |
| L4 | 공개 갈래 규칙·블록 편집기·모델 이름이 여러 곳에 사본 → 한쪽만 고쳐짐(179줄 갈라짐, 넉 달 낡은 문서) | 규칙 사본 | 규칙은 DB 함수·설정 한 곳, 손으로 적은 수 금지(세는 것은 명령 하나) |
| L5 | 동명이인·개명·계정 둘인 교사 | 사람을 이름·메일 문자열로 참조(180열) | `people`(사람)과 계정 분리, 이름 이력 표, id 참조만 |
| L6 | 끊긴 줄이 조용히 생김 | FK가 적고 이음이 앱 코드에만 | 모든 참조 FK + 복합 FK |
| L7 | 마이그레이션 번호 겹침 14개 | 병렬 세션이 손으로 번호를 땀. **문서·도구만으로는 안 막힘** | 타임스탬프 이름 + CI 문지기(`scripts/check-repo.mjs`) |
| L8 | 쿼리 1,000행에서 조용히 잘림(사고 2회) | Supabase(PostgREST) 행 한도 | 이 플랫폼은 `pg`로 직접 질의해 이 한도에 걸리지 않음. 다만 목록 API는 처음부터 페이지 나눔 규칙 |
| L9 | 중등 모드에 고등 명단, 기수 정규식이 '중1기'를 건너뜀 | 학교급 필터 누락, 문자열 파싱 | 학교급·기수를 문자열이 아닌 표(차원)로, 화면 질의에 학교급 범위 필수 |
| L10 | 조용히 틀리는 장부 4건(401을 422로 넘김, 부분 색인 upsert 실패, `error` 반환 무시, 기다리지 않은 쓰기) | 실패 분류·처리 규칙 없음 | 실패를 "누가 고칠 일인지"로 분류, 오류는 던지거나 반드시 보고, 장부 쓰기는 기다림 |
| L11 | 글자 수 한도(909·550·1500자 등)가 코드 곳곳에 | 하드코딩 | 학교 설정(판 관리) |
| L12 | 발송용 가리기에서 격자 밖 prop으로 사진·이름이 샘 | 가리기를 자료 일부에만 적용 | 내보내기 전용 스냅샷을 따로 만들고 그것만 렌더링 |
| L13 | 빌드 헛돌기(8일 157건), 함수 리전 iad1 ↔ DB 서울 | 배포 설정 | Vercel 함수 리전을 DB와 같게(이 프로젝트 DB는 `ap-northeast-1` 도쿄 — 확인 필요), 같은 커밋 중복 배포 방지 |

## 4. 가져갈 것 · 버릴 것

| 가져간다 | 버린다 |
| --- | --- |
| 발행 시점 보존(이미 14차 스냅샷, 통계까지 확장) · 배포 전 문지기 체계 · 비용 드는 창구의 공통 문(AI 사용량·한도·비용 기록, 실패 책임 구분) · 매 요청 권한 재확인(이미 RLS+세션) · 모듈 단위 관리자 · 감사 기록(이미 access_log) | 사람을 문자열로 가리키기 · 번호 매기는 마이그레이션 · 사본으로 규칙 나누기 · 학교 개념 없는 표 · 앱 셋이 한 DB 표를 코드 규약으로만 나눠 쓰기 |

## 5. 외부 의존성 (드리미포털)

Supabase(인증·DB·저장소, 세 앱 공유) · Google APIs(시트·문서·캘린더·드라이브, 서비스 계정) · Anthropic Claude(어댑터 한 곳, 시스템 프롬프트 캐시, 호출 기록) · Gemini(이미지) · ElevenLabs(음성) · Azure Speech(통역) · Higgsfield(영상) · Vercel · GitHub(학생 앱 저장소 자동 생성) · Notion(콘텐츠 크롤) · 카카오(식단 이미지 검색).
공용 API 창구(`app/api/platform/*`)가 학생 앱에 AI를 빌려줌: 허가 `dev_api_grants`, 사용량 `dev_api_usage`, 비용 `llm_calls.cost_usd`. 새 플랫폼이 학교에 AI를 빌려줄 때 참고할 모양.

## 6. 드리미포털에서 먼저 읽을 문서 (다음에 사용자를 통해 요청할 것)

`docs/PORTABLE-SCHEMA.md`(옮길 수 있는 스키마), `docs/SYSTEM-MAP.md`, `docs/DEPLOY-GATES.md`(문지기 90개), `docs/LOOP-CHARTER.md`, `grade/docs/ADMISSION-INTERVIEW-UI-SPEC.md`, 각 앱 `AGENTS.md`(사고 이력). 이 세션은 드리미포털 세션에서 받기만 할 수 있어, 추가 자료는 사용자를 통해 요청한다.

## 7. 다음 단계

[결정 기록 0004](../decisions/0004-domain-model-normalization.md)(제안, Claude 안 A) → Codex 안 B → 사용자 결정 → 핵심 표(사람·학년도·학기·과목·수업·수강·평가·통계 동결) 마이그레이션 → 학생부·학생 포털·홈페이지 모듈 순서로 구현.
