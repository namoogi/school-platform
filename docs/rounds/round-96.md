# 96차: 다국어 전환 3a묶음 — 학사 화면(구조 · 사람 · 수업 · 성적 · 출결) (ADR 0037)

> **요약** 학사 화면 다섯 개와 그 부품(점수 표·출결부·기간 표)을 이름표로 옮기고 영어를 채웠다. 한글 줄 1,289 → 1,091(198줄 줄임).
> **왜** 영어권 학교가 학기를 열고, 수업을 만들고, 성적·출결을 넣는 일상 업무를 영어로 할 수 있게 한다.

맡은 세션: 다국어 전환 전담 세션(`session_013RZyUnMgGiq22d4cMX1rCX`).

## 한 일
- 옮긴 파일(한글 줄 → 0): `academics/page.tsx`(19)·`RuleForm`(6) · `people/page.tsx`(23) · `courses/page.tsx`(57) · `grades/page.tsx`(41) · `attendance/page.tsx`(31) · `ResultGrid`(8) · `AttendanceRegister`(12) · `PeriodTable`(1). 합 198줄. 남은 줄 1,091(파일 55개).
- 이름표 302개. 상태·종류 값(학적 상태, 수업 상태·개설 계기·수강 상태, 평가 종류·이수 상태·척도 프리셋, 날 종류)은 `영역.값` 이름표로 두고 코드는 값만 든다.
- 데이터에 든 여러 언어 이름(평가 항목 `{ko,en}`, 학교 코드 이름)은 **화면 언어 → 한국어 → 첫 칸** 순으로 고른다(전에는 늘 한국어).
- `withLink(text, node)`(`ui.tsx`): 번역문 속 `{link}` 자리에 링크를 끼운다. 언어마다 어순이 달라 문장을 쪼개지 않는다.
- `PeriodTable`은 브라우저 부품으로 바꿨다(관리자 확인 화면에서만 쓴다).
- `scripts/i18n-add.mjs`가 줄바꿈 든 문구를 제대로 감싸도록 고쳤다.

## 시험
- `typecheck`, `lint:i18n`(기준선 1,091) 통과. `build` + `test:e2e` 52/52 통과.
- `ui:review academics people courses grades attendance --lang en`: 옮긴 부분 넘침 없음. 390px 셸 넘침은 관제 센터 D-25(자동 PR #149가 고치는 중).

## 남은 것
- 3b묶음: 문서 · 꾸러미 · 기록 · 요청.
- 학교 시간대: 날짜 시간대는 아직 서울 고정.
