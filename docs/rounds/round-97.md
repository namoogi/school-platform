# 97차: 다국어 전환 3묶음 — 학사 화면 (ADR 0037)

> **요약** 학사 화면 아홉 개(구조 · 사람 · 수업 · 성적 · 출결 · 문서 · 꾸러미 · 기록 · 요청)와 그 부품을 이름표로 옮기고 영어를 채웠다. 한글 줄 1,289 → 941(348줄 줄임).
> **왜** 영어권 학교가 학기를 열고, 수업·성적·출결을 넣고, 기록을 마감·발행하고, 열람·수정 요청에 답하는 일상 업무를 영어로 할 수 있게 한다.

맡은 세션: 다국어 전환 전담 세션(`session_013RZyUnMgGiq22d4cMX1rCX`).

## 한 일
- 옮긴 파일(한글 줄 → 0)
  - 3a: `academics/page`(19)·`RuleForm`(6) · `people/page`(23) · `courses/page`(57) · `grades/page`(41) · `attendance/page`(31) · `ResultGrid`(8) · `AttendanceRegister`(12) · `PeriodTable`(1)
  - 3b: `documents/page`(16)·`[id]/page`(15)·`DocumentsClient`(5) · `packages/page`(14)·`PackagesClient`(4) · `records/page`(48)·`records/doc/[id]`(12) · `requests/page`(11)·`RequestsClient`(24) · `PrintButton`(1)
  - 남은 줄 941(파일 45개)
- 이름표 531개. 상태·종류 값(학적·수업·수강·평가·이수·척도·날 종류·정의 종류·발행 형식·보고·공개 목적·요청 상태·결정)은 `영역.값` 이름표로 두고 코드는 값만 든다.
- 데이터에 든 여러 언어 이름(평가 항목·꾸러미·외부 결과·자격 제목 `{ko,en}`, 학교 코드 이름)은 **화면 언어 → 한국어 → 영어 → 첫 칸** 순으로 고른다(전에는 늘 한국어).
- `withLink(text, nodes)`(`ui.tsx`): 번역문 속 `{link}`·`{people}` 같은 자리에 링크를 끼운다. 언어마다 어순이 달라 문장을 쪼개지 않는다.
- `PeriodTable`·`PrintButton`은 브라우저 부품으로 화면 언어를 직접 읽는다.
- 기록 화면 '학생' 칸에 목록용 class(`people-list`)가 붙어 안내 문장 속 링크가 목록 줄처럼 그려지던 문제를 고쳤다(한국어에도 있던 문제).
- Codex 반영: 자격 이름은 입력한 사람의 화면 언어 칸에 저장한다(서버가 `resolveLang`으로 판정, 전에는 늘 `ko` 칸이라 영어 학업 기록에서 빠짐). 데이터 이름 고르기에서 영어를 첫 칸보다 먼저 본다.
- 차시 번호: 관제 PR #148이 96차를 써서 97차로 옮겼다.
- `scripts/i18n-add.mjs`가 줄바꿈 든 문구를 제대로 감싸도록 고쳤다. `ui:review` 점검 페이지에 `documents`·`packages`를 더했다.

## 일부러 두는 것
- 발행본 내용(`DocumentPaper`·`RecordDocumentView`)은 화면 언어가 아니라 **문서 언어**(출력 프로필, ADR 0037 9항·ADR 0025)를 따른다. 스냅샷만 읽는 원칙(지침 5)도 그대로다.
- `lib/portal.ts`의 `REQUEST_STATUS`(한국어)는 `/my`가 아직 쓴다. 4묶음에서 `/my`를 옮길 때 지운다.
- 서버가 만든 문장(오류·질문 본문 등)은 6묶음.

## 시험
- `typecheck`, `lint:i18n`(기준선 941) 통과. `build` + `test:e2e` 52/52 통과(한국어 문구 그대로).
- `ui:review academics people courses grades attendance documents packages records requests --lang en`: 옮긴 부분 넘침 없음. 390px 셸 넘침은 관제 센터 D-25(자동 PR #149가 고치는 중).

## 남은 것
- 4묶음: 학교 설정 · `/my` · `/locked`. 5묶음: 전체 관리. 6묶음: 서버 오류 문구.
- 학교 시간대: 날짜 시간대는 아직 서울 고정.
