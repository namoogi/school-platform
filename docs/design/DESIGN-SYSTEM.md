# 디자인 시스템 (18차 기반 · 25차 방향 ADR 0006)

근거: [UI/UX 신속 근거 평가(REA) 보고서](../research/ui-rea-2026-11.md) — 29개 출처, 질문별 종합과 명세 초안(§5).
구현: `src/app/globals.css`(토큰·기본 스타일), `src/components/ui.tsx`(공통 컴포넌트), `src/components/Shell.tsx`(앱 셸).

## 채택한 결정

| 영역 | 결정 | 근거 |
| --- | --- | --- |
| 토큰 | 원시 → 의미 → 컴포넌트 3층. 화면 코드는 의미 토큰만 쓴다(색 값 직접 금지) | S3, S17, S18 |
| 색 | (25차) 따뜻한 회색(stone) + 청록(teal #1F6B63, 주 버튼·링크·선택), 아이콘 레일은 짙은 슬레이트. 18차의 중립 회색 + 파랑을 대체(ADR 0006). 상태 의미색 6가지(success·warning·danger·info·neutral·discovery), 글자/배경 대비 4.5:1 이상 | 보고서 §5.1 |
| 선 (28차) | 흰 화면의 선은 회색 3단계로 둔다: 구분선 `--border-subtle` < 카드·표 테두리 `--border-default` < 입력·보조 버튼 `--border-input`(학사형 #C9C1B4, 분석형 #D0D5DD). 마우스를 올리면 `--border-strong`, 초점은 주 색 테두리 + 연한 고리. 검은 테두리는 쓰지 않는다. 입력 테두리 대비는 약 1.5:1로 WCAG 1.4.11(3:1)보다 낮다. 모든 입력에 위쪽 라벨·그림자·초점 고리를 두어 보완하며, 접근성 우선 학교는 `--border-input`을 `--border-strong`으로 올리면 된다 |
| 간격·반경 | 4px 기준 간격, 반경 6/8/12 (25차) | S3, S17 |
| 타입 | (25차) 본문 16/25, 홈 제목 28, 화면 제목 22, 숫자 tabular-nums, `word-break: keep-all` | S17, S18 |
| 밀도 | 표 행 48px·컨트롤 40px 기본 (25차), `data-density="compact|comfortable"`로 36/52 | S1, S13 |
| 앱 셸 | (25차, ADR 0006) 왼쪽 아이콘 레일 88px(아이콘 + 짧은 이름, 묶음은 가는 선, 현재 항목은 흰 글자 + 왼쪽 막대) + 상단 막대 64px(학교 전환기 · 확인 대기 알림 · 계정). 홈은 업무 카드 + 할 일 열. 목록·상세를 오가는 세부 처리는 3단 작업함(함 → 목록 → 상세) | S2, S14, S15, S16 |
| 화면 형식 | (26차, ADR 0007) `data-ui`(campus 학사 업무형 / analytics 분석 대시보드형) × `data-mode`(light / dark). 전체 관리 기본 = 분석형 다크(화이트 반전 버튼), 학교 기본 = 학사 업무형. 사용자별 DB 저장. 새 화면은 형식과 무관하게 의미 토큰만 쓴다 |
| 학교 전환기 | 상단 왼쪽, 현재 학교 이름 표시, 볼 수 있는 학교만(RLS), 전환하면 첫 화면으로. 전체 관리자로 학교를 볼 때는 경고 표시 | S2, S15, S25, S26 |
| 페이지 헤더 | 화면마다 하나: 경로 → 제목(h1) + 상태 배지 → 메타 → 설명, 오른쪽에 주 동작 최대 1개 | S9, S13, S14 |
| 단계 | 학사 흐름은 자료 첨부 → 관리자 확인 → 문서 발행 단계 표시(`aria-current="step"`) | S14 |
| 상태 | 항상 색 + 글자(필요하면 점). 클릭 불가. 같은 상태는 모든 화면에서 같은 색·라벨 | S4, S12, S19 |
| 버튼 | primary(구역당 1개) / secondary / ghost / danger(확인 대화상자 안에서만). 라벨은 동사+대상 | S8, S13 |
| 알림 | 오류는 관련 위치에 인라인, 페이지 결과는 본문 상단 배너. 토스트는 쓰지 않음(접근성) | S5, S8, S10 |
| 변경 불가 기록 | 편집 대신 새 판·수정본, 이력은 타임라인 | S9, S14, S25 |
| 문서(발행본) | 업무 화면 토큰과 분리해 인쇄물 서체·색을 유지 | 14차 결정 |
| 학교 홈페이지 그림 (116차) | 사진 자리(표지·구역 사진·카드·사진 줄·갤러리·소식 표지)는 실제 사진. 생성·스케치·수채화로 바꾼 그림은 디자인 요소로만: 안내 띠 장식 그림(`cta`의 `asset`, 대체 글 없음)과 성품 동화 | 2026-11-25 선생님 결정 |
| 접근성 | WCAG 2.2 AA: 대비, 포커스 표시, 24px 이상 대상, 건너뛰기 링크, sticky 막대가 포커스를 가리지 않게 `scroll-padding-top` | S19 |

## 컴포넌트 (`src/components/ui.tsx`)

`PageHeader`, `Steps`, `StatusBadge`, `Banner`, `EmptyState`, `Card`, `Kpi`, `Meter` + 셸의 `SchoolSwitcher`, `Nav`. 입력: `Field`·`Switch`(`Field.tsx`), `FileDrop`(아래 '입력·파일 첨부').
`DataTable`(`src/components/DataTable.tsx`, 29차 자동 실행): 서버 화면이 셀(`cells`)과 정렬 값(`sort`)을 넘긴다. 정렬 가능한 열은 머리 버튼으로 오름 ↔ 내림 정렬하고, 현재 열에만 `aria-sort`를 붙인다. 한국어 순서와 자연 정렬(9 < 10)을 쓰고, 빈 값은 맨 뒤에 두며, 같은 값은 원래 순서를 지킨다(`src/lib/table-sort.ts`). 행이 없으면 안내 문장을 보인다. `densityControl`이면 촘촘히·기본·넉넉히를 고를 수 있다. 화면 형식별 행 높이 토큰을 따른다.
`ConfirmDialog`·`useConfirm()`(`src/components/ConfirmDialog.tsx`, 자동 실행): 브라우저 `confirm()` 대신 쓴다. `if (!(await ask({ title, description, confirmLabel }))) return;` 형식이다. Radix Dialog로 포커스를 가두고 Esc·바깥 누르기로 닫는다. 처음 포커스는 '취소'에 두고, 닫으면 연 버튼으로 돌려준다. 되돌리기 어려운 일은 `tone: 'danger'`(기본, danger 버튼은 이 안에서만), 일반 확인은 `'primary'`. 설명에는 무엇이 남고 무엇을 되돌릴 수 있는지 적는다.
CSS 클래스: `.btn .btn-primary|secondary|ghost|danger .btn-sm`, `.badge[data-tone]`, `.count-badge`, `.grid-table`(+`.table-wrap`, `th scope`, `.num`), `.summary-list`, `.timeline`, `.tabs`, `.toolbar`, `.kpis`.
이전 클래스(`.primary`, `.tag.green` 등)는 같은 토큰으로 이어 두었다. 새 화면은 새 클래스를 쓴다.

## 입력·파일 첨부 (37차)

사용자 요청(2026-11-23): 관리 화면의 파일 첨부는 끌어 놓기로, 입력 칸은 최신 모양으로. 공개 홈페이지(`/s/**`)·시안(`/preview/*`)은 대상이 아니다.

| 항목 | 규칙 |
| --- | --- |
| 파일 첨부 | **모든 파일 첨부는 `FileDrop`**(`src/components/FileDrop.tsx`). 끌어 놓기 · 눌러 고르기(단추, Enter/Space) · 붙여넣기(Ctrl+V) · 여러 파일 · 형식·크기 검사(`src/lib/file-check.ts`의 `checkFiles`) · 올리는 중 진행 막대와 취소 · 그림 미리보기 · 결과 글자 표시(✓ 올림 / 실패). 상태는 `role=status` aria-live로 읽어 준다. 화면이 `<input type=file>`을 직접 그리지 않는다 |
| 업로드 진행 | 진행률이 필요하면 `uploadWithProgress`(XHR). `fetch`를 쓰면 `ctx.signal`만 넘겨 취소를 살리고 막대는 '올리는 중'으로 오간다 |
| 검사 위치 | 브라우저 검사는 안내용이다. 서버 검사(매직 바이트·PDF 검사, PLATFORM-PATTERNS 2)를 대신하지 않는다 |
| 입력 한 칸 | `Field`(`src/components/Field.tsx`): 위쪽 라벨 · 필수 `*`(+ 화면낭독기 '필수') · 도움말 · 오류(아이콘 + 문장, `aria-invalid`·`aria-describedby`) · 글자 수. 라벨이 입력을 감싸고(글자 수는 라벨 밖), 오류는 칸 바로 아래, 색만으로 알리지 않는다. **`required` 칸은 `Field`로**(날 `<label>`에 `required`만 두면 화면에 `*`가 없다) |
| 켜기/끄기 | 즉시 켜지고 꺼지는 설정은 `Switch`(체크박스 + `role=switch`, 손잡이 위치로도 구분). 여러 개 중 고르기는 체크박스, 하나만 고르기는 라디오 |
| 기본 모양 | 전역 CSS가 select 화살표, 체크(✓ 모양)·라디오(가운데 점), 숫자(스피너 없이 ↑↓ 키·고정폭 숫자), 날짜(흐린 달력 단추, 다크에서 달력 창도 어둡게), 검색(돋보기·지우기)을 의미 토큰으로 그린다. 새 화면은 따로 꾸미지 않아도 된다 |
| 특이성 | 전역 input·select·textarea 기본 규칙은 `:where()`(특이성 0). 화면별 크기·배치 규칙은 클래스 하나로 이긴다 |
| 크기 | 입력 높이는 `--control-h`(학사형 40 · 분석형 34 · 촘촘히 32). 터치 기기(`pointer: coarse`)는 화면 형식·밀도와 관계없이 44px, 체크·스위치를 감싼 줄도 44px, 라벨 없이 놓인 체크·라디오는 24px(WCAG 2.5.8), 표 행 동작 select도 44px |
| 초점 | 입력은 주 색 테두리 + 연한 고리, 체크·라디오·스위치는 2px 바깥선 |

## 도구 (ADR 0005)

아이콘 lucide-react, 메뉴·대화상자 Radix UI, 서체 Pretendard(동적 부분 집합). 방향 후보는 전체 관리 → 디자인 방향에서 비교한다.

## 다음 단계 (아직 하지 않음)

- 다크·고대비 테마(토큰 값은 보고서 §5.1에 초안 있음)
- DataTable 확장(필터·저장된 보기·일괄 작업 — 정렬·빈 상태·밀도는 완료), 보조 패널(근거·이력)
- 자동 접근성 검사(axe)를 E2E에 추가, 교사·행정 직원 대상 사용성 시험(본문 16px·레일 짧은 이름의 이해도 확인)
- 명령 팔레트(Ctrl+K)는 1차 근거를 찾지 못해 보류
