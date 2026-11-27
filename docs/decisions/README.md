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
| [0011](0011-school-self-editing.md) | 학교 자율 운영: 실시간 화면 편집 + 대화형 편집 + 학교별 생성형 개발 | 채택(1단계) · 제안(2·3단계) |
| [0012](0012-agent-work-token.md) | 외부 작업 토큰: 성품 동화 전용 · 시안만 · 명령 함수로만 | 채택 |
| [0013](0013-school-ai-workspace.md) | 학교별 AI 작업 공간(자기 구독 에이전트 + 범위 토큰)과 관제 서브 세션의 병행 | 채택(방향·1단계) · 제안(학교별 코드) |
| [0014](0014-agent-token-crud.md) | 작업 토큰 권한 확장: 만들기·고치기(구조)·보관, 기한 365일·무기한·연장 | 채택 |
| [0015](0015-control-center.md) | 관제 센터: 결정 요청함과 지시 전달 | 채택 |
| [0016](0016-agent-publish.md) | 작업 토큰 '공개' 권한: AI에게 공개를 지시하면 바로 공개 | 채택 |
| [0017](0017-chat-dock.md) | 어디서나 여는 대화창 (옛 개선 요청 판 이식) | 채택 |
| [0018](0018-r2-storage-usage.md) | 파일 저장소 Cloudflare R2 연결 + 학교별 사용량·요금 추정 | 채택 |
| [0019](0019-scale-architecture.md) | 규모 설계: 학교 100곳·1,000곳까지 Vercel·Supabase·R2 | 제안(A1 채택) |
| [0020](0020-content-auto-translation.md) | Codex 구독으로 콘텐츠 정기 번역·시안 저장 | 채택 |
| [0021](0021-agent-autopublish.md) | 작업 토큰 '자동 공개' 권한: 저장하면 바로 공개 | 채택 |
| [0022](0022-agent-connect-text.md) | AI 연결 글: 지시문과 토큰을 한 덩어리로 붙여 넣기 | 채택 |
| [0023](0023-school-own-host.md) | 학교 자체 주소로 공개 홈페이지 열기 | 채택 |
| [0024](0024-control-school-work.md) | 관제 세션 = 전체 관리자(점검 토큰으로 모든 학교 일) | 채택 |
| [0025](0025-academic-foundation.md) | 학사 토대: 한국+미국 기준, 원장·마감 판·출력 프로필·확장 사다리 | 채택 |
| [0026](0026-portal-exchange.md) | 드리미포털과 구조·규칙·문서 교환 | 채택 |
| [0027](0027-baseline-and-report-contract.md) | 관제 기본판 · 학교 복제 · 보고 계약 | 채택 |
| [0028](0028-retention-and-redaction.md) | 보존 기간과 파기: 추가만 하는 원장과 함께 쓰는 가림 판 | 채택 |
| [0029](0029-student-guardian-accounts.md) | 학생·보호자 열람 계정: 구성원과 분리, 13세 미만은 보호자 경유 | 채택 |
| [0030](0030-access-amendment-default.md) | 열람·수정 요청·이의 의견서를 모든 학교 기본값으로 | 채택 |
| [0031](0031-homepage-templates.md) | 학교 홈페이지 템플릿 7종: 둘러보고 골라 시작, 빈 칸 목록으로 자동 배치·이전을 잇는다 | 채택 |
| [0032](0032-ai-by-subscription.md) | AI 작업은 구독 계정으로, 플랫폼 서버의 유료 API 분석은 두지 않는다 | 채택 |
| [0033](0033-ui-review-loop.md) | UI 점검 루프: Claude 구현 → 기계 검사 → Codex 점검 → Claude 선별·수정 | 채택 |
| [0034](0034-template-complete-design.md) | 홈페이지 템플릿 = 완성 디자인(색·글꼴·첫 화면 + 쪽 구성), 테마 8종 | 채택 |
| [0035](0035-shared-first-portable.md) | 공용 DB 기본 + 학교 맞춤은 정의·규칙·계산식 + 언제든 전용·독립으로 이전(연습 이전 시험) | 채택 |

상태: 제안 → 검토 중 → 채택 / 기각 / 대체됨(대체한 번호 적기). 채택된 기록은 고치지 않고, 바꿀 때는 새 기록을 만들어 "대체됨"으로 연결한다.
새 기록은 [TEMPLATE.md](TEMPLATE.md)를 복사해 쓴다. 번호는 만들기 직전에 `ls docs/decisions`로 다음 빈 번호를 확인하고, 겹치면 CI(`npm run check:repo`)가 막는다.
