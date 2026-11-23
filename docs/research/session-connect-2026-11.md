# 세션·에이전트 연결 방법론 조사 (REA, 2026-11)

- 날짜: 2026-11-23 · 작성: Claude 자동 실행(개발 세션) · 대기열 항목 "세션·에이전트 연결 방법론·도구 조사"
- 방법: 공식 문서 본문 확인(✅)과 검색 요약만 확인(🔎)을 구분한다. 이 저장소에서 2026-11-22~23에 실제로 겪은 일은 "관찰"로 적는다.
- 확인 한계: 이 환경 네트워크에서 `docs.github.com`, `developers.openai.com`이 막혀 있다(프록시 403). 두 곳은 검색 요약으로만 확인했다(🔎). 자동 실행은 환경 설정을 바꾸지 않으므로 허용을 요청하지 않았다.

## 1. 질문

1. 관제 세션 1개가 개발 세션 여러 개(여러 프로젝트)를 어떻게 연결·관리할 수 있나?
2. 작업 단위를 `QUEUE.md`에서 GitHub 이슈로 옮길까?
3. 저위험 PR을 사람 클릭 없이 병합해도 되나? 조건은 무엇인가?

## 2. 연결 수단 비교

| 수단 | 하는 일 | 확인한 사실 | 이 저장소의 관찰 |
| --- | --- | --- | --- |
| **세션 간 메시지** (`send_message`/`SendMessage`) | 세션끼리 평문 메시지 | ✅ 받는 쪽은 "사용자가 아닌 다른 세션"이 보낸 것으로 받고, 승인·설정 변경 권한이 없다. ✅ **클라우드 세션은 다른 기기에서 온 메시지에 SendMessage로 답할 수 없다**(답은 대화 기록에서 읽는다). ✅ 반복 메시지 제한, 받는 쪽 대기열 최대 50개 [C1] | 관제 → 이 세션 알림은 도착했다. 이 세션 → 관제 회신은 "신뢰된 기기 인증 필요"로 거부됐다(2026-11-22 22:47) |
| **하위 세션 생성·조회** (`create_session`, `get_session`, `list_events`) | 관제가 개발 세션을 만들고 상태·대화를 읽음 | ✅ 세션이 정상 종료하면 보고하지 않을 수 있어 관제가 직접 확인해야 한다(도구 설명) | 이 세션은 관제 세션(`parent_session_id`)이 만든 깊이 1의 하위 세션이다. 깊이 한도는 8 |
| **예약 작업** (scheduled tasks, 옛 이름 routines) | 일정·API·GitHub 이벤트로 실행 | ✅ 연구 미리보기. 1시간보다 잦은 일정은 거부된다. ✅ GitHub 트리거는 PR·릴리스·이슈 이벤트를 지원하고 **이벤트마다 새 세션**을 연다(세션을 재사용하지 않음). ✅ 실행 한도 100회/시간/계정이고 구독 사용량을 같이 쓴다 [C2] | 지금은 "매시 37분, 같은 세션에 이어서" 방식이다. 같은 대화가 계속 길어진다(아래 4절) |
| **Projects** (claude.ai/code) | 대화 하나가 클라우드 스레드 여러 개를 만들고 추적 | ✅ 공개 베타, Pro·Max·Ultra만(Team·Enterprise 아직). ✅ 같은 지시·메모리를 모든 스레드에 적용하고, Overview에 "완료·검토 대기·답 기다림"을 표시. ✅ 하루 새 스레드 500개 한도, 스레드 수만큼 사용량 증가 [C3] | 계정에서 사용 가능 여부는 **확인 필요**(롤아웃 단계적). 이 저장소가 직접 만든 "관제 + 하위 세션 + 매시간 실행"을 제품 기능으로 대신할 수 있는 후보 |
| **Remote Control** | 내 컴퓨터의 세션을 앱·웹에서 조종 | ✅ 로컬 프로세스가 계속 떠 있어야 한다. 서버 모드는 여러 세션(기본 용량 32), claude.ai 로그인 필요 [C4] | 사용하지 않음. 학교 플랫폼은 클라우드에서 끝나므로 필요성이 낮다 |
| **GitHub 이슈·PR·댓글** | 작업 단위·검토·기록의 허브 | 🔎 auto-merge는 필수 검토·상태 검사를 통과하면 병합하며, **저장소에서 켜야 하고 보호 규칙(필수 검사)이 있어야 의미가 있다**. 경로 필터로 건너뛴 필수 검사는 "대기"로 남아 병합을 막는다 [G1·G2] | PR·`@codex review` 댓글·Vercel 미리보기 댓글이 이미 허브 역할을 한다. 이슈는 아직 쓰지 않는다 |
| **Codex GitHub 검토** | `@codex review` 댓글 → 검토 | 🔎 눈 이모지 반응 뒤 검토를 올린다. **P0·P1만 지적**한다. 자동 검토 설정이 있다. `AGENTS.md`의 검토 규칙을 따르지만 테스트·보호 규칙·필수 승인을 대신하지 않는다 [O1·O2] | PR #13에 두 번(22:46, 00:02) 요청했지만 반응이 없다(실행 3 시점). 저장소에서 Codex 검토가 켜져 있는지 **확인 필요** |
| **에이전트 간 프로토콜** (A2A, MCP) | A2A: 에이전트끼리, MCP: 에이전트 ↔ 도구 | 🔎 서로 보완하는 관계이고 둘 다 Linux Foundation 소속. A2A는 Agent Card(JSON)로 능력을 공개하고, MCP는 호스트–클라이언트–서버 구조 [P1·P2] | 1인 운영·저장소 하나 규모에는 과하다. Claude·Codex가 모두 GitHub을 읽으므로 GitHub이 사실상 공통 프로토콜이다 |

## 3. 요즘IT 4043 글의 적용 결과 평가

글: 「AI 코딩 세션 10개를 동시에 관리하는 개발 워크플로우」 [Y1]. 본문은 2026-11-22에 직접 확인했다. 글의 핵심은 "병목은 코드 작성이 아니라 결정·검토·병합을 챙기는 사람"이고, 규칙을 정형화한 뒤 주간 PR 병합이 29건에서 211건으로 늘었다는 것이다(저자 보고 수치).

| 글의 방법 | 이 저장소 적용 상태 | 결과·관찰 |
| --- | --- | --- |
| 이슈 생성 스킬 → 프로젝트 보드(Backlog→Ready→In progress→In review→Done) | ❌ 없음. `QUEUE.md` 표 | 표는 한 파일이라 사람 세션·자동 실행이 동시에 고치면 충돌한다. 상태("진행 중 (PR #n)")를 PR과 이중으로 관리한다 |
| 관제 세션과 개발 세션 분리 | ✅ session-start 스킬 2단계, COLLABORATION 역할 표 | 분리 자체는 동작한다. 다만 개발 → 관제 보고 통로가 막혀 있다(2절 메시지) |
| 세션 시작·종료 스킬 | ✅ `.claude/skills/session-start`, `session-end` | 실행 1~3에서 같은 순서를 지켰다. 실행 기록(`docs/automation/runs/`)이 글의 "종료 정리" 역할을 한다 |
| 인계(handoff) 폴더 | ✅ `school-platform-handoff/`, `docs/rounds/` | 동작한다 |
| CI 비용 관리(검증된 코드 재검증 생략) | 해당 적음 | CI 1개(`ci.yml`), 규모가 작다 |
| 위임 머지(머지 게이트 스크립트가 완료 조건·CI 확인) | ❌ 자동 실행은 병합 금지. 사용자 지시 작업은 세션이 병합(PR #15) | 자동 PR이 쌓이면 실행이 멈춘다(검토 대기 3개 규칙) |
| Claude·Codex 도구 이중화(`CLAUDE.md`에 `@AGENTS.md`) | ✅ | 같은 지침을 쓴다. Codex 검토 응답은 아직 관찰하지 못했다 |
| 문서 갱신 줄 충돌 방지(날짜만) | 부분 | 실행 기록은 날짜별 파일이라 충돌이 적다 |

**이 저장소에서 새로 드러난 위험(글에 없음):** 미리보기 배포가 운영 DB를 같이 써서, 브랜치 push가 곧 운영 DB 마이그레이션이었다(2026-11-22 발견, PR #16으로 미리보기 적용 중단). 세션을 늘리기 전에 "push가 바깥에 무엇을 일으키는가"를 먼저 점검해야 한다는 교훈이다.

## 4. 운영 방식에 대한 관찰

- **같은 세션에 이어 쓰는 매시간 실행**: 대화가 계속 길어진다. 실행 1 뒤 컨텍스트 약 21만 토큰, 비용 약 3.7달러(`get_session` 값, 실행 1 종료 무렵). 실행마다 앞 대화를 다시 읽으므로 실행당 비용이 늘어나는 구조로 **추정**한다(정밀 측정 아님). 실행 사이가 1시간이면 캐시 수명 1시간 경계에 걸린다 [C3 사용량 절].
- **새 세션 방식**(`create_new_session_on_fire` 또는 GitHub 트리거): 매번 저장소·실행 기록·PR 본문의 '남은 일'만 읽고 시작한다. 글의 "인계 문서로 새 세션 넘기기"와 같은 방식이다. 이 저장소는 이미 RUN-PROMPT·실행 기록·'남은 일' 목록이 있어 옮기기 쉽다.
- **사람 세션과의 충돌**: 사람 세션이 경로 목록을 메시지로 보내 충돌을 피했다(실행 1). 이슈에 "다룰 코드 영역"을 적으면 같은 정보를 GitHub에 남길 수 있다(글의 이슈 스킬 항목).

## 5. 결론 (ADR 0009 초안으로 넘김)

1. 허브는 GitHub(이슈·PR·댓글)로 한다. 세션 간 메시지는 보조 알림으로만 쓴다(답장 경로가 보장되지 않음).
2. 작업 단위를 GitHub 이슈와 라벨로 옮기는 것이 이점이 크다. 동시 편집 충돌이 없고, 다룰 영역·선행 조건을 적을 수 있고, Codex도 같은 곳을 본다.
3. 자동 병합은 범위를 좁게 시작한다(문서·테스트만, 마이그레이션·`scripts/`·`supabase/` 변경은 제외). GitHub auto-merge는 보호 규칙이 있어야 의미가 있고, 그 설정은 사용자가 해야 한다.
4. 매시간 실행은 "같은 세션 이어 쓰기"에서 "실행마다 새 세션"으로 바꾸는 것을 검토한다(비용·컨텍스트).
5. Projects가 계정에 열려 있으면 관제 역할을 제품 기능으로 대신할 수 있는지 시험할 가치가 있다(**확인 필요**).

## 출처

| 번호 | URL | 확인 |
| --- | --- | --- |
| C1 | https://code.claude.com/docs/en/cross-session-messaging | ✅ 본문 |
| C2 | https://code.claude.com/docs/en/routines | ✅ 본문 |
| C3 | https://code.claude.com/docs/en/claude-projects | ✅ 본문 |
| C4 | https://code.claude.com/docs/en/remote-control | 🔎 검색 요약 |
| C5 | https://code.claude.com/docs/en/claude-code-on-the-web | 🔎 검색 요약 |
| G1 | https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/automatically-merging-a-pull-request | 🔎 (본문 접근 403) |
| G2 | https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks | 🔎 |
| G3 | https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets | 🔎 |
| O1 | https://developers.openai.com/codex/integrations/github | 🔎 (본문 접근 403) |
| O2 | https://developers.openai.com/codex/guides/agents-md | 🔎 |
| P1 | https://blogs.cisco.com/ai/mcp-and-a2a-a-network-engineers-mental-model-for-agentic-ai | 🔎 |
| P2 | https://www.digitalocean.com/community/tutorials/a2a-vs-mcp-ai-agent-protocols | 🔎 |
| Y1 | https://yozm.wishket.com/magazine/detail/4043/ | ✅ 본문 (2026-11-22) |
