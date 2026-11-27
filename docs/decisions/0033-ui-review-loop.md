# 0033. UI 점검 루프: Claude 구현 → 기계 검사 → Codex 점검 → Claude 선별·수정

- 상태: 채택
- 날짜: 2026-11-26
- 제안: 사용자(선생님이 드리미포털용으로 정리한 `UI_REVIEW.md`를 올림)
- 검토: Claude(이 저장소에 맞게 조정)
- 결정: 사용자 (2026-11-26, 적용 범위 '문서 + 자동화' 선택)

## 배경
에이전트는 렌더된 화면을 보지 못하고, 만든 쪽이 스스로 채점하면 후하다. 선생님이 구현과 점검을 다른 모델로 나누는 루프를 정리해 올렸다.

## 고려한 안
| 안 | 내용 | 장점 | 단점·위험 | 비용 |
| --- | --- | --- | --- | --- |
| A 문서만 | `docs/UI_REVIEW.md` + 연결 문구 | 빠름 | 캡처·검사를 매번 손으로 | 없음 |
| **B 문서 + 자동화(채택)** | A + 캡처·기계 검사 스크립트, 색상 린트(CI) | 4-1·4-2가 한 줄로 돈다. Codex는 깨끗한 화면만 본다 | 서버를 띄워야 캡처 가능 | 없음(모델 호출 없음) |
| C B + 지금 전 페이지 점검 | | 바로 결과 | 이 환경에 Codex 없음, 캡처량 큼 | Codex 사용량 |

## 근거
- 이 클라우드 작업 환경에는 Codex CLI가 없다(`which codex` 없음, 2026-11-26).
- Codex를 GitHub에서 쓰는 길은 두 가지다.
  - **Codex GitHub 코드 리뷰**: ChatGPT 구독. PR에 `@codex review`를 달거나 자동 리뷰를 켠다. AGENTS.md의 리뷰 규칙을 따른다(https://developers.openai.com/codex/integrations/github).
  - **Codex GitHub Action** `openai/codex-action`: OpenAI API 키가 필요하다(https://developers.openai.com/codex/github-action).
- 토큰 밖 색상값은 24곳이다. 대부분 인쇄용 종이·무지개 장식·Google 단추 브랜드 색이다.

## 결정
B를 택한다.
- 규칙은 `docs/UI_REVIEW.md` 한 곳에만 두고, CLAUDE.md·AGENTS.md에는 연결 문구만 넣는다.
- Codex 점검은 기본을 선생님 Mac의 Codex CLI(구독)로 한다. GitHub 코드 리뷰(구독)는 PR 코드 점검에 쓴다.
- API 과금 Action은 ADR 0032에 따라 비용 확인 없이 쓰지 않는다.
- 다시 볼 조건
  - Codex 클라우드에서 캡처까지 되는지 시험되면 GitHub 위 상호 점검으로 넓힌다.
  - 기준 이미지 비교(`toHaveScreenshot` 또는 픽셀 비교)를 들인다.

## 영향
- 새 파일: `scripts/ui-review.mjs`, `scripts/ui-review.pages.mjs`, `scripts/lint-colors.mjs`, `scripts/lint-colors.baseline.json`
- `package.json`: `ui:review`, `lint:colors`
- CI에 `lint:colors` 단계를 넣는다.
- `.gitignore`에 `.ui-review/`를 넣는다.
- 데이터 경계에는 영향이 없다. 캡처 스크립트는 로컬 주소와 합성 예시 계정만 쓴다(다른 주소는 명시해야 열림).
- 되돌리기: 파일을 지우고 CI 단계를 뺀다.

## 확인 방법
- `npm run lint:colors`: 지금 상태 통과. 새 색을 넣으면 실패.
- `npm run ui:review -- lab`: 로컬 서버에서 9장 캡처와 기계 검사.
