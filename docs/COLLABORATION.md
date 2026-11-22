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

## 4. 역할

| 누가 | 맡는 일 |
| --- | --- |
| 사용자 | 요청, 안 비교 후 **결정**, 병합 승인, 비용·공개 범위·외부 발송 승인 |
| Claude Code | 조사(REA 등), 설계 초안(결정 기록·디자인 브리프), 구현, 테스트·배포 확인, Codex PR 검토 |
| Codex | Claude PR **독립 검토**(`@codex review`), 같은 브리프에 대한 **대안 설계안**, 범위가 작은 구현 |

한쪽이 만든 설계·코드는 다른 쪽이 검토한다. 두 안이 갈리면 결정 기록에 나란히 적고 사용자가 고른다.

## 5. UI/UX·아키텍처 설계 흐름

```
① 요청 ─ 사용자가 Claude 또는 Codex에 요청
② 브리프 ─ Claude가 문제·목표·제약을 정리
      UI/UX → docs/design/briefs/<날짜>-<주제>.md
      아키텍처 → docs/decisions/NNNN-<주제>.md (상태: 제안)
      PR 제목 "[설계] …" (코드 없음)
③ 안 2개 ─ Claude 안 A를 브리프에 적고,
      사용자가 아래 '요청 문구 B'로 Codex에 대안 B를 요청 → Codex가 같은 브리프에 안 B를 추가한 PR
④ 상호 검토 ─ Claude 안은 @codex review, Codex 안은 Claude가 검토 댓글
⑤ 결정 ─ 사용자가 비교표를 보고 결정 → 결정 기록 상태 "채택", 기각 안의 재검토 조건 기록
⑥ 구현 ─ 결정 기록 링크를 넣은 구현 PR (담당: 결정 때 정함)
⑦ 검토·병합 ─ 다른 쪽 검토 → 사용자 병합 승인
```

작은 변경(문구·간격·버그)은 ②~⑤를 건너뛰고 구현 PR + 상호 검토만 한다. 기준: 새 화면·새 표·새 외부 서비스·데이터 경계 변경·되돌리기 어려운 변경이면 설계 흐름을 탄다.

## 6. Codex에 붙여 넣을 요청 문구

**B. 대안 설계안**
```
namoogi/school-platform 저장소에서 작업해 줘. AGENTS.md와 docs/COLLABORATION.md를 먼저 읽어.
docs/design/briefs/<파일>.md (또는 docs/decisions/<파일>.md) 브리프를 읽고, Claude의 '안 A'와 다른 접근으로 '안 B'를 같은 문서의 비교표와 본문에 추가해 줘.
근거는 출처 URL과 함께 적고, 확인하지 못한 내용은 '확인 필요'로 표시해. 코드는 바꾸지 말고 문서만 수정해서
브랜치 codex/<주제>-alt 로 PR을 열어 줘. PR 제목은 "[설계] <주제> 안 B".
```

**C. 구현**
```
namoogi/school-platform 에서 docs/decisions/<번호>.md 의 '결정' 대로 구현해 줘. AGENTS.md의 데이터 경계와 docs/design/DESIGN-SYSTEM.md를 지켜.
npm run typecheck 와 npm run test:unit 을 통과시키고, Postgres가 없으면 npm test 는 '미실행'으로 PR에 적어.
브랜치 codex/<주제>, PR 양식(.github/pull_request_template.md)을 채워서 PR을 열어 줘.
```

**D. 검토** (PR 댓글)
```
@codex review AGENTS.md의 'Review guidelines'와 docs/design/DESIGN-SYSTEM.md 기준으로 검토해 줘.
```

## 7. 세션 운영 (관제 세션 · 개발 세션)

참고: [요즘IT 「AI 코딩 세션 10개를 동시에 관리하는 개발 워크플로우」](https://yozm.wishket.com/magazine/detail/4043) — 세션 규칙·CI·머지·문서화 표준화, 관제 세션과 개발 세션 분리, 세션 시작·종료 패턴 스킬화, Claude 장애 대비 Codex 이중화. (본문 전체는 이 개발 환경에서 열지 못해 검색 요약 기준)

| 세션 | 누가 | 하는 일 | 하지 않는 일 |
| --- | --- | --- | --- |
| 관제 세션 | 사용자와 대화 중인 Claude 세션 | 요청 정리, 대기열·결정 기록·브리프 작성, PR 검토, 진행 보고, 병합 요청 | 여러 기능을 한 번에 직접 구현 |
| 개발 세션 | 매시간 자동 개선 실행, Codex 작업, 필요할 때 띄우는 Claude 세션 | 대기열의 기능 하나를 끝까지 구현·검사·PR | 대기열에 없는 큰 방향 변경 |

- 모든 세션은 저장소 스킬 `session-start`로 시작하고 `session-end`로 끝낸다(`.claude/skills/`). Codex는 같은 내용을 AGENTS.md와 이 문서로 따른다.
- **이중화**: Claude 장애·한도 때는 사용자가 6절 '요청 문구 C'로 Codex에 대기열 맨 위 항목을 맡긴다. Codex 장애 때는 Claude가 검토까지 맡는다.
- 세션 간 정보 전달은 GitHub(PR 본문 '남은 일', 이슈, 결정 기록)를 기준으로 한다. 세션끼리 직접 보내는 메시지는 보조이고, 결정과 인계 내용은 반드시 저장소에 남긴다.

## 8. Claude ↔ Codex 자동 상호통신 (사람이 중계하지 않음)

Claude 세션의 GitHub 댓글·이슈는 사용자 계정 이름으로 올라가므로 Codex가 사용자 요청으로 받는다. 모든 교신은 GitHub에 남는다.

| 통로 | 방법 | 결과가 돌아오는 곳 |
| --- | --- | --- |
| 검토 요청 | Claude가 자기 PR에 `@codex review` 댓글 | Codex 리뷰 → PR 알림 → 다음 Claude 세션이 반영하고 답글 |
| 작업 요청(대안 설계·구현) | Claude가 **이슈**를 열고 본문 끝에 `@codex <요청>` (PR 댓글의 비검토 멘션은 검토로만 처리된다는 사용자 보고가 있어 이슈를 쓴다 — 확인 필요) | Codex 초안 PR → Claude가 검토 댓글 |
| Codex PR 검토 | 매시간 실행이 `codex/` 브랜치 PR을 찾아 Review guidelines로 검토 댓글 | Codex가 고치거나 사용자 판단 |

- Claude가 올리는 요청 첫 줄에 `(Claude 관제 세션 작성)` 또는 `(Claude 자동 실행 작성)`을 적어, 사용자 계정 이름이지만 누가 썼는지 구분한다.
- 한 주제에 Codex 요청은 하나만 열어 둔다(중복 실행 방지). 24시간 응답이 없으면 사용자에게 보고한다.
- 사용자 1회 설정: Codex Code review를 이 저장소에 켜기, Codex 환경(Environment) 하나 만들기. 그 뒤로는 사람이 중계하지 않는다.
- 참고(사용자 보고, 공식 확인 아님): [openai/codex#54382](https://github.com/openai/codex/issues/54382), [#20093](https://github.com/openai/codex/issues/20093), [#13701](https://github.com/openai/codex/issues/13701)

