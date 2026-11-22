# Claude · Codex 협업

같은 GitHub 저장소(`namoogi/school-platform`)에서 Claude Code와 OpenAI Codex가 나눠 작업한다. 공통 지침은 루트 `AGENTS.md` 하나다(Codex도 이 파일을 자동으로 읽는다).

## 1. 사용자가 할 연결 (ChatGPT 쪽)

OpenAI 공식 문서 기준(2026-11-22 검색). 화면 메뉴 이름은 바뀔 수 있어 **확인 필요**로 표시한다.

1. ChatGPT에 로그인해 **Codex**를 연다(웹: chatgpt.com/codex 또는 ChatGPT의 Codex 메뉴 — 확인 필요).
2. **GitHub 연결**: Codex가 요청하는 GitHub 앱 설치·권한 화면에서 `namoogi/school-platform` 저장소만 선택해 허용한다(Only select repositories 권장).
3. **환경(Environment) 만들기**: 저장소를 고르면 Codex가 설치할 것을 추정한다. 설정에서 아래를 확인한다.
   - Setup script: `npm ci`
   - 인터넷 접근: 기본값 유지(패키지 설치만 필요). DB·Vercel·Supabase 비밀 값은 넣지 않는다.
4. **자동 PR 리뷰(선택)**: Codex 설정의 Code review에서 이 저장소의 Automatic review를 켠다. 저장소에 push·admin 권한이 있는 계정이어야 한다. PR 댓글에 `@codex review`로 요청할 수도 있다(확인 필요).
5. **요금제**: Codex 클라우드 작업·코드 리뷰가 어떤 ChatGPT 요금제에 포함되는지와 사용 한도는 OpenAI 도움말 "Using Codex with your ChatGPT plan"에서 확인한다(확인 필요).

## 2. 작업 나누기 규칙

| 항목 | 규칙 |
| --- | --- |
| 브랜치 | Claude: `round-<차시>/<주제>`, Codex: `codex/<주제>`. main에 직접 push하지 않는다 |
| PR | 한 PR에 한 기능. 본문에 통과한 테스트와 확인하지 못한 항목을 나눠 적는다 |
| 검토 | 한쪽이 만든 PR은 다른 쪽(또는 사용자)이 검토한다. 병합은 사용자 승인 후 |
| 마이그레이션 | `supabase/migrations/`에 날짜 접두어. 작업 시작 전 최신 main을 받아 번호가 겹치지 않게 하고, 이미 적용된 파일은 고치지 않는다 |
| 할 일 | 진행 관리는 앱의 **전체 관리 → 개발·연구소** 보드가 기준. 저장소의 `docs/ROADMAP.md`는 큰 방향만 |
| 비밀 값 | DB 주소·비밀번호·토큰을 코드·PR·채팅에 남기지 않는다. 배포 값은 Vercel 환경 변수에만 |

## 3. Codex 환경에서 돌릴 수 있는 검사

| 명령 | 필요한 것 | 비고 |
| --- | --- | --- |
| `npm run typecheck` | Node | 항상 |
| `npm run test:unit` | Node | CSV·XLSX·DOCX·PDF 판독기 |
| `npm test` | Postgres 16 (127.0.0.1:54322) | RLS·발행본·라이선스 통합 테스트. Postgres가 없으면 PR에 "미실행"으로 적는다 |
| `npm run build && npm run test:e2e` | Postgres + Chromium | 전체 흐름 |

배포 확인은 PR의 Vercel Preview가 맡는다. Preview 빌드는 개발용 Supabase DB에 마이그레이션을 적용하므로, 마이그레이션이 든 PR은 서로 충돌하지 않게 순서대로 올린다.
