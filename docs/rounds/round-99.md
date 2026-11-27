# 99차: 다국어 전환 5묶음 — 전체 관리 (ADR 0037)

> **요약** 전체 관리 화면 일곱 개(학교·라이선스 · 사용량 · 기본판·보고 · 관제 센터 · 개발 연동·점검 접근 · 개발·연구소 · 디자인 원형)를 이름표로 옮기고 영어를 채웠다. 한글 줄 819 → 541(278줄 줄임).
> **왜** 영어권 운영자·외국인 협업자가 학교를 만들고 라이선스·관제·연구소를 영어로 다룰 수 있게 한다.

맡은 세션: 다국어 전환 전담 세션(`session_013RZyUnMgGiq22d4cMX1rCX`).

## 한 일
- 옮긴 파일: `admin/page`·`AdminClient` · `usage/page`·`StorageActions` · `baseline/page` · `control/page`·`ControlCenter` · `integrations/page`·`IntegrationsClient`·`InspectorPanel` · `lab/page`·`LabBoard`·`lab/[id]/page`·`ItemClient` · `design/page`·`ChooseDirection`·`ArchetypeThumb` · 공통 `Field`. 남은 줄 541(파일 24개).
- 이름표 약 430개. 학교 상태(`school.status.*`), 연동 종류·상태(`devlink.*`), 연구소 종류·상태·우선순위(`lab.*`, `labLabels(t)`), 디자인 비교 축(`design.axis.*`)은 값별 이름표.
- 학교 만들기의 '학교 기본 언어'(전 '문서 언어')는 #148에서 학교 기본 화면 언어가 됐으므로 이름을 바꾸고, 언어 이름은 화면 언어로 `Intl.DisplayNames`가 만든다(DB 함수가 받는 ko·en·th 값은 그대로).
- 사용량 표가 영어에서 옆으로 넘칠 때 키보드로 스크롤할 수 없던 접근성 문제(axe `scrollable-region-focusable`)를 고쳤다(표 영역에 초점·이름).
- `ui:review` 점검 페이지에 `usage`·`integrations`·`design`을 더했다.

## 일부러 두는 것
- 연구소 본문 서식(`RichDoc`의 '핵심 요약'·'용어 풀이' 등)과 서식 도움말, 세션에게 보내는 지침 제목·본문(`[연구소 지침] …`), 디자인 방향 선택 기록: 관제·세션이 읽는 한국어 작업 서식·기록이다.
- 디자인 원형 내용(`archetypes/meta`): 디자인 조사 자료.
- 라이선스 기능 이름·설명: DB 데이터(데이터 언어 칸으로 따로).
- `/site`·템플릿(홈페이지 세션 몫), `/intro`(홍보 문구), 로그인 콜백 대기 화면, 발행본 내용(문서 언어).

## 시험
- `typecheck`·`check:repo`·`lint:i18n`(기준선 541) 통과. `npm test` 66파일 451개, `build` + `test:e2e` 52/52 통과.
- `ui:review admin control baseline lab usage integrations design --lang en`: 넘침 없음(390px 셸 넘침은 관제 센터 D-25·자동 PR #149).

## 다음
- 6묶음: 서버 오류 문구 설계(API가 돌려주는 `error`를 이름표 + 값으로).
