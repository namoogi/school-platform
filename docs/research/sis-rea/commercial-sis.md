# 신속 근거 평가(REA) — 상용 SIS·학교 관리 서비스

- 작성일: 2026-11-25
- 범위: PowerSchool SIS, Infinite Campus, Skyward, Veracross, Blackbaud, Arbor, iSAMS, ManageBac(Faria), Toddle, Classe365, Alma, Gradelink, 대비용 Ellucian Banner·Workday Student, 한국·태국 현지 사례
- 목적: 다학교 학교 플랫폼(Next.js + Postgres, 모든 표 `school_id` + RLS, 판으로 쌓는 기록) 핵심 데이터 모델의 근거 마련

## 0. 방법과 한계 (먼저 읽을 것)

- **수집 방법**: 웹 검색 결과에서 출처별 발췌를 모았다. 이 세션에서는 `support.powerschool.com`, `kb.infinitecampus.com`이 네트워크 허용 목록 밖이어서 본문을 직접 열지 못했다(WebFetch 실패). 그래서 **모든 '사실'은 표기한 URL의 검색 발췌에 근거하고, 본문 전체를 읽어 확인한 것은 아니다.** 결정에 바로 쓸 항목은 해당 URL을 열어 다시 확인해야 한다.
- **표기**
  - **사실 [n]**: 출처 표의 n번 URL 발췌에 그 내용이 있다.
  - **추정**: 여러 사실을 바탕으로 한 필자의 해석이다.
  - **확인 필요**: 근거가 약하거나(제3자·포럼·마케팅), 서로 엇갈리거나, 찾지 못했다.
- **출처 등급**: 공식 문서·개발자 문서·도움말 > 공공기관(주 교육청·계약서) > 공급사 보도자료·마케팅 > 리뷰 사이트·커뮤니티 포럼. 공급사 마케팅은 '공급사 주장'이라고 밝혔다.
- 가격·수치·인용은 출처에 있는 것만 옮겼다. 개인정보는 다루지 않았다.

---

## 1. 비교표

| 시스템 | 대상·규모 | 다학교 테넌시 | 마감 후 정정·감사 | 확장 방식 | 표준 | AI(2024–26) | 가격 신호 |
|---|---|---|---|---|---|---|---|
| PowerSchool SIS | 미국 학군 중심, 공급사 주장 5천만+ 학생·90+국 [21] | 학군 아래 여러 학교. `SCHOOLS.SCHOOL_NUMBER`, 학기 표(`TERMS`)에 `SCHOOLID` [6] | 학기 말 성적을 '저장 성적'으로 고정 → 이력 성적 → 성적증명서 [10]. 변경 이력(Change History)에 사용자·전후 값 기록, 일부 안내서는 1년 보관 [12](확인 필요) | DB 확장(1:1 확장, 1:N 자식, 독립 표) [1][3][4], 플러그인 + PowerQuery(이름 붙은 SQL을 API로) [7][8], eCollect 양식 + 승인 단계 [16][17], 마켓플레이스 [18] | OneRoster·Ed-Fi 매핑 사례 [6] | PowerBuddy: 가족용 도우미, 자료 분석, 학군 문서 검색 [19][20] | 비공개(확인 필요) |
| Infinite Campus | 미국 학군·주 단위, 공급사 주장 약 1천만 학생·46개 주·2,800 학군 [35] | 학군판·주(州)판(State Edition) [33][34] | '게시(Posted)' 성적은 잠김, 성적 입력 기간(Grading Window) [37][39]. 성적증명서 감사 보고서가 게시 후 수정된 기록을 표시(IC KB PDF 발췌, URL 특정 못 함 — 확인 필요). 전후 값 추적은 유료 Data Change Tracker [38] | 사용자 정의 속성(`campusAttribute` 표), 사용자 정의 도구·탭(`campusTool`) [26][27], 온라인 등록 양식 빌더, Campus Workflow [41] | OneRoster 1.1·1.2 인증 [30], Ed-Fi 인증 [31][32] | 공식 AI 발표 못 찾음(확인 필요) | 주 계약: 학생 1인당 $0.50 [34] |
| Skyward (SMS 2.0 / Qmlativ) | 미국 학군 | 확인 필요 | 확인 필요 | 사용자 정의 화면·양식(이전 시 유지) [47], OneRoster API 라이선스 [46][51] | OneRoster 1.1 [46] | 자체 AI보다 Panorama 제휴, DistrictPulse 시각화(AWS) [48][49] | 비공개 |
| Veracross | 사립·독립 K-12, 공급사 주장 3,300+ 학교 [53] | 학교마다 별도 API 주소(`/<school>/v3`) [55 계열] | 성적 기간을 열고 닫는 방식 [58]. 잠금·정정 이력은 확인 필요 | 사람·가구·기관을 한 레코드로 [52], 사람 단위 맞춤 자료(Profile Codes) [144], OAuth 범위(`resource:action`) API [56][57] | 자체 Open API. OneRoster 확인 필요 | VC Studio(자연어 보고서), VC AI Service Assistant 시범 약 25개교 [59][60] | 맞춤 견적 [61]. 경쟁사 주장 $15K–50K+ [62](확인 필요) |
| Blackbaud (Education Management / SIS) | 사립 K-12 | 한 학교 안에 '학교 급(school level)' | 검토 완료 성적은 잠기고 성적 관리자가 풀어 줌. 성적표는 시점 스냅샷이 아니라 '살아 있는 자료'라는 사용자 증언 [70][71] | SKY API(School API), 사용자 정의 필드(기본 10개, 일부 베타) [74][75], 마켓플레이스·파트너 할당량 [77] | OneRoster API [77] | 성적표 서술 의견 생성기 [68], 입학 에이전트 개발 중 [69] | 비공개 |
| Arbor (영국) | 영국 공립·MAT. 잉글랜드 공립 44%(WhichMIS) [86] | 학교 MIS와 MAT(다학교 재단) MIS 분리. MAT 보고서는 여러 학교를 합침 [83] | 확인 필요 | REST + GraphQL API(신청제) [80][81][82], 맞춤 보고서 작성기 [83] | 확인 필요 | Ask Arbor, 요약·메일 초안, 보고서 공식 제안, 월 크레딧제 [84][85] | 비공개. AI는 크레딧·유료 추가 [85] |
| iSAMS (영국·국제) | 국제·사립, 공급사 주장 1,800+ 학교·95+국 [90] | 다캠퍼스·다법인, 그룹 통합 보고 [89] | 확인 필요 | 사용자 정의 필드 [92], Batch API 키 + REST API(지원 요청으로 개통) [87][88] | 확인 필요 | iSAMS Central(Power BI) 자연어 질의(2024) [91] | 비공개 |
| ManageBac (Faria) | IB 국제학교, 공급사 주장 3,000+ 학교 [97] | 학교 단위 | 확인 필요 | 공개 API(관리자만 문서 열람) [95] | 확인 필요 | 글쓰기 도우미(학교 단위 선택 활성화) [98][99] | 비공개 |
| Toddle | IB·진보 교육 학교 LMS(SIS 아님) | 확인 필요 | 교사가 AI 초안을 검토 후 게시 [100] | SIS 연동(명단·일정·성적·출결) [101][103] | 확인 필요 | 진도 보고서 의견 초안, 사건 기록 초안 [100] | 사용자 수 구간제, 견적 [102] |
| Classe365 | 소규모 학교·학원 | 확인 필요 | 확인 필요 | Zapier 등 연동. 자체 사용자 정의 필드 문서 못 찾음 | 확인 필요 | 학생 AI 분석·예측, 'Write with AI', AI 크레딧 [105][106] | 학생 1–100명 월 $100부터(제3자) [104] |
| Alma | 미국 소규모 사립·차터 | 확인 필요 | 확인 필요 | API 있음(공급사) [108] | OneRoster 확인 필요 | BeaconAI 분석(공급사 비교 페이지) [108] | 연 약 $4,000부터(제3자, 확인 필요) [109] |
| Gradelink | 미국 소규모 사립(기독교 학교 포함 추정) | 학교 단위 | 확인 필요 | 확인 필요 | 확인 필요 | AI 분석·수업 계획(제3자, 확인 필요) | 51–100명 월 $159(공급사) [112] |
| Ellucian Banner | 고등교육 | 기관 단위 | 학기 코드·CRN 기반, 수강 → 학업 이력 표 분리 [113][114] | — | — | Ellucian Student 에이전트, AI 비용 구독에 포함 [118][119] | — |
| Workday Student | 고등교육 | 기관 단위 | 변경을 '업무 절차(business process) 이벤트'로 남김 [115][117] | 설정형 업무 절차 | — | 확인 필요 | — |

---

## 2. 시스템별 정리

### 2.1 PowerSchool SIS

**(a) 대상·규모**
- 사실 [21]: 2023년 11월 보도자료 기준 학생 5천만 명 이상, 90여 개국, 고객 16,000곳 이상. 미국 학생 수 상위 100개 학군 중 90곳 이상이 고객이다(공급사 주장).
- 사실 [24]: 서울의 외국인학교 세 곳(Korea International School, Seoul Foreign School, Yongsan International School of Seoul)이 PowerSchool SIS를 쓴다. 2024년 12월 침해 사고 때 약 16,000건의 기록이 유출됐다는 보도다.

**(b) 데이터 모델**
- 사실 [6]: Ed-Fi 매핑 문서에 따르면 학교 ID는 `SCHOOLS.SCHOOL_NUMBER`, 학기는 `TERMS` 표(FIRSTDAY, LASTDAY, SCHOOLID, NAME, NOOFDAYS)에서 온다. 학기 행이 학교에 묶인다.
- 사실 [5]: 공식 데이터 사전(PSDD)이 모든 표·뷰를 공개한다. `yearid` 같은 학년도 키 구조는 이번에 확인하지 못했다(확인 필요).
- 출결 — 사실 [13][14]: 일 단위(daily)와 교시 단위(meeting) 출결이 있다. 초등은 주로 일 단위, 중등은 교시 단위다. '브리지 교시'를 두어 교시 출결을 하루 출결로 바꾼다. 출결 코드마다 '교사가 쓸 수 있음', 'ADA(평균 일일 출석)에 셈' 같은 속성이 있다.
- 성적·성적증명서 — 사실 [10]: 학기가 끝나면 이수 과목의 '이력 성적(historical grades)'을 저장하고, 이것이 성적증명서에 나온다.
- 사실 [9]: 학기 말 GPA, 학기 말까지 누적 GPA 등 계산 방식을 구분한다. 학기 말 GPA는 이력 성적을 쓰지 않는다(이 출처는 SMS 제품 문서라 SIS와 다를 수 있음, 확인 필요).
- 사실 [11]: 성적 척도를 바꾸면 기존 저장 성적을 내보내 비교한 뒤 학기 성적을 다시 저장해야 한다(노스캐롤라이나 주 교육청 안내).
- 성취기준 평가 — 사실 [15]: PowerTeacher Pro는 전통 성적·성취기준·둘 다 중에서 고른다. 성취기준 최종 점수를 자동 계산하고, 교사가 덮어쓸 수 있다.

**(c) 테넌시**
- 추정: 학군(district)이 운영 단위이고 학교는 그 아래 행 수준으로 나뉜다. 학교별로 학기 표를 따로 둔다. 우리 구조(플랫폼 = 학군, 학교 = 테넌트)와 비슷하다.

**(d) 정정·감사**
- 사실 [12]: 주(州) 교육부 안내서에 따르면 'Change History'가 일부 필드(저장 성적 포함)의 추가·변경·삭제를 1년간 남긴다. 사용자(또는 'System'), 시각, IP, 전후 값이 기록된다. 1년이라는 보관 기간은 한 안내서에만 나온다(확인 필요).
- 추정: 저장 성적도 권한만 있으면 같은 행을 고칠 수 있다. 판을 쌓는 방식이 아니라 '고치고 감사 로그를 남기는' 방식이다.

**(e) 확장성**
- 사실 [1][2]: 확장 스키마(Extension)는 주 표와 1:1, 자식 스키마(Child)는 1:N이다. 사용자 정의 표 이름에는 접두어가 강제된다. 다른 화면이 참조하는 확장은 지울 수 없다. 다만 이 출처는 SMS 제품 문서다.
- 사실 [3][4]: 'Manage Database Extensions'에서 '고급 확장(Advanced Extension)'을 고르라는 안내가 있다. 독립 표는 DCID 외래키가 없어서 조인을 직접 명시해야 한다는 커뮤니티 글이 있다.
- 사실 [7][8]: 플러그인의 `plugin.xml`이 읽을 표·필드를 '접근 요청(access request)'으로 미리 선언한다. `queries_root`의 XML 파일마다 SQL PowerQuery를 정의하고, 이 쿼리가 외부 API 끝점이 된다. 관리자가 플러그인을 켜면 클라이언트 ID와 비밀값이 발급된다.
- 사실 [16][17]: eCollect는 SIS 필드에 바로 연결되는 양식 빌더다. 승인 단계(승인자 수)를 거친 뒤에야 SIS 필드가 갱신된다.
- 확인 필요 [18 계열]: eCollect에 API가 없다는 제3자 목록이 있다.

**(f) 표준**: OneRoster·Ed-Fi 연동 사례가 있다 [6]. 인증 현황은 확인 필요.

**(g) AI**
- 사실 [19]: 2024년 7월 PowerBuddy를 발표했다. 학생용 학습 도우미와 교사·관리자용 도구가 있다.
- 사실 [20]: 2025년 3월 가족용 'PowerBuddy for Engagement'를 내놓았다. 자녀의 학업 진행을 자연어로 물을 수 있다. 학군이 사용자·학년·역할별로 접근을 제어한다(공급사 보도자료).
- 확인 필요: 자료 요청에 쿼리 작성 없이 답하고 시각화를 만든다는 주장, 무료 제공이라는 주장은 제3자 출처다.

**(h) 가격**: 공개 가격을 찾지 못했다(확인 필요).

**(i) 불만**
- 사실 [25]: G2에서 742건 리뷰, 평점 4.2. 화면·성적표 수정의 어려움, 낡은 화면, 고아 레코드(orphan records), 비용 부담이 자주 나온다.
- 사실 [22][23]: 2024년 12월 침해 사고. 고객 지원 포털의 계정 하나(다단계 인증 없음)가 뚫렸고, SIS의 학생·교사 표가 유출됐다.

### 2.2 Infinite Campus

**(a) 대상·규모**
- 사실 [35]: 공급사 자료 기준 학생 약 1천만 명, 46개 주, 2,800개 학군. 다른 출처는 수치가 다르다(확인 필요).
- 사실 [33]: 주 교육청용 'State Edition'이 따로 있다.

**(b) 데이터 모델**
- 사실 [28]: OneRoster 1.2 데이터 모델 표가 각 요소를 Campus 화면·DB 위치에 대응시킨다.
- 사실 [37][36]: 성적은 '성적 과제(Grading Task)'와 '성취기준(Standard)' 단위로 매긴다. 진행 중 성적을 '게시(Post)'하면 성적 탭에 나온다. 과제·성취기준에 '성적증명서 게시' 표시가 있으면 Transcript Post Wizard로 성적증명서에 옮긴다. 성적증명서에 올릴지는 학군이 GPA 계산 필요에 따라 정한다.
- 사실 [37 계열]: 성적 입력 기간(Grading Window)이 공식 문서에 성적을 게시할 수 있는 때를 정한다.

**(c) 테넌시**: 학군판(District Edition)과 주판(State Edition)이 있다. 몬태나 계약서가 둘을 구분한다 [34].

**(d) 정정·감사**
- 사실 [39]: 애틀랜타 공립학군 감사 보고서에 따르면 교사는 성적을 바꿀 수 있지만 '게시된 성적'은 예외다(잠김).
- 확인 필요(IC KB PDF 검색 발췌, 정확한 URL 특정 못 함): 성적증명서 감사 보고서가 성적증명서와 교사가 게시한 성적을 비교한다. 성적증명서 기록을 수정하면 그 기록이 보고서에 나온다.
- 사실 [40]: 한 학군은 지난 학년도 성적을 바꿀 때 별도의 '성적 변경 신청서'를 받는다. 한 해 전체를 다시 게시할 때는 지원팀이 DB 스크립트로 처리하고 변경 기록을 남겼다.
- 사실 [38]: 누가·언제·전후 값을 보여 주는 변경 추적은 유료 추가 상품(Data Change Tracker)이다.
- 확인 필요: 기본 감사 로그 화면은 최근 500건만 보여 준다는 발췌가 있다(공식 KB PDF).

**(e) 확장성**
- 사실 [26]: 사용자 정의 속성(Custom Attribute/Dictionary)으로 핵심 도구나 사용자 정의 도구에 필드를 더한다. 값은 `campusAttribute` 표에 저장된다. 속성 설정과 코드 값을 잠그는 플래그가 있다. 공급사는 필드를 만들기 전에 기존 기능·스키마를 검토하라고 권한다.
- 사실 [27]: 예전 'Custom Tab'은 Release Pack .2339부터 'Custom Tool Setup'으로 바뀌었다. 탭 정의는 `campusTool` 표에 있다.
- 사실 [41]: 온라인 등록·업무 흐름 묶음(Campus Workflow)이 있다. 새 '사용자 정의 양식 흐름·학생 양식 센터'(Campus.2643)가 언급되지만 세부 내용은 확인 필요.

**(f) 표준**
- 사실 [30]: 1EdTech OneRoster 1.1·1.2 인증.
- 사실 [31][32]: Ed-Fi 인증. Ed-Fi가 정의한 핵심 자료만 지원한다.
- 사실 [29]: 운영 환경에서는 GET만 쓰라고 권한다(쓰기 메서드가 자료를 바꿀 수 있어서).

**(g) AI**: 2025년 공식 AI 발표를 찾지 못했다(확인 필요). '조기 경보'가 AI라는 제3자 주장은 근거가 약하다.

**(h) 가격**
- 사실 [34]: 몬태나 주판 계약에서 학생 1인당 $0.50. 계약마다 단가가 다르다.

**(i) 불만**
- 사실 [43][44]: Capterra 평점 4.2(133건), TrustRadius 7.8/10. 직관적이지 않은 화면, 한 작업에 단계가 많음, 세션 시간 초과가 자주 나온다. 기본 성적·출결 입력은 간단하다는 칭찬도 있다.

### 2.3 Skyward (SMS 2.0 / Qmlativ)

- (a) 사실 [45]: 미국 학군 대상. SMS 2.0에서 Qmlativ로 옮기는 중이다. 단종을 발표하면 최소 2년 전에 알린다고 한다.
- (e) 사실 [47]: 이전할 때 사용자 정의 화면·양식 자료는 유지되고, 양식은 다시 만든다.
- (f) 사실 [46][51]: Qmlativ는 OneRoster 1.1 API를 제공한다(2019년 당시 읽기 전용). Google Classroom과 연결하려면 OneRoster API 라이선스가 필요하다. 확인 필요: SMS 2.0 LMS API의 무료 읽기 전용·유료 읽기·쓰기 구분.
- (g) 사실 [48][49]: 자체 AI 기능보다 Panorama(AI·MTSS) 우선 제휴(2025년 7월)와 AWS와 함께 만든 시각화 도구 DistrictPulse(2025년 3월)를 내세운다.
- (i) 사실 [50]: Capterra 154건, 긍정 84%. 사용 편의성 점수가 가장 낮다(3.9). 낡은 화면이라는 지적이 있다.
- (b)(c)(d)(h): 이번에 근거를 찾지 못했다(확인 필요).

### 2.4 Veracross

**(a) 대상·규모**
- 사실 [53]: 사립·독립 K-12 전용. 공급사 주장 3,300개 이상 학교. 국제학교 페이지도 있다.

**(b) 데이터 모델**
- 사실 [52]: 사람·가구(household)·기관마다 레코드가 하나이고, 모든 부서가 같은 레코드를 쓴다('one person, one record').
- 사실 [56][57]: API v3 범위는 `resource:action` 형식이다. 예: `academics.enrollments:list`, `academics.classes.meeting_times:list`, `academics.config.grading_periods:list`, `classes.attendance:list/update`, `master_attendance:list`. 수업 출결과 전체(일) 출결이 다른 범위다. 제3자 목록끼리 이름이 조금씩 다르다(확인 필요).
- 사실 [58]: 성적 기간 레코드에 '성적 입력 열림'·'의견 입력 열림' 표시를 켜고 끈다(학교 도움말).

**(c) 테넌시**: 사실 [144 계열 — EnrolHQ]: API 기본 주소가 `api.veracross.com/<학교 식별자>/v3`로 학교마다 갈린다. 추정: 학교마다 데이터베이스(인스턴스)가 따로다.

**(d) 정정·감사**: 성적 기간을 닫은 뒤 바꾸는 절차와 변경 이력은 근거를 찾지 못했다(확인 필요).

**(e) 확장성**
- 사실 [144]: 사람에게 붙이는 맞춤 자료를 'Person Profile Codes'로 쓴다(연동 업체 안내).
- 사실 [54]: 양방향 동기화 Open API, 범위를 보고 문서를 찾는 파트너 포털.
- 사실 [63][64]: 리뷰에는 사용자 정의가 제한적이라는 지적이 있다. 단일 DB는 자료가 많고 개발 인력이 있는 학교에 맞는다는 평도 있다.

**(g) AI**
- 사실 [59][60]: VC Studio는 자연어 요청으로 보고서·차트·대시보드를 만든다. 단일 레코드 DB에 근거한다고 한다(공급사 주장). 공개 전에 1년 동안 AI 층을 만들었다고 한다.
- 확인 필요: 2025년 12월 'VC AI Service Assistant' 고객 시범 약 25개교(제3자 연표, 공급사 페이지 일부).

**(h) 가격**
- 사실 [61]: 맞춤 견적.
- 확인 필요 [62]: 경쟁사 Sycamore가 $15K–$50K+ 범위라고 쓴다(이해 상충).

**(i) 불만** [63][64]: 비싸다, 개인화가 어렵다. 장기적인 자료 관리에는 값어치가 있다는 평도 있다.

### 2.5 Blackbaud (Education Management / Student Information System)

**(a) 대상**: 사립 K-12 [139]. 고객 수는 최신 수치를 찾지 못했다(확인 필요).

**(b) 데이터 모델**
- 사실 [65][66]: '성적 그룹(Grade Group)'이 과목과 성적 기간(marking period)을 잇고, 하나에 여러 기간을 담는다. 성취기준(skills-based) 성적표는 발행할 때마다 '성취기준 성적 기간'을 따로 만든다.
- 사실 [67]: 2026년 'Grading Hub'로 성적 설정을 모았다. 'Grade Plan'은 'Marking Period'로, 'Standard Grading'은 'Traditional Grading'으로 이름을 바꿨다. 성적 그룹·성취기준 성적 기간·성적 범주처럼 '가치보다 복잡도가 큰 개념'을 합치거나 없앨 계획이라고 밝혔다.
- 사실 [76 계열]: School API의 수업 목록이 학기마다 한 행씩 돌려준다는 개발자 보고가 있다. 학년 정보는 수업(section)이 아니라 과목(course) 끝점에 있다. 성적 과제에 필요한 `marking_period_id`가 학기 목록에 없다는 보고도 있다(커뮤니티, 확인 필요).

**(c) 테넌시**: 한 학교 안의 '학교 급(school level)'으로 나눈다(커뮤니티 질문에서 언급). 다법인 구조는 확인 필요.

**(d) 정정·감사**
- 사실 [70]: 교사가 성적을 '준비 완료'로 표시하고 검토자가 확인하면 잠긴다. 그 뒤에는 성적 관리자만 바꿀 수 있다. 새 성적 탭에서 다시 연 학기의 잠긴 성적이 수정되고 '검토됨' 상태가 풀리는 문제가 보고됐다.
- 사실 [72]: 기간이 닫힌 뒤 성적 하나를 고치려면 검토 종료일을 바꾸고, 검토 표시를 풀고, 다시 들어가야 한다는 불만이 있다.
- **사실(커뮤니티, 정확한 글 위치 확인 필요) [71]**: "성적과 출결은 살아 있는 자료여서 성적표를 발행한 시점에 보관되지 않는다"는 답변이 있다. 그래서 고정 기록이 필요한 학교는 매년 성적표를 PDF로 내보낸다고 한다. 완료된 기간의 유형·가중치를 바꾸면 평균이 소급해 바뀐다는 경고도 있다.

**(e) 확장성**
- 사실 [73][78]: SKY API의 School API가 사용자·학사·입학·체육·콘텐츠·목록을 다룬다. 예전 'ON API'는 더 확장하지 않는다.
- 사실 [74][75]: 사용자 정의 필드 API(공개 미리보기)는 필드 정의를 다룬다. 과목 사용자 정의 필드 끝점은 BETA이고, 90일 예고 후 없앨 수 있다.
- 확인 필요(Blackbaud 커뮤니티 글, 출처 표 미등재): 사용자 정의 필드 끝점이 예고 없이 바뀌어 사과했다는 글, PATCH가 값을 지웠다는 보고가 있다.
- 사실 [77]: 표준 할당량은 하루 25,000건, 마켓플레이스 파트너는 100,000건이다. 초당 10건 제한. 확인 필요: '무료 등급이 하루 25,000건에서 1,000건으로 줄었다'는 글 제목.

**(g) AI**
- 사실 [68]: '성적표 의견 생성기'가 성적표·성적증명서용 서술 의견을 더 명확하고 일관되게 다듬는다.
- 사실 [69]: 2026년 입학 에이전트를 개발 중이라고 발표했다. 과제 피드백 초안도 언급한다(공급사).

**(i) 불만** [79]: 자료를 넣고 빼기 어렵고 컨설팅 비용이 든다. 중등보다 초등에 맞는다.

### 2.6 Arbor (영국)

- (a) 사실 [86]: WhichMIS 집계(2026년 1월 Tes 보도)로 잉글랜드 공립학교의 44%(9,677개교). SIMS는 약 32%로 떨어졌다. 집계 방식에 따라 51%라는 수치도 있다.
- (c) 사실 [83]: 학교 MIS와 MAT MIS(다학교 재단)가 따로 있다. MAT 맞춤 보고서는 모든 학교 자료를 한 보고서로 합친다. 다만 MAT 소속 직원은 보고서에 넣을 수 없고 학교 직원만 된다. 보고서 템플릿을 내보내고 공유할 수 있다.
- (e) 사실 [80][81][82]: REST·GraphQL API와 SDK가 있다. 개발자 포털은 신청해야 열린다. 학교가 자체 개발에 API를 쓰는 경우도 약관이 다룬다.
- (e) 사실 [83 계열]: 맞춤 보고서 작성기에서 모든 필드를 보고할 수는 없다. 보고 대상별 필드 표를 공개한다.
- (g) 사실 [84][85]: 대화형 도우미 'Ask Arbor'는 학교 MIS에서만 된다(MAT·지자체 MIS 제외). 학생 요약, 메일 초안, 보고서 공식 제안, 감사 준비 도우미가 있다. 교사·보조교사는 기본으로 AI에서 제외되고 권한으로 연다. 월 무료 크레딧을 주고 추가 구매한다. 자동 결석 처리(Auto Absence)는 별도 유료다.
- (b)(d)(h)(i): 근거를 찾지 못했다(확인 필요).

### 2.7 iSAMS (영국·국제)

- (a) 사실 [90]: 공급사 주장 1,800개 이상 학교, 95개 이상 국가, 3–18세 다교육과정. 아시아·태평양 국제학교를 공략한다. 방콕 EARCOS 행사에 참가했다.
- (c) 사실 [89]: 다캠퍼스·다법인을 지원한다. 그룹 안의 각 학교가 학사·생활·입학·행정을 스스로 운영하고, 그룹은 통합 보고를 받는다. 그룹 단위 필드 정의를 공유·강제하는 방식은 확인 필요.
- (e) 사실 [87][88]: 개발자 포털에 Batch·인증·REST API가 있다. Batch 키는 제어판에서 만든다. 사진·사용자 정의 필드·특수교육(SEN) 정보는 REST API가 필요하고, 지원 요청으로 연다.
- (e) 사실 [92]: 학생 사용자 정의 필드는 Student Manager > Management Options > Custom Fields에 있다(OpenApply 안내).
- (g) 사실 [91]: 2024년 6월 iSAMS Central(Power BI 기반)에 자연어 질의·시각화를 넣었다.
- 확인 필요: 개발자 문서에 성적부(gradebook) 항목이 없다는 사용자 글.

### 2.8 ManageBac (Faria)

- (a) 사실 [97]: 3,000개 이상 학교, 80만 명 이상 학생, 130개국(공급사). IB 중심이며 비IB 수업도 관리한다.
- (b) 사실 [93][94]: 계층은 '프로그램'(여러 해에 걸친 교육과정) → '학년 집단'(프로그램 + 학년에 묶임, 학생은 한 번에 한 집단) → '수업'(프로그램·과목·학기에 묶임)이다. 학생과 수업은 '멤버십' 연결 표로 잇는다. 담임반(homeroom)은 독립 개체가 아니다.
- (b) 사실 [96]: 학기 성적 API 경로는 `/v2/classes/:class_id/assessments/term/:term_id/term-grades`이다. 수업에 `start_term_id`·`end_term_id`가 있고, 한 수업이 두 학년도에 걸칠 수 있다.
- (e) 사실 [95]: 공개 API가 수업·학기 출결·평가·학기 성적·학년도·과목을 다룬다. 참조 문서는 관리자 로그인 뒤에만 볼 수 있다.
- (g) 사실 [98][99]: 2025년 10월 AI 기능 확대를 발표했다. 무료 글쓰기 도우미는 학교 관리자가 요청해야 켜진다. 사용 예로 성적표 의견 초안이 있다. 도우미가 맥락(어느 단원 계획인지)을 저절로 알지 못한다고 도움말이 밝힌다.

### 2.9 Toddle

- 사실 [100]: AI가 평가 자료를 읽고 개인별 의견 초안을 쓴다. **교사가 검토하고 게시한다.** 공급사는 18개월 동안 의견 30만 건 이상을 도왔다고 주장한다. 템플릿형 진도 보고서와 성적증명서를 만든다.
- 사실 [101][103]: 자체 SIS가 아니라 LMS다. 출결은 일 단위·순환·교시 단위로 받고 SIS와 양방향 동기화한다. iSAMS가 학적·출결·학비를 맡고 Toddle이 교육과정·평가·포트폴리오를 맡는 분업 사례가 있다.
- 사실 [102]: 사용자 수에 따른 구간 가격, 견적제.

### 2.10 Classe365

- 사실 [104]: 학생 1–100명 월 $100부터, 1,000명 넘으면 견적(제3자 목록마다 구간이 다름, 확인 필요).
- 사실 [105][106]: 학생 프로필에 AI 분석(출결·학업·예측)이 있다. 'Write with AI'로 메일·피드백 초안을 쓰고, 맞춤 프롬프트를 둔다. AI 크레딧으로 사용량을 잰다.
- 확인 필요: 사용자 정의 필드·모듈과 API 공식 문서를 찾지 못했다.

### 2.11 Alma

- 사실 [107][110]: 성취기준 평가와 성취기준 GPA를 직접 지원하고, 숙달 척도를 설정할 수 있다(공급사).
- 사실 [109]: 가격은 문의. 한 제3자 수치는 연 약 $4,000부터다(확인 필요). 리뷰에는 성취기준 평가와 성적부 사용자 정의가 어렵다는 지적이 있다.
- 사실 [133]: 서울의 한 학교(SIE Central)가 Alma를 쓴다는 공급사 블로그가 있다.
- 확인 필요: OneRoster·Ed-Fi 인증.

### 2.12 Gradelink

- 사실 [112]: 51–100명 월 $159(연 $1,908). 100명 학교는 추가 기능을 넣어 월 $159–200이 흔하다(공급사 비교 페이지).
- 사실 [111]: 학교 단위 구간 가격이다(학생 수 기준). 250명 이상은 문의(제3자 정리).
- 확인 필요: AI 분석·수업 계획 기능(제3자 목록).

### 2.13 대비: Ellucian Banner, Workday Student (고등교육)

- Banner — 사실 [113]: 학기 코드는 연도와 학기를 담은 여섯 자리 숫자이고, CRN은 학기 안에서 분반 하나를 가리키는 다섯 자리 번호다. 학기가 바뀌면 다시 붙인다.
- Banner — 사실 [114]: 수강 표(SFRSTCR)와 학업 이력 표(SHRTCKN, SHRTRCE 등)가 따로 있다. '진행 중 수강'과 '확정 학업 이력'을 분리한다. 옮기는 과정(roll to academic history)의 세부는 확인 필요.
- Workday — 사실 [115][116][117]: 수강 등록을 '학업 기간 기록'에 자동으로 묶는다. 이를 덮어쓰는 것은 'Academic Period Record Override Event'라는 업무 절차로 처리한다. 대표 학업 기록 변경도 이벤트로 남고 이력을 볼 수 있다. 비표준 기간을 기존 달력에 더할 수 있다.
- 추정: 고등교육 시스템은 '변경 = 이름 붙은 업무 이벤트'로 남기는 모델이 강하다. 우리 판(버전) + 사유 기록 방식과 가장 비슷하다.
- AI — 사실 [118][119]: Ellucian Student는 학생·인사·재무를 묶은 AI 기반 SaaS다. 에이전트가 고등교육 업무 흐름 약 10,000개를 자동화한다고 한다. AI 비용은 구독에 포함되고 토큰·크레딧을 따로 사지 않는다(공급사).

### 2.14 한국·태국 현지

- 한국 — 사실 [24]: 외국인학교는 국가 교육정보시스템(NEIS)을 쓸 수 없다(서울시교육청 언급 보도). 서울 외국인학교 세 곳이 PowerSchool을 쓴다.
- 한국 — 확인 필요: 대안학교 전용 상용 학사관리 제품을 찾지 못했다. 공립용 LG U+ 슈퍼스쿨(출결·상담·생활기록부 작성 AI) [134], 리로스쿨(성적 분석·출결·알리미, 앱스토어 설명) [135] 정도가 보인다. 인가 대안학교 졸업생 진학 자료는 교육부 학교생활기록부 기재요령을 따르라는 대학 안내가 있다(검색 발췌, 출처 표에 넣지 않음). 추정: 우리 플랫폼은 NEIS를 대신하지 않는다. 인가 학교라면 생활기록부 양식으로 내보내는 기능, 미인가 학교라면 자체 성적 체계 설명서가 필요하다.
- 태국 — 사실 [131]: 사립학교 담당 기관(สช., OPEC)의 학생 등록 시스템(regis.opec.go.th) 사용 설명서가 있고, 졸업자 보고서(ปพ.3)를 이 시스템에서 만든다. ปพ.1(성적 기록)이 같은 시스템에 있는지는 확인 필요.
- 태국 — 사실 [129][130]: 현지 제품 School Bright는 태국 400개 이상 기관이 쓴다고 주장한다. 학사·SIS·학부모 소통, 얼굴 인식 출결, 수업·과목별 출결, 자동 채점을 내세운다(공급사). ปพ. 양식 지원은 확인 필요.
- 태국 국제학교 — 사실 [90]: iSAMS가 아시아 국제학교를 공략한다. ManageBac(방콕 KIS 사례)·WCBS·Rediker 사례가 검색됐다(공급사 사례).

---

## 3. 핵심 데이터 모델 비교 (표준을 기준선으로)

| 개념 | OneRoster 1.2 | Ed-Fi | PowerSchool | Infinite Campus | ManageBac | Blackbaud | 시사점(추정) |
|---|---|---|---|---|---|---|---|
| 기관 | orgs | School/LEA | SCHOOLS(+학군) [6] | 학군/주판 | 학교 | 학교(+학교 급) | `schools` + 나중에 '법인·그룹' 층 |
| 학사 기간 | academicSessions(유형·부모) [120] | Session, GradingPeriod [125] | TERMS(학교별) [6] | 학기 + 성적 과제 기간 | 학년도·학기 [96] | marking period, 성적 그룹 [65] | 학년도 → 학기 → 성적 기간의 부모-자식 계층 하나로 |
| 학년·집단 | users.grades | 학년 기술자 | 학년 필드 | — | 학년 집단(한 번에 하나) [94] | 과목에 학년 [76] | 학년 = 코드값, 집단(반) = 별도 개체 |
| 과목 | courses | Course | courses | course | 과목(subject) | course | 학교별 과목 목록 |
| 수업·분반 | classes | CourseOffering(학교 × Session) → Section [123][125] | sections | section | class(프로그램·과목·학기) [93] | section(학기마다 행) [76] | 수업 = 과목 × 기간의 개설. id로 참조 |
| 등록 | enrollments | 학교 등록(StudentSchoolAssociation) → 수업 등록(StudentSectionAssociation, 시작·종료일) [124] | cc/enrollment | 등록 | memberships [93] | 명단 | **학교 등록과 수업 등록 분리**, 시작·종료일 |
| 성적부 | lineItems, results, categories(weight), scoreScales [121][122] | Grade, GradebookEntry | PowerTeacher Pro | 진행 중 성적 | 평가 | 과제·범주·가중치 | 과제·결과·범주·척도는 OneRoster와 맞춤 |
| 확정 성적 | (results 상태) | Grade(GradingPeriod 참조) [125] | 저장 성적 → 이력 성적 [10] | 게시 성적(잠김) → 성적증명서 [37] | 학기 성적 [96] | 검토 완료(잠김) [70] | 우리 '마감 판'과 같은 자리 |
| 성취기준 | AssessmentLineItem 등 [121] | 학습 기준 | 전통/성취기준/둘 다 [15] | 성적 과제 또는 성취기준 [37] | IB 기준 점수 | 별도 성적 기간 [65](통합 예정 [67]) | 성취기준을 성적 항목의 한 종류로(별도 기간 말고) |
| 출결 | — | 출결 이벤트 | 일/교시, 브리지, 코드 속성 [13][14] | 일/교시 | 학기 출결 [95] | 출결 | 일·교시 두 단위 + 학교별 코드 표 |

- 사실 [124]: Ed-Fi는 학생과 학교 등록이 있어야 수업 등록을 쓸 수 있다고 정한다.
- 확인 필요: Ed-Fi 커뮤니티 초안에서 수업 등록을 '과목 이수 시도(StudentCourseAttempt)'로 바꾸자는 제안이 나왔다. 채택되지 않았다.
- 사실 [126][127][128]: Clever는 OneRoster를 받고, AnySchool로 Clever에 없는 학교도 명단을 올릴 수 있다. 여러 SIS(Blackbaud 등)가 OneRoster CSV 내보내기를 지원한다.

---

## 4. 확장 방식의 유형

| 유형 | 정의 | 사례(근거) | 장점 | 위험·불만 |
|---|---|---|---|---|
| ① 사용자 정의 필드 | 핵심 개체에 속성을 더함(대개 EAV·속성 표) | IC Custom Attribute(`campusAttribute`) [26], Blackbaud 사용자 필드(기본 10개) [74], iSAMS Custom Fields [92], Veracross Profile Codes [144] | 쉽고 안전함. 핵심 스키마를 건드리지 않음 | 형식·검증이 약함. API 노출이 늦거나 베타 [75]. 보고서에 안 나오는 필드 [83] |
| ② 사용자 정의 개체·표 | 1:1 확장, 1:N 자식 표, 독립 표 | PowerSchool DB 확장 [1][3][4], IC Custom Tool Setup(`campusTool`) [27] | 학교 고유 업무(예: 봉사, 프로젝트)를 정규화 | 조인 키 누락 [4], 이름 규칙 강제, 참조 중이면 삭제 불가 [1], 업그레이드할 때 다시 만들어야 함 [47] |
| ③ 플러그인 + 선언형 접근 | 묶음 파일이 읽을 표·필드를 미리 선언하고, 이름 붙은 쿼리를 API로 공개 | PowerSchool `plugin.xml` 접근 요청 + PowerQuery [7][8] | 최소 권한, 관리자 승인 하나로 설치 | SQL 직접 노출, 막힌 표 [PowerSchool 커뮤니티], 설정 실수가 잦음 [7] |
| ④ 저코드 양식·업무 흐름 | 양식 → 승인 단계 → 핵심 필드 갱신 | PowerSchool eCollect(승인자 수) [16][17], IC 온라인 등록 빌더·Campus Workflow [41], Workday 업무 절차 [115] | 비개발자가 만듦. 승인을 거친 쓰기 | 양식 결과가 덮어쓰기로 반영됨. API가 없다는 보고 [18 계열] |
| ⑤ 보고서 작성기·질의 | 필드를 골라 보고서·공식·대시보드 | Arbor CRW·MAT 보고서 [83], Veracross 질의·VC Studio [59], Skyward DistrictPulse [49], iSAMS Central [91] | 읽기 전용이라 안전, AI 자연어 질의와 잘 맞음 | 필드 범위 제한, 권한 경계 |
| ⑥ 공개 API + 마켓플레이스 | OAuth 범위·할당량·파트너 등급 | Blackbaud SKY API(할당량·파트너) [73][77], Veracross 범위 `resource:action` [56], Arbor REST+GraphQL(신청제) [80], ManageBac(관리자만 문서) [95], iSAMS(Batch 키 + 지원 요청) [87][88], IC OneRoster(GET 권장) [29] | 외부 생태계, 학교가 직접 개발 | 베타 끝점이 바뀜 [75], 할당량 축소(확인 필요) [77], 개통 절차가 번거로움 |

- 추정: 상용 SIS의 확장은 거의 **'공급사가 정한 핵심 스키마 + 가장자리 확장'**이다. 학교가 핵심 업무 흐름이나 확정 기록 규칙을 바꾸는 길은 없다. 정정·잠금·발행 규칙은 전부 공급사 코드에 박혀 있다.
- 추정: AI 에이전트가 학교별 기능을 만들게 하려면 ②(정규화된 개체) + ③(선언형 접근 범위) + ④(승인 거친 쓰기) + ⑥(범위 토큰)을 섞은 구조가 맞다. 우리 '범위 토큰 × 명령 함수' 방식(ADR 0012–0016)은 Veracross 범위 모델, PowerSchool 접근 요청 선언과 같은 계열이다.

---

## 5. AI 기능 (2024–2026)

| 유형 | 사례 | 실제로 하는 일(근거 수준) |
|---|---|---|
| 서술 의견 초안 | Blackbaud 의견 생성기 [68], Toddle [100], ManageBac 글쓰기 도우미 [98], Classe365 Write with AI [106], Arbor 메일 초안 [85] | 성적표·피드백·메일 문장을 생성하거나 다듬음. Toddle은 교사 검토 후 게시를 명시(사실) |
| 자연어 질의·보고서 | PowerBuddy 자료 분석(확인 필요), Veracross VC Studio [59], Ask Arbor·공식 제안 [84][85], iSAMS Central Q&A [91] | SIS 자료에 자연어로 묻고 표·차트를 만듦(공급사 주장) |
| 가족·학생용 도우미 | PowerBuddy for Engagement [20], PowerBuddy 학습 도우미 [19] | 자녀 성적·진행 질문에 답함. 역할·학년별 접근 제어 |
| 예측·조기 경보 | Classe365 예측 분석 [105], Skyward + Panorama [48] | 출결·성적 기반 위험 표시(세부 근거 약함) |
| 업무 에이전트 | Blackbaud 입학 에이전트(개발 중) [69], Veracross Service Assistant 시범(확인 필요), Ellucian 에이전트 [118] | 업무 흐름 자동화(대부분 발표·시범 단계) |

- **비용 모델** — 사실: 크레딧제(Arbor [85], Classe365 [106]), 구독 포함(Ellucian [119]), 무료라는 주장(PowerBuddy, 제3자, 확인 필요).
- **통제** — 사실: Arbor는 교사를 기본으로 제외한다 [85]. PowerSchool은 역할·학년별로 켠다 [20]. ManageBac은 관리자가 요청해야 켜진다 [98].
- **추정**: 이번에 본 공급사 중 **AI가 학교별 스키마·기능을 만들게 하는 곳은 없었다.** AI는 '읽기·요약·초안'에 머물고, 확정 기록 쓰기는 사람이 한다. 우리 플랫폼의 차별점이자 위험 지점이다.

---

## 6. 우리 토대에 주는 시사점

모두 **추정**(근거 번호 병기). 우선순위 순.

1. **핵심 골격은 표준과 맞춘다** [120][121][123][124][125]
   - 학교 → 학사 기간(학년도·학기·성적 기간을 부모-자식 계층 하나로) → 과목 → 수업(과목 × 기간의 개설) → 등록.
   - 학교 등록과 수업 등록을 나누고, 둘 다 시작·종료일을 둔다.
   - 성적부 개체(과제·결과·범주 가중치·점수 척도)는 OneRoster 1.2 이름과 짝을 맞춰 둔다.
   - 그러면 나중에 OneRoster CSV·API 내보내기와 Clever·Google Classroom 연동 비용이 작아진다.
2. **'진행 중' 층과 '확정' 층을 표로 분리한다** [10][37][114][70]
   - PowerSchool의 저장 성적, IC의 게시 성적, Banner의 학업 이력처럼 상용 시스템은 모두 두 층을 나눈다.
   - 다만 확정 층도 **같은 행을 권한으로 고치고 감사 로그를 덧붙이는** 방식이다. IC 변경 추적은 유료 추가 상품이고 [38], PowerSchool은 1년 보관 사례가 있다 [12].
   - 우리 '마감 판 + 이전 판을 가리키는 정정 판 + `base_version` 409'(ADR 0004·0013)는 업계 관행보다 엄격하다. 지킬 가치가 있다.
3. **발행본 스냅샷 원칙은 실제 불만을 해결한다** [71][67]
   - Blackbaud 사용자들은 성적표가 발행 시점 스냅샷이 아니라 살아 있는 자료라서 매년 PDF로 내보낸다고 말한다.
   - 지난 기간의 가중치를 바꾸면 평균이 소급해 바뀐다.
   - 우리 '발행본은 스냅샷만 읽는다'는 원칙은 이 문제를 구조로 막는다. 계산 규칙(가중치·척도)도 판으로 고정해 확정 판이 그 판을 가리키게 해야 한다.
4. **정정은 '신청 → 승인 → 새 판' 흐름으로 만든다** [40][72][115]
   - IC 학군은 지난 학년도 성적 변경 신청서를 받는다. Blackbaud는 닫힌 기간 하나를 고치는 데 단계가 너무 많다는 불만이 있다. Workday는 변경을 이름 붙은 이벤트로 남긴다.
   - 우리도 정정 사유·승인자를 담은 '정정 판'을 한 화면에서 만들게 하면 엄격함과 편의를 함께 얻는다.
5. **성취기준 평가는 '성적 항목의 한 종류'로 둔다** [15][37][65][67]
   - Blackbaud는 성취기준용 성적 기간을 따로 만들었다가 복잡도 때문에 합치겠다고 밝혔다.
   - PowerSchool·IC는 같은 구조 안에서 전통·성취기준·둘 다를 고른다.
   - 프로젝트 기반 대안학교의 서술형·숙달형 평가와 태국 학교의 점수형 평가를 한 모델에 담으려면 '평가 항목 유형 + 척도 판'이 낫다.
6. **출결은 일 단위·교시 단위 두 층 + 학교별 코드 표** [13][14][101]
   - 코드에 '결석으로 셈'·'교사가 쓸 수 있음' 같은 속성을 둔다.
   - 소규모 초등(태국 P1–P6)은 일 단위, 중등·프로젝트 수업은 교시·활동 단위가 필요하다. 변환 규칙(브리지)도 학교 설정 판으로 둔다.
7. **확장은 '정규화된 학교 개체 + 선언형 범위 + 승인 거친 쓰기'로** [1][7][16][26][56]
   - 사용자 정의 필드만으로는 AI 에이전트가 기능을 쌓기에 모자란다. EAV는 검증·보고서·API 노출이 약하다 [75][83].
   - PowerSchool식 1:1·1:N·독립 표 구분과 `plugin.xml`식 접근 선언이 참고할 만하다.
   - 학교 에이전트가 만드는 새 표도 `school_id` + RLS + 판 쌓기 규칙을 자동으로 물려받는 '확장 표 틀'이 필요하다.
   - 끝점이 예고 없이 바뀐다는 불만 [75]을 피하려면 에이전트 API 계약을 판으로 관리한다.
8. **다학교 층: 학교 위에 '법인·그룹'을 나중에 둘 자리를 남긴다** [83][89][6]
   - Arbor MAT, iSAMS 그룹은 학교별 자율 운영 + 그룹 통합 보고 모델이다.
   - 한국 학교법인이 여러 학교를 운영하는 경우를 대비해, 읽기 전용 그룹 보고를 `app.is_member`와 별도의 그룹 권한으로 설계할 여지를 둔다. 이번 차시 범위는 아님.
9. **AI는 초안·질의부터, 확정 기록 쓰기는 사람 승인으로** [68][85][98][100]
   - 업계는 의견 초안 → 교사 검토 → 게시 흐름이 표준이다.
   - 역할별 AI 접근 제어(Arbor, PowerSchool)와 사용량 계량(크레딧)도 흔하다.
   - 우리 '자동 공개(autopublish)' 토큰(ADR 0021)은 업계보다 앞선 권한이다. 성적·생활기록 같은 확정 기록에는 적용하지 않는 경계를 분명히 둔다.
10. **보안: 공급사 지원 경로가 최대 위험이었다** [22][23][24]
    - PowerSchool 사고는 다단계 인증이 없는 지원 포털 계정 하나로 학생·교사 표 전체가 빠져나간 사례다.
    - 관제·지원 경로(점검 토큰)도 다단계 인증·범위 제한·접근 기록을 두어야 한다.
    - 주민번호 같은 고위험 필드는 핵심 표에 두지 않는다.
11. **현지 제도: 국가 시스템을 대신하지 말고 내보내기를 맞춘다** [24][131]
    - 한국 외국인·미인가 대안학교는 NEIS 밖에 있다. 태국 사립학교는 OPEC 등록 시스템에 ปพ. 보고를 한다.
    - 플랫폼은 원본 기록을 보존하고 공식 양식으로 내보내는 '발행본' 종류를 늘리는 편이 맞다.
12. **가격 기준선** [104][109][112][34]
    - 소규모 학교 상용 SIS는 월 $100–$200(학생 100명 안팎, Classe365·Gradelink)부터 시작한다. Veracross·Blackbaud는 견적제다.
    - 우리 대상 학교의 비용 기대치가 낮다는 신호다(추정).

### 다시 확인할 항목(우선)
- PowerSchool 데이터 사전(`docs.powerschool.com/PSDD`)의 `TERMS.YEARID`·`STOREDGRADES` 구조. 저장 성적을 고칠 때 이력이 어떻게 남는지.
- IC KB 'Transcript Audit Report', 'Grading Window', 'Data Change Tracker' 원문.
- Blackbaud '성적표는 살아 있는 자료' 답변의 정확한 글과 현재 동작.
- Veracross 성적 기간을 닫은 뒤의 정정 절차.
- 태국 OPEC 시스템의 ปพ.1 생성 여부, School Bright의 ปพ. 지원.
- 이번 세션은 `support.powerschool.com`·`kb.infinitecampus.com`에 접근하지 못했다. 이 둘을 허용하면 원문을 확인할 수 있다.

---

## 7. 출처 표

확인 날짜는 모두 2026-11-25(검색 결과 발췌 확인. 본문을 직접 열지 못한 곳 포함).

| 번호 | 제목 | URL | 확인 날짜 |
|---|---|---|---|
| 1 | PowerSchool SMS — Adding Extension and Child schemas | https://support.powerschool.com/help/sms/843/SchoolUser/Content/Topics/Customizing/Adding_Extension_and_Chi.htm | 2026-11-25 |
| 2 | PowerSchool SMS — Working with schemas | https://support.powerschool.com/help/sms/843/SchoolUser/Content/Topics/Customizing/Working_with_schemas.htm | 2026-11-25 |
| 3 | K12 Online — PowerSchool custom form fields | https://ktwelveonline.freshdesk.com/support/solutions/articles/14000075407-powerschool-custom-form-fields | 2026-11-25 |
| 4 | PowerSchool Community — DB Extension joins in SQL | https://help.powerschool.com/t5/Community-Forum/DB-Extension-joins-in-SQL/m-p/319243 | 2026-11-25 |
| 5 | PowerSchool Data Dictionary | https://docs.powerschool.com/PSDD | 2026-11-25 |
| 6 | InnovateEDU — PowerSchool SIS (Ed-Fi mapping) | https://innovateedu-landing-zone.readthedocs-hosted.com/en/latest/integrations/powerschool-sis/powerschool-sis.html | 2026-11-25 |
| 7 | Connecting PowerSchool Data to Google Sheets Part 3 (PowerQuery API mode) | https://domain7cc.substack.com/p/connecting-powerschool-data-to-google-fe8 | 2026-11-25 |
| 8 | txoof/PowerQuery (GitHub) | https://github.com/txoof/PowerQuery | 2026-11-25 |
| 9 | PowerSchool SMS — Calculating GPAs | https://support.powerschool.com/help/sms/843/SchoolUser/Content/Topics/Grading/Calculating_GPAs_SM.htm | 2026-11-25 |
| 10 | PowerSchool SIS — Managing Grades and Academic Data (quick reference) | https://www.thehelpgroup.org/assets/Managing-Grades-and-Academic-Data.pdf | 2026-11-25 |
| 11 | NC DPI — PowerTeacher Pro grade calculation details | https://www.dpi.nc.gov/documents/ptpro-qrd/ptpro-grade-calculation-details/open | 2026-11-25 |
| 12 | Change History User Guide (Nova Scotia) | https://www.ednet.ns.ca/inschool/files_inschool/change_history_user_guide.pdf | 2026-11-25 |
| 13 | NC DPI — Attendance preferences (meeting) | https://www.dpi.nc.gov/documents/attendance/ps-qrd-attendance-preferences-meeting/open | 2026-11-25 |
| 14 | SC Charter — PowerSchool attendance | https://powerschoolsupport.sccharter.org/attendance | 2026-11-25 |
| 15 | NC DPI — Standards-based grading teacher user guide | https://www.dpi.nc.gov/documents/sbrc/ps-standardsbasedgradingteacheruserguide/open | 2026-11-25 |
| 16 | PowerSchool — Ecollect Forms | https://www1.powerschool.com/solutions/student-information-system/powerschool-sis/ecollect-forms/ | 2026-11-25 |
| 17 | eCollect Form Building for PS Admins (March 2022) | https://erskinecharters.org/institute_uploads/2023/02/eCollect_Form-Building-for-PS-Admins-_March-2022.pdf | 2026-11-25 |
| 18 | PowerSchool Marketplace — Ecollect | https://marketplace.powerschool.com/apps/ecollect | 2026-11-25 |
| 19 | THE Journal — PowerSchool Releases AI-Powered Tools (2024-07-03) | https://thejournal.com/articles/2024/07/03/powerschool-releases-ai-powered-tools-for-students-admins.aspx | 2026-11-25 |
| 20 | BusinessWire — PowerSchool family-facing AI assistant (2025-03-31) | https://www.businesswire.com/news/home/20250331311823/en | 2026-11-25 |
| 21 | BusinessWire — PowerSchool international expansion (2023-11-27) | https://www.businesswire.com/news/home/20231127015031/en | 2026-11-25 |
| 22 | TechCrunch — PowerSchool says hackers accessed personal data (2025-01-08) | https://techcrunch.com/2025/01/08/edtech-giant-powerschool-says-hackers-accessed-personal-data-of-students-and-teachers/ | 2026-11-25 |
| 23 | TechTarget — PowerSchool data breach explained | https://www.techtarget.com/whatis/feature/PowerSchool-data-breach-Explaining-how-it-happened | 2026-11-25 |
| 24 | Korea Herald — Seoul international schools and PowerSchool breach | https://www.koreaherald.com/article/10922866 | 2026-11-25 |
| 25 | G2 — PowerSchool SIS reviews | https://www.g2.com/products/powerschool-sis | 2026-11-25 |
| 26 | Infinite Campus KB — Custom Attribute/Dictionary | https://kb.infinitecampus.com/help/custom-attribute | 2026-11-25 |
| 27 | Infinite Campus KB — Custom Tab | https://kb.infinitecampus.com/help/custom-tab | 2026-11-25 |
| 28 | Infinite Campus KB — OneRoster 1.2 Data Models | https://kb.infinitecampus.com/help/oneroster-12-data-models | 2026-11-25 |
| 29 | Infinite Campus KB — OneRoster API Documentation (OAuth 2) | https://kb.infinitecampus.com/help/oneroster-12-api-documentation | 2026-11-25 |
| 30 | 1EdTech — Infinite Campus certifications | https://site.imsglobal.org/certifications/infinite-campus-inc/infinite-campus | 2026-11-25 |
| 31 | Ed-Fi — Registry of certified products | https://docs.ed-fi.org/partners/certification/registry-of-ed-fi-certified-products | 2026-11-25 |
| 32 | Infinite Campus KB — Getting Started with Ed-Fi | https://kb.infinitecampus.com/help/ed-fi | 2026-11-25 |
| 33 | Infinite Campus — State Edition | https://www.infinitecampus.com/products/state-edition | 2026-11-25 |
| 34 | Montana OPI — Infinite Campus contract | https://archive.legmt.gov/content/Publications/fiscal/2025-Biennium/Section-E/Interim/OPI-InfiniteCampus-Contract.pdf | 2026-11-25 |
| 35 | Meet Infinite Campus (docx) | https://infinitecampus.com/img/Meet-Infinite-Campus.docx | 2026-11-25 |
| 36 | Kentucky DOE — Data Standard: Grades | https://education.ky.gov:443/districts/tech/sis/Documents/DataStandard-Grades.pdf | 2026-11-25 |
| 37 | Infinite Campus KB — Grade Submission Process Study Guide | https://kb.infinitecampus.com/help/grade-submission-process-study-guide | 2026-11-25 |
| 38 | Infinite Campus — Data Change Tracker | https://infinitecampus.com/products/premium-products/data-change-tracker | 2026-11-25 |
| 39 | Atlanta Public Schools — IC Monitoring Audit (FY19-14) | https://www.atlantapublicschools.us/cms/lib/GA01000924/Centricity/Domain/11447/FY19-14%20FINAL%20Report%20IC%20Monitoring%20Audit_05212019.pdf | 2026-11-25 |
| 40 | Columbus — 20-21 Transcript Posting | https://columbus.atlassian.net/wiki/spaces/SC/pages/2366374214/20-21+Transcript+Posting | 2026-11-25 |
| 41 | Infinite Campus — Campus Workflow | https://www.infinitecampus.com/products/campus-workflow | 2026-11-25 |
| 42 | Infinite Campus — 2025 enhancements | https://www.infinitecampus.com/about/articles/2025-enhancements | 2026-11-25 |
| 43 | Capterra — Infinite Campus reviews | https://www.capterra.com/p/188836/Infinite-Campus/reviews/ | 2026-11-25 |
| 44 | TrustRadius — Infinite Campus reviews | https://www.trustradius.com/products/infinite-campus/reviews | 2026-11-25 |
| 45 | Skyward — SMS to Qmlativ migration | https://www.skyward.com/qmlativ | 2026-11-25 |
| 46 | Skyward — Interoperability update: OneRoster certification (2019) | https://www.skyward.com/blogs/skyward-insider/2019/january/interoperability-update-oneroster-certification | 2026-11-25 |
| 47 | Skyward — Qmlativ Migration Booklet 2023 | https://www.skyward.com/web/media/PDFs/Qmlativ-Migration-Booklet_2023.pdf | 2026-11-25 |
| 48 | Skyward — Panorama named preferred partner (2025) | https://www.skyward.com/about/newsroom/panorama-named-preferred-partner-by-skyward-to-bring-best-in-class-ai-and-mtss-solution | 2026-11-25 |
| 49 | GlobeNewswire — Skyward unveils DistrictPulse (2025-03-04) | https://www.globenewswire.com/news-release/2025/03/04/3036614/0/en/Skyward-Unveils-New-Turnkey-Data-Visualization-Tool-During-2025-International-Conference-iCon.html | 2026-11-25 |
| 50 | Capterra — Skyward reviews | https://www.capterra.com/p/2185/Skyward-School-Management/reviews/ | 2026-11-25 |
| 51 | Google — Connect Classroom to your SIS | https://support.google.com/edu/classroom/answer/9356588?hl=en | 2026-11-25 |
| 52 | Veracross — Single record SIS | https://www.veracross.com/resources/single-record-sis/ | 2026-11-25 |
| 53 | Veracross — homepage | https://veracross.com/ | 2026-11-25 |
| 54 | Veracross — API & Integrations | https://www.veracross.com/integrations-2/ | 2026-11-25 |
| 55 | PyPI — veracross-api3 | https://pypi.org/project/veracross-api3 | 2026-11-25 |
| 56 | Orah — Veracross scope reference | https://success.orah.com/en/articles/16903020-veracross-scope-reference | 2026-11-25 |
| 57 | SchoolCal — Complete list of scopes for API v3 in Veracross | https://schoolcal.freshdesk.com/support/solutions/articles/153000238220 | 2026-11-25 |
| 58 | Indian Mountain — Opening/closing comments and grades (Veracross) | https://indianmountain.freshdesk.com/support/solutions/articles/35000167905-opening-closing-comments-and-grades | 2026-11-25 |
| 59 | Veracross — AI school software | https://www.veracross.com/ai-school-software/ | 2026-11-25 |
| 60 | Veracross — AI for independent schools: why our approach is different | https://www.veracross.com/resources/ai-for-independent-private-schools-why-our-approach-is-different/ | 2026-11-25 |
| 61 | Veracross — Pricing | https://www.veracross.com/pricing/ | 2026-11-25 |
| 62 | Sycamore — Veracross vs Sycamore | https://sycamoreleaf.com/compare/veracross-vs-sycamore/ | 2026-11-25 |
| 63 | G2 — Veracross reviews | https://www.g2.com/products/Veracross/reviews | 2026-11-25 |
| 64 | TrustRadius — Veracross reviews | https://www.trustradius.com/products/veracross/reviews/all | 2026-11-25 |
| 65 | Blackbaud Help — Grades Management Overview | https://webfiles-sc1.blackbaud.com/files/support/helpfiles/education/k12/full-help/content/sis-grades-management-overview.html | 2026-11-25 |
| 66 | Blackbaud Help — Grading Setup for Managers | https://webfiles-sc1.blackbaud.com/files/support/helpfiles/education/k12/full-help/content/sis-tutorial-manager-grading-setup.html | 2026-11-25 |
| 67 | Blackbaud Community — Our Grade Journey | https://community.blackbaud.com/discussion/84817/our-grade-journey-what-s-changing-now-and-where-we-re-headed | 2026-11-25 |
| 68 | Blackbaud Help — Grade Report Feedback Generator | https://webfiles-sc1.blackbaud.com/files/support/helpfiles/education/k12/k12-resource-center-qa/content/sis-grade-report-feedback-generator.html | 2026-11-25 |
| 69 | Blackbaud — Reimagining the future of education with AI | https://www.blackbaud.com/newsroom/article/blackbaud-is-reimagining-the-future-of-education-with-ai | 2026-11-25 |
| 70 | Blackbaud Community — New Grading Tab does not respect reviewed (locked) grades | https://community.blackbaud.com/discussion/comment/275647/ | 2026-11-25 |
| 71 | Blackbaud Community — Locking report cards (후보 글, 정확한 위치 확인 필요) | https://community.blackbaud.com/discussion/comment/259560 | 2026-11-25 |
| 72 | Blackbaud Community — Too many steps to update a grade once the Grade Plan has closed | https://community.blackbaud.com/discussion/52710/too-many-steps-to-update-a-grade-once-the-grade-plan-has-closed | 2026-11-25 |
| 73 | Blackbaud Community — The School API is now available | https://community.blackbaud.com/discussion/82533/calling-all-developers-the-school-api-is-now-available | 2026-11-25 |
| 74 | Blackbaud Community — Introducing the Custom Field API (Public Preview) | https://community.blackbaud.com/discussion/85437/introducing-the-custom-field-api-public-preview | 2026-11-25 |
| 75 | Groton School SKY API SDK — Courses Customfields List | https://groton-school.github.io/sky-api/classes/Blackbaud-SKY-School-Endpoints-V1-Academics-Courses-Customfields-List.html | 2026-11-25 |
| 76 | Blackbaud Community — GET sections returns many duplicate entries | https://community.blackbaud.com/discussion/comment/245667/ | 2026-11-25 |
| 77 | Blackbaud Community — SKY API quota increase question | https://community.blackbaud.com/discussion/comment/306651/ | 2026-11-25 |
| 78 | Blackbaud Help — "Legacy" ON API | https://webfiles-sc1.blackbaud.com/files/support/helpfiles/education/k12/full-help/content/bb-core-integrations-on-api.html | 2026-11-25 |
| 79 | TrustRadius — Blackbaud Education Products review | https://www.trustradius.com/reviews/blackbaud-education-management-solutions-formerly-blackbaud-k-12-on-solutions-2019-07-10-09-41-34 | 2026-11-25 |
| 80 | Arbor — Become a Partner | https://arbor-education.com/become-a-partner/ | 2026-11-25 |
| 81 | Arbor Developers — API reference v2 | https://developers.arbor-education.com/api/reference/v2/Gender | 2026-11-25 |
| 82 | Arbor Support — How can we set up our own API integration | https://support.arbor-education.com/hc/en-us/articles/10899675598365-How-can-we-set-up-our-own-API-Integration-with-Arbor | 2026-11-25 |
| 83 | Arbor Support — MAT MIS Custom Report Writer | https://support.arbor-education.com/hc/en-us/articles/360011078878-Group-MIS-The-Custom-Report-Writer | 2026-11-25 |
| 84 | Arbor Support — Ask Arbor | https://support.arbor-education.com/hc/en-us/articles/30750363843869-Ask-Arbor | 2026-11-25 |
| 85 | Arbor Support — Intro to Arbor AI for Admins and SLT | https://support.arbor-education.com/hc/en-us/articles/35666602337181-Intro-to-Arbor-AI-for-Admins-and-SLT | 2026-11-25 |
| 86 | Tes — ESS SIMS loses market dominance | https://www.tes.com/magazine/news/general/ess-sims-loses-market-dominance-school-information-systems-mis | 2026-11-25 |
| 87 | iSAMS — New Developer Portal (press, 2020) | https://www.isams.com/company/press/new-developer-portal/ | 2026-11-25 |
| 88 | Wonde — iSAMS Batch API Integration Guide | https://www.wonde.com/wp-content/uploads/iSAMS-Batch-API-Integration-Guide-1.pdf | 2026-11-25 |
| 89 | iSAMS — Group schools | https://www.isams.com/solutions/school-type/group-schools/ | 2026-11-25 |
| 90 | iSAMS — School management software Asia | https://www.isams.com/school-management-software-asia/ | 2026-11-25 |
| 91 | iSAMS — AI functionality in iSAMS Central (press, 2024-06-17) | https://www.isams.com/company/press/isams-announces-ai-functionality-built-in-to-their-power-bi-reporting-solution-isams-central/ | 2026-11-25 |
| 92 | OpenApply — iSAMS introduction & supported fields | https://help.openapply.com/hc/en-us/articles/4405307111949 | 2026-11-25 |
| 93 | Faria SchoolsTech — ManageBac's Data Model | https://schoolstech.faria.org/hc/en-us/articles/7767739039897-ManageBac-s-Data-Model | 2026-11-25 |
| 94 | ManageBac Help — Creating & managing year groups | https://help.managebac.com/hc/en-us/articles/360019108011 | 2026-11-25 |
| 95 | ManageBac Help — Enabling ManageBac+ Public API | https://help.managebac.com/hc/en-us/articles/360018226931 | 2026-11-25 |
| 96 | Faria SchoolsTech — Exporting PYP Term Grades Scores | https://schoolstech.faria.org/hc/en-us/articles/23038504622745-Exporting-PYP-Term-Grades-Scores | 2026-11-25 |
| 97 | ManageBac — About | https://www.managebac.com/about | 2026-11-25 |
| 98 | ManageBac Help — Getting started with ManageBac+ AI Writing Assistant | https://help.managebac.com/hc/en-us/articles/38117871360921 | 2026-11-25 |
| 99 | Faria — Innovation in Action | https://www.faria.org/insights/innovation-in-action/ | 2026-11-25 |
| 100 | Toddle — AI-powered progress reports and transcripts | https://www.toddleapp.com/?p=9760 | 2026-11-25 |
| 101 | Toddle — Attendance, timetable and calendar management | https://toddleapp.com/?p=9837 | 2026-11-25 |
| 102 | Toddle — Pricing | https://www.toddleapp.com/pricing | 2026-11-25 |
| 103 | iSAMS — Toddle and iSAMS integration | https://www.isams.com/platform/integrations/toddle-and-isams/ | 2026-11-25 |
| 104 | Capterra — Classe365 pricing | https://www.capterra.com/p/135075/Classe365/pricing | 2026-11-25 |
| 105 | Classe365 Docs — AI module | https://docs.classe365.com/en/articles/11092557-classe365-s-ai-module | 2026-11-25 |
| 106 | Classe365 Docs — AI feature | https://docs.classe365.com/en/articles/9818523-classe365-s-ai-feature | 2026-11-25 |
| 107 | Alma — Curriculum & Grading | https://www.getalma.com/how-alma-supports-any-curriculum-framework/ | 2026-11-25 |
| 108 | Alma — Alma vs Gradelink | https://www.getalma.com/alma-vs-gradelink/ | 2026-11-25 |
| 109 | Software Advice — Alma SIS profile | https://www.softwareadvice.com/admissions/alma-profile | 2026-11-25 |
| 110 | PRWeb — Alma introduces standards-based grading GPA | https://www.prweb.com/releases/alma-sis-introduces-standards-based-grading-grade-point-average-846041615.html | 2026-11-25 |
| 111 | Gradelink — Pricing plans | https://gradelink.com/pricing-plans/ | 2026-11-25 |
| 112 | Gradelink — Gradelink vs TeacherEase | https://gradelink.com/gradelink-vs-teacherease/ | 2026-11-25 |
| 113 | Penn — Course section (Banner CRN, SSBSECT) | https://provider.www.upenn.edu/computing/da/dw/pennant-student-records/crse_section.e.html | 2026-11-25 |
| 114 | UC Riverside — Banner ODS STUDENT_COURSE target | https://odsadmintestxe.ucr.edu/metadata/STUDENT_COURSE_ODS_target.html | 2026-11-25 |
| 115 | Workday Docs — Academic period record overrides | https://doc.workday.com/admin-guide/en-us/student/student-records/academic-records/academic-record-management/concept--academic-period-record-overrides.html | 2026-11-25 |
| 116 | Workday Docs — Standard and nonstandard academic periods | https://doc.workday.com/admin-guide/en-us/student/academic-foundation/academic-calendar-for-student-records-and-financia/concept--standard-and-nonstandard-academic-periods.html | 2026-11-25 |
| 117 | Workday Docs — View student reporting record history | https://doc.workday.com/admin-guide/en-us/student/student-records/student-records-setup/steps--view-student-reporting-record-history.html | 2026-11-25 |
| 118 | Ellucian — Ellucian Student arrives | https://www.ellucian.com/en-au/newsroom/ellucian-student-arrives-unified-ai-platform-built-future-higher-education | 2026-11-25 |
| 119 | Ellucian — Redefines the economics of AI | https://www.ellucian.com/en-gb/newsroom/ellucian-redefines-economics-ai-higher-education | 2026-11-25 |
| 120 | 1EdTech — OneRoster Version 1.2 | https://www.imsglobal.org/spec/oneroster/v1p2 | 2026-11-25 |
| 121 | 1EdTech — OneRoster 1.2 Gradebook Service | https://www.imsglobal.org/spec/oneroster/v1p2/gradebook/info | 2026-11-25 |
| 122 | 1EdTech — OneRoster CSV Binding | https://standards.1edtech.org/oneroster/specifications/standards/v1p2/csv | 2026-11-25 |
| 123 | Ed-Fi — Teaching and Learning Domain (DS 5) | https://docs.ed-fi.org/reference/data-exchange/data-standard/5/model-reference/teaching-and-learning-domain/entities-references-and-descriptors | 2026-11-25 |
| 124 | Ed-Fi — Teaching and Learning best practices | https://docs.ed-fi.org/reference/data-exchange/data-standard/model-reference/teaching-and-learning-domain/best-practices | 2026-11-25 |
| 125 | Ed-Fi — Key structure in the ODS/API | https://docs.ed-fi.org/reference/ed-fi-api/technical-articles/key-structure-in-the-ed-fi-ods-api | 2026-11-25 |
| 126 | Clever — AnySchool Quickstart | https://dev.clever.com/docs/anyschool-rostering | 2026-11-25 |
| 127 | Clever — Clever is open, now with OneRoster | https://www.clever.com/clever-is-open-and-now-with-oneroster | 2026-11-25 |
| 128 | Atlas — OneRoster integration | https://help.onatlas.com/hc/en-us/articles/360054387631 | 2026-11-25 |
| 129 | School Bright — Who are School Bright | https://www.schoolbright.co/en/post/who-are-school-bright-why-are-we-thailand-s-no-1-school-management-system | 2026-11-25 |
| 130 | School Bright — 5 key features | https://www.schoolbright.co/en/post/5-key-features-of-school-bright-that-transform-schools-into-fully-digital-systems | 2026-11-25 |
| 131 | OPEC — Student registration system manual (private schools) | https://regis-api.opec.go.th/manual/manual22.pdf | 2026-11-25 |
| 133 | Alma blog (SIE Central, Seoul) | https://www.getalma.com/?p=5326 | 2026-11-25 |
| 134 | LG U+ 슈퍼스쿨 | https://www.lguplus.com/biz/all/product-service/metaverse/superschool/B000000140 | 2026-11-25 |
| 135 | App Store — 리로스쿨 | https://apps.apple.com/KR/app/id995221497 | 2026-11-25 |
| 139 | Blackbaud — Student Information System | https://blackbaud.com/products/student-information-system | 2026-11-25 |
| 144 | EnrolHQ — Sync to Veracross | https://www.enrolhq.com.au/support/documentation/knowledgebase/syncs/enrolhq-to-veracross-integration | 2026-11-25 |

(번호 132·136–138·140–143은 비워 두었다. 검토 중 뺀 출처다.)
