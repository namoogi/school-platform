# 38차: 작업 토큰 권한 확장 — 만들기·고치기(구조)·보관, 기한 365일·무기한·연장 (ADR 0014)

## 지시 (2026-11-23, 선생님 → 관제·룽아룬숙사 세션 경유)
- "지금 발급한 토큰 API로는 새 동화 항목을 만들 수 없다는데? 활동 권한을 생성과 수정, 삭제까지 넓혀 줘." / "또한 해당 페이지의 구조 변경까지 가능하도록."
- "외부 작업 토큰 기한 선택지에 365일과 무기한을 추가", 기한 연장 버튼·만료 임박 표시(/site, /admin), ROADMAP '연례 토큰 점검'.

## 한 일
- **마이그레이션 `20261123001400_agent_crud.sql`**
  - 권한 read·upload·create·edit·archive(36차 draft → edit). 기한 null = 무기한.
  - `site_entries.archived_at`·`archived_by`·`archived_by_token`(소프트 삭제). 방문자 함수는 보관 항목을 빼고 내준다.
  - 함수 `agent.create_entry`·`update_meta`·`archive_entry`, `save_entry`에 구조 변화 요약 기록. `app.extend_agent_token`, `app.platform_agent_tokens`.
- **구조 바꾸기:** `POST …/edit` ops(move·insert·remove·hide·set)를 화면 편집과 같은 `site-edit.ts` 함수로 서버에서 적용 → validateContent → base_version. 전체 내용 저장(`…/versions`)도 그대로.
- **사람 쪽:** /site 목록 아래 '보관함', 편집 화면의 '보관함으로'(공개 내린 뒤)·'되살리기', 보관 항목 공개 금지. 패널에 기한 365·무기한(경고)·연장·'곧 끝남' 표시, 설정 위쪽 알림(30일 안 만료 · 180일 미사용 무기한). 전체 관리 → 학교별 개발 연동에 모든 학교 토큰 목록.
- **스크립트** `--create`(동화가 없으면 manifest title·virtue·character로 만든다), 기한 '무기한' 출력. **안내** docs/agents(README API·구조 바꾸기, story-agent 예시), AGENTS.md '외부 에이전트', ROADMAP '연례 토큰 점검'.

## 검증
- `npm test` 21파일 160개(round37 7 새로), `npm run build`, `npm run test:e2e` 26/26(38차: 무기한·만들기·보관 발급 → 새 동화·구조 바꾸기 → 공개 → 내림 → 보관 → 되살리기, axe), `check:repo`, `tsc`.
- 비슈퍼유저 마이그레이션 사용자(PG16)로 34·36차가 적용된 DB에 38차를 올려 round34·36·37 통과(운영 업그레이드와 같은 순서).

- **공통 부품(#44·#45, 관리 화면 입력 정리)**: 'AI 작업 공간' 패널의 이름·에이전트·기한·연장 기한을 `Field`로 바꿨다. 편집 화면 그림·PDF 고르기(AssetPick)는 #45가 이미 `FileDrop`으로 바꿨다.
- 차시 번호: #44가 '37차 1'을 써서 이 작업은 38차로 붙였다.

## 남긴 것
- 이미 발급한 토큰은 읽기·고치기(+파일 올리기)로 옮겼다. 만들기·보관이 필요하면 새로 발급한다.
