# 95차: 다국어 전환 2묶음 — 홈 · 자료 첨부 · 관리자 확인 (ADR 0037)

> **요약** 학사 흐름의 첫 세 화면(홈, 자료 첨부, 관리자 확인)을 이름표로 옮기고 영어를 채웠다. 한글 줄 1,422 → 1,289(133줄 줄임).
> **왜** 학교가 처음 들어와 가장 먼저 쓰는 흐름(자료 → 확인 → 발행)이라, 영어권 교사가 첫 화면부터 막히지 않게 한다.

맡은 세션: 다국어 전환 전담 세션(`session_013RZyUnMgGiq22d4cMX1rCX`).

## 한 일
- 옮긴 파일(한글 줄 → 0): `home/page.tsx`(45) · `intake/page.tsx`(5) · `intake/IntakeClient.tsx`(28) · `review/page.tsx`(37) · `review/ReviewClient.tsx`(18). 합 133줄. 남은 줄 1,289(파일 64개).
- 이름표 171개(`home.*` · `intake.*` · `review.*` · 공통 `common.countItems/countRows/countN/version/inUse/previousVersion` · `rule.decision.*`).
- 서버 화면이 사용자 언어를 읽는 도우미 `userLang(db)`(`src/lib/i18n/server.ts`)를 더했다. 화면마다 같은 SQL을 되풀이하지 않는다.
- 홈 할 일 구분 값을 한국어('지금'·'다음'·'완료')에서 코드 값(`now`·`next`·`done`)으로 바꿨다.
- 문장 속 링크(“이 질문의 답으로 **2판**을 확정했습니다”)는 번역문의 `{version}` 자리에서 나눠 링크를 끼운다. 언어마다 어순이 달라 문장을 조각내 옮기지 않는다.
- 날짜는 화면 언어 형식. 형식에는 `locale`(문법이 틀린 언어 코드면 기준 언어)을 쓰고, 언어 저장 때도 Intl 이 못 받는 코드(예: `en-12`)를 막는다(Codex P2). 시간대는 아직 서울 고정.
- `ui:review` 점검 페이지에 `review`(확인 대기·확정한 판)를 더했다.

## 그대로 둔 것(다음 단계)
- 서버가 만든 문장: 질문 본문(`q.prompt`), 근거 설명(`e.claim`), 확인할 점(`x.message`), 자료 상태 메모(`status_note`), API 오류(`error`). 6묶음 '서버 오류 문구 설계'에서 이름표 + 값으로 돌려주는 방식으로 함께 다룬다.

## 시험
- `typecheck`, `lint:i18n`(기준선 1,289), i18n·파일 검사 단위 시험 통과. `build` + `test:e2e` 52/52 통과(한국어 문구 그대로).
- `ui:review home intake review --lang en`: 옮긴 부분 넘침 없음. 390px 가로 넘침은 셸 메뉴 문제(관제 센터 D-25로 알림, 이번 변경과 무관).
