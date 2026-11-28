# 화면 용어집 (한국어 → 영어)

> **요약** 화면 문구를 영어로 옮길 때 같은 말은 늘 같은 영어로 쓴다. 학교 용어는 미국 학교 표준어(K-12 학사 시스템·FERPA)를 따른다.
> **왜** 한 화면은 'term', 다른 화면은 'semester'라고 쓰면 영어권 교사가 같은 것인지 헷갈린다. 새 언어를 더할 때도 이 표가 기준이 된다.

- 쓰는 곳: `src/lib/i18n/catalog.ts`(한국어 기준) → `i18n/en.json`(영어). 다른 언어 번역도 이 표의 영어 열을 기준으로 옮긴다.
- 고치는 법: 용어를 바꾸면 이 표와 `i18n/en.json`을 같은 PR에서 함께 고친다. 운영 DB의 번역은 배포 때 빈 칸만 채우므로(ADR 0037 6항), 이미 들어간 영어를 바꿀 때는 전체 관리 → 언어·번역에서 '이미 있는 번역도 바꾸기'로 넣는다.
- 확인이 필요한 항목은 `(확인)`을 붙였다. 미국 학교마다 쓰는 말이 갈리는 곳이다.

## 쓰는 법

| 항목 | 규칙 | 예 |
| --- | --- | --- |
| 대소문자 | 문장형(첫 글자만 대문자). 단추·제목도 같다 | Save changes, Close course |
| 단추 | 동사 + 대상 | Upload files, Issue record |
| 진행 중 | 동사-ing + `…` | Saving…, Uploading… |
| 완료 알림 | 과거형 문장 | Saved., 3 files uploaded. |
| 오류 | 무엇이 안 됐는지 + 할 일 | Couldn't save. Try again. |
| 개수 | 복수형 형식 `{n, plural, one {# file} other {# files}}` | 1 file, 3 files |
| 날짜·숫자 | 코드에 `ko-KR`을 박지 않고 화면 언어로 | `toLocaleString(lang)` |
| 줄임 | 'D-12' 같은 번호 형식은 그대로 둔다 | D-12 |

## 사람·역할

| 한국어 | 영어 | 비고 |
| --- | --- | --- |
| 학교 관리자 | School admin | |
| 교사 | Teacher | |
| 교직원 | Staff | |
| 전체 관리자 | Platform admin | |
| 구성원 | Member | 학교 일을 하는 계정(교직원) |
| 학생 | Student | |
| 보호자 | Guardian | parent 대신 guardian(법적 보호자 포함) |
| 열람 계정 | Portal account | 학생·보호자용 |
| 관제 세션 | Control session | |
| 관제 센터 | Control center | |
| 세션 | Session | Claude 작업 세션 |
| 학교 AI | School AI | |

## 학교 구조·학적

| 한국어 | 영어 | 비고 |
| --- | --- | --- |
| 학교 구조 | School setup | 메뉴 이름 |
| 학년도 | School year | |
| 학기 / 텀 | Term | semester·quarter를 모두 포함하는 말 |
| 학기 나무 | Term structure | |
| 학년 | Grade level | |
| 학년 서수 | Grade order | |
| 수업일 | Instructional day | |
| 수업일 달력 | Instructional calendar | |
| 학적 | Enrollment record | |
| 재적 | Enrolled | |
| 입학 / 전입 / 전출 / 졸업 | Admission / Transfer in / Transfer out / Graduation | |
| 외부 식별자 | External ID | 주 학생 번호 등 |
| 가족 | Family | |
| 디렉터리 공개 거부 | Directory information opt-out | FERPA 용어 |
| 교직원 배정 | Staff assignment | |
| 학교 관할 판 | Jurisdiction version | (확인) |

## 수업·성적

| 한국어 | 영어 | 비고 |
| --- | --- | --- |
| 과목 | Subject | 과목 목록의 한 항목 |
| 과목 표기 판 | Subject listing version | |
| 수업 | Course | 한 학기에 여는 과목(US 'course section') |
| 개설 | Offering | '수업 개설' = Offer a course |
| 수업 제안 | Course proposal | |
| 담당 | Teacher of record | |
| 명단 | Roster | |
| 갈래 규칙 | Track rule | (확인) |
| 재수강 | Course retake | |
| 평가 항목 | Assessment | |
| 점수 표 | Gradebook | |
| 과목 서술 | Narrative comment | |
| 척도 | Grading scale | |
| 성적 정책 | Grading policy | |
| 역량 틀 | Competency framework | |
| 학점 | Credits | |
| 수업 마감 판 | Course closing version | |
| 정정 판 | Correction version | 이전 판을 가리키는 새 판 |

## 출결

| 한국어 | 영어 | 비고 |
| --- | --- | --- |
| 출결 | Attendance | |
| 출결부 | Attendance register | |
| 출석 / 결석 / 지각 / 조퇴 | Present / Absent / Tardy / Early dismissal | |
| 인정 결석 / 미인정 결석 | Excused / Unexcused absence | |
| 반나절 / 교시 | Half-day / Period | |
| 만성 결석 | Chronic absenteeism | |
| 증거물 | Evidence | |
| 확인(서명) | Sign-off | |

## 기록·문서

| 한국어 | 영어 | 비고 |
| --- | --- | --- |
| 판 | Version | 고치지 않고 새로 쌓는 한 벌 |
| 마감 판 | Closed version | |
| 확정 | Finalize | |
| 확정 규칙 | Confirmed rule | |
| 양식 | Template | |
| 발행 / 발행본 | Issue / Issued document | |
| 학생부 | Student record | 자체 학생부 = School student record |
| 성적증명서 | Transcript | |
| 학교 소개서 | School profile | |
| 학년도 기록 마감 판 | School-year record closing version | |
| 출력 프로필 | Output profile | |
| 지정일 보고 | Count-date report | (확인) census day report라고도 함 |
| 외부 결과 | External result | 시험 기관 등이 발급 |
| 자격 | Credential | 졸업장·수료 등 |
| 공개 기록 | Public record | (확인) |
| 열람 요청 | Request to inspect | FERPA 'inspect and review' |
| 수정 요청 | Amendment request | FERPA |
| 이의 의견서 | Statement of disagreement | FERPA |
| 보존 규칙 | Retention rule | |
| 파기 | Destruction | |
| 가림 | Redaction | |
| 원본 행 | Source row | |
| 학사 문서실 | Academic documents | |
| 학사 꾸러미 | Academic package | |
| 정의 | Definition | 기록 유형·양식·화면 정의 |

## 자료·확인

| 한국어 | 영어 | 비고 |
| --- | --- | --- |
| 자료 첨부 | Upload files | 메뉴 이름 'Files' |
| 관리자 확인 | Admin review | |
| 질문 | Question | 자료가 규칙과 다를 때 여는 항목 |
| 확인 대기 | Pending review | |
| 결정 요청 | Decision request | |

## 운영·관리

| 한국어 | 영어 | 비고 |
| --- | --- | --- |
| 기본판 | Baseline | |
| 기본판 제안 | Baseline proposal | |
| 보고 계약 | Report contract | |
| 라이선스 | License | |
| 시범 / 이용 중지 | Trial / Suspended | |
| 사용량·저장소 | Usage & storage | |
| 연동 | Integrations | |
| 연구소 | Lab | |
| 범위 토큰 | Scoped token | |
| AI 작업 공간 | AI workspace | |
| 공개 / 공개 내림 | Publish / Unpublish | |
| 보관 / 되살리기 | Archive / Restore | |
| 승인 / 반려 | Approve / Reject | |
| 되돌리기 어려움 | Hard to undo | |

## 공통 동작

| 한국어 | 영어 |
| --- | --- |
| 저장 / 저장했습니다. | Save / Saved. |
| 취소 | Cancel |
| 닫기 | Close |
| 보내기 / 보내는 중… | Send / Sending… |
| 불러오는 중… | Loading… |
| 처리하지 못했습니다. | Something went wrong. |
| 파일 고르기 | Choose files |
| 목록 | Back to list |
