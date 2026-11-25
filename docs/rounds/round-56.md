# 56차: 학사 토대 F1 (ADR 0025 채택)

- 날짜: 2026-11-25 · 세션: 관제
- 사용자 지시: "일단 추천안대로 진행하지" → ADR 0025 채택, F1부터, E1(코드 값)만 즉시 반영·나머지는 관리자 켜기, 첫 출력은 드리미 자체 학생부 + 미국 성적증명서·학교 소개서(F4).

## 한 일 — 마이그레이션 `20261125000100_f1_academic_foundation.sql`
| 개념 | 표·함수 | 한국 + 미국 기준에서 |
| --- | --- | --- |
| 학교 관할·인가 | `school_profiles`(판, '왜' 칸, base_version 409), `app.set_school_profile` | 나라·부문(공립·사립·대안·국제·홈스쿨)·인가, CEEB·NEIS 학교 코드 |
| 학년 코드 + 정규 서수 | `grade_levels`, `app.add_grade_level` | 한국 고1 = 미국 Grade 10 = 10, K = 0, PK = -1 |
| 학기 나무 | `terms`에 `parent_id`·`kind`·`credit_bearing`·입력 창, `app.add_sub_term`, `app.set_term_entry_window` | 학점 학기 ≠ 성적 기간(미국), 부모마다 순서 |
| 수업일 달력 | `calendar_days`, `app.set_calendar_days` | 만성 결석 10%·출석 2/3·ADA의 분모(반일 0.5) |
| 코드 목록(E1) | `code_lists`(플랫폼 기본 + 학교 값, 표준 사상 `maps_to`, 유효 기간, 이전 코드, 왜), `app.add_code` | 기본값: 출결 종류 4 × 사유(한 기재요령·US NCES 사상), 관계, 교직원 역할, 입·퇴학 사유(휴학은 한국 전용), 식별 체계 |
| 외부 식별자 | `external_identifiers`(관리자만 조회, 주민번호·SSN 거부) | 주 학생 ID·학번·CEEB·NEIS |
| 가족·보호자 | `families`, `guardian_links`(관리자만 조회, 기간·겹침 거부) | 보호자 계정 열람은 F6 |
| 교직원 배정 | `staff_assignments` | 담임·상담교사·멘토·외부 강사 |
| 디렉터리 공개 거부 | `directory_optouts`, `app.directory_allowed` | FERPA 디렉터리 정보 — 누리집·에이전트 공개가 검사할 함수 |
| 학생 수업 제안 | `course_proposals` + `course_proposal_versions`(판·409, 승인·반려는 관리자, 승인 후 고정) | 제안 → 학교 승인 → 개설 |
| 개설 기원 | `course_offerings.origin`·`proposal_id`(한 번만 정함), `app.link_proposal_offering`, `app.set_offering_origin` | 학교·학생 제안·프로젝트·인턴십·외부 |

- 경계: 새 표 모두 `school_id` + RLS + 복합 FK. 요청 역할은 SELECT만, 쓰기는 `app_writer` 소유 명령 함수. 변경 제한 트리거(지울 수 없음, 정해진 열만 수정).
- 라이브러리 `src/lib/foundation.ts`.

## 시험
- `tests/f1-foundation.test.ts` 11개:
  - 학기제 4종(한 2학기, 미 학기 + 성적 기간 분기, 3학기, 4분기)
  - 학년 서수, 수업일(반일), 코드 목록(기본·학교 값·교체·닫힌 코드 409)
  - 외부 식별자(관리자만·주민번호 거부·중복), 보호자(관리자만·학교 간 거부)
  - 공개 거부, 수업 제안(409·승인 권한·개설 연결 한 번), 직접 쓰기 금지
  - 학교 간 거부 양방향
- 전체 `npm test` 38파일 293개.

## 다음
- 화면: 학사 기초(학년·학기 나무·수업일·코드 목록) 관리 화면은 F2와 함께.
- F2: 과목 표기 판, 수강 시도, 역량 틀, 척도·계산 규칙 판, 평가·결과·서술, 수업 마감 판·정정 판.
- 사용자 대기열(이 분야가 끝난 뒤): 학교 홈페이지 템플릿(형식 정리·둘러보기·선택·AI 자동 배치·기존 사이트 크롤링 이전), 시스템 카피와 홍보 페이지.
