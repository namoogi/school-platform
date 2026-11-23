## 요약
<!-- 무엇을 왜 바꿨는지. 관련 차시·결정 기록(docs/decisions/)·디자인 브리프 -->

## 종류
- [ ] 기능 · [ ] UI/UX 설계 · [ ] 아키텍처 · [ ] 문서·지침 · [ ] 버그 수정

## 확인
- [ ] 데이터 경계(AGENTS.md 1~6)를 지켰다 — 새 표에 `school_id`와 RLS, 학교 ID는 서버에서
- [ ] UI는 의미 토큰과 공통 컴포넌트만 썼다(docs/design/DESIGN-SYSTEM.md)
- [ ] 마이그레이션은 새 파일로 추가했고 이미 적용된 파일은 고치지 않았다
- [ ] 비밀 값(DB 주소·비밀번호·토큰)을 코드·PR에 남기지 않았다

## 테스트
<!-- 통과한 명령과 결과. 실행하지 못한 검사는 이유와 함께 -->
- `npm run typecheck`:
- `npm run test:unit`:
- `npm test`:
- `npm run test:e2e`:

## 전체 적용 후보
<!-- 이 PR에서 만든 것 중 다른 모듈·학교에도 쓸 만한 것을 한 줄씩. 관제 세션이 docs/design/PLATFORM-PATTERNS.md로 옮긴다. 없으면 '없음' -->

## 확인하지 못한 항목

## 검토 요청
<!-- Claude가 만든 PR은 Codex에게(@codex review), Codex가 만든 PR은 Claude 또는 사용자에게 -->
