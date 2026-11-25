# 57차: 학사 토대 F2 — 평가·마감 (ADR 0025)

- 날짜: 2026-11-25 · 세션: 관제
- 사용자 지시: 학사 분야 F1~F6을 모두 끝낸 뒤 홈페이지 템플릿으로(관제 질문에 대한 답). 이번 차시는 F2.

## 한 일 — 마이그레이션 `20261126000100_f2_grading_closure.sql`, 라이브러리 `src/lib/grading.ts`
| 개념 | 표·함수 | 메모 |
| --- | --- | --- |
| 과목 표기 판 | `subject_labels`(용도: all·record·transcript·report_card), `app.set_subject_label` | 학생부·성적증명서 과목명은 '제출용 표기', 바꾸는 것이 정상 실무(포털 교훈). 판·409 |
| 척도 판 | `scales` + `scale_versions`(띠: 코드·표기·min 이상·GPA 점수·학점 인정), `app.save_scale`, `app.band_for` | 프리셋 `SCALE_PRESETS`: KR 성취평가제 A–E·미이수, US A–F·4.0, P/F |
| 성적 정책 판 | `grading_policies`(학교 한 줄, '왜' 칸), `app.save_grading_policy` | 원점수 자릿수·최종 반올림·표준편차(모/표본)·서술 글자 수 한도 |
| 역량 틀 | `competency_frameworks`·`competency_items`(나무) | 국가 성취기준과 학교 역량을 같은 구조로 |
| 평가 항목 | `assessments`(축: course·competency·habit, 가중·만점·성적 기간·척도), 보관만 | 담당 교사·관리자, 마감 뒤 추가 거부 |
| 결과 사건 | `assessment_results`(추가만, `corrects_id`), 뷰 `current_assessment_results`, `app.record_result` | 마감 뒤에는 관리자가 사유와 함께만 |
| 서술 사건 | `narratives`(종류·작성자 역할·학년도·수업, 추가만), `app.record_narrative` | 세특·행특·교사 의견·상담교사 서류, 글자 수 한도는 정책 판 |
| 재수강 | `attempt_links`, `app.link_retake` | 같은 과목 개설끼리만 |
| 수업 마감 판 | `offering_closures`(판·이전 판·사유·요청 키·적용 정책·척도 띠를 얼림), `closure_results`(원점수·최종·등급·이수 상태·시도/취득 학점·통계 포함), `closure_stats`, `app.close_offering` | base_version 409, 같은 요청 키 = 같은 판, 정정은 사유 필수 새 판, 한 판에서 갈라짐 금지, 자식 행은 같은 트랜잭션에서만 |

## 시험
- `tests/f2-grading.test.ts` 9개:
  - 경계값: 성취율 90 이상 A·89.99 B·39.99 미이수, 원점수 89.5 → 최종 90 → A, 79.996 → 80 → B
  - 가중 원점수 계산, 모표준편차 통계(90·80·40 → 평균 70.0·SD 21.6)
  - 철회·미완료 통계 제외, 요청 키 반복, 409
  - 결과·마감 판 수정·추가 거부, 마감 후 교사 거부, 관리자 사유 정정 → 정정 판(이전 판 보존·갈라짐 방지)
  - 같은 원점수의 미국 척도 판(40 → F·미이수)
  - 표기 판(용도별), 서술 글자 수 한도, 학교 간 거부
- 전체 `npm test` 39파일 302개. 비슈퍼유저 소유자로 빈 DB 전체 마이그레이션 통과.

## 다음
F3: 출결 사건 원장(교시·반나절·분), 코드 두 축·통계 범주, 하루 환산·분모(수업일), 증거물·확인(서명).
