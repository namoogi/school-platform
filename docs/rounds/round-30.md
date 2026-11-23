# 30차: Claude 점검 접근 (머리 토큰 + 읽기 전용 점검 계정)

> 이 문서는 32차에 뒤늦게 채웠다. 설계·결정의 원문은 [ADR 0010](../decisions/0010-inspector-access.md)이다.

## 사용자 지시 (2026-11-23)
"구글 로그인이라도 Claude가 접근하고 화면을 스캔할 수 있는 길을 만들어 놔. 내가 계속 대신 로그인하고 체크해 줄 수는 없잖아."

## 한 일 (PR #26)
- 전용 계정 `inspector@onschools.internal`('Claude 점검(읽기 전용)'): 비밀번호 없음, 모든 화면 읽기, DB 트랜잭션을 `read only`로 연다.
- 요청 머리 `x-inspector-token: insp_<64 hex>`. DB에는 sha256만, 기한 7·30·90일, 폐기·마지막 사용 시각.
- 발급·폐기: 전체 관리 → 학교별 개발 연동 → 'Claude 점검 접근'(전체 관리자만).
- Claude 쪽: 작업 환경의 Network secret으로 프록시가 onschools.vercel.app 요청에만 붙인다.
- 마이그레이션 `20261123000300_inspector_access.sql`, 통합 시험 `tests/round30.test.ts`, E2E 30차 단계.

## 고친 것 (32차)
- 점검 계정은 쓰기가 막혀 입장 기록을 남기지 못하는데, 학교 화면 위 띠가 "접근이 기록됩니다"라고 안내했다. 점검 계정이면 "Claude 점검(읽기 전용)으로 보는 중 · 점검 토큰의 마지막 사용 시각이 남습니다"로 바꿨다(E2E 30차 단계에서 확인).
