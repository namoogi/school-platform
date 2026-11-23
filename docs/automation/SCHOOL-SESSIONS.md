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
