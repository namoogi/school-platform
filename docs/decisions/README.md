# 결정 기록 (ADR)

설계·아키텍처·도구 결정을 한 파일에 하나씩 남긴다. 번호는 순서대로, 파일 이름은 `NNNN-짧은-제목.md`.

| 번호 | 제목 | 상태 |
| --- | --- | --- |
| [0001](0001-data-boundary-rls.md) | 학교 간 데이터 경계는 DB(RLS)에서 강제 | 채택 |
| [0002](0002-auth-session.md) | 로그인: Supabase Auth(Google) 확인 후 앱 세션 | 채택 |
| [0003](0003-design-system.md) | 디자인 시스템: 토큰 3층 + 공통 컴포넌트 | 채택 |
| [0004](0004-domain-model-normalization.md) | 도메인 모델 정규화 (학교·사람·학사 구조·수업·평가·발행) | 채택 (안 B, Codex) |
| [0005](0005-ui-tooling.md) | UI 구현 도구 (lucide · Radix · Pretendard, Tailwind 보류) | 채택(1단계) |
| [0006](0006-design-direction-campus.md) | 디자인 방향: 학사 업무형 기본 틀 + 3단 작업함 세부 화면 | 채택 |
| [0007](0007-ui-switching.md) | 화면 형식 선택: 전체 관리 = 분석형(다크·화이트 반전), 학교 = 학사 업무형, 사용자별 저장 | 채택 |
| [0008](0008-school-homepage-module.md) | 학교 홈페이지·성품 동화 모듈과 룽아룬숙사 홈페이지 이전 | 채택 |
| [0009](0009-session-connect.md) | 세션 연결 방식: GitHub 허브 · 이슈 작업 단위 · 좁은 자동 병합 | 제안 |
| [0010](0010-inspector-access.md) | Claude 점검 접근: 머리 토큰 + 읽기 전용 점검 계정 | 채택 |

상태: 제안 → 검토 중 → 채택 / 기각 / 대체됨(대체한 번호 적기). 채택된 기록은 고치지 않고, 바꿀 때는 새 기록을 만들어 "대체됨"으로 연결한다.
새 기록은 [TEMPLATE.md](TEMPLATE.md)를 복사해 쓴다. 번호는 만들기 직전에 `ls docs/decisions`로 다음 빈 번호를 확인하고, 겹치면 CI(`npm run check:repo`)가 막는다.
