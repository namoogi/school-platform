# 디자인 시스템 (18차 기반)

근거: [UI/UX 신속 근거 평가(REA) 보고서](../research/ui-rea-2026-11.md) — 29개 출처, 질문별 종합과 명세 초안(§5).
구현: `src/app/globals.css`(토큰·기본 스타일), `src/components/ui.tsx`(공통 컴포넌트), `src/components/Shell.tsx`(앱 셸).

## 채택한 결정

| 영역 | 결정 | 근거 |
| --- | --- | --- |
| 토큰 | 원시 → 의미 → 컴포넌트 3층. 화면 코드는 의미 토큰만 쓴다(색 값 직접 금지) | S3, S17, S18 |
| 색 | 중립 회색 + 브랜드 파랑(#2D5BC8, 주 버튼·링크·선택). 상태 의미색 6가지(success·warning·danger·info·neutral·discovery), 글자/배경 대비 4.5:1 이상 | 보고서 §5.1 |
| 간격·반경 | 4px 기준 간격, 반경 4/6/8 | S3, S17 |
| 타입 | 본문 14/22, 페이지 제목 20/28, 숫자 tabular-nums, `word-break: keep-all` | S17, S18 |
| 밀도 | 표 행 40px 기본, `data-density="compact|comfortable"`로 32/48 | S1, S13 |
| 앱 셸 | 48px 상단 막대(로고 · 학교 전환기 · 계정), 흰 바탕 그룹형 왼쪽 탐색(학사 운영 / 학교 관리 / 전체 관리), 현재 항목은 연한 파랑 + 왼쪽 막대 | S2, S14, S15, S16 |
| 학교 전환기 | 상단 왼쪽, 현재 학교 이름 표시, 볼 수 있는 학교만(RLS), 전환하면 첫 화면으로. 전체 관리자로 학교를 볼 때는 경고 표시 | S2, S15, S25, S26 |
| 페이지 헤더 | 화면마다 하나: 경로 → 제목(h1) + 상태 배지 → 메타 → 설명, 오른쪽에 주 동작 최대 1개 | S9, S13, S14 |
| 단계 | 학사 흐름은 자료 첨부 → 관리자 확인 → 문서 발행 단계 표시(`aria-current="step"`) | S14 |
| 상태 | 항상 색 + 글자(필요하면 점). 클릭 불가. 같은 상태는 모든 화면에서 같은 색·라벨 | S4, S12, S19 |
| 버튼 | primary(구역당 1개) / secondary / ghost / danger(확인 대화상자 안에서만). 라벨은 동사+대상 | S8, S13 |
| 알림 | 오류는 관련 위치에 인라인, 페이지 결과는 본문 상단 배너. 토스트는 쓰지 않음(접근성) | S5, S8, S10 |
| 변경 불가 기록 | 편집 대신 새 판·수정본, 이력은 타임라인 | S9, S14, S25 |
| 문서(발행본) | 업무 화면 토큰과 분리해 인쇄물 서체·색을 유지 | 14차 결정 |
| 접근성 | WCAG 2.2 AA: 대비, 포커스 표시, 24px 이상 대상, 건너뛰기 링크, sticky 막대가 포커스를 가리지 않게 `scroll-padding-top` | S19 |

## 컴포넌트 (`src/components/ui.tsx`)

`PageHeader`, `Steps`, `StatusBadge`, `Banner`, `EmptyState`, `Card`, `Kpi`, `Meter` + 셸의 `SchoolSwitcher`, `Nav`.
CSS 클래스: `.btn .btn-primary|secondary|ghost|danger .btn-sm`, `.badge[data-tone]`, `.count-badge`, `.grid-table`(+`.table-wrap`, `th scope`, `.num`), `.summary-list`, `.timeline`, `.tabs`, `.toolbar`, `.kpis`.
이전 클래스(`.primary`, `.tag.green` 등)는 같은 토큰으로 이어 두었다. 새 화면은 새 클래스를 쓴다.

## 다음 단계 (아직 하지 않음)

- 다크·고대비 테마(토큰 값은 보고서 §5.1에 초안 있음)
- DataTable 컴포넌트화(정렬·필터·저장된 보기·일괄 작업), 확인 대화상자, 보조 패널(근거·이력)
- 자동 접근성 검사(axe)를 E2E에 추가, 교사·행정 직원 대상 사용성 시험(본문 14px의 가독성 확인)
- 명령 팔레트(Ctrl+K)는 1차 근거를 찾지 못해 보류
