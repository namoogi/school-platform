# 학교 홈페이지 템플릿 — 조사와 설계 초안 (2026-11-25)

- 상태: **조사·정리** (설계 초안, 채택 전). 관제에 넘겨 ADR·차시로 이어 간다.
- 범위: 56차 문서의 사용자 대기열 항목 "학교 홈페이지 템플릿(형식 정리·둘러보기·선택·AI 자동 배치·기존 사이트 크롤링 이전)".
- 작성: 자동 개발 세션(사용자 지시, 2026-11-25). 코드·DB 변경 없음.
- 표기: **[사실]** 코드나 출처로 확인한 것. **[제안]** 이 문서의 설계 의견. **[확인 필요]** 확인하지 못한 것.

## 1. 지금 있는 것 [사실, 코드 기준 main 2c58477]

| 층 | 지금 | 위치 |
| --- | --- | --- |
| 테마 | `campus`·`dawn` 두 가지. 사이트 설정의 한 칸(`site_settings.theme`) | `src/lib/site.ts`, `(app)/site/SiteClient.tsx` |
| 디자인 토큰 | 새벽빛은 `--dawn-*` 색·`--dawn-fs-*` 글자 단계(52차) | `globals.css`, `docs/design/DAWN-SYSTEM.md` |
| 쪽 구성 | 항목(쪽·소식·동화) → 판(jsonb `Content`) → 공개 기록 | ADR 0008 |
| 블록 | heading·text·notice·image·gallery·video·story_page·section·news_list·download | `site-shared.ts` |
| 구역 템플릿(칸) | `section.template` 10가지: text, media-left/right, banner, cards, photos, facts, steps, quote, cta | `SECTION_TEMPLATES` |
| 구역 모양(배치) | `section.variant` 12가지. **새벽빛만** 쓰고 다른 테마는 무시 | `SECTION_VARIANTS`, ADR 0008 42차 |
| 가져오기 | 옛 사이트 **내보내기 묶음**(`rung-arun-export/1`)을 시안으로 변환. 순수 함수, 모두 시안, 덮어쓰지 않고 새 판 | `site-import.ts` |
| 외부 에이전트 | 범위 토큰으로 쪽·소식·동화 만들기·고치기(ADR 0012~0022) | `docs/agents/README.md` |
| 화면 편집 | 관리 화면 안 '화면에서 고치기'(53차) | `(app)/site/edit/[id]` |

빠진 것:
- '템플릿'이 **사이트 단위로 묶여 있지 않다.** 테마는 색·글꼴만 바꾼다. 쪽 묶음(사이트맵), 첫 화면 구역 순서, 표본 글이 테마와 따로 논다.
- 모양(variant) 이름이 새벽빛 전용이다. ADR 0008이 다시 검토할 조건으로 적어 둔 "다른 학교가 새벽빛을 쓰거나 모양을 고르게 할 때"가 이번 일이다.
- 가져오기는 룽아룬숙사 내보내기 형식 하나만 받는다. 일반 웹사이트 주소에서 가져오는 길은 없다.

## 2. 바깥 조사 [사실, 출처는 끝에]

### 2.1 학교 홈페이지 업체 (미국)
- **Finalsite:** 정해진 디자인 체계를 가진 테마(단순한 탐색, 표준 쪽 종류)와 맞춤 디자인을 나눠 판다. 디자인 예시 모음으로 다른 학교가 모듈을 어떻게 쓰는지 보여 준다. 이전할 때는 옛 사이트를 그대로 옮기지 말고 다시 짜라고 권한다(옛 사이트 자료 분석 → 새 사이트맵 → 내용 이전 계획). 사용자 평에는 "예시가 계약 전엔 맞춤 템플릿인지 밝히지 않는다"는 지적이 있다(한 건, 일화).
- **Apptegy(Thrillshare):** 브랜드 테마와 이전 지원을 사람(고객 담당)이 해 준다는 후기가 많다. 템플릿 대응 방식은 공개 자료에서 찾지 못했다 [확인 필요].
- **대학 이전 사례:** 옛 쪽을 가장 가까운 새 템플릿에 자동 배치하는 방식과, 빈 틀 템플릿에서 다시 만드는 방식, 두 갈래를 두고 고르게 한다.

### 2.2 일반 사이트 빌더
- **WordPress:** `theme.json`이 디자인 토큰(색·글자·간격)의 한 원본이다. **패턴**(미리 짠 블록 묶음)은 따로 두고 테마가 목록으로 묶는다.
- **Shopify:** **JSON 템플릿**은 "어떤 구역을 어떤 순서·설정으로" 적은 데이터 파일이다. 구역은 스키마와 프리셋을 가져야 편집기에서 더할 수 있다. 템플릿 하나에 구역 25개, 구역마다 블록 50개까지다.
- 두 곳 모두 **디자인 체계(토큰)와 배치(구역 목록)를 나눈다.** 그래서 코드를 모르는 사람도 쪽을 다시 배치할 수 있다.

### 2.3 'AI로 만들기'·'주소로 가져오기'
- 대부분의 AI 빌더는 글 설명이나 짧은 질문지로 새 사이트를 만든다. 주소를 넣어 기존 사이트를 읽는 기능은 일부에만 있다.
- 주소 가져오기는 보통 넣은 한 쪽이나 주 메뉴에 걸린 쪽(개수 제한)만 읽는다. 로그인 뒤 내용, 누른 뒤에야 나오는 내용은 못 읽는다. 업체 스스로도 이름·소개 글 같은 사실은 지어내거나 섞일 수 있다고 적는다.
- 업체 안내도 **자기 사이트나 허락받은 사이트만** 가져오라고 한다.
- 이 절의 출처는 대부분 업체 홍보 글이다. 품질을 독립적으로 시험한 자료는 찾지 못했다.

### 2.4 템플릿 시장 (Envato ThemeForest 등)
- 교육 테마는 한 상품 안에 데모를 여러 벌 넣어 판다. 판매 1위로 표시된 Eduma는 데모 39벌 이상을 한 번에 가져오게 하고, 강의 장터·어학원·대학·유치원처럼 **학교 유형별로** 나눈다. 다른 상품도 유치원·초중고·대학 단위로 홈 화면을 여러 벌(예: 홈 15벌, 구역 30여 개) 둔다.
- 자주 나오는 기능은 교사 소개, 반·과정 쪽, 시간표·학사일정이다. 강의 판매(LMS) 쪽으로 기운 상품이 많다(Masterstudy·Edubin). 이 플랫폼은 강의 판매가 목적이 아니므로 그 부분은 참고하지 않는다.
- 판매 수·가격은 캐시된 목록 기준이라 대략값이다.
- **라이선스 주의:** ThemeForest 상품의 디자인·코드를 플랫폼 템플릿으로 옮겨 여러 학교에 나눠 주는 것은 일반 라이선스 범위를 넘는다고 보는 편이 안전하다 [확인 필요: Envato 라이선스 조항]. 그래서 시장 자료는 **유형 분류와 구역 구성만** 참고하고, 디자인은 이 플랫폼의 토큰으로 새로 만든다.

### 2.5 학교 홈페이지 실무 조언 (업체 블로그)
- 첫 화면이 답해야 할 것: 어떤 학교인가, 몇 학년·누구를 받는가, 무엇을 배우나, 어떻게 입학하나, 어디로 연락하나. 학년·대상이 안 보이면 방문자가 떠난다는 지적이 있다.
- 모든 쪽에 **문의·방문·지원** 단추를 고정해 두라는 조언이 반복된다. 지원이 주 단추, 방문(견학)이 보조 단추다. '지원하기' 하나만 두면 전환을 잃는다는 지적도 있다. 후원 단추도 잘 쓰인다.
- 입학 쪽에는 단계별 절차·주요 날짜·지원 방법을 한곳에 둔다. 문의 양식은 3~6칸.
- 첫 화면에 소식·다가오는 일정·연락처·입학 안내 길을 둔다.
- 출처가 모두 업체라, 숫자(칸 수·단추 묶음)는 시험해 볼 출발점으로 본다.

## 3. 설계 초안 [제안]

### 3.1 '템플릿'을 세 층으로 나눈다 (업체 공통 구조를 따름)
| 층 | 무엇 | 저장 | 누가 바꾸나 |
| --- | --- | --- | --- |
| ① 테마(디자인 체계) | 색·글꼴·글자 단계·간격·모양 그리기 | 코드(CSS 토큰) + 테마 목록 | 플랫폼(차시) |
| ② 쪽 묶음(사이트 틀) | 쪽 목록·메뉴 순서·쪽마다 구역 순서·표본 글 | 코드 안 템플릿 데이터(JSON) | 플랫폼(차시). 학교 고유 템플릿은 나중(E3~E4) |
| ③ 내용 | 학교 글·사진 | 지금처럼 항목·판(jsonb) | 학교 |

- 템플릿 = ① 테마 하나 + ② 쪽 묶음 하나. 고르면 ②를 **그 학교의 시안 항목들로 복사**한다. 공개는 지금처럼 학교 관리자가 한다. 템플릿을 바꿔도 공개본·기존 판은 그대로다(AGENTS 4·5).
- **새 표·마이그레이션 없이** 시작할 수 있다. 쪽 묶음은 코드 안 데이터이고, 고르면 기존 쓰기 경로(항목 만들기·판 쌓기)를 탄다. 설계 유지보수 원칙에 맞춰 새 쓰기 경로를 따로 만들지 않는다.
- 모양(variant) 이름을 **테마 공통 이름**으로 정리한다. 테마마다 같은 이름을 자기 방식으로 그리고, 못 그리는 모양은 template 기본 배치로 내린다. ADR 0008의 다시 검토할 조건을 충족한다.

### 3.2 형식 정리 (첫 단계)
- 쪽 묶음 형식 `site-template/1`(가칭): `{ id, name, theme, audience, langs, pages: [{ key, title, menu, sort, blocks: [...] }], sample: true }`. 블록은 지금 `Content` 형식을 그대로 쓴다. 새 형식을 만들지 않는다.
- `validateContent`로 템플릿 데이터도 검사한다. 단위 시험에서 모든 템플릿이 통과해야 한다.
- 표본 글은 방문자 문장으로 쓰되 `[학교 이름]` 같은 자리 표시를 둔다. 공개 전 검사로 자리 표시가 남은 쪽은 공개하지 못하게 할지 정해야 한다(4절 결정 3).
- 처음 템플릿 후보는 3.7절 유형 분류에서 고른다.

### 3.3 둘러보기·선택
- 관리 화면 '홈페이지 → 템플릿'에 템플릿 카드를 둔다. 각 카드는 합성 학교 자료로 그린 **실제 렌더링 미리보기**를 보여 준다(그림 파일이 아니라 `SiteRenderer`로 그린다). Finalsite 평에서 지적된 "예시와 실제가 다름"을 피하려면, 미리보기는 고르면 받는 것과 같은 데이터로만 그린다.
- 고르기 = "이 틀로 시안 만들기". 이미 같은 key의 쪽이 있으면 덮어쓰지 않고 새 판으로 더하거나 건너뛰기를 고르게 한다(가져오기 규칙과 같음).
- 테마만 바꾸기는 지금처럼 설정 한 칸으로 남긴다. 내용은 그대로 두고 그리는 방식만 바뀐다.

### 3.4 AI 자동 배치
- 입력: 학교가 가진 자료(가져온 쪽, 올린 사진, 소개 글)와 고른 템플릿.
- 출력: 템플릿 구역 칸에 자료를 채운 **시안 판**. 공개하지 않는다.
- 경로 두 갈래 [제안 순서]
  - **A. 외부 에이전트 경로(지금 가능, 플랫폼 과금 없음):** 학교가 쓰는 Claude Code·Codex가 범위 토큰으로 시안을 만든다(ADR 0012~0022). 플랫폼 쪽에서는 "템플릿 채우기 지시문"을 'AI 연결 글'에 더하기만 하면 된다.
  - **B. 플랫폼 안 버튼(유료 API):** 관제 D-5('대화형 편집, Claude API 유료')와 같은 결정에 묶인다. 사용자 비용 원칙에 따라 무료로 지시문·비용 추정을 먼저 하고, 착수는 따로 승인받는다.
- 지킬 것: AI가 사실(연락처·학비·인원)을 지어내지 않게, 원문에 없는 사실 칸은 비워 두고 '관리자 메모' 구역에 "확인 필요"를 남긴다(DAWN-SYSTEM 규칙: 방문자 글에는 메모를 쓰지 않음).

### 3.5 기존 사이트 크롤링 이전
- 지금 있는 **내보내기 묶음 가져오기**(`site-import.ts`)를 일반화한다. 크롤러는 묶음을 만드는 앞단으로만 두고, 시안으로 바꾸는 일은 지금 변환기를 그대로 쓴다. 쓰기 경로를 하나로 유지하려는 것이다.
- 크롤러 위치 [제안]: 서버(Vercel 함수)가 아니라 **학교 쪽 도구**로 둔다. 외부 에이전트나 내려받아 돌리는 스크립트가 묶음 파일을 만들어 올린다. 이유는 셋이다.
  - 서버에서 남의 주소를 대신 받으면 SSRF·남용 위험이 있다.
  - Vercel 함수의 실행 시간 한도가 있다.
  - "자기 사이트만" 원칙을 사람이 확인하는 단계가 생긴다.
- 지킬 것
  - 소유 확인: 학교 관리자가 "우리 학교 사이트"임을 확인하는 칸. 가능하면 옛 사이트에 확인 문자열을 두는 방식도 검토한다.
  - `robots.txt`를 따르고 요청 간격을 둔다. 로그인 뒤 내용은 가져오지 않는다.
  - HTML은 받지 않는다(ADR 0008 결정 5). 글은 텍스트로, `<br>`은 줄바꿈으로, 표는 [확인 필요: 표 블록이 없음].
  - 그림은 5MB 이하만 받는다(ADR 0008 결정 6). 큰 영상은 주소로만 잇는다.
  - 개인정보: 옛 사이트의 교직원·학생 사진·이름은 시안으로만 들어오고, 공개 전 학교가 확인한다. 실제 학교 자료는 git에 넣지 않는다(AGENTS 독립 인프라).
- 쪽 대응: 대학 사례처럼 두 방식을 고르게 한다. (1) 옛 쪽을 가장 가까운 템플릿 쪽에 자동 배치(AI 자동 배치와 결합) (2) 빈 템플릿에 옛 글을 '참고 자료'로만 붙여 사람이 옮김.

### 3.7 유형 분류와 템플릿 제안
특정 나라 제도 대신 **방문자가 누구이고 무엇을 하러 오는가**로 나눈다. 시장 데모(2.4)의 학교 유형 분류와 업체 조언(2.5)의 방문자 과업을 합쳤다. 구역은 지금 있는 `section.template`·블록만 쓴다(새 블록 없음).

| # | 템플릿(가칭) | 맞는 학교 | 첫 방문자의 할 일 | 테마 | 쪽 묶음 |
| --- | --- | --- | --- | --- | --- |
| 1 | **새벽 이야기** | 작은 기숙·대안·선교 학교 | 학교의 결을 느끼고 입학·후원을 묻는다 | dawn | 소개·배움·생활·입학·소식·후원(숨은 쪽)·연락 |
| 2 | **입학 안내** | 사립·국제·신설 학교 | 대상·학비·절차를 보고 문의·견학·지원 | campus | 소개·과정·입학(절차·날짜·학비)·견학·자주 묻는 질문·연락 |
| 3 | **학교 소식판** | 지역 공립형·큰 학교 | 재학생 가정이 소식·일정·안내문을 찾는다 | campus | 소식·학사일정·안내문(내려받기)·교직원·연락 |
| 4 | **어린이 학교** | 유치원·초등 | 보호자가 하루 생활·안전·사진을 본다 | campus(밝은 색 세트) | 소개·하루 생활·반 소개·사진첩·입학·연락 |
| 5 | **배움 과정** | 방과후·어학·직업 과정, 홈스쿨 모임 | 과정을 비교하고 신청한다 | campus | 과정 목록(cards)·과정 쪽·교사 소개·신청·연락 |
| 6 | **한 쪽 학교** | 막 시작한 학교, 행사·캠프 | 한 화면에서 소개와 연락을 끝낸다 | dawn 또는 campus | 첫 화면 하나(구역 6~8개) |

첫 화면 구역 순서(제안, 지금 블록 이름으로)
- **공통 머리:** 학교 이름·대상(학년·학생 구분) 한 줄 → 주 단추(지원 또는 문의)·보조 단추(견학)를 모든 쪽 머리에 둔다. 단추는 `content.site`의 방문 단추를 넓혀 '문의·견학·지원' 세 개까지로 하자는 제안이다.
- 1 새벽 이야기: banner(대표 사진·한 줄) → facts(한눈에 보기) → media-left/right 교차(배움·생활) → quote(학생·보호자 목소리) → news_list(cards 3) → cta(입학·후원)
- 2 입학 안내: banner → facts(대상·학년·정원·학비 범위) → cards(과정 3) → steps(입학 절차) → quote → cta(문의·견학·지원)
- 3 학교 소식판: notice(긴급 알림) → news_list(list 6) → cards(바로가기: 일정·안내문·급식·연락) → download(이번 달 안내문) → facts(연락처)
- 4 어린이 학교: banner → steps(하루 생활) → photos → cards(반 소개) → cta(입학 상담)
- 5 배움 과정: banner → cards(과정 목록) → steps(신청 방법) → quote → cta(신청)
- 6 한 쪽 학교: banner → text → facts → photos → steps → cta → (연락)

첫 묶음 추천: **1 새벽 이야기 + 2 입학 안내 + 3 학교 소식판.** 1은 룽아룬숙사 판에서 바로 뽑을 수 있고, 2·3은 campus 테마로 서로 다른 방문자를 덮는다. 4~6은 같은 형식으로 데이터만 더하면 된다.

밖에서 가져오지 않는 것: 상용 테마의 디자인·그림·글(라이선스). 강의 판매·결제(이 플랫폼 범위 밖, 결제는 사람 승인 필요).

### 3.6 단계 제안
| 단계 | 내용 | DB 변경 | 비용 |
| --- | --- | --- | --- |
| T1 | 형식 정리: 쪽 묶음 형식, 모양 공통 이름, 템플릿 3개(3.7의 1·2·3), 머리 단추 세 개, 검사 시험 | 없음 | 없음 |
| T2 | 둘러보기·선택 화면, 시안 복사, E2E | 없음 | 없음 |
| T3 | AI 자동 배치 A(외부 에이전트 지시문) | 없음 | 없음 |
| T4 | 크롤링 이전: 묶음 형식 일반화(`site-export/1`), 학교 쪽 크롤러 스크립트, 소유 확인 | 소유 확인 기록이 필요하면 있음 | 없음 |
| T5 | AI 자동 배치 B(플랫폼 안 버튼) | 있을 수 있음 | **유료 API**(D-5와 함께 결정) |

## 4. 결정이 필요한 것 (관제에 올릴 후보)
1. **템플릿 저장 위치:** 코드 안 데이터(추천, T1~T3 마이그레이션 없음) / DB 표(학교 고유 템플릿·공유가 필요할 때).
2. **첫 템플릿 구성:** 3.7의 1·2·3(추천) / 6개 모두 / 1만 먼저.
3. **표본 글 자리 표시가 남은 쪽의 공개:** 막음(추천) / 경고만.
4. **크롤러 위치:** 학교 쪽 도구(추천) / 플랫폼 서버.
5. **AI 자동 배치 순서:** 외부 에이전트 경로 먼저(추천, 무료) / 플랫폼 안 버튼 먼저(유료, D-5).

## 5. 위험과 반대 근거
- **템플릿을 늘리면 테마마다 모양 그리기가 늘어난다.** 모양 이름 공통화는 테마 수 × 모양 수만큼 CSS·시험이 든다. 테마는 2개로 묶어 두고 템플릿(쪽 묶음)만 늘리는 편이 싸다.
- **업체들은 이전을 사람이 돕는다.** 자동 크롤링만으로 끝나는 이전은 업체 사례에서도 드물다. 자동 결과는 시안이고, 사람의 확인 단계가 본체라고 보는 편이 맞다.
- **AI 배치의 사실 오류.** 업체 스스로 경고한다(2.3). 사실 칸 비우기와 공개 전 확인 규칙이 없으면 잘못된 학비·연락처가 공개될 수 있다.
- **시장 데모를 닮게 만들 위험.** 유형·구역 구성만 참고하고 디자인·글·그림은 새로 만든다. 라이선스 조항은 따로 확인한다.
- **유형 분류는 이 문서의 판단이다.** 실제 학교 몇 곳에 맞춰 보며 고친다.

## 출처
- Finalsite: [template design portfolio](https://www.finalsite.com/school-websites/template-design-portfolio) · [how flexible can a school website template be](https://www.finalsite.com/blog/p/~board/b/post/how-flexible-can-a-school-website-template-be) · [template or custom](https://www.finalsite.com/blog/p/~board/b/post/template-or-custom-school-website-design-how-to-decide) · [steps for successful content migration](https://www.finalsite.com/blog/p/~board/b/post/steps-successful-website-content-migration) · [G2 reviews](https://www.g2.com/products/finalsite/reviews)
- Apptegy: [school websites](https://apptegy.com/solutions/school-websites) · [reviews](https://apptegy.com/reviews)
- 템플릿 시장: [Eduma (ThemeForest)](https://themeforest.net/item/eduma-education-wordpress-theme/14058034) · [ThemeForest education category](https://themeforest.net/category/wordpress/education?term=demo) · [ThemeForest school search](https://themeforest.net/search/school%20site) · [Envato Elements school theme](https://elements.envato.com/school-wordpress-theme-MRCLP6L)
- 실무 조언(업체 블로그): [Finalsite: 5 questions](https://www.finalsite.com/blog/p/~board/b/post/does-your-homepage-answer-these-5-questions) · [Finalsite: 5 ingredients](https://www.finalsite.com/blog/p/~board/b/post/the-5-main-ingredients-of-a-successful-school-homepage) · [Cube Creative: admissions](https://cubecreative.design/blog/private-school-marketing/k12-website-admissions-success) · [Schudio: 5 important pages](https://www.schudio.com/?p=26428) · [ISM: first impressions](https://isminc.com/advisory/publications/the-source/website-first-impressions-much-job-interviewsyou-only-get-one)
- 대학 이전 사례: [University of Wyoming migration options](https://www.uwyo.edu/web/design-upgrade/migration.html)
- WordPress: [theme.json](https://developer.wordpress.org/themes/global-settings-and-styles/introduction-to-theme-json/) · [patterns](https://developer.wordpress.org/themes/global-settings-and-styles/patterns/) · [WP VIP: design system with theme.json](https://wpvip.com/blog/using-a-design-system-with-the-wordpress-block-editor-pt-1-theme-json/)
- Shopify: [JSON templates](https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates) · [templates, sections, blocks](https://shopify.dev/docs/themes/best-practices/templates-sections-blocks)
- 주소로 만들기(업체 글): [Hostinger: generate a website from a URL](https://www.hostinger.com/ph/tutorials/how-to-generate-website-from-url) · [Elementor: AI web design tools 2026](https://elementor.com/blog/ai-web/)
