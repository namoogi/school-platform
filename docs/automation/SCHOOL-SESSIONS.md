# 관제 서브 세션 운영 규약 (ADR 0013)

관제 세션(플랫폼 전체)이 학교·기능별 클라우드 세션을 만들어 일을 맡길 때 따른다. 학교가 자기 구독으로 돌리는 에이전트(Claude Code·Codex)와 **병행**한다.

## 만들 때
- 도구: `mcp__claude-code-remote__create_session` (source_url = 이 저장소). 관제 세션과 같은 작업 환경을 쓴다.
- **이름:** `<학교 또는 기능> (<근거 ADR>)` 예: `룽아룬숙사 홈페이지 (school-platform)`, `외부 작업 토큰 + 동화 PDF (ADR 0012)`.
- **태그:** `school-platform` + `school:<학교 주소 이름>`(학교 일) 또는 `adr-<번호>`(기능 일).
- **첫 지시 틀** (빠짐없이):
  1. 이 세션이 맡는 일과 맡지 않는 일(경계), 사용자 결정 원문 요약
  2. 먼저 읽을 것: `AGENTS.md`, `CLAUDE.md`, `docs/NEXT.md`, 관련 ADR·차시 문서·코드 위치
  3. 겹치는 세션과 파일, 알리는 방법(send_message, PR 설명)
  4. 환경: 로컬 Postgres 54322, 시험 명령, 운영 확인(점검 토큰, Playwright 프록시 — 인증서 검사를 끄지 않는다)
  5. 첫 행동: "읽고 짧게 보고한 뒤 지시를 기다린다" 또는 "설계안 보고 후 구현"
- 만든 뒤 `docs/NEXT.md`의 세션 표에 한 줄 더한다.

## 일하는 동안
- 운영 내용은 사람 화면이나 학교 범위 토큰으로만 바꾼다. 점검 계정은 읽기 전용이다.
- 시안까지 만들고 공개는 사람이 한다.
- 새 판 저장은 `base_version`을 보낸다(409면 최신 판을 다시 읽고 합친다).
- 한 PR에 한 기능. 공용 파일(`src/lib/site*.ts`, `SiteRenderer.tsx` 등)은 작은 PR로 먼저 병합하고 알린다.
- 선생님 Mac의 세션처럼 답장 도구가 없는 세션은 대화 기록에 조각 출력(`=== 조각 n/N ===` + sha256)을 부탁하고 `list_events`로 읽는다.

## 관제 지시 받기 (당겨 오기)
모든 서브 세션은 차례를 시작할 때·긴 작업 사이·끝내기 전에 `GET https://onschools.vercel.app/api/control/mine?session=<내 세션 id>`를 확인하고, 나온 일을 먼저 처리한다(`docs/automation/CONTROL-CENTER.md`). 관제의 `send_message`가 Claude 보안(신뢰 기기 확인)으로 막혀도 관제 통제가 끊기지 않게 하는 규칙이다.

## 승인·결정이 필요할 때 (멈추지 않기, 2026-11-23 사용자 결정)
서브 세션은 사용자에게 직접 묻고 멈추지 않는다. 사용자는 관제 대화에서 한꺼번에 답한다.
1. **결정 요청을 올린다.** 사용자에게 물을 일이 생긴 그 자리에서 관제 센터 API(`POST /api/control/requests`, `docs/automation/CONTROL-CENTER.md`)로 올린다. 세부 내용(배경·영향)·선택지·추천안·되돌릴 수 있는지를 채운다. API를 못 쓰는 세션은 `send_message`로 관제에 같은 내용을 보내고, 관제가 대신 올린다.
2. **되돌릴 수 있는 일**(화면·명칭·서체·탐색·시안·문서·테스트, 공개 전 판)은 추천안으로 진행하고 PR·결과 보고에 "추천안으로 진행함(결정 요청 D-n)"이라고 적는다. 답이 다르면 다음 PR에서 바꾼다.
3. **되돌리기 어려운 일**만 보류한다: 데이터 삭제·덮어쓰기, 개인정보 공개 범위 확대, 비용(유료 API·요금제), 외부 발송·게시, 운영 넘겨주기(주소·DNS), 권한 범위 확대. 보류 항목은 시안·테스트까지 만들어 두고 다른 일을 한다.
4. 할 일이 모두 보류뿐이면 그 사실을 관제에 한 줄 알리고 차례를 마친다(같은 질문을 되풀이해 묻지 않는다).
5. **관제의 몫:** 사용자는 웹 관제 센터(`/admin/control`)에서 답하거나 관제 대화에서 답한다. 관제는 사용자와 대화할 때마다 전달 대기(`GET /api/control/inbox`)를 확인해 해당 세션에 `send_message`로 보내거나 새 세션을 만들어 실행하고 '전달됨'을 표시한다. 세션은 일을 마치면 그 요청에 보고를 남긴다.

## 전체로 올리기
- 서브 세션은 PR 본문 `## 전체 적용 후보`에 다른 모듈·학교에도 쓸 만한 것을 적는다.
- 관제 세션은 서브 세션 PR이 병합될 때마다 그 칸을 읽어 `docs/design/PLATFORM-PATTERNS.md`(패턴)·`docs/automation/QUEUE.md`(할 일)·AGENTS.md(규칙)로 옮긴다.

## 끝낼 때
- `docs/NEXT.md`에서 자기 줄을 갱신하고(끝남·남은 일), 열린 PR이 없게 한다.
- 관제 세션에 send_message로 한 줄 보고한다. 관제는 세션을 보관(archive)할지 사용자에게 묻는다.

## 지금 세션 (2026-11-23)
| 세션 | 맡는 일 | 태그 |
| --- | --- | --- |
| `session_013RZyUnii47zkGXkmqAhPmt` 학교 플랫폼 전체 (관제) | 방향·결정 기록·조정 | school-platform |
| `session_013RZyUq3bukJr2ggdSiQ2vt` 룽아룬숙사 홈페이지 | 새벽빛 디자인 충실도, 동화 자료 정리 | school:rungarunsuksa |
| `session_013RZyUqUFVPBGjdxpiXsrU2` 학교 자율 편집 개발 | ADR 0011 1단계 실시간 화면 편집 | adr-0011 |
| `session_013RZyUoGcTChpSHJuksgDH3` 외부 작업 토큰 + 동화 PDF | ADR 0012 토큰·PDF, ADR 0013 학교 AI 작업 공간(콘텐츠) | adr-0012 |
| `session_013RZyUqmXotCXgQK1a22bDW` 옛 사이트 (선생님 Mac VS Code) | 옛 rungarunsuksa 코드·설명서·넘겨주기 판 | — |
| `session_013RZyUomAv7AE6YjhpHp6Kc` 자동 개발(매시간) | QUEUE.md 자동 허용 항목, PR까지 | — |
