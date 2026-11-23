# 36차: AI 작업 공간 — 작업 토큰 범위 일반화 (ADR 0013)

## 지시
- 사용자(2026-11-23, 관제 세션 경유): "각 학교별로 본인들의 홈페이지나 시스템을 개선하기 위한 Codex·Claude 구독 계정을 붙이는 기능을 만들자." → ADR 0013(채택) 안 A: 학교가 자기 구독 에이전트를 자기 앱에서 돌리고, 플랫폼은 학교 범위 작업 토큰을 준다.
- 관제 세션 요청: 범위 일반화(story·page·news × key × 권한), Claude Code용 안내, 패널 이름 'AI 작업 공간'. 쪽·소식도 시안까지만, 공개는 사람.

## 한 일
- **마이그레이션 `20261123001300_agent_scope.sql`** (추가만, 34차 토큰은 그대로 동작)
  - `agent_tokens.kinds`·`keys`·`perms` 열. 34차 행은 kinds={story}, keys={entry_key}, perms=전부로 채움.
  - agent_writer RLS: 학교 · `kind = any(kinds)` · `key = any(keys)`(지정 시).
  - 일반 함수 `agent.entries`·`entry`·`save_entry`(권한 read·draft 확인), `upload_asset`(upload), `assets`(read 또는 upload). 34차 `agent.stories/story/save_story`는 일반 함수로 넘김.
  - 라이선스가 꺼진 종류는 토큰에서 빠지고, 남는 종류가 없으면 토큰이 멈춘다(동화는 stories, 쪽·소식은 homepage).
  - 발급 `app.create_agent_token(학교, 이름, 기한, 종류[], 주소[], 권한[], 에이전트)`: 고른 종류에 없는 주소, 라이선스 밖 종류, 없는 권한은 거부.
  - Supabase 마이그레이션 사용자는 agent_writer로 SET ROLE만 할 수 있어(PG16+) 그 소유 함수는 `set local role agent_writer` 안에서 바꾼다.
- **API**: `/api/agent/entries/<kind>[/<key>[/versions]]`. 34차 `/api/agent/stories…` 유지.
- **관리 화면**: `/site` 설정의 패널 이름 'AI 작업 공간'. 에이전트·기한·종류(체크)·항목(체크, 비우면 모두)·권한(체크) → 발급. 목록에 범위·권한·에이전트·마지막 사용·최근 한 일 3건. 성품 동화 기능이 없는 학교도 쪽·소식 토큰을 쓸 수 있다.
- **안내**: `docs/agents/README.md`(공통 규칙·API·오류), `claude-code.md`, `codex.md`(준비·첫 지시 예), `story-agent.md`(동화 일). AGENTS.md '외부 에이전트' 줄 갱신. 22차 학교별 개발 연동의 세션 요청 문구에 안내 링크 한 줄.

## 검증
- `npm test`(round35 5 새로, round34 8 그대로), `npm run build`, `npm run test:e2e`(34·36차 단계: 패널 이름, 항목 체크 발급, 일반 경로 200/403/404), `check:repo`, `tsc`.
- Supabase와 비슷하게 **슈퍼유저가 아닌 마이그레이션 사용자**(CREATEROLE·CREATEDB, PG16)로 빈 클러스터에 마이그레이션 전체 적용 → agent 함수 모두 agent_writer 소유 확인, round27·34·35 시험 통과.
- 확인하지 못한 것: 운영 DB에서 34차 토큰이 있는 상태의 업그레이드(지금 운영에는 발급된 토큰이 없을 가능성이 큼 — 배포 뒤 /api/agent/me 로 확인).
