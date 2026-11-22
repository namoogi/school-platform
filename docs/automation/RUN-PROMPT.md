# 자동 개선 실행 절차 (예약 작업이 매번 따르는 지시)

이 파일은 예약 작업이 새 세션에서 읽고 그대로 따른다. 규칙은 `AUTOPILOT.md`의 안전 규칙이 우선한다.

## 0. 준비
1. 저장소 `namoogi/school-platform`을 세션에 연결하고 받는다(얕은 클론).
2. `AGENTS.md`, `docs/automation/AUTOPILOT.md`, `docs/automation/QUEUE.md`, `docs/COLLABORATION.md`를 읽는다.
3. 기준 브랜치를 정한다: main에 `package.json`이 있으면 main. 없으면 열린 PR 중 다른 PR의 기준이 되지 않는 가장 최근 `round-*` 브랜치(쌓인 PR의 끝).
4. 열린 `[자동]` PR 수를 센다. 3개 이상이면 5단계(보고)만 한다.
5. 로컬 Postgres 16을 54322 포트로 띄우고 `npm ci`. (방법은 README '로컬 실행')

## 1. 종류 고르기 (하나만)
- A. `QUEUE.md`에서 맨 위의 **자동 허용** 항목 중, 같은 주제의 열린 PR이 없는 것 → 기능 구현
- B. A가 없으면: `docs/decisions/`·`docs/design/DESIGN-SYSTEM.md`와 실제 코드가 어긋난 곳(색 값 직접 사용, 페이지 헤더 누락 등)을 찾는다 → 설계 갱신 문서 또는 작은 정리 PR
- C. A·B가 없으면: 최근 "주간 점검" 이슈와 `npm outdated`·`npm audit` → 의존성 갱신(공개 2주 지난 버전만) 또는 도구 비교 결정 기록 초안

## 2. 작업
- 브랜치 `auto/<YYYY-MM-DD>-<주제>` (기준 브랜치에서)
- 데이터 경계·디자인 시스템·마이그레이션 규칙을 지킨다. 새 마이그레이션이 필요하면 초안 PR로만.
- 바뀐 동작에는 테스트를 더한다.

## 3. 검사
`npm run typecheck`, `npm run test:unit`, `npm test`, `npm run build && npm run test:e2e` (E2E는 화면을 바꿨을 때). 실패를 고치지 못하면 PR을 초안으로 두고 실패 내용을 적는다.

## 4. PR
- 제목 `[자동] <종류> · <주제>`, 기준 브랜치는 0-3에서 정한 브랜치, PR 양식(.github/pull_request_template.md)을 채운다.
- `docs/automation/runs/<YYYY-MM-DD>.md` 실행 기록을 같은 PR에 넣는다.
- PR 댓글로 `@codex review` 를 요청한다.
- QUEUE.md의 해당 항목 상태를 "진행 중 (PR #n)"으로 바꾼다.

## 5. 보고
세션 마지막 메시지에 한 일, PR 링크, 테스트 결과, 승인 필요 항목을 5줄 안으로 적는다. 할 일이 없었으면 "변경 없음"과 이유만 적고 PR을 만들지 않는다.

## 하지 않는 일
병합, main 직접 push, 배포·환경 설정 변경, 유료 API, 결제, 외부 발송, 이미 적용된 마이그레이션 수정, 한 실행에 PR 두 개 이상.
