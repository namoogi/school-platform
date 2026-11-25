# 오픈소스 학사정보시스템(SIS) 소스·스키마 분석 — REA 갈래 보고서

- 작성: 2026-11-25 · 범위: 오픈소스 SIS 5종 심층 + Fedena 1종 보조 + LMS 경계 참고
- 목적: 다학교(멀티테넌트) 학교 플랫폼(Next.js + Postgres/Supabase, 모든 표 `school_id` + RLS, 판으로 쌓는 기록)의 핵심 데이터 모델을 정할 근거 모으기
- 표기: **사실**(출처 = 저장소 파일 경로 또는 URL) / **추정**(근거는 있으나 직접 확인 못 함) / **확인 필요**(검증 못 함)
- 개인정보: 다루지 않음. 저장소의 예시 데이터는 열어 보지 않았고 인용하지 않음.

## 0. 방법과 한계

| 항목 | 내용 |
| --- | --- |
| 수집 | `git clone --depth 1`로 아래 저장소를 받고 SQL 설치 파일, ORM 모델, DocType JSON을 읽음. 코드는 실행하지 않음 |
| 저장소(받은 브랜치·최신 커밋) | `OS4ED/openSIS-Classic`(master, 2026-10-26), `francoisjacquet/rosariosis` GitHub 미러(mobile, 2026-11-23), `GibbonEdu/core`(v31.0.00, 2026-11-25), `openeducat/openeducat_erp`(19.0, 2026-11-24), `frappe/education`(develop, 2026-11-23), `projectfedena/fedena`(2016-07-20) |
| 보조 | 프레임워크 동작 확인용으로 `frappe/frappe`(develop)와 `odoo/odoo`(19.0)의 일부 파일만 sparse checkout |
| 활동 지표 | GitHub API는 이 세션에서 막혀(403) 기여자 총수·별 수를 못 얻음. 대신 `git fetch --shallow-since=2025-11-25`로 **최근 12개월 커밋 수와 작성자 메일 고유 수**를 셈. 봇·병합 커밋이 섞여 있어 대략치다 |
| 막힌 것 | `docs.frappe.io`가 이 세션 네트워크에서 열리지 않음. Frappe 문서 대신 프레임워크 소스로 확인. SchoolTool·Canvas·Moodle은 받지 않음(시간 우선순위). LMS 경계는 RosarioSIS의 Moodle 플러그인과 Frappe Education의 학습 DocType으로만 봄 |
| 표 수 세는 법 | SQL은 `CREATE TABLE` 고유 이름 수, Odoo는 `_name` 고유 수(마법사·보고서 모델 포함), Frappe는 `doctype/*/` 폴더의 JSON 수 |

---

## 1. 한눈 비교

| 항목 | openSIS Classic | RosarioSIS | Gibbon | OpenEduCat (커뮤니티) | Frappe Education | Fedena(보조) |
| --- | --- | --- | --- | --- | --- | --- |
| 기술 | PHP + MySQL/MariaDB | PHP + PostgreSQL(MySQL도 지원) | PHP + MySQL | Odoo 19 (Python ORM, PostgreSQL) | Frappe/ERPNext (Python, DocType JSON, MariaDB/PG) | Rails 2.x + MySQL |
| 스키마 규모(사실) | 표 102 + 뷰 4 (`install/OpensisSchemaMysqlInc.sql`) | 표 95 + 뷰 5 (`rosariosis.sql`) | 표 208 (`gibbon.sql`) | 모델 88(마법사·보고서 포함) | DocType 108, 그중 자식표 39 | 표 187 (`db/schema.rb`) |
| 학교(테넌트) | `schools` + 거의 모든 표에 `school_id` | `schools(id, syear)` 복합 PK + 대부분 표 `(school_id, syear)` FK | **학교 표 없음**. 설치 1개 = 학교 1개(`gibbonSetting` 'organisationName') | Odoo `res.company` 일부 모델에만 `company_id` | `Company` 링크가 학사 DocType 대부분에 있음, `Campus` DocType | 158개 표에 `school_id` 열, 앱 코드에선 사용 안 함 |
| 학년도·학기 | `school_years → school_semesters → school_quarters → school_progress_periods` 4단 + 통합 뷰 `marking_periods` | 한 표 `school_marking_periods(mp: FY/SEM/QTR/PRO, parent_id)` | `gibbonSchoolYear(status Past/Current/Upcoming) → gibbonSchoolYearTerm` | `op.academic.year(term_structure) → op.academic.term(parent_term)` | `Academic Year → Academic Term` | (확인 필요) |
| 학년·반 | `school_gradelevels`, `school_gradelevel_sections` | `school_gradelevels` | `gibbonYearGroup`(학년), `gibbonFormGroup`(학급, 학년도별, 담임 3명까지 열로) | `op.batch`(과정 기수) | `Student Batch Name`, `Program` | `batches`, `courses` |
| 과목·개설 | `courses`(과목) → `course_periods`(개설: 교사·정원·학점·평가척도) → `course_period_var`(요일·교시·교실) | `courses` → `course_periods` → `course_period_school_periods` | `gibbonCourse`(학년도별) → `gibbonCourseClass` → `gibbonCourseClassPerson(role)` | `op.course` + `op.subject`, 개설 표 없음(배치가 대신) | `Course` + `Subject`(+`Course Subject`) , 개설 표 없음 | `subjects`(배치별) |
| 등록(학교) | `student_enrollment(syear, school_id, grade_id, start/end, enrollment_code, drop_code)` | 같은 구조 + `id` PK | `gibbonStudentEnrolment(학년도, 학년, 학급)` | `op.student.course(course, batch, year, term, state)` | `Course Enrollment`(제출형, 수정은 amend) | `batch_students` |
| 등록(수업) | `schedule(student, course_period, mp, start/end, dropped)` | `schedule` | `gibbonCourseClassPerson(dateEnrolled/Unenrolled)` | `op.subject.registration` | `Subject Registration`(제출형) | `students_subjects` |
| 출결 | 교시별 `attendance_period` + 일별 `attendance_day`(분·상태값 계산) + 교사 완료 `attendance_completed` | 같은 계열 + 수정 허용 일수 설정 | 이벤트형 `gibbonAttendanceLogPerson`(방향 In/Out, 맥락: 학급/수업/개인/미래) | `op.attendance.sheet`(상태 draft→start→done) + `op.attendance.line`(불리언 4개) | `Student Attendance`(제출형, Present/Absent/Leave) | `attendances`(결석 기록만, 오전/오후) |
| 성적부 | 과제 `gradebook_assignments`·점수 `gradebook_grades` → 기간 성적 `student_report_card_grades` | 같은 계열 | `gibbonMarkbookColumn/Entry`(성취·노력 2축, 루브릭) + 별도 `gibbonReporting*`(성적표 작성 주기) | 시험 `op.exam` → `op.marksheet.register/line` → `op.result.line` | `Assessment Plan/Result`(제출형) + 새 `Grade Book`(Draft/Computed, 수동 덮어쓰기 사유 필수) | `exams`·`exam_scores`, CCE 표 |
| 척도·GPA·석차 | `report_card_grade_scales/grades` + DB 함수 `CALC_GPA_MP`, `SET_CLASS_RANK_MP`, 트리거로 재계산 | 같은 계열(`calc_gpa_mp`, `set_class_rank_mp`, 트리거 `srcg_mp_stats_update`) | `gibbonScale/ScaleGrade`, GPA·석차 기능은 핵심에 없음(추정) | `op.grade.configuration`(구간→표시), GPA는 유료 모듈 | `Grading Scale`(제출형) + `Grading Scale Interval(gpa, include_gpa, earn_credits)` | `grading_levels`, `ranking_levels` |
| 확정·정정 | 기간별 **입력 창**(`post_start_date`~`post_end_date`)만, 관리자는 언제든 덮어씀. 감사 기록 없음 | 같은 방식. 과거 성적은 FK 없이 이름 사본으로 보관 | 성적표 보관 `gibbonReportArchiveEntry(Draft/Final, filePath)`, 일반 감사 없음, 이벤트별 `gibbonLog` | 상태 필드만, validated → draft 되돌리기 가능. Odoo 변경 추적(`tracking=True`) | 프레임워크 **docstatus 0/1/2 + 취소·amend(새 문서)**, 제출 후 수정 차단, `track_changes` → `Version` | 졸업·퇴학 때 `archived_*` 표로 복사 |
| 확장 | 사용자 정의 필드 = `ALTER TABLE ... ADD CUSTOM_n` | 같은 방식(`AddDBField`) + 모듈/플러그인 + 훅 약 120개 | `gibbonCustomField` → 각 표 `fields` TEXT(JSON) + 추가 모듈 + `gibbonHook` | Odoo 모듈 상속(`_inherit`), 스튜디오는 유료 | Custom Field·Property Setter·Server Script, REST `/api/resource/<doctype>` | 플러그인(vendor/plugins) |
| 권한 | 프로필 × 화면(`profile_exceptions` can_use/can_edit) | 같은 방식 + 사용자별 예외 `staff_exceptions` | 역할(Staff/Student/Parent/Other) × 동작(`gibbonPermission`) | Odoo 그룹 + 레코드 규칙(`ir.rule`) | 역할 × DocType 권한 + User Permission | `privileges` |
| 다국어 | 4개 언어(`lang/`) | 51개 로캘(`locale/`), 과목명 등 다국어 필드(`ParseML`) | 47개 언어 목록(`gibboni18n`), 번역 파일은 저장소에 없음 | 핵심 모듈 `.po` 20개 | 앱 안에는 `ar.csv`만, 나머지는 프레임워크 몫(추정) | `translator` 플러그인 |
| 라이선스 | GPL-2.0 (`docs/License.txt`) | GPL-2.0 이상 (`LICENSE`, `COPYRIGHT`) | GPL-3.0 (`LICENSE`) | LGPL-3.0 (`LICENSE`, `__manifest__.py`) | GPL-3.0 (`license.txt`, `hooks.py`) | Apache-2.0 (`README.markdown`) |
| 최근 12개월 (대략치) | 커밋 288 / 작성자 6 | 커밋 426 / 작성자 4 | 커밋 364 / 작성자 15 | 커밋 28 / 작성자 13 | 커밋 88 / 작성자 12 | 2016년 이후 커밋 없음 |

---

## 2. 시스템별 분석

### 2.1 openSIS Classic (OS4Ed)

**계보.** **추정:** RosarioSIS와 같은 뿌리(Centre/SIS 계열)다. 표 이름(`marking_periods`·`course_periods`·`student_report_card_grades`·`attendance_day`)과 DB 함수 이름(`CALC_GPA_MP`, `SET_CLASS_RANK_MP`)이 거의 같다. 예시 데이터 설치 파일 `install/SqlSampleDataInc.php`에 RosarioSIS 저작권 기록에 나오는 단체명이 들어 있다.

**핵심 개체 (사실, `install/OpensisSchemaMysqlInc.sql`)**
- 학교: `schools(id, syear, title, …, reporting_gp_scale)`. 표 대부분에 `school_id`·`syear`가 있다. 교직원 소속은 `staff_school_relationship(staff_id, school_id, syear, start_date, end_date)`, 학교별 교직원 정보는 `staff_school_info`.
- 학기 구조: 4개 표 `school_years`·`school_semesters(year_id)`·`school_quarters(semester_id)`·`school_progress_periods(quarter_id)`. 각 표에 `start_date/end_date`, **성적 입력 기간** `post_start_date/post_end_date`, `does_grades`·`does_exam`·`does_comments` 플래그, 다음 해 복사용 `rollover_id`가 있다. 뷰 `marking_periods`가 넷을 UNION으로 합친다. 과거 학교 기록은 `history_marking_periods`, `history_school`.
- 학생·보호자: `students`, `people`(보호자·연락처), 연결 `students_join_people(student_id, person_id, is_emergency, relationship)`.
- 개설: `courses` → `course_periods(course_id, teacher_id, secondary_teacher_id, total_seats, filled_seats, credits, grade_scale_id, marking_period_id, schedule_type FIXED/VARIABLE/BLOCKED, does_class_rank, does_honor_roll)` → `course_period_var(days, course_period_date, period_id, start/end_time, room_id, does_attendance)`. 교사 교체 이력은 `teacher_reassignment`.
- 등록: 학교 등록 `student_enrollment(syear, school_id, student_id, grade_id, start_date, end_date, enrollment_code, drop_code, next_school, last_school, calendar_id)`. 사유 코드는 `student_enrollment_codes`. 수업 등록 `schedule(student_id, course_period_id, marking_period_id, start/end_date, scheduler_lock, dropped)`, 신청 `schedule_requests`.
- 출결: `attendance_codes(school_id, syear, type, state_code, default_code, table_name)`, 분류 `attendance_code_categories`. 교시별 `attendance_period(student_id, school_date, period_id, attendance_code, attendance_teacher_code, admin, course_period_id)`. 일별 `attendance_day(minutes_present, state_value)`. 교사 제출 표시 `attendance_completed(… substitute_staff_id)`. 저장 프로시저 `ATTENDANCE_CALC`, `CALC_MISSING_ATTENDANCE`(`install/OpensisProcsMysqlInc.sql`).
- 평가: `gradebook_assignment_types` → `gradebook_assignments(course_period_id, marking_period_id, points)` → `gradebook_grades(student_id, assignment_id, points)`. 기간 최종 성적 `student_report_card_grades(…, grade_percent, grade_letter, weighted_gp, unweighted_gp, gp_scale, credit_attempted, credit_earned, course_code, course_title)`. 집계 `student_gpa_calculated(gpa, weighted_gpa, class_rank, cgpa)`, `student_mp_stats`. 교사 완료 `grades_completed`.
- 생활: 건강 `student_medical_alerts`·`student_medical_visits`·`student_medical_notes`·`student_immunization`·`medical_info`, 활동 자격 `eligibility*`, 목표 `student_goal(_progress)`. **징계(discipline) 모듈은 없다**(사실, `modules/` 목록: attendance, eligibility, grades, messaging, miscellaneous, scheduling, schoolsetup, students, tools, users).

**계산 위치 (사실).** `install/OpensisTriggerMysqlInc.sql`의 트리거 `ti_/tu_/td_student_report_card_grades`가 행을 넣거나 고칠 때마다 `CALC_GPA_MP(student_id, marking_period_id)`를 부른다. 석차·학점·좌석 수도 DB 함수와 프로시저(`SET_CLASS_RANK_MP`, `CREDIT`, `SEAT_COUNT`, `SEAT_FILL`)가 맡는다.

**참조 무결성 (사실).** 설치·갱신 SQL 8개 파일 어디에도 `FOREIGN KEY`나 `REFERENCES`가 없다. 학교 간 참조는 앱 코드(`UserSchool()` 조건)만 막는다.

**정정·잠금.**
- 사실: 성적 입력은 `GetMP(mp,'POST_START_DATE')` ≤ 오늘 ≤ `POST_END_DATE`일 때만 연다(`modules/grades/InputFinalGrades.php` 1091행 부근). 출결은 기간 조건과 '며칠 전후까지 수정' 설정을 함께 본다(`modules/attendance/TakeAttendance.php` 180행).
- 사실: 관리자는 `modules/grades/EditReportCardGrades.php`로 기간 성적을 직접 고친다. 고치면 트리거가 GPA를 다시 계산한다. 이전 값은 남지 않는다. 모든 표에 `last_updated`·`updated_by`만 있다.
- 사실: `log_maintain(value, session_id)`, `login_records`, `hacking_log`은 로그인·보안 기록이고 데이터 변경 감사가 아니다.
- 사실: 학년도를 넘길 때 `BackupForRollover.php`·`RolloverShadow.php`로 학년도별 행을 복사한다.

**확장.**
- 사실: 사용자 정의 필드를 만들면 실제 열을 더한다. `modules/schoolsetup/SchoolCustomFields.php` 213행의 `ALTER TABLE schools ADD CUSTOM_$id …`가 그 예다. 필드 정의는 `custom_fields`, `school_custom_fields`, `staff_fields`, `people_fields`.
- 사실: API는 읽기 전용 3개(`api/SchoolInfo.php`, `StaffInfo.php`, `StudentEnrollmentInfo.php`)다. 요청 인자 `api_key`·`api_secret`을 `api_info` 표의 평문 값과 비교한다.
- 추정: 플러그인·훅 체계는 없다(코드에서 찾지 못함).

**권한 (사실).** `user_profiles` → `profile_exceptions(profile_id, modname, can_use, can_edit)`. 권한 단위가 화면 파일(modname)이다.

**다국어 (사실).** `lang/lang_{ar,en,es,fr}.php` 4개 언어.

**약점.** FK 없음. 정정 이력 없음. 실제 열을 더하는 사용자 정의 필드(학교마다 다른 열을 둘 수 없음). 학기 구조가 4단으로 고정. API 비밀을 평문 저장. 계산 결과를 트리거로 덮어써 과거 석차를 다시 만들 수 없다.

### 2.2 RosarioSIS

**버전·저작권 (사실, `COPYRIGHT`, `Warehouse.php`).** 13.0.3(2026-10). 2004–2009 The Miller Group부터 이어진 GPL-2.0 이상.

**핵심 개체 (사실, `rosariosis.sql`, 표 95)**
- 학교 = **학년도별 행**: `schools(… PRIMARY KEY (id, syear))`. 학교 소속 표 대부분이 `FOREIGN KEY (school_id, syear) REFERENCES schools(id, syear)`를 갖는다(`REFERENCES` 111회). 학교와 학년도를 한 키로 묶는다.
- 학기: 한 표 `school_marking_periods(marking_period_id, syear, mp, school_id, parent_id, start/end_date, post_start/end_date, does_grades, does_comments, rollover_id)`. 종류는 `mp` 값(FY·SEM·QTR·PRO)이고 `parent_id`로 나무 구조를 만든다. 4단 고정이 아니라 자기참조다.
- 개설: `courses(subject_id, school_id, grade_level, credit_hours)` → `course_periods(course_id, marking_period_id, teacher_id, secondary_teacher_id, total_seats, filled_seats, does_attendance, grade_scale_id, credits)` → `course_period_school_periods(period_id, days)`.
- 등록: `student_enrollment(id, syear, school_id, student_id, grade_id, start/end_date, enrollment_code, drop_code, next_school, last_school, calendar_id)`, `schedule`.
- 사람: `students`, `staff(syear, staff_id, current_school_id, profile, schools varchar(150), rollover_id)`. 보호자 계정은 `students_join_users(student_id, staff_id)`로 학생과 잇는다(보호자도 `staff` 표의 사용자). 연락처는 `people` + `students_join_people` + `people_join_contacts`, 주소는 `address` + `students_join_address`.
- 출결: `attendance_period PRIMARY KEY (student_id, school_date, period_id)`, `attendance_day PRIMARY KEY (student_id, school_date)`. 일별 값은 `modules/Attendance/includes/UpdateAttendanceDaily.fnc.php`가 교시 기록에서 `MINUTES_PRESENT`·`STATE_VALUE`로 다시 계산한다. 기본 코드 예시는 `attendance_codes`의 `type`(teacher/official)과 `state_code`(P/A) 조합이다(같은 파일 2226~2229행).
- 성적: `gradebook_assignment_types/assignments/grades`, `student_assignments`(제출물), `student_report_card_grades`, `student_mp_stats`(누적 가중·비가중 평점, `cum_rank`, `mp_rank`, `class_size`, 학점), 의견 `report_card_comment_*`·`student_report_card_comments`·`student_mp_comments`.
- 징계: `discipline_referrals(student_id, staff_id, entry_date, referral_date, category_1 … category_6)`. 항목 정의는 `discipline_fields(column_name)`·`discipline_field_usage`. 항목을 만들면 `modules/Discipline/DisciplineForm.php` 111행이 `ALTER TABLE discipline_referrals ADD …`로 열을 더한다.
- 건강: `student_medical`, `student_medical_alerts`, `student_medical_visits`.
- 수납·회계·급식: `billing_fees(waived_fee_id, created_by)`, `billing_payments`, `accounting_*`, `food_service_*`(11개 표).

**과거 성적 보관 (사실).** `student_report_card_grades`는 학교·학기 FK를 일부러 두지 않는다. 스키마 주석이 `-- History, so no FOREIGN KEY`, `marking_period_id … EditReportCardGrades.php, so no REFERENCES`라고 적고 있다. 대신 `course_title`·`school`(학교 이름 텍스트)·`credit_hours`를 행에 복사한다. 전학 온 학생의 이전 학교 성적을 받으려는 설계다(`modules/Grades/EditHistoryMarkingPeriods.php`). 성적 사본을 FK 없이 두는 형태다.

**계산 (사실).** 함수 `calc_gpa_mp`, `calc_cum_gpa`, `calc_cum_cr_gpa`, `set_class_rank_mp`, `credit`. 트리거 `srcg_mp_stats_update`가 `t_update_mp_stats`로 `student_mp_stats`를 고친다. 모든 표에 `set_updated_at` 트리거가 있다.

**정정·잠금.**
- 사실: 성적 입력은 `POST_START_DATE` ≤ 오늘 ≤ `POST_END_DATE`일 때만 `$allow_edit = true`다(`modules/Grades/InputFinalGrades.php` 971~977행).
- 사실: 출결 수정 허용 일수는 `ProgramConfig('attendance','ATTENDANCE_EDIT_DAYS_BEFORE/AFTER')`다(`modules/Attendance/TakeAttendance.php` 207~209행).
- 사실: 관리자 정정은 `EditReportCardGrades.php`가 맡고 이전 값은 남지 않는다. `access_log`는 로그인 기록이다.

**학년도 넘기기 (사실, `modules/School_Setup/Rollover.php` 114~135행).** `schools`, `staff`, `school_marking_periods`, `report_card_grades`(척도), `courses`, `student_enrollment` 등을 새 `syear` 행으로 복사하고 `rollover_id`로 이전 해 행을 가리킨다. 복사 순서 제약은 화면 문구로 강제한다("과목을 넘기기 전에 사용자·교시·학기·달력·척도를 먼저 넘겨야 한다").

**확장.**
- 사실: 사용자 정의 필드는 `ProgramFunctions/Fields.fnc.php`의 `AddDBField($table, $field_id, $type)`가 실제 열(`custom_<id>`)을 더한다. 형식은 radio, text, select, numeric, date, textarea, files 등.
- 사실: 모듈(`modules/README.md`: `Menu.php`, `install.sql`, `functions.php`)과 플러그인(`plugins/README.md`: `functions.php`, `composer.json`, `install.sql`)을 화면에서 켜고 끈다.
- 사실: 액션 훅은 `add_action`/`do_action`(`functions/Actions.php` 609·676행)이고, 코드에 고유 훅 이름이 120개 있다. 예: `Grades/Grades.php|before_save`, `Attendance/TakeAttendance.php|update_attendance`.
- 사실: 문서 양식은 `templates(modname, staff_id, template)`에 둔다.
- 사실: `CHANGES.md` 13.1에 '모듈 업로드로 원격 코드 실행' 보안 수정(#380)이 있다. 업로드형 확장은 공격면이 된다는 근거다.

**권한 (사실).** `profile_exceptions(profile_id, modname, can_use, can_edit)` + 사용자별 `staff_exceptions(user_id, modname, …)`. 교직원의 학교 목록은 `staff.schools` 문자열 열이다(예: `modules/Scheduling/MassRequests.php` 116행의 `SCHOOLS LIKE '%,<id>,%'`).

**다국어 (사실).** `locale/`에 gettext 로캘 51개. 과목명 같은 내용 필드를 여러 언어로 저장하는 `ParseMLField`(`functions/ParseML.php`, `courses.title` 주석 "@since 12.3 Multilingual course title").

**LMS 경계 (사실).** `plugins/Moodle/README.md`: Moodle 사용자를 가져오는 연동이고, "ONE school only", 사용자·과목은 "한 해에 한 번만" 넘길 수 있다. 대응 표 `moodlexrosario("column", rosario_id, moodle_id)`. SIS는 명부·개설·최종 성적을 갖고 LMS는 수업 활동을 갖는다. 둘은 id 대응표로 잇는다.

**약점.** 학교 정체성이 학년도마다 다른 행이다(`(id, syear)`). 사용자 정의 필드와 징계 항목이 실제 열을 더한다. 교직원의 학교 목록이 문자열이다. 정정 이력이 없다. 확정 상태가 날짜 창뿐이다. 과거 성적을 FK 없는 문자열 사본으로 둔다.

### 2.3 Gibbon

**규모·라이선스 (사실).** `gibbon.sql` 표 208, `FOREIGN KEY` 0. GPL-3.0. 이번 기준 버전은 v31.0.00(`version.php`). 스키마 변경은 버전별 SQL 묶음 `CHANGEDB.php`(486줄)와 `src/Database/Migrations/`로 한다.

**학교 범위 (사실).** 학교 표가 없다. 학교 이름은 `gibbonSetting('System','organisationName')`이고, 설치 1개가 학교 1개다. `gibbonDistrict(name)`는 주소용 지역 목록일 뿐이다. 학년도 키 `gibbonSchoolYearID`가 스키마에 56회 나온다.

**핵심 개체 (사실)**
- 학년도·학기: `gibbonSchoolYear(name, status Past/Current/Upcoming, sequenceNumber, firstDay, lastDay)` → `gibbonSchoolYearTerm`. 휴일 등은 `gibbonSchoolYearSpecialDay`.
- 학년·학급: `gibbonYearGroup(학년 주임 gibbonPersonIDHOY)`, `gibbonFormGroup(gibbonSchoolYearID, gibbonPersonIDTutor/Tutor2/Tutor3, gibbonPersonIDEA/EA2/EA3, gibbonFormGroupIDNext)`. 다음 해 학급을 직접 가리킨다. 담임은 열 3개로 고정이다.
- 사람: 한 표 `gibbonPerson`(열 96개). 기본 역할 `gibbonRoleIDPrimary`, 전체 역할 `gibbonRoleIDAll`(쉼표 목록 문자열). 상태 변경 기록은 `gibbonPersonStatusLog(statusOld, statusNew, reason, gibbonPersonIDModified)`.
- 가족: `gibbonFamily` → `gibbonFamilyAdult`/`gibbonFamilyChild` + `gibbonFamilyRelationship(gibbonPersonID1, gibbonPersonID2, relationship)`. 보호자를 학생 1:1이 아니라 가족 단위로 묶는다.
- 등록: `gibbonStudentEnrolment(gibbonPersonID, gibbonSchoolYearID, gibbonYearGroupID, gibbonFormGroupID, rollOrder, fields)`. 학년도마다 한 행이다.
- 개설: `gibbonCourse(gibbonSchoolYearID, gibbonDepartmentID, gibbonYearGroupIDList)` → `gibbonCourseClass(enrolmentMin/Max, attendance, reportable, gibbonScaleIDTarget)` → `gibbonCourseClassPerson(role Student/Teacher/Assistant/Technician/Parent/'Student - Left'/'Teacher - Left', dateEnrolled, dateUnenrolled)`. 교사·학생·보조를 같은 소속 표에 역할로 둔다.
- 시간표: `gibbonTT → gibbonTTDay → gibbonTTColumn/ColumnRow → gibbonTTDayRowClass(gibbonCourseClassID, gibbonSpaceID)`, 날짜 매핑 `gibbonTTDayDate`, 예외 `gibbonTTDayRowClassException`, 교실 변경 `gibbonTTSpaceChange`.
- 출결: 코드 `gibbonAttendanceCode(type Core/Additional, direction In/Out, scope Onsite/Onsite - Late/Offsite/…, future, prefill, gibbonRoleIDAll)`. 학생 기록 `gibbonAttendanceLogPerson(gibbonAttendanceCodeID, direction, type, reason, context 'Form Group'/'Class'/'Person'/'Future'/'Self Registration', date, gibbonPersonIDTaker, gibbonCourseClassID, gibbonTTDayRowClassID, timestampTaken)`. '누가 언제 어느 맥락에서 찍었나'를 담는 이벤트형이다. 교사 제출 표시는 `gibbonAttendanceLogFormGroup`/`gibbonAttendanceLogCourseClass`. 다만 같은 날·같은 맥락이면 기존 행을 **덮어쓴다**(`modules/Attendance/attendance_take_byFormGroupProcess.php` 120~147행: 있으면 `update`, 없으면 `insert`).
- 성적부: `gibbonMarkbookColumn(gibbonCourseClassID, gibbonSchoolYearTermID, attainment/effort 2축, gibbonScaleIDAttainment/Effort, gibbonRubricIDAttainment/Effort, attainmentWeighting, attainmentRaw/RawMax, gibbonUnitID, gibbonPlannerEntryID, gibbonHookID)` → `gibbonMarkbookEntry(attainmentValue, attainmentValueRaw, effortValue, comment, response, modifiedAssessment, gibbonPersonIDLastEdit)`. 가중치 `gibbonMarkbookWeight`, 목표 `gibbonMarkbookTarget`. 기능 설정은 `gibbonSetting('Markbook', enableColumnWeighting/enableRawAttainment/enableGroupByTerm/enableEffort/enableRubrics/…)`.
- 척도: `gibbonScale(usage, lowestAcceptable, numeric)` → `gibbonScaleGrade(value, descriptor, sequenceNumber)`. 추정: GPA·석차 계산은 핵심에 없다(스키마에 해당 열이 없음).
- 공식 평가: `gibbonInternalAssessmentColumn/Entry`, 외부 시험 `gibbonExternalAssessment*`.
- 성적표 작성(Reports 모듈): `gibbonReportingCycle(학년도, 대상 학년 목록, dateStart/End, milestones)` → `gibbonReportingScope` → `gibbonReportingCriteria(target Per Student/Per Group, gibbonScaleID)` → `gibbonReportingValue(value, comment, gibbonPersonIDCreated, timestampCreated, gibbonPersonIDModified, timestampModified)`. 작성 진행 `gibbonReportingProgress(status In Progress/Complete)`, 작성 권한 기간 `gibbonReportingAccess(dateStart, dateEnd, canWrite, …)`, 교정 `gibbonReportingProof`. 산출물은 `gibbonReportTemplate*`로 만들고 `gibbonReportArchive` → `gibbonReportArchiveEntry(status Draft/Final, filePath, timestampSent, accessToken, timestampAccessExpiry)`에 PDF 파일로 보관한다.
- 생활·기타: 행동 `gibbonBehaviour(type Positive/Negative/Observation, level, followup, gibbonMultiIncidentID)`, 학생 메모, 개별 지원 `gibbonIN*`, 건강 `gibbonPersonMedical*`·`gibbonFirstAid`, 수납 `gibbonFinance*`(15개 표), 입학 `gibbonAdmissions*`·`gibbonApplicationForm*`, 수업 설계 `gibbonPlanner*`·`gibbonUnit*`·`gibbonOutcome`. 핵심 안에 LMS 성격 기능(수업계획·과제 제출)이 있다.
- 개인정보 정리: `gibbonDataRetention(tables, status, gibbonPersonIDOperator)`, 인터페이스 `src/Domain/ScrubbableGateway.php`.

**정정·감사 (사실).** `gibbonLog(gibbonModuleID, gibbonPersonID, title, serialisedArray, ip)`는 일반 감사가 아니다. `addLog(` 호출 25곳에서 정한 사건만 남긴다(비밀번호 변경, 개인정보 설정 변경, 메일 발송 실패 등). 성적·출결 덮어쓰기는 '마지막 수정자' 열(`gibbonPersonIDLastEdit`, `gibbonPersonIDModified`)만 남는다. 성적표는 `gibbonReportingAccess` 기간으로 작성을 닫고, 보관본 `Final`로 굳힌다.

**확장 (사실).**
- 사용자 정의 필드는 `gibbonCustomField(context, type 15종, options, required, activePersonStudent/Staff/Parent/Other, activeApplicationForm, activeDataUpdater, activePublicRegistration)`로 정의한다. 값은 각 표의 `fields` TEXT 열에 JSON으로 넣는다(`gibbonStudentEnrolment.fields`, `gibbonCourse.fields`, `gibbonCourseClass.fields`, `gibbonBehaviour.fields` 등). 열을 더하지 않는다.
- 모듈은 `gibbonModule(type Core/Additional)`. 추가 모듈은 `modules/<이름>/manifest.php`를 읽어 설치한다(`modules/System Admin/moduleFunctions.php` 123행).
- 화면 삽입 지점은 `gibbonHook(type 'Public Home Page'/'Student Profile'/'Parental Dashboard'/'Staff Dashboard'/'Student Dashboard'/'Report Writing'/'Staff Profile'/'Lesson Planner')`.
- 추정: 공개 REST API는 핵심에 없다(`src/` 아래 API 라우터를 찾지 못함).

**권한 (사실).** `gibbonRole(category Staff/Student/Parent/Other, type Core/Additional, futureYearsLogin, pastYearsLogin, restriction)` × `gibbonAction(URLList, defaultPermission*)` → `gibbonPermission(gibbonRoleID, gibbonActionID)`. 역할마다 과거·미래 학년도에 로그인할 수 있는지를 따로 정한다.

**다국어.** 사실: `gibboni18n`에 47개 언어 행, `rtl` 플래그와 날짜 형식 열. 추정: 번역 파일은 따로 내려받는다(저장소의 `i18n/`이 비어 있음).

**약점.** 학교 한 곳 전용. FK 없음. 역할·대상 학년을 쉼표 목록 문자열로 둠(`gibbonRoleIDAll`, `gibbonYearGroupIDList`). 담임·보조를 열 3개로 고정. 출결을 같은 맥락에서 덮어씀. 일반 감사 기록 없음. 반면 **성적표 작성 주기 → 기준 → 값 → 진행 → 보관본(Draft/Final)** 흐름은 발행 모델로 참고할 만하다.

### 2.4 OpenEduCat (커뮤니티판, Odoo 19)

**구성 (사실).** 모듈 13개(`openeducat_core`, `_admission`, `_assignment`, `_attendance`, `_classroom`, `_exam`, `_facility`, `_fees`, `_library`, `_parent`, `_timetable`, `_activity`, 테마). 모델 고유 `_name` 88개. LGPL-3(`openeducat_core/__manifest__.py` `'license': 'LGPL-3'`, 버전 19.0.1.0).

**핵심 개체 (사실)**
- `op.academic.year(start_date, end_date, term_structure, company_id)` → `op.academic.term(academic_year_id, parent_term, company_id)`. 학기 나무는 `parent_term`으로 만든다.
- `op.program` → `op.course(parent_id, evaluation_type normal/GPA/CWA/CCE, subject_ids, department_id, program_id)` → `op.batch(course_id, start/end_date)`. `op.subject(grade_weightage, type, subject_type)`.
- `op.student`는 `_inherits = {"res.partner": "partner_id"}`로 Odoo 연락처를 상속한다. 이름 필드는 `translate=True`이고 `gr_no`는 unique다(`openeducat_core/models/student.py`).
- 등록: `op.student.course(student_id, course_id, batch_id, roll_number, subject_ids, academic_years_id, academic_term_id, state)`, `mail.thread` 상속, 필드별 `tracking=True`. 과목 신청은 `op.subject.registration`.
- 보호자: `op.parent(name→res.partner, user_id, student_ids M2M, relationship_id, company_id)`.
- 출결: `op.attendance.register(course, batch, subject)` → `op.attendance.sheet(attendance_date, session_id, faculty_id, state draft/start/done/cancel)` → `op.attendance.line(student_id, present, excused, absent, late, attendance_type_id, state=related)`. 출결 종류 `op.attendance.type`도 불리언 4개다. 상태를 코드 하나가 아니라 플래그 여러 개로 둔다.
- 시험: `op.exam.session` → `op.exam(subject, total_marks, min_marks, state draft/schedule/held/…/done)` → `op.exam.attendees`. 결과 `op.result.template(grade_ids, state … result_generated)` → `op.marksheet.register(state draft/validated/cancelled)` → `op.marksheet.line(total_marks, percentage, grade(계산), status)` → `op.result.line(marks, grade(계산), status)`. 등급은 `op.grade.configuration(min_per, max_per, result)` 구간에서 계산한다(`openeducat_exam/models/marksheet_line.py` 75~87행).
- 시간표 `op.session(timing_id, start/end_datetime, faculty, batch, subject, classroom, state, company_id)`, 수납 `op.fees.terms/element/student.fees.details`, 도서관 등.

**다학교 (사실).** 최신 커밋(#1084) 메시지가 "multi-company", "Added company id and ir rule"이다. 실제로 `company_id`와 다회사 레코드 규칙(`openeducat_core/security/op_security.xml` 100~140행)이 있는 것은 `op.academic.year`, `op.academic.term`, `op.subject.registration`, `op.category`, 출결 종류, 보호자, 시간표, 수납 일부뿐이다. `op.student`, `op.course`, `op.batch`, `op.exam`에는 `company_id`가 없다(grep 결과). **다학교 분리는 일부 표에만 있다.** 캠퍼스 기능은 유료 모듈 `module_openeducat_campus_enterprise`(`res_config_setting.py`)다.

**정정·잠금 (사실).** `op.marksheet.register.act_draft()`가 `validated` → `draft`로 되돌리고, 막는 조건이 없다(`marksheet_register.py` 83~90행). `op.result.line.unlink()`도 막지 않는다. 잠금은 화면 readonly와 상태 값뿐이다. 이력은 Odoo `mail.thread`의 필드 추적이 남긴다. 이 추적은 `mail.tracking.value` 모델에 저장된다(사실, `odoo/addons/mail/models/mail_tracking_value.py`). 문맥 키 `mail_notrack`·`tracking_disable`로 끌 수 있다(사실, `odoo/addons/mail/models/mail_thread.py` 103~105행).

**확장·권한.** 사실: Odoo 모듈 상속(`_inherit`, `_inherits`)과 그룹(`group_op_faculty`, `group_op_back_office_admin` 등) + `ir.rule` 도메인(예: `[('student_id.user_id','=',user.id)]`, `openeducat_exam/security/op_security.xml`). 사실: GPA, 건강, 캠퍼스, 학생 진도 등 35개 기능이 `module_openeducat_*_enterprise` 설정으로 유료판에 있다(`res_config_setting.py`). **오픈 코어** 구조다. 추정: Odoo 외부 API(XML-RPC/JSON-RPC)와 Studio(유료)로 확장한다.

**다국어 (사실).** `openeducat_core/i18n/` `.po` 20개. 모듈 전체로는 `.po` 234개.

**약점.** 핵심 학사 기능 일부가 유료판에 있음. 다학교 분리가 일부 표에만 있음. 확정한 성적표를 그대로 다시 열 수 있음. 출결 상태가 불리언 4개라 서로 어긋날 수 있음. 개설(section) 개념 없이 배치·과목으로만 묶음.

### 2.5 Frappe Education (ERPNext 교육 앱)

**구성 (사실).** `education/hooks.py`: `required_apps = ["erpnext"]`, `app_license = "GNU GPL V3"`. DocType 108(자식표 39). 이번 develop 브랜치는 예전에 알려진 `Program Enrollment`·`Student Group`·`Course Schedule` 대신 `Course Enrollment`·`Subject Registration`·`Subject Schedule`·`Grade Book`·`Campus`를 쓴다. **확인 필요:** 개편 시점과 이전 DocType의 이전 경로(`education/patches.txt` 26줄).

**제출형(submittable) DocType (사실, `"is_submittable": 1`).** `Course Enrollment`, `Subject Registration`, `Student Attendance`, `Assessment Plan`, `Assessment Result`, `Grading Scale`, `Fees`, `Fee Schedule`, `Fee Structure`, `Fee Plan`, `Fee Term`, `Admission Register`, `Academic Plan`, `Hostel Allocation`, `Student Leave Application`, `Room Booking`, `Ceremony`, `Ceremony Registration`. 각각 `amended_from` 링크가 있다.

**프레임워크 정정 모델 (사실, `frappe/frappe` 소스)**
- `frappe/model/docstatus.py`: `DRAFT=0`, `SUBMITTED=1`, `CANCELLED=2`.
- `frappe/model/document.py` `_validate_update_after_submit`(3928행): 제출 뒤에는 `allow_on_submit`이 표시된 필드만 바꿀 수 있고, 그 밖은 `UpdateAfterSubmitError`. 취소된 문서는 "Cannot edit cancelled document"(1834행).
- `frappe/model/delete_doc.py` 318~320행: 제출된 문서는 지울 수 없고 먼저 취소해야 한다. 링크된 문서가 있으면 취소도 막는다(540행).
- 정정 = 취소(2) + 새 문서가 `amended_from`으로 원본을 가리킴. 우리 규칙 4·8의 '새 판 추가'와 같은 방식이다.
- `track_changes`가 켜진 DocType은 저장마다 `Version` 문서를 남긴다(`document.py` `save_version` 2415행, `frappe/core/doctype/version/`).
- 낙관적 동시성 검사는 `check_if_latest`(1748행)다. 수정 시각이 다르면 `TimestampMismatchError`. 우리 규칙 10(`base_version` 409)과 같은 방식이다.

**핵심 개체 (사실, `education/education/doctype/*/*.json`)**
- `Academic Year(company)` → `Academic Term(academic_year, company)`. `Campus(company, cost_center)`.
- `Program(company, program_level, minimum/maximum_unit_load)`, `Course(program, default_grading_scale, evaluation_type, course_credit, subjects→Course Subject, grade_templates, fee_term)`, `Subject(credit_hours, credit, attempted_units, course, company)`.
- `Course Enrollment(student, course, program, academic_term, student_batch, roll_number, company, campus, fee_plan, billing_status, subjects→Course Enrollment Subject)`. 자식 행에 과목의 학점·약칭을 **사본으로** 넣는다(`credit_hours`, `credit`, `abbreviation`, `source`). 등록 당시 값을 얼리는 방식이다.
- `Subject Registration(course_enrollment, academic_term, compulsory_subjects, elective_subjects, total_credits)`.
- `Subject Schedule(student_batch, faculty, course, subject, schedule_date, room, campus, from/to_time)`. 날짜별 수업 1회가 1행이다.
- `Student Attendance(student, subject_schedule, date, student_batch, status 'Present/Absent/Leave', leave_application)`, 제출형. 수업 단위 출결이 기본이고, 일 단위는 설정(`Education Settings.attendance_based_on_subject_schedule`)으로 고른다.
- `Assessment Plan(student_batch, assessment_group(나무), course, subject, academic_year/term, maximum_assessment_score)` → `Assessment Result(score, maximum_score, percentage)`.
- `Grading Scale`(제출형) → `Grading Scale Interval(grade_code, gpa, include_gpa, minimum/maximum_percentage, earn_credits)`.
- `Grade Template(academic_year/term, weightage_type, assignment_weights, attendance_weights)`. `Grade Book(student, course, academic_year/term, grading_scale, status Draft/Computed, overall_percentage, overall_grade, subjects, assignment_components, attendance_components)`는 제출형이 아니다. `grade_book.py`에 `reset_to_draft`, `generate_final_grade`, `apply_overrides_and_totals`가 있고, 덮어쓰기에는 사유가 필수다("Override Comment is required", 273행). 성적 마감이 제출형 문서가 아닌 상태 값이라 정정 이력은 `track_changes`에만 의존한다.
- 사람: `Student(user, guardians→Student Guardian, siblings, customer, alumni)`, `Guardian(user, students)`, `Student Guardian(guardian, relation)`. **`Student`에는 `company` 필드가 없다**. 학생 자체는 회사(학교)에 속하지 않고 등록 문서가 회사를 갖는다.
- 생활 기록: `Student Log(type, academic_year/term, log)`. 건강·징계 전용 DocType은 없다.
- LMS 성격: `Article`, `Topic`, `Topic Content`, `Quiz`, `Question`, `Quiz Result`, `Course Activity`, `Quiz Activity`, 그리고 `frontend/`(Vue 학생 포털). SIS 앱 안에 가벼운 LMS를 함께 둔다.

**다학교.** 사실: `Company` 링크가 Academic Year/Term·Program·Course·Subject·Course Enrollment·Assessment Plan·Grade Book·Fees 등에 있다. 추정: 회사별 분리는 Frappe `User Permission`(사용자별 허용 레코드 목록, `frappe/core/doctype/user_permission/`)으로 한다. DB 수준 강제가 아니라 앱 쿼리 필터다.

**잠금 (사실).** `Education Settings`에 `attendance_freeze_date` 필드가 있지만 앱 코드에서 쓰는 곳이 없다(grep 결과 JSON 정의에만 있음). 출결 잠금은 제출형 docstatus에 기댄다.

**확장 (사실, 프레임워크 소스).** `frappe/custom/doctype/custom_field`(필드 추가), `property_setter`(기존 필드 속성 바꾸기), `frappe/core/doctype/server_script`(DB에 저장한 파이썬 스크립트). REST는 `/api/resource/<doctype>` GET/POST/PUT/DELETE와 `/api/method/<path>`(`frappe/api/v1.py` 150~156행). 앱 훅은 `hooks.py`(`website_route_rules`, `accounting_dimension_doctypes`, `global_search_doctypes` 등). 추정: Custom Field는 실제 DB 열을 더한다(Frappe는 DocType마다 표 `tab<DocType>`를 둠). 확인 필요: 소스로 검증하지 않음.

**식별자.** 사실: 상당수 DocType이 `autoname: field:<이름>`이다(`Academic Year`=`academic_year_name`, `Course`=`course_name`, `Program`=`program_name`, `Grading Scale`=`grading_scale_name`, `Academic Term`=`title`). 이름 문자열이 PK이고, 링크도 그 문자열을 담는다. 우리 규칙 7(id로만 참조)과 반대다. 이름을 바꾸면 `rename_doc`(`frappe/model/rename_doc.py`)가 링크를 모두 고쳐 써야 한다.

**다국어.** 사실: 앱 안 번역은 `education/translations/ar.csv` 1개. 추정: UI 번역은 프레임워크 공용 번역에 기댄다.

**약점.** ERPNext 의존이 무겁다(수납이 회계 문서와 묶임). 이름이 PK. Student가 학교 밖에 있음. 성적 마감 판(Grade Book)이 제출형이 아님. 잠금 설정 필드가 비어 있음. 반면 **docstatus + amend + Version + 낙관적 동시성**은 우리 판 모델과 가장 가깝다.

### 2.6 Fedena (보조, 사실상 중단)

- 사실: 마지막 커밋 2016-07-20, 메시지 "emptying content". Apache-2.0(`README.markdown`). Rails 2.x 플러그인 구조(`vendor/plugins`: paperclip, searchlogic, translator 등).
- 사실: `db/schema.rb` 표 187 중 158개에 `school_id` 정수 열과 인덱스가 있다. 그러나 `app/`, `lib/`, `vendor/plugins`에 `school_id`를 쓰는 코드가 없다. 마이그레이션 112개 중 `school_id`를 만드는 것도 2개뿐이다. 추정: 다학교는 저장소에 없는 별도 플러그인(상용 다학교판)이 열을 더하고 범위를 걸었다. 확인 필요.
- 사실: 학생이 졸업·퇴학하면 `Student#archive_student`(`app/models/student.rb` 276행)가 속성을 `archived_students`로 복사하고 `former_id`를 남긴다. 성적은 `archived_exam_scores`. 보관 표를 따로 두는 방식이다.
- 사실: 출결 `attendances(student_id, period_table_entry_id, forenoon, afternoon, reason, month_date, batch_id)`. **결석만 기록**하는 예외 기록형이다.
- 사실: 인도 CCE 평가용 표(`cce_*`, `fa_criteria`, `descriptive_indicators`)가 핵심 스키마에 들어 있다. 국가별 평가 제도를 핵심 표에 하드코딩한 예다.

### 2.7 LMS 경계 참고 (Canvas·Moodle·SchoolTool은 소스 미확인)

- 사실: RosarioSIS는 Moodle과 id 대응표(`moodlexrosario`)로 명부·과목만 넘긴다. 학교 하나, 1년 1회라는 제약이 있다(`plugins/Moodle/README.md`).
- 사실: Gibbon은 수업계획(`gibbonPlanner*`), 단원(`gibbonUnit*`), 과제 제출(`gibbonPlannerEntryHomework`, `gibbonPlannerEntryStudentHomework`)을 핵심에 둔다. Frappe Education은 퀴즈·콘텐츠 DocType을 둔다. 소규모 SIS일수록 LMS 기능을 흡수한다.
- 추정(일반 지식, 이번에 소스 미확인): Canvas·Moodle은 과정·과제·제출·성적부(활동 단위)를 갖고, SIS는 학적·개설·공식 성적·출결·성적표를 갖는다. 둘은 LTI/OneRoster 같은 표준으로 잇는다. 확인 필요: 이 REA의 표준 갈래에서 검증할 것.
- 확인 필요: SchoolTool은 이번에 받지 않았다. 개발 중단 여부와 스키마는 확인하지 못했다.

---

## 3. REA(자원–사건–행위자) 관점 대응

| REA 요소 | 공통으로 보이는 실체 | 시스템별 특징(사실 근거는 2절) |
| --- | --- | --- |
| 행위자(Agent) | 학교, 학생, 교직원, 보호자/가족 | Gibbon은 사람 1표 + 역할 다중. Rosario는 보호자도 `staff` 사용자. Odoo·Frappe는 `res.partner`/`User` 위에 학생·보호자를 얹음. 학교는 Rosario에서 학년도별 행, Gibbon에서 아예 없음 |
| 자원(Resource) | 개설의 좌석(`total_seats/filled_seats`, `enrolmentMin/Max`), 학점(`credits`, `credit_attempted/earned`), 교실·시간(시간표), 척도 | 좌석을 openSIS는 프로시저 `SEAT_FILL`로 계산한 캐시로 보관. 학점은 성적 행 안의 사본 |
| 사건(Event) | 등록(학교·수업), 출결 표시, 평가 결과, 기간 마감, 학년도 넘기기, 성적 정정, 성적표 발행 | **사건을 따로 쌓는 곳은 드물다.** Gibbon 출결 로그(맥락·기록자·시각)와 Frappe 제출형 문서(docstatus·amend)가 사건 원장에 가깝다. Rosario·openSIS는 상태 행을 덮어쓰고 GPA를 트리거로 다시 계산한다 |
| 이중성(Duality) | 수업 등록 ↔ 좌석 소비, 평가 결과 ↔ 학점 취득, 수납 청구 ↔ 납부 | `billing_fees`↔`billing_payments`(Rosario), `Fees`↔`Payment Record`(Frappe)는 대응하는 쌍으로 기록된다. 학점 취득은 `student_report_card_grades.credit_earned` 열 하나에 섞여 있다 |
| 약속(Commitment) | 수강 신청(`schedule_requests`), 입학 지원, 청구 일정(`Fee Schedule`) | 신청과 확정 등록을 나눈 시스템(openSIS·Rosario·Frappe)이 정정에 유리하다 |

**관찰.** 다섯 시스템 모두 '기간 성적' 행을 원장이자 계산 결과로 겸해 쓴다. 기간 마감을 사건으로 기록하는 시스템은 없다. 입력 날짜 창이나 상태 값만 있다. 우리 ADR 0004 안 B의 `offering_closures`(마감 판)는 이 공백을 메우는 설계다. 비교한 오픈소스 어디에도 같은 개념은 없다(사실: 위 스키마에서 해당 표를 찾지 못함).

---

## 4. 우리 토대에 주는 시사점

### 4.1 받아들일 것

1. **학기를 자기참조 나무 한 표로 (Rosario `school_marking_periods.parent_id`, OpenEduCat `parent_term`).** openSIS식 4단 고정 표는 학교마다 다른 학기제(2학기·3텀·분기)에 맞지 않는다. 우리 `terms`에 `parent_id`·`kind`를 두고 `school_id` 복합 FK로 묶는다.
2. **기간마다 '입력 창'과 '평가 대상' 플래그 (`post_start_date/post_end_date`, `does_grades/does_comments`).** 마감 판 이전 단계(입력 가능 기간)를 학교 설정 데이터로 둔다. 다만 날짜 창은 잠금의 **보조 수단**일 뿐이다. 확정은 마감 판(사건)으로 한다.
3. **과목(courses) ↔ 개설(course_periods / gibbonCourseClass) ↔ 수업 소속(schedule / gibbonCourseClassPerson)의 3층.** 통계 모집단 키를 개설 id로 두는 우리 규칙 8과 맞는다. Gibbon처럼 교사·학생·보조를 소속 표 하나에 `role`과 기간(`dateEnrolled/Unenrolled`)으로 두면 담당 교사 권한(ADR 0004 `offering_staff`)과 수강을 같은 방식으로 다룰 수 있다. 우리는 역할별 표를 둘지, 한 표에 역할 열을 둘지 고르면 된다.
4. **학교 등록을 기간 행으로 (`student_enrollment` start/end + 입학·이탈 사유 코드 + next/last school).** 전학·재입학을 덮어쓰지 않고 행을 더해 남긴다. 사유 코드는 학교별 표로 둔다.
5. **출결을 사건으로 (Gibbon `gibbonAttendanceLogPerson`의 맥락·기록자·시각, Frappe 제출형 `Student Attendance`).** 교시·수업 기록을 원장으로 두고, 일별 값(`attendance_day`)은 계산 캐시로 둔다. 코드 표는 `type`(교사 입력/공식 판정)과 `state_code`(출석·결석·반일)를 나눠 학교별로 정한다. 같은 사건의 정정은 덮어쓰지 말고 새 행이 이전 행을 가리키게 한다. Gibbon이 덮어쓰는 부분은 따르지 않는다.
6. **정정 모델은 Frappe의 docstatus + amend + Version + `check_if_latest`.** 제출 뒤 수정 금지 → 취소 + 원본을 가리키는 새 문서. 낙관적 동시성은 수정 시각 비교. 우리 규칙 4·8·10과 같은 방식이고, 실제 운영에서 오래 쓰인 사례다(추정: ERPNext 회계 문서 전반이 이 모델을 씀). `allow_on_submit`처럼 확정 뒤에도 바꿀 수 있는 필드를 명시하는 목록도 들인다(예: 메모·첨부).
7. **성적표 작성을 발행 파이프라인으로 (Gibbon Reporting: 주기 → 범위 → 기준 → 값 → 진행 → 보관본 Draft/Final).** 우리 `published_documents` 스냅샷과 같은 구조다. 기준별 척도(`gibbonReportingCriteria.gibbonScaleID`)와 작성 권한 기간(`gibbonReportingAccess`)은 학교 설정 데이터로 들인다.
8. **척도를 데이터로 (`Grading Scale Interval(gpa, include_gpa, earn_credits)`, `report_card_grade_scales.gp_scale`).** 척도는 판(제출형)으로 두고, 마감 판은 적용한 척도 판 id를 고정한다. 성취·노력 2축(Gibbon)처럼 한 평가 항목에 여러 척도 축을 허용하면 한국식 성취도·원점수·석차등급을 함께 담을 수 있다(추정: 국내 학생부 요건은 별도 갈래에서 확인).
9. **가족 단위 보호자 (Gibbon `gibbonFamily*` + 관계 표).** 우리 규칙 9의 `guardian_links`를 만들 때, 학생 1:1 연결보다 가족(형제 공유, 주소·청구 단위)이 운영에 맞다. 관계는 person id 쌍으로 둔다.
10. **확장은 메타데이터 + 정해진 삽입 지점.** Gibbon `gibbonCustomField`(대상 맥락·화면 노출 플래그), Gibbon `gibbonHook`의 화면 위치 목록, Rosario `do_action` 이름 규칙(`파일|시점`), Frappe `Custom Field`/`Property Setter`. 우리는 AI 에이전트가 학교별 기능을 만들므로 **에이전트가 쓰는 확장점은 '필드 정의 표 + JSONB 값(스키마 검증) + 명명된 이벤트'**로 한정한다. 정의도 판으로 쌓는다.
11. **연동은 id 대응표 (`moodlexrosario(column, rosario_id, moodle_id)`).** LMS·외부 시스템과는 이름이 아니라 외부 id 대응표로 잇는다. 대응표에도 `school_id`를 둔다.

### 4.2 피할 것

1. **FK 없는 스키마 (openSIS·Gibbon 모두 0개).** 학교 간 참조와 고아 행을 앱 코드만 막는다. 우리는 규칙 1·ADR 0004 P1·P9대로 `(id, school_id)` 복합 FK를 유지한다.
2. **학교를 학년도마다 다른 행으로 (Rosario `schools(id, syear)`, 학년도 넘기기로 표 통째 복사 + `rollover_id`).** 학교·사람·과목의 정체성은 학년도와 무관한 id로 두고, 학년도별 값(개설·학년 배정·설정 판)만 학년도 키를 갖게 한다. '다음 해 준비'는 복사가 아니라 새 판 만들기 명령으로 한다.
3. **실제 열을 더하는 사용자 정의 필드 (`ALTER TABLE … ADD CUSTOM_n`, 징계 항목 `category_N`).** 다학교 공유 표에서는 학교마다 다른 열을 둘 수 없고, RLS·마이그레이션 규칙(이미 적용된 파일 수정 금지)과도 충돌한다. JSONB + 정의 표로 한다. 사람·수업 참조는 JSON 안에 숨기지 않는다(ADR 0004 B2).
4. **쉼표 목록 문자열 (`staff.schools`, `gibbonRoleIDAll`, `gibbonYearGroupIDList`, `reportingScopeIDList`).** 조인 표로 둔다. RLS의 `app.is_member(school_id)` 검사가 문자열 LIKE에 기대면 안 된다.
5. **이름을 PK로 (Frappe `autoname: field:…`).** 규칙 7 위반이고, 이름을 바꾸면 링크를 모두 고쳐 써야 한다.
6. **트리거로 계산 결과 덮어쓰기 (openSIS·Rosario의 `CALC_GPA_MP`, `student_mp_stats`).** 정정할 때마다 과거 석차·평점이 사라진다. 계산은 마감 판에 묶인 불변 결과로 두고, 현재 값은 캐시로만 둔다(ADR 0004 P6, 규칙 8).
7. **'확정'을 상태 값이나 날짜 창으로만 (OpenEduCat `act_draft`가 validated를 되돌림, openSIS·Rosario 관리자가 덮어씀, Frappe Grade Book Draft/Computed).** 마감은 불변 판으로 하고, 되돌리기는 새 판으로 한다.
8. **회계·ERP 결합 (Frappe Education의 ERPNext 필수, `Fees`가 회계 계정·원가센터를 가짐).** 수납·청구는 따로 갈래를 둔다. 회계 연동은 이벤트로 내보낸다. 학사 핵심이 ERP에 묶이지 않게 한다.
9. **일부 표만 학교로 분리 (OpenEduCat: 학년도에는 `company_id`가 있고 학생·과정·시험에는 없음, Frappe: Student에 company 없음).** 반쪽 분리는 가장 위험하다. 모든 학교 소속 표에 `school_id NOT NULL` + RLS를 예외 없이 둔다. '여러 학교에 다니는 한 사람'은 학교별 person으로 두고 자동 병합하지 않는다(ADR 0004 B2).
10. **국가 평가 제도를 핵심 표에 하드코딩 (Fedena CCE 표, openSIS의 미국식 honor roll·class rank 열).** 핵심에는 일반 개념(평가 항목, 척도 판, 마감 판, 계산 규칙 판)만 두고, 국가·학교별 제도는 설정 판과 학교 확장으로 얹는다.
11. **삭제·보관을 사본 표로 (Fedena `archived_*`).** 상태·기간과 소프트 삭제로 한다. 사본 표는 FK와 RLS를 두 벌로 만든다.
12. **업로드형 코드 확장 (Rosario #380 원격 코드 실행 수정, Frappe Server Script).** 에이전트가 학교 기능을 만들어도 서버에서 임의 코드를 돌리지 않는다. 현재 `agent` 스키마의 명령 함수 + 범위 토큰 방식(ADR 0012~0014)을 유지한다.

### 4.3 다음 갈래로 넘길 질문 (확인 필요)

- 한국 학교생활기록부 항목(성취도·원점수·과목평균·표준편차·석차등급·세특 글자 수)을 '평가 항목 × 척도 축'으로 모두 담을 수 있는지. 표준·법령 갈래에서 확인한다.
- OneRoster·Ed-Fi 같은 표준의 '개설(class/section)'·'등록(enrollment)'·'학기(academicSession)' 정의와 위 3층 모델의 대응. 표준 갈래에서 확인한다.
- Frappe Custom Field가 실제 열을 더하는지, Frappe Education의 예전 DocType(Program Enrollment 등)을 어떻게 옮겼는지. 프레임워크 문서가 이 세션에서 막혀 확인하지 못했다.
- 각 저장소의 전체 기여자 수와 별 수. GitHub API가 막혀 최근 12개월 대략치만 있다.
