# 45차: 작업 토큰 '자동 공개' (ADR 0021)

- 날짜: 2026-11-24 · 세션: 관제
- 사용자 지시: 룽아룬숙사 성품 동화 Codex 토큰에 자동 공개까지 넣어서 주자.

## 한 일
- 권한 `autopublish`(자동 공개): `publish`와 함께만. 만들기·새 판 저장 즉시 같은 트랜잭션에서 그 판을 공개(`src/lib/agent.ts` autoPublish). 마이그레이션 `20261123002200_agent_autopublish.sql`.
- 학교 홈페이지 설정 → AI 작업 공간: '자동 공개(저장하면 바로)' 체크(공개도 함께 켜짐)와 안내. 토큰 목록에 표시.
- 동화 스크립트(`scripts/agent-story-upload.mjs`): 응답이 자동 공개면 그렇게 알림.
- 에이전트 안내(`docs/agents/README.md`)·AGENTS.md 외부 에이전트 줄.

## 시험
- `tests/round45.test.ts` 5개, 전체 `npm test` 30파일 225개, 운영 조건 흉내 마이그레이션.

## 선생님이 할 일
- 룽아룬숙사 /site → AI 작업 공간에서 새 토큰(동화 · 읽기·파일 올리기·만들기·고치기·자동 공개) 발급 → Codex 환경 변수 `SCHOOL_AGENT_TOKEN` 교체 → 예전 'Codex 동화 작업' 토큰 폐기.
