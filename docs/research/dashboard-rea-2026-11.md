# 업무 시스템 대시보드 구조 조사 — 학교 플랫폼 레이아웃 원형 비교용

조사일: 2026-11-22 · 범위: 색이 아닌 **구조**(탐색, 그리드, 타이포그래피, 밀도, 상호작용) · 대상 화면: 한국어 UI, Next.js

---

## 0. 조사 방법과 한계

- **웹 페이지 직접 열람은 모두 막혔다.** 이 세션의 네트워크 정책 때문에 krds.go.kr, design-system.service.gov.uk, carbondesignsystem.com, experience.sap.com, vercel.com, linear.app는 DNS 단계에서 차단됐다. 다른 사이트도 같은 이유로 열리지 않을 것으로 보고 더 시도하지 않았다.
- **수치의 1차 출처는 각 디자인 시스템이 npm에 공개한 토큰·CSS 패키지다.** 패키지를 내려받아 실제 토큰 값을 읽었고, 판 번호는 7절에 적었다. 웹 문서보다 오히려 정확한 출처다(실제 배포되는 값).
- **제품 화면(Linear, Stripe, Notion 등)은 검색 결과 요약에 기댔다.** 공식 도움말·변경 기록 위주로 골랐다. 수치가 확인되지 않은 항목은 "확인 필요"로 표시했고, 수치를 지어내지 않았다.
- "계산값"은 공개 토큰(안쪽 여백 + 행간)을 더해 낸 값이다. 실제 렌더링 높이와 1~2px 차이가 날 수 있다.
- 시각 자산(로고, 아이콘, 일러스트, 독점 서체)은 가져오지 않는다. 구조 원칙만 참고한다.

---

## 1. 공개 디자인 시스템 수치 기준표 (1차 출처: npm 토큰 패키지)

| 시스템 | 기본 서체(토큰) | 본문 크기/행간 | 타입 스케일(px) | 간격 단위 | 컨트롤·행 높이 | 탐색·패널 폭 | 본문 최대 폭·그리드 |
|---|---|---|---|---|---|---|---|
| **KRDS** (krds-uiux 1.1.0) | Pretendard GOV | 17px / 1.5 (루트 62.5%→1rem=10px) | 본문 13·15·17·19, 제목 15·17·19·24·32·40, 디스플레이 36·44·60 (PC) | 2·4·6·8·10·12·16·20·24…px 단계(number-1~21) | 표 본문 상하 12px·좌우 16px + 17px 글자 → 약 50px(계산값). 표 머리 상하 8px, 15px | 왼쪽 탐색–본문 간격 64px(PC). 측면 탐색 폭 확인 필요 | 콘텐츠 1200px(감싸개 1248px), 좌우 여백 PC 24px·모바일 16px. 분기점 360/768/1024/1280/1440 |
| **GOV.UK** (govuk-frontend 6.6.0) | GDS Transport(정부 전용) | 19px / 25px | 16·19·24·27·36·48·80 (태블릿 이상) | 5px 단계: 5·10·15·20·25·30·40·50·60 | 표 셀 상하 10px·오른쪽 20px, 19px(작은 화면 16px), 숫자 칸 tabular → 약 45px(계산값) | 서비스 탐색(service-navigation) 상단 가로형 | 페이지 960px, 거터 30px, 열 비율 1/4·1/3·1/2·2/3·3/4·전체. 분기점 320/641/769 |
| **IBM Carbon** (@carbon/layout 11.63, @carbon/type 11.71, @carbon/styles 1.120) | IBM Plex Sans / Plex Mono | 14px / 1.43(body-01), 16px / 1.5(body-02) | 12·14·16·18·20·24·28·32·36·42·48·54… | 8px "mini unit". 간격 2·4·8·12·16·24·32·40·48·64·80·96·160 | 데이터 표 행 24·32·40·48·64(xs~xl). 기본값 lg 48px은 문서 기준(확인 필요) | 상단 셸 48px, 측면 탐색 256px, 접힌 레일 48px | 2x 그리드: sm 4열 / md 8열 / lg·xlg·max 16열. 분기점 320/672/1056/1312/1584 |
| **Atlassian** (@atlaskit/tokens 20.14) | Atlassian Sans(전용) | 14px / 20px | 제목 12·14·16·20·24·28·32 (굵기 600~653) | 8px 기준: 2·4·6·8·12·16·20·24·32·40·48·64·80 | 확인 필요 | 확인 필요 | 확인 필요 |
| **Fluent 2** (@fluentui/tokens) | Segoe UI | 14px / 20px(body1) | 10·12·14·16·20·24·28·32·40·68 | 2·4·6·8·10·12·16·20·24·32 | 확인 필요 | 확인 필요 | 확인 필요 |
| **Material 3** (@material/web 2.5) | Roboto(토큰 참조) | body-medium 14/20, body-large 16/24 | 11·12·14·16·22·24·28·32·36·45·57 | 확인 필요 | 확인 필요 | 내비게이션 레일 80px, 서랍 360px | 확인 필요 |
| **Shopify Polaris** (@shopify/polaris-tokens 9.4) | Inter | 데스크톱 body-md 13px / 20px, 작은 화면 16/24 | 11·12·13·14·16·18·20·22·24·30·32·36·40 | 4px 기준(space-100=4px) | 표 셀 여백 6px → 13/20 글자 기준 약 32px(계산값) | 확인 필요 | 분기점 490/768/1040/1440 |
| **GitHub Primer** (@primer/primitives 11.10, @primer/react 38.46) | Mona Sans / 시스템 서체 | body-medium 14px / 1.5 | 12·14·16·20·32·40 (제목 600) | 4px 기준 | 컨트롤 24·28·32·40·48 | PageLayout 측면 창 240~320px(분기점별), 크기 조절 가능 | 콘텐츠 폭 full / 768 / 1012 / 1280px |
| **SAP Fiori Horizon** (@sap-theming/theming-base-content 11.36) | "72"(SAP 전용) | 14px / 1.5 | 12·14·16, 제목 14·16·20·24·32·48 | 확인 필요 | **Cozy** 행 44px·컨트롤 36px / **Compact** 행 32px·컨트롤 26px / Condensed 22px | 셸 여백 S 8px, M·L 32px, XL 48px | 유연 열 레이아웃(FCL) 2열 67/33, 3열 25/50/25 |
| **Salesforce SLDS** (@salesforce-ux/design-system 2.264) | 시스템 서체 | 13px / 1.5 | 10·12·13·14·16·18·20·24·28·32·42 | 2·4·8·12·16·24·32·48px | 표 셀 4px 8px → 약 28px(계산값). 터치 대상 44px | 앱 탐색 막대(context bar) 40px, 고정 머리 32px | 템플릿 거터 12px |
| **Workday Canvas** (@workday/canvas-tokens-web 5.0) | Sana Sans(전용) / Roboto, 모노 IBM Plex Mono | body-md 18px, body-sm 16px, subtext 10·12·14 | 제목 24·28·32, 타이틀 40·48·56 | 확인 필요 | 확인 필요 | 확인 필요 | 분기점 320/768/1024/1440 |
| **Instructure UI (Canvas LMS)** (@instructure/ui-themes 11.7) | Lato | 16px / 1.5 | 12·14·16·22·28·38, 페이지 제목 36(모바일 32) | 2·4·8·12·16·24·36·48·60 | 입력 28·38·48px | 확인 필요 | 확인 필요 |
| **Grafana** (@grafana/data 13.3) | Inter / Roboto Mono | 14px / 22px | 12·14·18·22·24·28 | 8px gridSize | 대시보드 그리드 높이 단위 30px(AWS 관리형 Grafana 문서) | 확인 필요 | 패널 그리드 24열 |
| **Vercel Geist** | Geist Sans / Geist Mono (OFL 1.1) | copy-14가 가장 흔한 본문 스타일. 14/20은 비공식 자료(확인 필요) | label·copy·heading·button 계열 크기 이름 클래스 | 확인 필요 | 확인 필요 | 크기 조절·숨김 가능한 측면 탐색 | 확인 필요 |

### 기준표에서 읽히는 경향

1. **업무용 본문은 13~14px, 공공·학습용 본문은 16~19px으로 갈린다.** 고밀도 업무 도구(SLDS 13, Polaris 13, Carbon·Fluent·Atlassian·Primer·Grafana 14)와 시민·학습자용(Canvas LMS 16, KRDS 17, Workday 18, GOV.UK 19)이 뚜렷이 나뉜다.
2. **밀도는 "행 높이 단계"로 표현한다.** Carbon 24/32/40/48/64, SAP 44/32/22, Salesforce 넉넉함·중간·조밀(조밀은 정보 밀도 30% 증가), Airtable 4단(Short~Extra Tall). 단계는 3~5개다.
3. **셸 높이는 40~50px에 모인다.** Carbon 48, SLDS 탐색 막대 40, 이 저장소의 현재 상단 막대 48. 측면 탐색은 240~360px이다(Primer 240~320, Carbon 256, Material 서랍 360, 레일 48~80).
4. **간격 단위는 4px 또는 8px이 표준이다.** 예외는 GOV.UK(5px)이고, KRDS는 2px 단위로 촘촘하게 시작한다.
5. **숫자 정렬(tabular figures)을 명시하는 곳은 GOV.UK 표가 대표적이다.** 성적·통계 표에서 반드시 챙겨야 할 항목이다(4절 서체 검증 참고).

---

## 2. 카테고리별 레퍼런스

### 2.1 학사·교육 행정

#### Canvas LMS (Instructure UI)
- **탐색 구조:** 모든 페이지 왼쪽에 전역 탐색이 있다(대시보드, 과목, 계정). 과목 안에서는 과목 탐색이 하나 더 붙어 **2단 왼쪽 탐색**이 된다. 과목 탐색 항목은 교사가 보이기·숨기기를 정한다.
- **레이아웃:** 대시보드는 기관이 카드 보기, 목록 보기(할 일 일정), 최근 활동 중 하나를 기본으로 정한다. 과목 카드에는 공지·과제·토론·파일 바로가기 아이콘이 최대 4개 붙고, 순서와 표시 여부는 과목 탐색 설정을 따른다. 과목 홈은 최근 활동, 첫 페이지, 모듈, 과제 목록, 강의계획서 중 하나로 정한다.
- **타이포그래피:** Lato 16px, 행간 1.5. 크기 12·14·16·22·28·38, 굵기 300·400·700(ui-themes 토큰).
- **밀도:** 학습자용이라 넉넉하다. 입력 높이 28·38·48px, 카드 안쪽 여백 12·16·24px.
- **상호작용:** 보기 전환(옵션 메뉴), 읽지 않은 항목 표시 점, 할 일 목록.
- **학교 플랫폼에 맞는 점:** "학교 → 수업(과목) 맥락 → 수업 안 탭" 2단 탐색이 교사의 머릿속 구조와 같다. 카드에 바로가기를 붙이는 방식은 담당 수업이 적은 교사에게 좋다.
- **안 맞는 점:** 카드 보기는 수업이 많아질수록(행정 직원, 학년부장) 금방 비효율적이 된다. 2단 탐색이 화면 폭을 많이 차지한다.

#### PowerSchool (SIS + PowerTeacher Pro)
- **탐색 구조:** 시작 페이지 왼쪽 메뉴가 중심이다. 23.5판의 향상된 UI(EUI)에서 탐색 메뉴, 빠른 검색, 즐겨찾기, 사용자 정의 링크가 추가됐다. 관리자는 교사 기록을 찾은 뒤 왼쪽 패널에서 교사 화면으로 들어간다.
- **레이아웃:** PowerTeacher Pro는 왼쪽 탐색, 위쪽 가운데 학급·그룹 선택, 오른쪽 위 만들기·알림·도움말·사용자 메뉴로 이뤄진 **업무형 셸 + 성적부 격자**다.
- **타이포그래피·밀도:** 확인 필요(공개 토큰 없음).
- **상호작용:** 학생 검색 후 기록으로 들어가기, 학급 선택기로 맥락 바꾸기, 즐겨찾기.
- **맞는 점:** "학급 선택기 + 격자" 조합은 성적 입력에 바로 쓸 수 있는 형태다.
- **안 맞는 점:** 고전 화면과 새 화면의 메뉴 위치가 달라 교육청마다 쪽 위치 안내표를 만들 정도로 학습 비용이 크다. 메뉴 깊이를 늘리지 말아야 한다는 교훈을 준다.

#### Google Classroom
- **탐색 구조:** 홈은 수업 카드 격자이고, 위쪽에 할 일(학생: 할당됨·누락·완료)과 교사용 검토할 항목이 있다. 수업 안에는 스트림·수업 과제·사람·성적 탭이 있다. 탭 이름은 현재 판 기준 확인 필요.
- **레이아웃:** 카드마다 일주일 안에 마감되는 과제가 최대 3개 보인다. 할 일은 기한 없음·이번 주·다음 주·나중으로 묶인다.
- **타이포그래피·밀도:** 확인 필요. 디자인 기반은 Material 계열로 추정되지만 확인하지 못했다.
- **맞는 점:** "카드 = 수업, 탭 = 수업 안 작업"이 단순하다. 마감 기준 묶음은 교사의 주간 업무에 잘 맞는다.
- **안 맞는 점:** 행정 기능(학적, 규칙, 발행)을 담을 구조가 없다. 학교 단위 관리 화면으로는 부족하다.

#### Infinite Campus (새 화면)
- **탐색 구조:** 예전의 여러 줄 탭과 깊은 개요 트리를 없애고, **통합 검색**(학생·수업·가구 + "도구" 검색), 즐겨찾기, 최근 항목, 이동 경로로 바꿨다. 주 메뉴는 메뉴 항목별 도구를 평평한 목록으로 펼치는 방식으로 바꿀 수 있다. 2527 판(6월)부터 새 화면이 고전 화면을 완전히 대체했다.
- **타이포그래피·밀도:** 확인 필요.
- **맞는 점:** 메뉴가 수백 개인 학사 시스템에서 **검색을 1차 탐색으로** 삼은 사례다. 학교 플랫폼의 기능이 늘어날 때 따라갈 방향이다.
- **안 맞는 점:** 검색 중심 탐색은 처음 쓰는 사람이 무엇이 있는지 모르는 문제(발견성)가 남는다. 즐겨찾기와 평평한 메뉴로 보완해야 한다.

#### 한국 나이스(4세대 NEIS)
- 2023년 6월 21일 개통했다. 개통 직후 접속 오류, 다른 학교 시험지가 인쇄되는 사고, 개인정보 노출 문제가 보도됐다(교사 응답자 96.8%가 접속 오류 경험).
- **화면 구조(메뉴 체계, 즐겨찾기, 검색)는 공개 자료로 확인하지 못했다. 확인 필요.**
- **학교 플랫폼 시사점:** 구조 참고보다 **데이터 경계 사고 사례**로 가치가 크다. 학교 간 출력·조회가 섞이면 안 된다는 이 저장소의 규칙(RLS, 학교 ID를 소속에서 정함)과 정확히 맞닿는다. 사전 시연 없이 개통한 것이 문제로 지적됐으므로, 시안을 합성 자료로 먼저 보여 주는 이 저장소의 원칙을 뒷받침한다.

### 2.2 개발·업무 도구

#### Linear
- **탐색 구조:** 접을 수 있는 왼쪽 사이드바(`[` 키), 오른쪽 클릭·끌어 놓기로 항목을 고친다(2024-12 개인화 사이드바). 명령 메뉴 Cmd/Ctrl+K는 지금 보는 화면 기준으로 명령 묶음의 순서를 바꾼다.
- **레이아웃:** 목록·보드 전환(Cmd/Ctrl+B). 받은 편지함은 2열(왼쪽 목록, 오른쪽 상세). **Peek**은 스페이스 바로 이슈를 열지 않고 오른쪽에 미리 본다.
- **타이포그래피:** 본문은 Inter, 제목은 Inter Display. 2026-03 개편에서 사이드바 아이콘을 줄이고 비활성 글자를 흐리게 하고 세로 여백을 늘렸다. px 값은 확인 필요.
- **밀도:** 밀도 설정은 공식 문서에서 찾지 못했다(확인 필요). 표시 옵션(Shift+V)으로 묶기·정렬·표시 속성을 고르고, 보기별로 저장하거나 작업 공간 기본값으로 정한다.
- **상호작용:** 단축키 중심. Shift+Opt+O 정렬, Shift+Opt+G 묶기. 받은 편지함·분류함(triage)은 정렬만 바꿀 수 있다.
- **맞는 점:** "보기 = 저장된 필터 + 묶기 + 정렬"은 질문함, 마감 대기 수업 같은 학교 업무 대기열에 그대로 옮길 수 있다. Peek은 원본 행이나 질문 검토에 좋다.
- **안 맞는 점:** 단축키를 모르면 기능의 절반이 숨는다. 교사 대부분은 키보드 중심 사용자가 아니다. 어두운 테마·낮은 대비 경향은 접근성 검토가 필요하다.

#### Vercel 대시보드 (Geist)
- **탐색 구조:** 예전의 가로 탭을 **크기 조절·숨김이 되는 왼쪽 사이드바**로 옮겼고, 지금은 모든 사용자의 기본값이다. "필터로서의 프로젝트"는 팀 단위 화면과 프로젝트 단위 화면을 한 번에 오간다. 전환기로 팀을 바꾸지 않고 프로젝트를 옮겨 다니고, 여러 팀의 프로젝트를 즐겨찾기한다.
- **타이포그래피:** Geist Sans는 화면·본문용, Geist Mono는 코드·표 자료용, 둘 다 SIL OFL 1.1이다(한글 글리프는 없음). 스타일은 Tailwind 클래스(text-label-14, text-copy-14, text-heading-24 등)로 크기·행간·자간·굵기를 한 번에 정한다. 메뉴에는 label, 본문에는 copy를 쓴다. 정확한 px 값은 확인 필요.
- **맞는 점:** "범위(팀↔프로젝트) = 필터"는 "전체 관리 ↔ 한 학교" 전환과 같은 구조다. 플랫폼 관리자 화면에 바로 쓸 수 있다.
- **안 맞는 점:** 범위 전환을 URL·클라이언트 상태로만 구현하면 이 저장소의 규칙 3(학교 ID는 소속에서 정함)과 부딪힌다. 표시용 상태로만 쓰고 서버가 소속을 다시 검증해야 한다.

#### GitHub (Primer)
- **탐색 구조:** 전역 상단 머리 → 저장소 이름 아래 밑줄 탭(UnderlineNav) → 설정 화면은 왼쪽 NavList. 트리 탐색(TreeView)도 있다.
- **레이아웃:** PageLayout과 SplitPageLayout. 측면 창은 분기점에 따라 240~320px이고 끌어서 폭을 바꾼다. 콘텐츠 폭은 full / 768 / 1012 / 1280px 네 단계다.
- **타이포그래피:** 본문 14px/1.5, 제목 16·20·32 semibold, 캡션 12px.
- **밀도:** 컨트롤 24·28·32·40·48px. 굵은 포인터(터치)일 때 최소 대상 44px, 가는 포인터일 때 16px로 바뀐다(size-coarse / size-fine 토큰).
- **상호작용:** SelectPanel(검색 가능한 다중 선택), 빈 상태(Blankslate), 대화상자, DataTable.
- **맞는 점:** **입력 장치에 따라 밀도를 바꾸는 토큰**은 교실 태블릿과 교무실 PC를 함께 지원하는 데 좋다. 콘텐츠 폭 4단계는 쪽 종류별 폭 규칙의 본보기다.
- **안 맞는 점:** 개발자용 어휘와 정보 구조(저장소 중심)는 그대로 옮길 수 없다.

#### Sentry
- **탐색 구조:** 새 탐색(2025)에서 좁은 화면에서 답답했던 사이드바를 다시 짰고, **이슈 보기(Issue Views)** 를 정식 출시했다. 이슈 보기는 프로젝트·기간·환경 필터, 검색어, 정렬을 묶어 저장한 것이다.
- **레이아웃:** 이슈 스트림 행 어디를 눌러도 열린다. 이슈 상세는 정보 위계와 단계적 공개를 원칙으로 다시 설계했고, 이동 경로(breadcrumbs)는 시간순 타임라인으로 보여 준다.
- **타이포그래피·밀도:** 확인 필요.
- **맞는 점:** "저장된 보기 = 필터 묶음"이 질문함·오류 대기열 구조로 그대로 옮겨 온다. 타임라인은 원본 행·판 이력(정정 판이 이전 판을 가리킴)을 보여 주는 데 알맞다.
- **안 맞는 점:** 예전에 기본 필터를 드롭다운으로 바꿨을 때 사용자가 혼란을 겪었다. 저장된 보기만 두고 기본 보기를 숨기면 안 된다.

### 2.3 엔터프라이즈·분석

#### SAP Fiori (런치패드, 밀도 모드)
- **탐색 구조:** 모든 화면 위에 셸 막대(검색, 알림, 사용자 메뉴). 런치패드는 **공간 → 페이지 → 섹션 → 타일**의 4단 구조이고, 공간 하나에 페이지가 하나 이상 있다.
- **타일:** 2×2(기본), 4×2(넓음), 2×1(납작함), 4×1(납작하고 넓음). 기본 크기는 반응형이고, 관리자가 모든 타일을 작은 크기로 바꿀 수 있다. 예전 표준 타일은 너비 12rem·높이 14rem(SAP 커뮤니티 답변). 176px 같은 px 고정값은 확인하지 못했다.
- **레이아웃:** 유연 열 레이아웃(FCL)은 1열(599px 미만), 2열(599~1023px, 67/33 등), 3열(1023px 초과, 25/50/25). SAP는 **처음부터 3열로 시작하지 말라**고 권한다.
- **타이포그래피:** "72" 14px, 행간 1.5. 제목 14·16·20·24·32·48.
- **밀도:** Cozy(터치) 행 44px·컨트롤 36px, Compact(마우스) 행 32px·컨트롤 26px, Condensed 22px(표 전용).
- **맞는 점:** **밀도 모드를 입력 장치 기준으로 정하는 원칙**이 명확하다. FCL은 목록 → 상세 → 하위 상세로 이어지는 학적·성적 확인 흐름에 맞는다.
- **안 맞는 점:** 런치패드 타일은 기능이 많을 때 "앱 보관함"이 되기 쉽다. 학교 플랫폼처럼 기능이 적고 흐름이 이어진 경우에는 과하다.

#### Workday (Canvas Kit)
- **탐색 구조:** 모든 페이지 왼쪽에 항상 보이는 전역 탐색 사이드바. 아이콘에 올리면 범주별 대시보드·앱이 나온다. 홈 가운데 큰 검색창이 있고, 홈을 떠나면 페이지 머리 위로 돌아간다.
- **레이아웃:** 홈은 카드 묶음이다(처리할 일, 추천, 공지, 빠른 작업, 상위 앱). 상위 앱은 20개에서 4개로 줄었다. 관리자가 홈 카드를 더하고 빼고 순서를 바꾼다.
- **타이포그래피:** body-md 18px, body-sm 16px로 업무 도구치고 크다. 모노는 IBM Plex Mono(토큰).
- **맞는 점:** **"처리할 일" 카드를 홈 맨 위에** 두는 구조는 교사·행정 직원 홈에 그대로 쓸 수 있다. 관리자가 홈 카드를 구성하는 방식은 학교 관리자 설정과 같다.
- **안 맞는 점:** 카드가 늘어나면 홈이 공지 게시판처럼 된다. 앱을 20개에서 4개로 줄인 사례가 그 교훈이다.

#### Stripe 대시보드
- **탐색 구조:** 왼쪽 사이드바 첫 묶음은 잔액·거래·고객·상품이다. 2024-05 개편에서 거래·상품·고객 위쪽 탐색을 바꿨다. **바로가기**에 고정한 쪽과 최근 방문한 쪽이 함께 보인다.
- **레이아웃:** 목록 → 상세, 이동 경로로 목록에 돌아온다(전체 화면 앱 지침).
- **저장된 보기:** 공식 자료로 확인하지 못했다(확인 필요). 상태 필터 칩은 제3자 분석에만 나온다.
- **타이포그래피·밀도:** 확인 필요.
- **맞는 점:** "고정 + 최근" 바로가기는 메뉴 즐겨찾기보다 가볍다.
- **안 맞는 점:** 결제 도메인에 맞춘 쪽 구성이라 구조 원칙만 참고한다.

#### Grafana
- **레이아웃:** 대시보드는 **24열 격자**이고, 패널마다 x·y·w·h를 격자 단위로 저장한다. 높이 한 단위는 30px(AWS 관리형 Grafana 문서). 빈 공간이 있으면 패널이 위로 올라간다(음의 중력). 예: `{x:0, y:0, w:12, h:9}`.
- **타이포그래피:** Inter 14px/22px, 크기 12·14·18·22·24·28, 코드 Roboto Mono 14/16(@grafana/data). 간격 단위 8px.
- **상호작용:** 맨 위 시간 범위·변수 선택기가 모든 패널에 한꺼번에 적용된다. 패널 편집, 행 접기.
- **맞는 점:** **전역 필터(학기·학년·수업) 하나가 모든 위젯을 움직이는** 구조는 학교 통계 화면에 맞다. 격자 좌표를 저장하는 방식은 학교 관리자가 화면을 구성하는 데 쓸 수 있다.
- **안 맞는 점:** 자유 배치는 학교마다 화면이 달라져 지원·교육 비용이 커진다. 통계 모집단은 수업 id와 마감 판으로 확정되어야 하므로(ADR 0004), "실시간 지표" 위젯이 확정 전 값을 확정처럼 보이게 할 위험이 있다.

#### Salesforce Lightning (SLDS)
- **탐색 구조:** 전역 머리 아래 앱별 탐색 막대(40px). 앱 실행기(App Launcher)는 타일 격자이고 끌어서 순서를 바꾼다.
- **타이포그래피:** 본문 13px, 행간 1.5, 제목 10·12·14·18·24·28.
- **밀도:** 넉넉함(라벨이 필드 위), 중간(조밀함과 같되 줄 간격만 넓음), 조밀함(라벨이 필드 옆, 줄 간격 좁음, 정보 밀도 30% 증가). 관리자가 조직 기본값을 정하고, 사용자가 자기 값으로 바꾸며, 관리자는 사용자 선택을 덮어쓰지 못한다.
- **표:** 셀 4px·8px, 첫 칸·끝 칸 24px 여백(cell-buffer), 고정 머리 32px. 인라인 편집 표 변형이 있다.
- **맞는 점:** **밀도를 "조직 기본값 + 사용자 선택"으로 정하는** 권한 모델이 학교(관리자 기본값)와 교사(개인 선택) 관계와 같다. 폼 라벨 위치를 밀도에 묶는 아이디어도 좋다.
- **안 맞는 점:** 13px 본문은 한글에서 작다(한글은 같은 px에서 라틴 문자보다 빽빽하게 보인다). 한국어 화면이라면 14px 이상을 권한다.

### 2.4 문서·워크스페이스

#### Notion
- **탐색 구조:** 왼쪽 쪽 트리(작업 공간 → 쪽 → 하위 쪽). 데이터베이스 보기(표, 보드, 목록, 타임라인, 달력 등)가 쪽 안에 들어간다.
- **레이아웃:** 쪽 폭은 기본 / 전체 폭 두 가지, 쪽마다 바꾼다. 작은 글씨 켜기·끄기가 있다(데스크톱·웹만). 데이터베이스 쪽은 오른쪽 세부 정보 창을 열고 닫는 맞춤 배치가 있고, 그 배치는 데이터베이스 전체 쪽에 적용된다.
- **상호작용:** 표·보드·목록·타임라인의 항목은 기본으로 **측면 미리보기**(side peek, 오른쪽)로 열린다. 보기마다 측면 / 가운데 / 전체 쪽 중에 고를 수 있다. 슬래시 명령으로 블록을 넣는다.
- **px 값:** 확인 필요.
- **맞는 점:** "쪽 = 문서, 그 안에 보기가 박힘"은 학교 규칙·양식 작성(설명 글 + 관련 자료 표)에 알맞다. 측면 미리보기는 목록을 잃지 않고 상세를 본다.
- **안 맞는 점:** 자유 편집 모델은 **확정 규칙·발행본을 고치지 않는다는 규칙(규칙 4·5)** 과 정반대다. 확정본은 읽기 전용 스냅샷으로, 편집은 "새 판 초안"으로만 해야 한다. 측면 미리보기는 본문이 여러 열이면 오른쪽 열을 가린다.

#### Airtable
- **레이아웃(인터페이스 디자이너):** 레코드 검토(왼쪽 목록에서 고르면 오른쪽에 상세. 이제 예전 방식으로 분류되고 표 배치를 권장), 레코드 상세, 대시보드(관리자용 개요), 목록·갤러리·칸반·달력·타임라인 시각화.
- **밀도:** 격자 보기 행 높이 4단(Short, Medium, Tall, Extra Tall). Short가 새 보기의 기본값이고 가장 조밀하다. 행 높이를 올리면 셀 글자, 첨부 썸네일, 연결 레코드 토큰이 더 많이 보인다. 머리 행 높이는 바뀌지 않고, 내용에 맞추는 자동 행 높이는 없다.
- **px 값:** 확인 필요.
- **맞는 점:** "같은 자료, 여러 보기"와 행 높이 단계 전환은 원본 행·명단 화면에 알맞다. 레코드 검토는 질문·충돌 처리 3단 구조의 원형이다.
- **안 맞는 점:** 스프레드시트처럼 자유롭게 고치는 기대를 만든다. 마감 판·원본 행은 수정하지 못하므로 **편집할 수 있는 칸과 없는 칸을 색만이 아닌 아이콘·글로도** 구분해야 한다.

#### Coda
- **탐색 구조:** 왼쪽 쪽 목록(쪽·하위 쪽). 왼쪽 위 아이콘으로 숨기고, 숨긴 뒤에는 왼쪽 가장자리에 마우스를 올려 연다.
- **레이아웃:** 쪽이 기본 편집면(캔버스)이다. 표·버튼·설명 상자·글을 옆으로 나란히 놓는 열, 표처럼 배치하는 격자가 있다. 표는 바탕 표와 보기(달력, 타임라인, 카드, 상세)로 나뉜다. 문서 지도(Doc map)에서 모든 표와 보기를 한눈에 본다.
- **px 값:** 확인 필요.
- **맞는 점:** **"바탕 표 하나 + 보기 여러 개 + 문서 지도"** 는 이 저장소의 id 참조 원칙(규칙 7)과 잘 맞는 정신 모형이다. 보기는 원본을 복제하지 않는다.
- **안 맞는 점:** Notion과 같은 자유 편집 문제가 있다. 공식 도움말 일부가 Superhuman 도메인으로 옮겨져 출처가 흔들린다.

---

## 3. 가로질러 보이는 구조 원칙

1. **탐색은 "전역 → 맥락 → 쪽 안" 3층이다.** 전역(학교·영역), 맥락(수업·학급·명단), 쪽 안(탭·보기). Canvas, PowerSchool, GitHub, SAP 모두 같다. 층마다 다른 형태(레일, 사이드바, 탭)를 쓰면 혼동이 줄어든다.
2. **메뉴가 깊어지면 검색과 명령 메뉴가 1차 탐색이 된다.** Infinite Campus("도구" 검색), Linear(Cmd+K), SAP(셸 검색), Workday(홈 가운데 검색).
3. **"저장된 보기 = 필터 + 묶기 + 정렬"이 공통 단위다.** Linear 표시 옵션, Sentry 이슈 보기, Airtable 보기, Coda 보기.
4. **상세는 목록을 지우지 않고 옆에 연다.** Linear Peek, Notion 측면 미리보기, SAP FCL, Airtable 레코드 검토, Linear 받은 편지함 2열.
5. **밀도는 3~5단계로, 조직 기본값 + 개인 선택으로 정한다.** Salesforce 권한 모델, SAP 입력 장치 기준, Primer 굵은/가는 포인터 토큰.
6. **홈은 "처리할 일"이 먼저다.** Workday 처리할 일, Classroom 할 일·검토할 항목, Canvas 할 일 목록.
7. **시민·학습자용은 단일 열 + 큰 본문.** GOV.UK 2/3 열·19px, KRDS 1200px·17px.

---

## 4. 서체 검증 (이번 조사에서 직접 확인)

npm 배포본 글꼴 파일을 fontTools로 열어 OpenType 기능과 숫자 폭을 확인했다.

| 서체 | 출처·판 | 라이선스 | `tnum`(고정폭 숫자) | 기본 숫자 폭 | 메모 |
|---|---|---|---|---|---|
| Pretendard | pretendard 1.3.9 | SIL OFL 1.1 | **있음** | **비례폭**(숫자마다 폭이 다름) | 표·성적에는 `font-variant-numeric: tabular-nums` 필수. `zero`, `case`, `ss01~16`, `cv01~13` 있음. 가변 글꼴 굵기 45~920 |
| IBM Plex Sans KR | @fontsource/ibm-plex-sans-kr 5.3.0 | OFL 1.1 | 부분 집합에 없음 | **고정폭**(모든 숫자 600/1000) | 기본 상태로 숫자 열이 맞는다. 굵기 단계는 확인 필요 |
| Noto Sans KR | @fontsource/noto-sans-kr 5.3.1 | OFL 1.1 | 부분 집합에 없음 | **고정폭**(555/1000) | 세로쓰기(`vert`) 지원 |
| JetBrains Mono | @fontsource/jetbrains-mono 5.3.0 | OFL 1.1 | 해당 없음(모노) | 고정폭 | 한글 없음. 학번·코드·id 표시용 |
| Geist Sans/Mono | vercel/geist-font | OFL 1.1 | 확인 필요 | 확인 필요 | 한글 없음. 라틴 숫자 보조용 |
| Pretendard GOV | KRDS 지정 서체 | Pretendard 저장소 배포(OFL로 추정, 확인 필요) | 확인 필요 | 확인 필요 | KRDS 디자인 자산에 필요 |
| SUIT, Noto Serif KR, IBM Plex Mono | — | OFL로 알려져 있음(이번에 직접 확인하지 못함) | 확인 필요 | 확인 필요 | npm의 `suit`는 다른 프로그램이라 확인에 쓸 수 없었다 |

**결론:** 현재 쓰는 Pretendard는 유지하되 숫자 칸에 tabular-nums를 강제해야 한다. 숫자가 주인공인 통계 화면이라면 기본 숫자가 고정폭인 IBM Plex Sans KR이 대안이다.

---

## 5. 학교 플랫폼용 8가지 레이아웃 원형

공통 전제(모든 원형):
- 이 저장소의 현재 기본값은 48px 상단 막대(로고·학교 전환기·계정), 묶음형 왼쪽 탐색, 표 행 40px(조밀 32 / 넉넉 48), Pretendard, 본문 14px, 4px 간격이다(docs/design/DESIGN-SYSTEM.md). 아래 원형은 이 값에서 **얼마나 멀어지는지**로 읽으면 된다.
- 학교 전환기·범위 필터는 **표시 상태일 뿐**이다. 서버는 로그인 사용자의 소속에서 학교를 정한다(규칙 3).
- 확정 규칙·양식·발행본·마감 판은 어떤 원형에서도 **읽기 전용 + "새 판 만들기"** 로 보인다(규칙 4·8).
- 한글 본문은 라틴 문자보다 빽빽하게 보이므로 업무 화면에서도 14px 이하로 내리지 않는다. 13px은 보조 글(메타, 캡션)에만 쓴다.

### A. 학사 업무형 (전역 레일 + 수업 맥락 탐색)
- **참고:** Canvas LMS, PowerSchool, Google Classroom
- **탐색:** 왼쪽 전역 레일(64~80px, 아이콘 + 짧은 라벨: 홈·수업·학생·문서·관리) → 수업을 고르면 두 번째 열에 수업 탐색(200~240px: 개요·명단·평가·성적·자료) → 쪽 안 탭. 상단 48px에 수업·학기 선택기.
- **그리드:** 콘텐츠 최대 1200px, 12열, 거터 24px. 홈은 "처리할 일" 목록 + 수업 카드(3~4열).
- **서체:** Pretendard 15px/1.6 본문, 제목 18·20·24·28(600). 숫자 tabular-nums.
- **밀도:** 표 행 44px 기본, 조밀 36px. 터치 대상 44px(교실 태블릿).
- **대표 상호작용:** 수업 카드의 마감 임박 항목(최대 3개), 수업 전환기, 수업별로 보이는 탭 설정.
- **잘 맞는 사용자:** 교사(담당 수업 1~10개), 담임.
- **위험:** 2단 탐색이 폭을 차지한다(1280px 미만이면 수업 탐색을 접어야 함). 행정 직원처럼 수업이 많은 사용자에게는 카드가 비효율적이다.

### B. 명령·목록형 고밀도 (Linear형)
- **참고:** Linear, Vercel, Sentry
- **탐색:** 접을 수 있는 왼쪽 사이드바 240px(`[`로 접기): 내 작업 · 저장된 보기 · 영역별 묶음. Cmd/Ctrl+K 명령 메뉴는 지금 화면 기준으로 명령 순서를 바꾼다. 이동 경로는 상단 한 줄.
- **그리드:** 전체 폭 목록, 열 고정 없음. 오른쪽 Peek 창 420~480px(스페이스로 열고 닫기).
- **서체:** Pretendard 14px/1.5, 메타 13px, 제목 16·20(600). id·학번은 JetBrains Mono 13px.
- **밀도:** 목록 행 36px(조밀 32 / 넉넉 40), 간격 4px.
- **대표 상호작용:** 표시 옵션(묶기·정렬·표시 속성) 저장, 키보드 이동(j/k, Enter, Space), 여러 줄 선택 후 일괄 작업.
- **잘 맞는 사용자:** 플랫폼 관리자, 학교 관리자, 행정 실무 담당자.
- **위험:** 단축키를 모르면 기능이 숨는다(모든 단축키에 화면 버튼 짝이 있어야 함). 조밀한 목록에서 상태를 색 점만으로 표시하기 쉽다(규칙 5 UI 검토 항목).

### C. 런치패드 타일형 (SAP·Salesforce·Workday 홈)
- **참고:** SAP Fiori 런치패드, SLDS 앱 실행기, Workday 홈 카드
- **탐색:** 상단 셸 막대(48px: 검색·알림·계정)만 두고 왼쪽 탐색은 없다. 홈 = 섹션별 타일 격자(학사·평가·문서·학교 관리). 타일 안에 숫자 배지(대기 3건).
- **그리드:** 타일 단위 격자(2×2 기본, 4×1 납작하고 넓음), 섹션 사이 48px, 최대 1440px.
- **서체:** Pretendard(또는 SUIT, 라이선스 확인 뒤) 14px 본문, 타일 제목 16px(600), 배지 숫자 24~28px tabular-nums.
- **밀도:** 홈은 넉넉하게, 들어간 뒤 업무 화면은 행 40px.
- **대표 상호작용:** 관리자가 역할별 타일 묶음(공간·페이지)을 구성한다. 사용자는 순서만 바꾼다.
- **잘 맞는 사용자:** 가끔 쓰는 사용자(교장·교감, 행정 직원의 드문 업무), 처음 쓰는 학교.
- **위험:** 기능이 적으면 타일이 앱 보관함처럼 비어 보이고, 많으면 찾기 어렵다(Workday가 앱을 20개에서 4개로 줄인 사례). 타일을 거치는 왕복이 매번 클릭 하나를 더 만든다.

### D. 분석 대시보드형 (Grafana·Stripe형)
- **참고:** Grafana, Stripe 홈, Carbon 2x 그리드
- **탐색:** 상단에 **전역 필터 막대**(학기·학년·수업·마감 판 선택)를 고정하고, 왼쪽 사이드바는 대시보드 목록만 둔다.
- **그리드:** 24열 패널 격자, 높이 단위 30px(Grafana 방식) 또는 16열(Carbon). 상단에 지표 타일 4개(각 6열), 아래 차트 12+12, 표 24열.
- **서체:** IBM Plex Sans KR(기본 숫자가 고정폭) 14px/1.5, 지표 숫자 28~32px(600), 축·범례 12px. 보조 모노 IBM Plex Mono.
- **밀도:** 패널 안쪽 여백 16px, 패널 사이 8px.
- **대표 상호작용:** 필터 하나가 모든 패널에 적용된다. 패널 → 원본 표로 내려가기. 각 숫자 옆에 "어느 마감 판 기준인지" 표시.
- **잘 맞는 사용자:** 학교 관리자(학업 성취 현황), 플랫폼 관리자(학교별 사용 현황, 학교끼리 섞이지 않게).
- **위험:** 통계 모집단 키는 수업 id와 마감 판이다(규칙 8). 확정 전 값을 확정 지표처럼 보이면 안 된다. 여러 학교 합계 화면은 개인정보 공개 범위가 넓어지므로 실행 전에 확인해야 한다. 자유 배치를 허용하면 학교마다 화면이 달라진다.

### E. 문서 워크스페이스형 (Notion·Coda형)
- **참고:** Notion, Coda, GitHub 설정 쪽 NavList
- **탐색:** 왼쪽 쪽 트리 260px(규칙집 → 장 → 조항, 양식 → 판). 숨김 가능하고 가장자리에 마우스를 올리면 열린다. 오른쪽 정보 창 300px(판 이력, 근거 자료, 질문).
- **그리드:** 본문 폭 720px(읽기)과 전체 폭(표가 있을 때)을 쪽마다 고른다. 블록 단위 배치.
- **서체:** 업무 UI는 Pretendard 14px. **문서 본문은 Noto Serif KR 16~17px/1.75**로 인쇄물 느낌을 준다(현재 디자인 시스템이 발행본 서체를 업무 화면과 분리하는 결정과 맞음).
- **밀도:** 문서 본문은 넉넉하게, 문서 안에 박힌 표는 행 36px.
- **대표 상호작용:** 슬래시 명령으로 블록 넣기, 본문 안 자료 보기(원본 표를 복제하지 않고 id로 참조), 측면 미리보기, 판 비교.
- **잘 맞는 사용자:** 학교 관리자·교무 담당(학업성적관리규정, 평가 계획, 양식 작성).
- **위험:** 자유 편집 모델과 보존 규칙(규칙 4·5)이 충돌한다. 확정본에는 편집 커서를 아예 두지 않고 "새 판 초안"으로만 편집해야 한다. 발행본은 반드시 스냅샷을 렌더링해야 한다.

### F. 공공서비스 단일 열형 (GOV.UK·KRDS형)
- **참고:** GOV.UK Design System, KRDS
- **탐색:** 상단 서비스 이름 + 가로 서비스 탐색, 이동 경로, 한 쪽에 한 가지 일. 왼쪽 탐색은 없다(안내 문서형 쪽만 왼쪽 쪽 안 탐색).
- **그리드:** 본문 2/3 열(960px 기준 약 640px) + 오른쪽 1/3 보조. KRDS 기준이라면 1200px에 좌우 여백 24px.
- **서체:** Pretendard(또는 KRDS 지정 Pretendard GOV) **17px/1.5**(KRDS 본문 중간). 제목 24·32·40(700). 표는 tabular-nums.
- **밀도:** 표 행 약 48~50px(KRDS 계산값), 컨트롤 48px 이상.
- **대표 상호작용:** 작업 목록(task list)으로 단계와 진행 상태 보기, 요약 목록(summary list)으로 "확인 후 제출", 오류 요약을 맨 위에 두기, 단계 표시기.
- **잘 맞는 사용자:** 보호자·학생(규칙 9가 열린 뒤), 가끔 쓰는 교직원의 신청·제출, 발행본 열람.
- **위험:** 업무 반복 작업에는 클릭이 너무 많다. 학생·보호자 역할은 기존 표 전체의 RLS를 점검하기 전에 열면 안 된다(규칙 9).

### G. 데이터 그리드형 (Airtable·Carbon 표·SAP 목록 보고서)
- **참고:** Airtable 격자 보기, Carbon 데이터 표, SAP 목록 보고서, SLDS 인라인 편집 표
- **탐색:** 왼쪽 사이드바는 좁게(접힌 레일 48px), 위쪽에 표 탭(명단·성적·출결 등 "보기") + 보기 막대(필터·정렬·행 높이·열 숨기기).
- **그리드:** 전체 폭, 첫 열(이름) + 학번 열 고정, 머리 고정(32~40px), 가로 스크롤.
- **서체:** Pretendard 14px + tabular-nums(또는 IBM Plex Sans KR 14px), 머리 13px(600). 학번·id는 JetBrains Mono.
- **밀도:** 행 높이 4단 24 / 32 / 40 / 48px(Carbon xs~lg와 Airtable 4단 참고). 기본 32px. 셀 여백 좌우 8px.
- **대표 상호작용:** 칸 안에서 바로 편집(초안 판에서만), 붙여 넣기로 여러 칸 입력, 열 단위 필터, 보기 저장, 이상값 강조(색 + 아이콘).
- **잘 맞는 사용자:** 교사(성적 입력), 행정 직원(명단·원본 행 대조).
- **위험:** 마감 판·원본 행은 수정·삭제할 수 없다(규칙 4·8). 편집할 수 있는 칸과 없는 칸, 초안과 확정의 차이를 색 외의 단서로 분명히 해야 한다. 조밀한 행은 24px 대상 기준(WCAG 2.2)에 걸릴 수 있으므로 24px 단계는 읽기 전용 보기에만 쓴다.

### H. 3단 작업함(triage)형 (받은 편지함 · 레코드 검토 · FCL)
- **참고:** Linear 받은 편지함·분류함, Sentry 이슈 스트림, Airtable 레코드 검토, SAP FCL 25/50/25
- **탐색:** 1단(220~260px) 대기열 목록(새 질문·자료 충돌·마감 대기·검토 요청과 개수) → 2단(320~400px) 항목 목록 → 3단(나머지) 상세 + 처리 동작.
- **그리드:** 1280px 이상에서 3단, 1024~1279px에서 2단(1단이 서랍으로), 1024px 미만은 1단 + 쌓기. SAP 권고대로 **처음에는 2단으로 시작**한다.
- **서체:** Pretendard 14px, 목록 제목 14px(600), 메타 13px. 상세의 근거 자료는 15px.
- **밀도:** 목록 항목 56~64px(두 줄: 제목 + 메타), 상세는 넉넉하게.
- **대표 상호작용:** j/k로 다음 항목, 처리하면 다음 항목으로 자동 이동, 결정 이유 입력, 판 타임라인(정정 판이 이전 판을 가리킴, Sentry 이동 경로 타임라인 참고).
- **잘 맞는 사용자:** 학교 관리자·교무 담당(규칙 6에 따라 자료 충돌로 열린 질문 처리), 플랫폼 관리자(학교 개설·오류 신고 처리).
- **위험:** 1280px 미만 노트북에서 세 단이 답답하다. 한 번에 한 항목만 보이므로 묶어서 처리할 때는 G형으로 넘어가는 길이 필요하다. 질문을 닫는 동작이 확정 규칙을 조용히 바꾸면 안 된다(질문 결과는 새 판으로).

---

## 6. 원형 비교표

| 축 | A 학사 업무형 | B 명령·목록형 | C 런치패드 타일형 | D 분석 대시보드형 | E 문서 워크스페이스형 | F 공공서비스 단일 열형 | G 데이터 그리드형 | H 3단 작업함형 |
|---|---|---|---|---|---|---|---|---|
| 1차 탐색 | 전역 레일 + 수업 탐색 | 접이식 사이드바 + Cmd+K | 홈 타일 | 전역 필터 막대 | 쪽 트리 | 상단 서비스 탐색 + 이동 경로 | 보기 탭 + 보기 막대 | 대기열 목록 |
| 상세 여는 방식 | 쪽 이동 | 오른쪽 Peek | 쪽 이동 | 패널에서 내려가기 | 측면 미리보기 | 쪽 이동(한 쪽 한 일) | 칸 편집 / 행 펼침 | 3단 상세 |
| 본문 크기 | 15px | 14px | 14px | 14px(숫자 28~32) | UI 14 / 문서 16~17 | 17px | 14px | 14px |
| 기본 행 높이 | 44px | 36px | 40px(업무 화면) | 패널 단위 | 36px(박힌 표) | 48~50px | 32px | 56~64px(두 줄) |
| 밀도 단계 | 2단 | 3단 | 홈 고정 | 고정 | 문서 고정 | 고정(넉넉) | 4단 | 2단 |
| 본문 최대 폭 | 1200px | 전체 | 1440px | 전체(24열) | 720px / 전체 | 약 640px(2/3) | 전체 | 전체(3단) |
| 추천 서체 | Pretendard | Pretendard + JetBrains Mono | Pretendard / SUIT | IBM Plex Sans KR + Plex Mono | Pretendard + Noto Serif KR | Pretendard(GOV) | Pretendard(tnum) + JetBrains Mono | Pretendard |
| 정보 밀도 | 중간 | 높음 | 낮음 | 중간~높음 | 낮음~중간 | 낮음 | 매우 높음 | 중간 |
| 학습 비용 | 낮음 | 높음(단축키) | 매우 낮음 | 중간 | 중간 | 매우 낮음 | 중간 | 중간 |
| 주 사용자 | 교사 | 플랫폼·학교 관리자 | 가끔 쓰는 교직원 | 학교·플랫폼 관리자 | 교무 담당 | 보호자·학생·제출자 | 교사·행정 직원 | 학교 관리자·교무 |
| 대표 업무 | 수업 운영, 평가 | 대기열·설정 관리 | 기능 찾기 | 성취·사용 현황 | 규칙·양식 작성 | 신청·열람 | 성적 입력, 명단 대조 | 질문·충돌 처리 |
| 태블릿 적합성 | 좋음 | 낮음 | 좋음 | 중간 | 중간 | 매우 좋음 | 낮음 | 낮음 |
| 접근성 주의점 | 2단 탐색 키보드 순서 | 단축키 대체 버튼, 색 점 | 타일 라벨 | 차트 대체 표 | 블록 포커스 | 거의 없음(기준 원형) | 24px 대상, 편집 가능 표시 | 단 사이 포커스 이동 |
| 데이터 경계 주의점 | 수업 전환기 ≠ 권한 | 범위 필터 ≠ 학교 ID | 역할별 타일 노출 | 학교 간 합계, 마감 판 표기 | 확정본 편집 금지 | RLS 점검 전 공개 금지(규칙 9) | 마감 판·원본 행 읽기 전용 | 질문 처리 = 새 판 |
| 현재 기본값과의 거리 | 가까움 | 가까움 | 멂 | 중간 | 중간 | 멂 | 가까움 | 중간 |
| Next.js 구현 난이도 | 중간 | 중간~높음(명령 메뉴, 키 처리) | 낮음 | 높음(격자, 차트) | 높음(블록 편집기) | 낮음 | 높음(가상 스크롤, 편집) | 중간(병렬 경로로 단 구성) |

### 조합에 대한 메모

- 원형은 하나만 고를 필요가 없다. **역할별 홈은 다르게, 셸은 하나로** 가는 것이 실제 제품들의 공통점이다. 예: 셸 = B(사이드바 + Cmd+K), 교사 홈 = A의 처리할 일 + 수업 카드, 성적 = G, 질문함 = H, 규칙·양식 = E, 보호자·학생 = F.
- 비교 시안을 만든다면 차이가 분명한 넷을 먼저 권한다: **A(학사) · B(고밀도 목록) · F(공공 단일 열) · H(작업함)**. C·D·E·G는 특정 화면 유형으로 붙인다.
- 밀도는 SLDS처럼 **학교 기본값 + 개인 선택**으로, SAP·Primer처럼 **입력 장치 기준 기본값**을 함께 쓰는 것이 이 저장소의 `data-density` 구조와 맞는다.

---

## 7. 출처

### 1차 출처(npm 공개 패키지, 이번 조사에서 내려받아 값을 읽음)
- KRDS: krds-uiux 1.1.0 — https://www.npmjs.com/package/krds-uiux
- GOV.UK: govuk-frontend 6.6.0 — https://www.npmjs.com/package/govuk-frontend
- IBM Carbon: @carbon/layout 11.63.0, @carbon/type 11.71.0, @carbon/styles 1.120.0 — https://www.npmjs.com/package/@carbon/layout · https://www.npmjs.com/package/@carbon/type · https://www.npmjs.com/package/@carbon/styles
- Atlassian: @atlaskit/tokens 20.14.0 — https://www.npmjs.com/package/@atlaskit/tokens
- Microsoft Fluent 2: @fluentui/tokens 1.0.0-alpha.24 — https://www.npmjs.com/package/@fluentui/tokens
- Material 3: @material/web 2.5.0 — https://www.npmjs.com/package/@material/web
- Shopify Polaris: @shopify/polaris-tokens 9.4.2 — https://www.npmjs.com/package/@shopify/polaris-tokens
- GitHub Primer: @primer/primitives 11.10.0, @primer/react 38.46.0 — https://www.npmjs.com/package/@primer/primitives · https://www.npmjs.com/package/@primer/react
- SAP: @sap-theming/theming-base-content 11.36.5 — https://www.npmjs.com/package/@sap-theming/theming-base-content
- Salesforce: @salesforce-ux/design-system 2.264.3 — https://www.npmjs.com/package/@salesforce-ux/design-system
- Workday: @workday/canvas-tokens-web 5.0.0 — https://www.npmjs.com/package/@workday/canvas-tokens-web
- Instructure(Canvas LMS): @instructure/ui-themes 11.7.10 — https://www.npmjs.com/package/@instructure/ui-themes
- Grafana: @grafana/data 13.3.1, @grafana/schema 13.3.1 — https://www.npmjs.com/package/@grafana/data
- 서체: pretendard 1.3.9, @fontsource/ibm-plex-sans-kr 5.3.0, @fontsource/noto-sans-kr 5.3.1, @fontsource/jetbrains-mono 5.3.0 — https://www.npmjs.com/package/pretendard · https://github.com/orioncactus/pretendard

### 2차 출처(검색 결과 요약으로 확인. 이 세션에서는 직접 열지 못함)
- KRDS 디자인 자산에 Pretendard GOV 필요 — https://krds.go.kr/html/eng/resource/resource.html
- SAP 런치패드 공간·페이지 — https://www.sap.com/design-system/fiori-design-web/v1-139/foundations/integration-and-services/sap-fiori-launchpad/sap-fiori-launchpad-spaces
- SAP 타일 크기 — https://www.sap.com/design-system/fiori-design-web/v1-139/ui-elements/tile/usage · https://community.sap.com/t5/technology-q-a/how-to-change-size-of-standard-fiori-tiles/qaq-p/323281
- SAP 유연 열 레이아웃 — https://www.sap.com/design-system/fiori-design-web/v1-142/page-types/page-layouts/flexible-column-layout/usage · https://sap.github.io/ui5-webcomponents/nightly/components/fiori/FlexibleColumnLayout
- Salesforce 밀도 — https://developer.salesforce.com/blogs/2018/08/new-density-settings-for-the-lightning-experience-ui-in-winter-19 · https://developer.salesforce.com/docs/platform/lwc/guide/data-display-density.html
- Workday 홈·전역 탐색 — https://doc.workday.com/admin-guide/en-us/manage-workday/user-experience/people-experience/home-page/faq--workday-home.html · https://modernization.wsu.edu/2022/09/02/updates-to-global-navigation-display/ · https://kb.lynn.edu/x/hgKtBg
- Grafana 그리드 — https://docs.aws.amazon.com/grafana/latest/userguide/dashboard-json-model.html · https://grafana.com/docs/grafana/latest/dashboards/json-model/
- Stripe — https://support.stripe.com/questions/dashboard-update-may-2024 · https://docs.stripe.com/dashboard/basics · https://docs.stripe.com/stripe-apps/patterns/full-page-apps
- Linear — https://linear.app/docs/display-options · https://linear.app/docs/peek · https://linear.app/changelog/2024-12-18-personalized-sidebar · https://linear.app/changelog/2026-03-12-ui-refresh · https://linear.app/now/how-we-redesigned-the-linear-ui · https://linear.app/changelog/2019-10-07-contextual-command-menu
- Vercel·Geist — https://vercel.com/changelog/dashboard-navigation-redesign-rollout · https://vercel.com/changelog/new-dashboard-navigation-available · https://vercel.com/geist/typography · https://vercel.com/font
- Sentry — https://sentry.io/changelog/new-nav-issue-views-ga · https://sentry.io/changelog/issue-stream-ui-enhancements · https://sentry.io/changelog/new-issue-details-ui-now-available/ · https://sentry.io/changelog/improved-breadcrumbs-on-issues
- Canvas LMS — https://community.canvaslms.com/docs/DOC-10164 · https://www.usu.edu/teach/help-topics/canvas/dashboard-customization · https://www.umt.edu/canvas/tip-sheets/files/course-navigation-and-settings-tip-sheet.pdf
- PowerSchool — https://helpdesk.csdnb.org/help/article/321908 · https://schoolsupport.strongmind.com/hc/en-us/articles/26211060870420-PowerSchool-Enhanced-User-Interface · https://powerschoolsupport.sccharter.org/powerteacher-pro
- Google Classroom — https://support.google.com/edu/classroom/answer/6020284 · https://9to5google.com/2020/08/11/google-classroom-fall-2020/
- Infinite Campus — https://kb.infinitecampus.com/help/try-the-new-look-of-campus · https://columbus.atlassian.net/wiki/spaces/SC/pages/3495591990/New+Look+Of+Infinite+Campus
- 4세대 나이스 — https://m.boannews.com/html/detail.html?idx=119561
- Notion — https://www.notion.com/help/layouts · https://notion.com/help/customize-and-style-your-content · https://www.notion.com/releases/2022-07-20
- Airtable — https://support.airtable.com/docs/interface-layout-record-review · https://support.airtable.com/docs/airtable-grid-view · https://support.airtable.com/docs/interface-layouts
- Coda — https://intercom.help/coda/en/articles/75123-pages · https://help.superhuman.com/hc/en-us/articles/46210143294605-Create-connected-table-views · https://help.superhuman.com/hc/en-us/articles/46210192420365-Align-page-content-in-columns

### 확인하지 못한 항목(다음 조사 때 직접 열람 필요)
- 4세대 나이스 화면 구조 전반
- Linear·Stripe·Notion·Airtable·Coda·Sentry의 px 단위 행 높이와 서체 크기
- Geist 타입 스타일의 정확한 px 값
- Carbon 데이터 표 기본 크기, KRDS 측면 탐색 폭
- SUIT·Noto Serif KR·IBM Plex Mono·Pretendard GOV의 라이선스 원문과 tnum 지원
- 직접 열람하려면 krds.go.kr, design-system.service.gov.uk, carbondesignsystem.com, experience.sap.com, vercel.com, linear.app을 세션 네트워크 허용 목록에 추가해야 한다.
