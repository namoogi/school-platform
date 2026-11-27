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
| 검토·병합 | 사용자 지시로 한 작업은 테스트 통과 후 작업한 세션이 바로 병합하고 운영 배포를 확인한다(지시 = 승인, AGENTS.md). 다른 쪽 검토는 병합 뒤에도 받을 수 있다. 자동 실행 PR(`[자동]`)만 사람 지시가 있어야 병합 |
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
| 사용자 | 요청(요청 자체가 승인), 안 비교 후 **결정**, 지시 범위 밖의 비용·공개 범위·외부 발송 승인 |
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
⑦ 병합 ─ 테스트 통과 후 작업 세션이 병합·배포 확인 (검토 의견은 후속 PR로 반영)
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
| 관제 세션 | 사용자와 대화 중인 Claude 세션 | 요청 정리, 대기열·결정 기록·브리프 작성, 지시받은 작업의 구현·병합·배포 확인, PR 검토, 진행 보고 | 여러 기능을 한 번에 직접 구현 |
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
- **선별(85차)**: Codex 리뷰의 지적마다 수용·기각·보류 중 하나로 판정한다. 그 PR에 답글 하나로 남긴다(표: 번호 · 판정 · 근거 한 줄 · 고친 커밋). 수용한 것은 같은 PR에서 고친다. 보류는 선생님께 선택지로 올린다. Codex 지적을 그대로 다 받지 않는다. 규약(AGENTS.md·DESIGN-SYSTEM)과 부딪치면 규약이 이긴다.
  - **판정 근거는 지적의 종류에 따라 다르다.** 코드 리뷰 지적(데이터 경계·보존·비밀·마이그레이션·테스트 등)은 AGENTS.md 규칙과 코드·테스트로 판정한다. 화면으로 입증할 수 없어도 수용할 수 있다. 화면 근거 조건("체크리스트 항목에 근거가 있고 화면에서 확인된다")은 UI 시각 점검 지적(`docs/UI_REVIEW.md` 4-4)에만 쓴다.
- 연결 상태(2026-11-27, 85차)
  - 그전까지 PR 26개의 `@codex review`에 봇 반응이 **0건**이었다. 막혀 있던 곳은 세 군데다: ① 저장소 Code review 꺼짐 ② 개인 설정 자동 검토 꺼짐 ③ GitHub 앱 권한 갱신 요청 미승인. 셋 다 풀어야 했다. 다시 막히면 이 세 곳부터 본다.
  - 개인 설정을 켜고, GitHub의 ChatGPT Codex Connector 앱에 걸려 있던 권한 갱신 요청을 승인한 뒤(01:57Z) 봇(`chatgpt-codex-connector[bot]`)이 PR #127에 처음으로 검토를 남겼다(01:58Z, P1 1건 → 수용). 이제 PR을 열면 자동 검토되고, `@codex review` 댓글로도 다시 청할 수 있다.
  - 보조 경로: 선생님 쪽 Codex 세션이 GitHub 커넥터로 PR을 읽고 검토 댓글을 직접 남긴다. 첫 줄은 `(Codex 수동 검토 …)`이다. 85차 PR #127에서 P2 2건을 받아 반영했다.
- 작업 요청 연결 상태(2026-11-27, 99차, 이슈 #143)
  - 이슈의 `@codex`가 처음 세 번은 "create an environment for this repo" 답만 받았다. Codex 클라우드 환경을 만들고 **환경의 저장소 칸을 이 저장소로 맞춘 뒤** 네 번째 호출에서 👀 반응(착수)이 붙었다. 다시 막히면 환경의 저장소 연결부터 본다.
  - Codex 클라우드 작업은 끝나도 **PR을 만들지 않고 'Create PR' 단추에서 멈춘다**(이번에는 커밋 `36e70a4`만 남김). 이 한 번의 클릭이 사람 병목이다.
  - 실제 PR #154는 선생님 Mac의 Codex가 올렸다. PR 본문에 완료 범위·시험 결과·미확인 항목·Claude가 이어 할 일을 적어, Claude가 대화 전달 없이 저장소에서 이어받았다(검토 → 지적 보완 커밋 → 시험 → 병합 → 운영 확인).
  - 다음 시험(미확인): Claude가 브랜치와 초안 PR을 먼저 만들고 **그 PR 댓글에서 `@codex`로 구현을 청한다**. Codex가 그 PR 브랜치에 바로 올리면 'Create PR' 클릭이 없어진다. 결과를 이 절에 적는다.
  - Codex 클라우드 환경은 작업 실행 때 Postgres가 꺼져 있어 DB 시험·E2E를 못 돌렸다. 빠진 시험은 받는 Claude 세션이 돌린다.
- 106차 확인(2026-11-27, PR #159)
  - **PR 댓글의 `@codex`도 브랜치에 올리지 않는다.** 결과는 Codex 클라우드 작업에만 남고 'Create PR' 단추가 필요하다.
  - **PR 본문에 `@codex` 글자를 쓰면 그것도 호출로 받아 같은 작업이 두 번 돈다.** 본문에서는 쓰지 않는다.
  - GitHub 댓글의 Codex 공유 링크(`chatgpt.com/s/cd_…`)는 앱에서 "사용할 수 없습니다"로 열리지 않을 수 있다. chatgpt.com/codex 작업 목록에서 찾는다.
  - 클라우드 Claude 세션 안의 `codex login --device-auth`는 계정 보안 설정에 따라 막힐 수 있다("장치 코드 인증을 활성화").
  - 사람 손을 없애는 길(추천): 선생님 Mac에서 `claude remote-control`로 저장소 폴더를 열면, 클라우드 Claude 세션이 그 폴더를 붙여 Mac에 로그인된 Codex CLI를 직접 실행할 수 있다(확인 대기).
- 사용자 1회 설정(85차에 확인한 순서). 그 뒤로는 사람이 중계하지 않는다.
  1. Codex 설정 → Code review → 이 저장소 켜기(Automatic review)
  2. Codex 설정 → Personal preferences → 자동 검토 켜기. 저장소 칸이 'Follow personal preferences'면 이 값을 따른다.
  3. GitHub → Settings → Applications → ChatGPT Codex Connector: 권한 갱신 요청이 있으면 승인하고, 저장소 접근에 이 저장소를 넣는다.
  4. Codex 환경(Environment): 공식 안내에는 필요하다고 되어 있다. 85차에는 환경이 있는지 확인하지 않았다(검토는 돌았다). 막히면 이것도 본다.
- 참고(사용자 보고, 공식 확인 아님): [openai/codex#54382](https://github.com/openai/codex/issues/54382), [#20093](https://github.com/openai/codex/issues/20093), [#13701](https://github.com/openai/codex/issues/13701)

## Vercel 미리보기 빌드 (2026-11-24 사용자 결정, 관제 D-12)
- `claude/**`·`codex/**` 브랜치는 Vercel 배포를 만들지 않는다(`vercel.json` `git.deploymentEnabled`). 무료 요금제의 하루 배포 100회를 세션 브랜치가 다 써서 운영 배포가 막힌 일(2026-11-23) 때문.
- 이 브랜치들의 확인은 로컬 `npm test`·`npm run build`·`npm run test:e2e`로 한다. 미리보기는 원래 운영 DB를 같이 써서 시험용으로 적합하지 않았다.
- 다른 브랜치(`auto/**`, 사람 브랜치)와 `main`은 그대로 배포된다. 다시 검토할 조건: 미리보기 DB가 분리되거나 요금제가 바뀔 때.
