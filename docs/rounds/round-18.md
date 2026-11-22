# 18차 결과: UI/UX 디자인 기반

요청(2026-11-22): 디자인이 투박하다. 주요 학사관리·전문 관리 도구를 REA 방식으로 조사하고, 복잡하고 체계적인 서비스를 위한 UI·UX 기반을 구축한다.

## 조사

[REA 보고서](../research/ui-rea-2026-11.md): 질문 5개(정보 구조, 고밀도 화면, 검토·감사 흐름, 양식·피드백, 시각 기반), 29개 출처(Carbon, Primer, GOV.UK, Polaris, SLDS, Atlassian, Fluent 2, KRDS, WCAG 2.2, NN/g, PowerSchool, Infinite Campus, Canvas, ManageBac, 교육부 학생부 정정 Q&A 등), 핵심 권고 12개, 명세 초안.

한계: 이 개발 환경의 네트워크에서 공식 디자인 시스템 사이트 다수가 막혀, 각 시스템의 공식 문서 저장소(GitHub)·npm 패키지로 읽었다. NN/g와 학교 제품 도움말은 검색 발췌 수준이라 보고서 §6 "확인 필요"에 남겼다.

## 구현

- 토큰 3층(색·타입·간격·반경·그림자·밀도), 상태 의미색 6가지
- 앱 셸: 상단 막대 + 학교 전환기 + 그룹형 흰 탐색(처리할 질문 수 배지), 건너뛰기 링크
- 공통 컴포넌트: PageHeader(경로·상태·메타·동작), Steps(자료 첨부 → 관리자 확인 → 문서 발행), StatusBadge, Banner, EmptyState, Card, Kpi, Meter
- 모든 화면 적용: 자료 첨부, 관리자 확인, 학사 문서실·발행본, 학교 설정(좌석 사용 막대), 전체 관리(지표 카드·표), 개발·연구소, 로그인

설계 규칙: [DESIGN-SYSTEM.md](../design/DESIGN-SYSTEM.md)

## 검증

- `npm test` 58개, `npm run test:e2e` 14단계 통과 (화면 구조가 바뀌어도 흐름 유지)
- 화면: `round-18/screens/`

## 남은 것

다크·고대비 테마, DataTable 컴포넌트(필터·저장된 보기·일괄 작업), 보조 패널, axe 자동 검사, 실제 사용자 사용성 시험.
