# REA 갈래: 영어권 학교 제도(잉글랜드·캐나다·호주·뉴질랜드)를 KR+US 기준으로 흡수할 수 있는가

- 작성: 2026-11-25 (서브 에이전트, REA 한 갈래)
- 범위: 잉글랜드(UK 중 England만), 캐나다 온타리오·브리티시컬럼비아(BC), 호주(연방 + NSW·빅토리아), 뉴질랜드. 각 제도의 학사 구조, 평가·보고, 식별·기록, 출결, 법정 통계 수집, 정정·보존·개인정보, 사립·국제학교 의무를 뽑았다. 그다음 KR+US 핵심이 이들을 **출력 프로필**로 흡수할 수 있는지와, 핵심에 무엇이 더 있어야 하는지를 정리했다.
- 관련 설계: ADR 0025(학사 토대 제안: 사건 원장 · 마감 판 · 출력 프로필 · 확장 사다리), ADR 0004.
- **법률 자문이 아니다.** 법령·지침은 해마다 바뀐다(이 조사 중에도 2024·2025·2026 개정이 여럿 보였다). 제품 결정 전에 원문과 관할 당국 안내를 다시 확인해야 한다.

## 0. 방법과 한계 (먼저 읽기)

- 이 세션의 네트워크 정책이 원문 호스트를 막았다. 직접 열어 본 `www.ontario.ca`, `ontario.ca`, `www.gov.uk`는 모두 DNS 단계에서 막혔다(ENOTFOUND). 그래서 **모든 근거는 웹 검색 엔진이 그 URL에서 보여 준 발췌와 요약**이다. 다른 정부 호스트는 같은 정책이라고 보고 열지 않았다.
- 표시 규칙:
  - **사실** (출처 번호): 표의 URL 문서에서 검색 엔진이 발췌한 내용으로 확인했다. 원문 쪽수까지 대조하지는 못했다. 발췌가 2차 자료(교육청·학교·벤더 문서)이면 '2차'라고 적었다.
  - **추정**: 작성자의 사전 지식이나 여러 발췌를 묶은 추론. 설계 근거로만 쓰고 화면·문서에 단정해 쓰지 않는다.
  - **확인 필요**: 자료끼리 어긋나거나 근거를 찾지 못했다.
- URL은 모두 검색 결과에 실제로 나온 것만 적었다. 숫자·인용은 발췌에 있는 것만 썼다.
- 원문 대조를 하려면 세션 네트워크 허용 목록에 `www.gov.uk`, `assets.publishing.service.gov.uk`, `www.legislation.gov.uk`, `www.ontario.ca`, `files.ontario.ca`, `www2.gov.bc.ca`, `acara.edu.au`, `www2.education.vic.gov.au`, `curriculum.nsw.edu.au`, `www2.nzqa.govt.nz`, `www.education.govt.nz`를 더해야 한다.

---

## 1. 잉글랜드 (England)

### 1-1. 학사 구조

| 항목 | 내용 | 표시 |
| --- | --- | --- |
| 핵심 단계(Key Stage)와 학년(Year) | KS1 = 5–7세·Year 1–2, KS2 = 7–11세·Year 3–6, KS3 = 11–14세·Year 7–9, KS4 = 14–16세·Year 10–11. 국가교육과정 틀 문서에 나온 표 | 사실 (E22) |
| 학년 배정 | 학년은 9월 1일–8월 31일에 태어난 아이를 한 학년으로 묶는다. 핵심 단계도 8월 31일 기준 나이로 나눈다 | 확인 필요: 민간 학교 안내 사이트의 검색 요약에서만 봤다(출처 표에 넣지 않음). 법문 표현은 찾지 못했다 |
| 학년도·수업일 | 공립(maintained) 학교는 한 학년도에 최소 380 수업 단위(session) = 190일. 학교 대부분은 3학기(term)이고, 각 학기를 다시 반(half term)으로 나눈다. 아카데미·프리스쿨은 이 규정 밖이다 | 사실(2차) (E23) |
| 수업 단위 | 하루 = 오전·오후 두 수업 단위(session). 출결도 이 단위로 기록한다(1-4 참고) | 사실 (E1, E3) |
| 자격(qualification) | GCSE(보통 KS4 끝)는 2017년부터 9–1 척도이고, U는 등급 없음이다. A level은 A*–E에 U가 더해진다. 시험·등급은 학교가 아니라 **인가 시험기관(awarding organisation)**이 낸다. Ofqual은 2025년에 4개 기관이 A level 결과를 냈다고 발표했다 | 사실 (E19, E21) / A level 척도 문구는 E21 발췌의 'ungraded results (U)'만 확인, A*–E 원문은 확인 필요 |

### 1-2. 평가·보고

| 항목 | 내용 | 표시 |
| --- | --- | --- |
| GCSE 9–1 | 7등급 하한 ≈ 옛 A 하한, 4등급 하한 ≈ 옛 C 하한, 1등급 하한 ≈ 옛 G 하한. DfE는 4 이상을 'standard pass', 5 이상을 'strong pass'로 본다 | 사실 (E19, E20) |
| 이중 등급 | GCSE Combined Science는 '9-9'부터 '1-1'까지 17단계의 **두 칸짜리 등급**이다 | 사실 (E20) |
| 법정 평가 | KS2 평가·보고 방식(ARA)은 해마다 새 판이 나온다(2027년 판은 2026년 10월 갱신). 교사 평가(teacher assessment)는 틀(framework)에 맞춰 보고해야 하고, 곱셈표 확인(multiplication tables check)은 Year 4 대상이다 | 사실 (E24) / 곱셈표 부분은 2차 |
| 연간 보고서 | 교장의 연간 보고서(학부모·성인 학생 대상)에는 다음이 들어간다. ① 교육과정 모든 과목·활동의 성취 요약 ② 전반적 진전에 대한 의견 ③ 담당 교사와 보고서를 논의할 방법 ④ 출결 기록 ⑤ 그해 국가교육과정 시험 결과(점수) | 사실 (E18, Schedule 1 발췌) |
| 옛 판의 출결 요약 | 1997년 판 규정은 '무단 결석 수와 가능 출석 수'를 요구했다 | 사실 (E18 검색 발췌) — 현행 문구는 확인 필요 |
| 교육 기록 열람 | 학부모가 서면으로 요청하면 이사회(governing body)는 **15 수업일 안에** 교육 기록(educational record)을 무료로 열람하게 해야 한다. 사본도 같은 기한 안에 준다 | 사실 (E17) |

### 1-3. 식별자·기록·전학

| 항목 | 내용 | 표시 |
| --- | --- | --- |
| UPN (Unique Pupil Number) | 13자: 검사 글자 1 + 지방정부(LA) 번호 3 + 학교 번호 4 + 발급 연도 2 + 일련번호 3. 다른 학생에게 다시 주지 않는다. 학교·LA를 옮겨도 따라간다 | 사실(2차) (E10, E9) |
| UPN 사용 범위 | '학교 생활 기간에만 교육 맥락에서 쓰고 개인정보 보호 제한을 받는다'(NHS 데이터 사전). 학교 생활이 끝나면 학교 기록과 함께 보관한다 | 사실(2차) (E10 계열 발췌) |
| 임시 UPN | 11–13번째 자리가 두 자리 일련번호 + 글자다. 정식 UPN을 알면 바꿔야 한다 | 사실(2차) (E11) |
| ULN (Unique Learner Number) | 10자리 숫자로, 끝자리는 검사 숫자다. LRS(Learning Records Service)가 발급하고 개인 학습 기록(PLR)에 연결된다. LRS 안내는 14세 이상, UCAS는 '13세 초과'라고 적었다 | 사실 (E12, E13) / 나이 기준은 확인 필요 |
| CTF (Common Transfer File) | 학생이 학교를 옮길 때 보내는 표준 파일. 명세가 **해마다 새 판**이다(CTF 26 v1.1, 2026-07-30. 새 출결 코드가 추가됐다). 담는 항목: UPN·이름·생년월일 같은 식별, 출결, 평가 등. 항목 사전은 CBDS 통합 문서에 있다 | 사실 (E6, E7, E8) |
| 기록 이관 기한 | 새 학교가 요청하면 15 수업일 안에 보낸다는 문구가 KS1 2016 ARA에 있다. 등록 해제를 기준으로 기한을 센다는 근거는 찾지 못했다 | 사실 (E29) / 기산점은 확인 필요 |

### 1-4. 출결

| 항목 | 내용 | 표시 |
| --- | --- | --- |
| 법적 근거 | School Attendance (Pupil Registration) (England) Regulations 2024. 2024-08-19 시행으로 2006년 규정을 대체했다. 출결부를 '출석'과 '결석'으로 단순화하고 **정해진 코드 집합을 의무화**했다 | 사실 (E3) |
| 하루 두 번 | 오전 수업 단위가 시작할 때와 오후에 한 번씩 출결부를 쓴다 | 사실 (E1, E5 / 2차 포함) |
| 확인된 코드 | `/` 오전 출석, `\` 오후 출석, `L` 출결부 마감 전 지각(출석), `U` 마감 후 지각(무단 결석), `N` 사유 미확인, `C` 예외적 사유 결석 허가, `B` 승인된 다른 교육 활동, `I` 질병(허가 결석), `R` 종교 행사, `D` 다른 학교 이중 등록(가능 수업 단위에서 뺌), `X` 의무교육 연령 아님(가능 수업 단위에서 뺌). `H` 코드는 없어졌다. 학기 중 허가 결석은 이제 모두 `C`다 | 사실 (E4, E5) / M·G·O·K·V·P·Q·W·J1 뜻은 확인 필요(2026 지침 8장) |
| 통계 범주 | 코드마다 통계 범주(출석 / 허가 결석 / 무단 결석 / 가능 수업 단위 아님)가 붙는다 | 사실 (E5 발췌의 'classified for statistical purposes as attending', 'not counted as a possible attendance') |
| 매일 공유 | 학교는 정해진 양식으로 오전·오후 하루 두 번 필요한 항목을 기록하고 공유한다 | 사실 (E2) |
| 출결부 수정 | 입학부(admission register)를 고치면 **원래 항목을 수정과 함께 남겨야 한다**. 각 항목은 작성일부터 6년 보존한다(독립학교 지침 검색 발췌, 2024 규정 근거) | 사실(검색 요약) (E25, E26, E3) / 같은 규칙이 출석부에도 적용되는지는 확인 필요 |

### 1-5. 법정 통계 수집

| 항목 | 내용 | 표시 |
| --- | --- | --- |
| 학교 센서스 | 가을·봄·여름 세 번 걷는다. 학교 단위·학생 단위 자료이고, 해마다 명세(business and technical specification)가 새 판이다(2026–27 v1.2, 2026-09). 부록 F·G가 어느 학교급·어느 회차에 어떤 항목이 해당하는지 정한다 | 사실 (E14, E15) |
| 센서스 기준일 | 2026년 가을 센서스 기준일은 2026-10-01(목)이다. 급식 지원 자격처럼 항목마다 따로 정한 기간도 있다(2026-05-22부터 센서스 기준일까지) | 사실(2차, LA 안내) (E16) |
| 확인 보고서 | DfE는 회차별 '학교 요약 보고서' 명세를 따로 낸다. 학교가 제출 전에 자기 자료를 확인하는 용도다 | 사실 (E15 계열) |

### 1-6. 정정·보존·개인정보 (UK GDPR / DPA 2018)

| 항목 | 내용 | 표시 |
| --- | --- | --- |
| 정정권 | UK GDPR 제16조: 부정확한 개인정보의 정정을 요구할 수 있다. 제19조: 정정했으면 알려야 한다 | 사실(2차) (E28) |
| 보존 | DfE 학교 개인정보 지침의 보존 표: 중등 학생 기록은 학생이 25세가 될 때까지, 초등 기록은 졸업 때 다음 학교로 보낸다 | 사실(검색 요약) (E27) |
| 열람 제외 | 학생 본인에게도 공개할 수 없는 정보는 학부모 열람에서 뺄 수 있다(2005 규정, 당시 DPA 1998 근거) | 사실 (E17) |

### 1-7. 독립(사립)학교

- 독립학교 기준은 Education (Independent School Standards) Regulations 2014의 부칙이다. DfE 해설 지침(2026-04)과 등록 지침이 있다. 사실 (E25, E26)
- 소유자(proprietor)는 입학부를 둬야 하고, 학생 전원이 기숙생이 아니면 출석부도 둬야 한다. 입학부 항목: 이름, 학교에서 쓰는 이름, 성별, 주소, 함께 사는 부모 이름. 기숙학교는 의무교육 연령 학생마다 기숙생인지 통학생인지 적는다. 학생은 첫 등교일 첫 수업 단위 전이나 시작할 때 올린다. 사실(검색 요약) (E25, E26, E3)
- 검사 기관이 입학부·출석부를 볼 수 있어야 한다. KS2 ARA는 '참여하는 독립학교'에도 적용된다. 사실 (E25, E24)
- 독립학교의 센서스 의무는 이번 검색으로 확인하지 못했다. 확인 필요. 독립학교 연간 인구 조사가 따로 있다는 것은 추정.

---

## 2. 캐나다 — 온타리오

### 2-1. 학사 구조·졸업장

| 항목 | 내용 | 표시 |
| --- | --- | --- |
| 학년 | 유치원, Grade 1–8(초등), Grade 9–12(중등). 중등은 학기제(semestered)와 비학기제가 있고, 성적표 양식도 둘로 나뉜다 | 사실 (O8, O9 계열 양식 목록) |
| 과목 코드 | 다섯 글자. 앞 세 글자는 교육부 공통 과목 코드, 넷째는 학년(1 = Grade 9 … 4 = Grade 12), 다섯째는 과정 유형(W 계열 통합, D 학문, P 응용, U 대학, M 대학·칼리지, C 칼리지, E 직업, O 공통) | 사실 (O5, O11) |
| OSSD | 30학점. 2023년 이전 Grade 9 입학생은 필수 18 + 선택 12, **2024–25 Grade 9 입학생부터 필수 17 + 선택 13**이다. 그 밖에 봉사(community involvement) 40시간과 문해 요건(OSSLT 통과 또는 OSSLC 이수)이 있다 | 사실 (O10) / 40시간은 2차 |
| 학점 인정 | PLAR(선행 학습 평가)로 받은 동등 학점도 OST에 적는다 | 사실(2차) (O5 계열) |

### 2-2. 평가·보고 (Growing Success)

| 항목 | 내용 | 표시 |
| --- | --- | --- |
| 성취 표시 | Grade 1–6은 글자 등급, Grade 7–8은 백분율, 중등은 과목마다 백분율 | 사실 (O8, O9) |
| 성취 수준 | 수준 1–4와 백분율의 대응(성적표에 설명이 있다). 흔히 쓰는 대응은 4 = 80–100, 3 = 70–79, 2 = 60–69, 1 = 50–59, R = 50 미만이다 | 대응 존재는 사실 (O9) / 숫자 구간은 확인 필요(검색 엔진이 일반 지식이라고 밝혔다) |
| 학습 기능·작업 습관 | 6개(책임, 조직, 독립 작업, 협업, 주도성, 자기 조절). Grade 1–12에 공통이고 척도는 E/G/S/N이다. **교과 성취와 따로** 보고한다 | 사실 (O9) |
| 보고 주기 | 초등 가을 진전 보고서는 글자·백분율 대신 '매우 잘 / 잘 / 어렵게 진전 중' 척도를 쓴다. 정규 성적표 횟수는 이번에 확인하지 못했다 | 진전 보고서는 사실(2차) / 횟수는 확인 필요 |

### 2-3. 식별자·OSR·OST

| 항목 | 내용 | 표시 |
| --- | --- | --- |
| OEN | 9자리(무작위 8 + 검사 숫자 1). 이름·성별·생년월일 같은 안정 정보에 묶인다. 학교가 교육부 웹 'OEN Registry'에서 받는다. 수집·사용·공개는 O. Reg. 440/01이 제한한다 | 사실 (O13, O12, IPC 발췌) |
| OnSIS | 교육청·학교·학생·교원·과목·학급 자료를 요소 단위로 걷는 웹 시스템 | 사실 (O13) |
| OSR 지침 | 'OSR Guideline 2000 (revised 2020)'. Education Act에 따라 장관이 발령하고, 교육청과 직원이 따라야 한다 | 사실(2차) (O1, O2) |
| OST | 학생의 과목 이수와 졸업장 요건을 다 담은 기록으로, OSR의 일부다. 재학 중에는 전자로 관리하고, 전학·졸업·퇴학 때 인쇄 정본을 종이 OSR에 넣는다. 세부는 OST Manual 2013이 정한다 | 사실(2차) (O4, O2) |
| 전면 공개(full disclosure) | 1999–2000년부터 Grade 11·12 과목 **시도는 실패를 포함해 모두** OST에 남긴다. 첫 성적표 뒤 5 수업일이 지나 철회하면 학점 칸에 `W`와 그때 점수를 적는다. 재이수하면 두 시도를 모두 적고 학점은 하나만 준다. 점수가 낮은 쪽 학점 칸에 `R`을 적는다 | 사실 (O5, O6) |
| 보존 | OSR 주요 부분은 학생이 떠난 뒤 55년 보존한다(IPC 안내, 교육청 보존표) | 사실(2차) (O2) |
| 정정 | 학생(18세 미만이면 부모)이 교장에게 서면으로, 부정확하거나 '교육 개선에 도움이 되지 않는' 자료의 정정·삭제를 요구한다. 교장이 거절하면 장학관(supervisory officer)에게, 그다음 교육부 지정인 청문으로 간다. 끝까지 거절되면 **이의 진술서(statement of disagreement)를 해당 정보에 붙인다**. 사실만 정정할 수 있고 의견은 정정 대상이 아니다. MFIPPA 경로와 Education Act 경로 중 하나를 고른다 | 사실 (O3) |

### 2-4. 출결·수집·사립학교

- 출결: 교육부 'Enrolment Register Instructions'가 해마다 나온다(2026–27 판에 'Daily Attendance Records' 절). 오전·오후 기록은 교육청 실무로 확인했다. 성인 사회복지사 확인서로 정신건강 결석을 의료 결석으로 처리할 수 있다는 2024–25 문구가 있다. 사실 (O14) / 하루 두 번 기록은 사실(2차, 교육청 편람 O15) / 법정 횟수는 확인 필요
- 등록 학생 수 기준일(10/31·3/31 등)은 이번 검색으로 확인하지 못했다. 확인 필요
- 사립학교: 해마다 9월 1일까지 운영 의사 신고(NOI)를 낸다(Education Act 16조). OSSD 학점을 주려는 사립 중등학교만 교육부가 검사한다. NOI 자료는 OnSIS로 걷는다. 운영 기준은 2013 사립학교 정책 편람이다. 사실 (O16, O17)

---

## 3. 캐나다 — 브리티시컬럼비아 (BC)

| 항목 | 내용 | 표시 |
| --- | --- | --- |
| 졸업 프로그램 (2023) | 최소 80학점: 필수 52(원주민 관련 4학점 포함) + 선택 28 이상, 그리고 주 졸업 평가(수리·문해). 졸업증은 Dogwood Diploma | 사실 (B1, B2, B11) / 옛 판과 필수 구성이 다르다(옛 페이지에는 진로 교육 8학점) |
| 졸업 평가 | Grade 10 평가 코드 NME10·NMF10·LTE10·LTP10. 성적 증명서에는 최종 글자 등급 대신 `RM`(요건 충족)이 찍힌다. 면제는 `XMT`이고, 평가 결과는 4단계(1 Emerging ~ 4 Extending) | 사실 (B8, B2) / 4단계 표기는 2차 |
| 척도 | K–9는 4단계 숙련 척도(Emerging·Developing·Proficient·Extending). Grade 10–12는 글자 등급 + 백분율(Provincial Letter Grades Order). A = 86–100. 학점 이수에는 C- 이상이 필요하다. `F`·`IE`·`W`·`SG` 같은 특수 글자가 있고, Grade 10–12 성적 증명서에는 `IE`를 쓸 수 없어 다른 등급으로 바꿔야 한다. `TS`(전입 인정) 표시가 있다 | 사실 (B3, B4, B12, B2) / A 외 구간은 확인 필요 |
| 보고 정책 | 2023-07-01 시행 K–12 학생 보고 정책. 학습 갱신(learning update)을 한 해 다섯 번 낸다. 한 판은 비공식 2 + 서면 2 + 서면 학습 요약 1이고, 다른 안내는 서면 3 + 비공식 2다. 서면 소통에는 모두 서술 피드백이 들어간다. **핵심 역량 자기 성찰과 목표 설정**은 K–12 공통이고 척도·등급을 매기지 않는다. 학년도 마지막 서면 보고에 졸업 진행 상황을 넣는다 | 사실 (B3, B4, B5) / 서면 횟수는 확인 필요(판이 어긋남) |
| PEN | 9자리 고유 번호. 재정 배분, 학교·교육청·고등교육 간 이동 분석, 시험, 학생 보고에 쓴다. 유아부터 K–12, 고등교육까지 따라간다 | 사실 (B6 / 2차 포함) |
| 주 제출 (TRAX) | 학교가 학생 자료를 교육부에 전자로 보낸다(10월 초–7월 중순). 철회 학생은 파일에서 빼는 것으로 끝나지 않고 1월 1일 이후 **종료 레코드**를 보내야 한다. 영구 학생 기록(Permanent Student Record)은 K–12 학업 이력 전체(과목·성취·결석·다닌 학교)다 | 사실 (B7) |
| 과목 코드 | MyEducation BC 과목 코드는 최대 7자(과목 5 + 학년 2). 교육부가 Course Registry로 관리한다 | 사실 (B13 계열) |
| 독립학교 | Group 1–4로 나뉜다. 정부 보조는 Group 1·2만 받는다(교육청 단가의 50% 또는 35%). Group 3·4 인증은 최대 2년이다 | 사실 (B9) / 보조율 배정은 2차 |
| 해외 학교 | B.C. 인증 해외 학교(offshore)에서 B.C. 인증 교사가 영어로 가르치고, 학생은 자기 나라에서 Dogwood 졸업장을 받는다. 주 정부가 검사·인증한다(사전 인증 1년 → 인증 1년, 갱신) | 사실 (B10, B11) |

---

## 4. 호주 (연방 + NSW · 빅토리아)

### 4-1. 학사 구조·자격

| 항목 | 내용 | 표시 |
| --- | --- | --- |
| NSW 단계(Stage) | Early Stage 1(유치원), Stage 1(Year 1–2), 2(3–4), 3(5–6), 4(7–8), 5(9–10), 6(11–12) | 사실 (A7) |
| 학년도 | 달력 연도로 움직이고, 4 텀(term)과 2 학기(semester)를 함께 쓴다. 출결 국가 수집은 Semester 1 기준이다(4-3) | 학기 기준 수집은 사실 (A1, A2) / 4 텀은 추정 |
| NSW HSC·RoSA | HSC는 NSW Education Act 1990에 따라 NESA가 준다. 문해·수리 최소 기준은 HSC 과정 시작 후 5년 안에 맞춰야 한다. Board Endorsed Course는 HSC에는 들어가고 ATAR에는 들어가지 않는다. Year 10 마지막 날까지 다니고 필수 과정을 마치면 RoSA를 받고, 요건을 못 채우면 Transcript of Study를 받는다 | 사실 (A9, A10) |
| ATAR | NSW는 UAC, 빅토리아는 VTAC가 계산한다. 학생에게 바로 주고 NESA Students Online에는 나오지 않는다. **학교 밖에서 만드는 결과**다 | 사실 (A10, A12 계열) |
| VCE | 단위(unit)마다 성과(outcome)를 보여 주면 이수(S)이고, 못 보이면 N이다. Units 1·2의 S/N 판정은 성취 수준 평가와 **따로** 한다. Units 3·4는 연속으로 이수해야 한다. VCE는 단위 이수로 준다. ATAR에는 영어군 Unit 3–4 이수가 필요하다 | 사실 (A12) |
| VET in Schools | 국가 인정 직업교육(VET)을 듣는 학생은 USI가 필요하다. 학교 RTO가 USI 없이는 AQF 증명(수료증·이수 증명)을 낼 수 없다(QLD) | 사실 (A13, A14) |
| NAPLAN | 숙련 수준 4단계: Exceeding, Strong, Developing, Needs additional support. 옛 밴드·국가 최저 기준을 대체했고 척도·시계열을 새로 시작했다 | 사실 (A15) |

### 4-2. 평가·보고

| 항목 | 내용 | 표시 |
| --- | --- | --- |
| 연방 요건 | 학부모에게 1년에 **최소 두 번**, 알아보기 쉬운 서면 보고서를 준다. Year 1–10은 과목마다 A–E(또는 동등한 5단계) 등급을 매긴다. 근거는 연방 규정이다(2013 규정 → 주 자료는 **Australian Education Regulations 2023**을 인용) | 사실 (A4, A6, A8) / 2023 규정 조문은 확인 필요 |
| NSW | NESA 공통 등급 척도(Years 1–10, Preliminary). Early Stage 1과 Life Skills 성과는 A–E에서 빠지고 교사 의견으로 대신할 수 있다. Year 12 자격증의 A–E는 과정 끝의 성취 수준이다 | 사실 (A6) |
| 빅토리아 | 연 2회 이상 서면(인쇄·디지털) 보고서. 5단계 척도로 성취·진전을 보고하되, 빅토리아 교육과정 수준(level)을 그대로 쓰는 것으로는 이 요건을 채울 수 없다. **지난 보고 뒤의 진전 표시**가 들어가야 한다. 영어·수학은 나이 기대 수준과 비교한다. 교사 판단 자료를 CASES21에 6/30과 12/31까지 올린다. 형식은 정하지 않는다. 새 정책은 2027년 1학기부터 적용된다 | 사실 (A4, A5) |

### 4-3. 식별자·출결·수집

| 항목 | 내용 | 표시 |
| --- | --- | --- |
| 빅토리아 VSN | 9자리. 25세 미만이 빅토리아 교육·훈련 기관에 처음 등록하면 받는다. **VCAA 학생 번호와 다르다**(VCE 결과·ATAR 서비스는 VCAA 번호를 쓴다) | 사실 (A11) |
| USI | VET용 평생 번호로, 한 번 만들면 평생 쓴다. Student Identifiers Act 2014 | 사실 (A13) |
| NSW 학생 번호 | NESA 학생 번호의 형식·용도는 이번에 확인하지 못했다 | 확인 필요 |
| 국가 출결 기준 | 'National Standards for Student Attendance Data Reporting'(3판, 2020-07 갱신). 공립·가톨릭·독립 모든 학교의 Year 1–10에 적용한다. **출석 수준(attendance level)** = Semester 1 출석률이 90% 이상인 전일제 Year 1–10 학생의 비율. 2020 개정: 120분 넘는 부분 결석은 반나절 결석으로 치고, 90% 판정에 반올림하지 않는다 | 사실 (A1, A2, A3) |
| 학교 센서스 | 국가 학교 통계 수집(NSSC) 기준일은 8월 첫 금요일(2024년은 8월 2일)이고, 나이 기준일은 7월 1일이다. 전일제·시간제·FTE 학생 수를 센다 | 사실 (A16) |
| My School | ACARA가 모든 학교의 출결·NAPLAN·재정을 공개한다. 독립학교는 연차 보고서, 센서스, **학생 배경 자료**(언어, 부모 학력·직업 → ICSEA·SEA 계산)를 낸다 | 사실 (A17, A18) |
| 주 간 전학 | 주 간 학생 자료 이관(ISDTN)은 이번에 근거를 찾지 못했다 | 확인 필요 |

### 4-4. 정정·개인정보

- Privacy Act 1988의 APP 13: 정보를 가진 기관은 부정확함을 알게 되었을 때와 본인이 요청했을 때 정정해야 한다. 거절하면 본인은 '부정확·낡음·불완전'하다는 **진술을 정보에 연결**해 달라고 할 수 있다. 정정·진술 연결에는 비용을 받지 않는다. OAIC는 30일을 합리적 응답 기간으로 본다. 사실 (A19, A20)
- 소기업 예외(s 6D)가 독립학교에 적용되는지는 이번에 확인하지 못했다. 확인 필요. 공립학교는 주 개인정보법을 따른다는 것은 추정.

---

## 5. 뉴질랜드

| 항목 | 내용 | 표시 |
| --- | --- | --- |
| 학년 | Year 0–8 초등, Year 9–13 중등. Year 0은 연말에 다섯 살이 된 아이용이다. 교육부는 재정·교원 배정에 '재정 학년(Funding Year Level, 받은 학교 교육 연수)'을 쓴다. Year 14·15도 표에 있다 | 사실(검색 요약) (N15) |
| 학생 수 기준일 | 교육부 학생 수 자료는 7월 1일 학생 수 보고(roll return) 기준이다 | 사실 (N15) |
| NCEA | 2024년부터 Level 1·2·3 각각 60학점 + 문해·수리 공동 요건(co-requisite) 20학점(문해 10 + 수리 10, 한 번만 채우면 된다). L2는 Level 2 이상 60학점, L3는 Level 3 이상 60학점이다. 2023년까지는 80학점 체계였다 | 사실 (N1) |
| 성취 기준 등급 | 성취 기준(achievement standard)은 Not Achieved / Achieved / Merit / Excellence. 단위 기준(unit standard)은 대부분 Merit·Excellence가 없다 | 사실 (N2, N3) |
| 인증(endorsement) | 자격 인증은 Merit(Merit 이상 50학점), Excellence(Excellence 50학점)이고 여러 해에 걸쳐 쌓을 수 있다. NZQA가 외부 평가 결과를 내는 1월에 계산한다. 과목 인증(course endorsement)은 따로 있다. 2020년에는 46학점 예외가 있었다 | 사실 (N2, N3) / '성취 기준 학점만 인증에 든다'는 학교 자료라 확인 필요 |
| 결과 정본 | NZQA의 Record of Achievement(NZROA)가 정본이다. 학교는 수험자 정보를 관리하고 결과를 NZQA에 보고한다 | 사실 (N19, N20) |
| NSN | 학생마다 주는 고유 번호(디지털 신원). 유아·학교·고등교육 기관에 처음 등록할 때 받는다 | 사실 (N4) |
| ENROL | Education and Training Act 2020 237조에 따라 등록 기록을 적고 옮기는 교육부 소유 시스템. 다른 학교는 이름·생년월일·NSN·등록 이력만 볼 수 있고, 나머지는 등록 학교만 본다. 입학 전에 'Find a Student'로 기존 기록을 찾아야 한다. 떠날 때는 갈 학교와 사유를 적는다 | 사실 (N5, N6, N7) |
| 출결 | Education (School Attendance) Regulations 2024와 관보 규칙(최신 School Attendance Rules 2026). 교육부 승인 전자 출석부(eAR)와 승인 코드를 써야 한다. **반나절 또는 교시마다** 코드를 기록하고, 해명되지 않은 결석에는 기본 코드를 쓴다. 2025년 1텀에 코드가 26개에서 15개로 줄었다(새 코드는 없음). 매일 출결 보고가 있다. 30명 미만 학교는 면제될 수 있다 | 사실 (N8, N9, N10, N11) |
| 학부모 보고 | 쉬운 말로 쓴 서면 보고가 의무다. 2026년부터 읽기·쓰기·수학에 진전 서술 5단계(Emerging·Developing·Consolidating·Proficient·Exceeding)를 쓴다. 'Consolidating' 이상이 '궤도 위(on track)'다. 2027-01-01부터 연 2회 보고가 의무이고, 근거는 Education (School Boards) Regulations 2020 개정이다. 다른 학습 영역은 NZC 2007로 계속 보고한다 | 사실 (N12, N13, N14) |
| 정정 | Privacy Act 2020 IPP 7: 정정을 요구할 수 있고, 거절되면 **정정 진술(statement of correction)을 붙여 달라고 할 수 있다**. 기관은 진술이 붙도록 합리적 조치를 해야 한다 | 사실 (N16, N17) |
| 보존 | 공문서법(Public Records Act 2005)에 따른 학교 기록 처분 기준은 이번에 찾지 못했다 | 확인 필요 |

---

## 6. 사립·국제학교 공통 정리

| 제도 | 무엇을 지키고 무엇을 내나 | 표시 |
| --- | --- | --- |
| 잉글랜드 독립학교 | 입학부·출석부(2024 규정), 수정 때 원래 항목 보존, 6년 보존, 검사 기관 열람, 참여하면 KS2 평가 | 사실 (1-7) |
| 온타리오 사립 | 매년 NOI, 학점을 주려면 검사, OnSIS 자료 | 사실 (2-4) |
| BC 독립·해외 | Group 1–4 인증. 해외 학교는 B.C. 교육과정·교사로 Dogwood를 준다 | 사실 (3) |
| 호주 독립 | 센서스, ACARA 학생 배경 자료, My School 재정 자료, 연차 보고서 | 사실 (4-3) |
| 국제학교 일반 | 한 학교가 자기 나라 제도와 외국 자격(IB, Cambridge, OSSD, Dogwood)을 함께 운영할 수 있다. **자격의 관할 ≠ 학교 소재지의 관할**이다 | B.C. 해외 학교로 사실 (B10) / 나머지 일반화는 추정 |

---

## 7. 종합: KR+US 기준으로 흡수 가능한가

분류:
- (a) KR+US 핵심에 이미 있는 개념: 학년, 학기 나무, 과목·개설, 학점, 글자·척도 결과, 서술, 코드가 붙은 출결 사건, 마감 판, 성적 증명서
- (b) 코드 목록·척도·규칙 판만 더하면 되는 것
- (c) 핵심에 무언가 **더 있어야** 하는 것
- (d) 출력 프로필에만 두면 되는 것

| 제도 | 항목 | (a) 있는 개념 | (b) 코드·척도·규칙 | (c) 핵심 추가 | (d) 출력 프로필 |
| --- | --- | --- | --- | --- | --- |
| 공통 | 학년 표기(Year N, Grade N, Stage N, Key Stage) | 학년 | 지역 표기 ↔ 정규 서수 대응, 학년 배정 기준일(England 8/31, AU 나이 기준 7/1) | **학년 = 표기 + 정규화된 '학교 교육 연수/나이대'**. England Year 7 ≈ US Grade 6, NZ Year 9 ≈ US Grade 8(추정). 표기 문자열 일치로 비교하면 틀린다 | 성적표 학년 표기 |
| 공통 | 3학기+반학기, 4텀+2학기, 학기제/비학기제, 달력 연도 학년도 | 학기 나무 | 텀 종류(term, half term, semester, reporting period) 코드 | 학년도가 달력 연도를 넘나든다(9–8월, 1–12월). 같은 학년도 안에서 **수업 운영 단위와 보고·수집 단위가 다를 수 있다**(AU: 텀으로 운영, 학기로 보고) | — |
| EN | GCSE 9–1, A level A*–E·U, Combined Science 9-9 | 척도 결과 | 9–1·A*–E 척도 판, 'standard/strong pass' 기준 | **두 칸짜리 결과**(이중 등급)를 하나의 결과 값으로 담을 수 있어야 한다. **외부 시험 결과**(인가 시험기관 발급, 학교가 못 고침) | 결과 통지서 |
| EN | 출결: 하루 2 수업 단위, 법정 코드, 통계 범주, 가능 수업 단위 | 출결 사건 + 코드 | 2024 코드 목록(판), 코드 → 통계 범주 대응 | **수업 단위(session) 축**(AM/PM)과 '가능 수업 단위' 분모 규칙. 코드 판 교체(2024, CTF 26)와 판 사이 대응. '사유 미확인(N)' → 나중 정정 흐름 | 매일 출결 공유 파일, 출석률 보고 |
| EN | 입학부·출석부 수정 때 원래 항목 보존, 6년 | 추가 전용 + 정정 판 | 보존 기간 규칙 | 보존 기간이 끝나면 **폐기**할 수 있어야 한다(추가 전용과 충돌, 아래 8-9) | 검사용 출결부 출력 |
| EN | UPN(임시 → 정식), ULN, 시험 수험 번호 | — | 식별 체계별 형식·검사 글자 검증기 | **`external_identifiers`**: 체계, 발급 기관, 상태(임시·정식·대체됨), 유효 기간, 범위(평생·학교 생활·시험 회차), 민감도 | CTF·센서스의 식별 항목 |
| EN | CTF 학생 이관(연 단위 판) | 학적·전학 사건 | — | **이관 패키지 사건**(보냄·받음·가져옴)과 받은 자료를 원본 행(`source_rows`)으로 보존 | CTF XML(판마다 프로필) |
| EN | 학교 센서스(연 3회, 기준일, 명세 판) | 마감 판(비슷함) | 회차·기준일·항목 적용표 | **법정 제출 스냅샷**: 수집 id, 명세 판, 기준일(as-of), 제출 판·재제출. 기준일 시점의 학적·속성을 **유효 시간으로 다시 계산**할 수 있어야 한다 | 센서스 파일, 요약 확인 보고서 |
| EN | 연간 보고서 법정 내용 | 결과·서술·출결 | — | — | 연간 보고서 양식(과목별 성취, 진전 의견, 출결, 논의 방법, NC 시험 결과) |
| ON | 과목 코드 5자(과목·학년·유형), 학점 | 과목·개설·학점 | 유형 코드(W·D·P·U·M·C·E·O) | 과목 정의에 **외부(관할) 과목 코드** 칸이 있어야 한다. 개설이 그 코드를 가리킨다 | OST 행 |
| ON | 전면 공개: 시도마다 행, W(점수와 함께), R(재이수) | 수강·결과 | W·R 결과 코드, 공개 기준일 규칙(첫 성적표 + 5일) | **시도(attempt)를 덮어쓰지 않는 수강 행**. 결과에 '철회 시점 점수' 같은 상태 + 값 조합 | OST |
| ON | OSSD 30학점, 필수/선택, 40시간, 문해 요건, 입학 연도별 요건 | 학점 | 요건 판 | **자격(award) 정의 + 입학 학년도 코호트에 묶인 요건 판**. 학점 아닌 요건(봉사 시간, 문해 시험)을 같은 감사(audit) 틀로 | 졸업 진행 보고 |
| ON | 수준 1–4 ↔ %, 글자(1–6)/%(7–12) | 척도 결과 | 척도 판, 척도 간 대응 | 같은 결과에 **여러 표현**(%, 수준)이 함께 있을 수 있다 | 성적표 |
| ON | 학습 기능·작업 습관 6개, E/G/S/N | 역량 틀(CASE 모양) | E/G/S/N 척도 | 교과와 따로 매기는 **비교과 평가 차원**(과목당 또는 학생당) | 성적표 |
| ON | OEN(검사 숫자, 레지스트리 발급, 법으로 사용 제한) | — | 검증기 | 식별자마다 **접근·공개 정책**(O. Reg. 440/01) | OnSIS 제출 |
| ON | OSR 55년 보존, 정정은 사실만, 이의 진술서 | 정정 판 | 보존 규칙 | **이의·정정 진술 첨부(record annotation)**: 정보 주체가 쓰고 원 기록에 연결, 출력에 함께 나간다 | OSR 폴더·OST 인쇄 정본 |
| BC | K–9 숙련 4단계, 10–12 글자+%, IE·W·SG·TS·RM·XMT | 척도 결과 | 척도·특수 코드 판, '성적 증명서에 IE 금지' 같은 **출력 제약 규칙** | — | 학습 갱신·학습 요약·성적 증명서 |
| BC | 핵심 역량 자기 성찰(학생 작성, 척도 없음), 목표 설정 | 서술 | — | 서술 작성자 역할에 **학생 본인**. 척도 없는 성찰 기록 유형 | 학습 갱신 |
| BC | Dogwood 80학점 + 졸업 평가 | 학점 | 요건 판 | 자격·요건 판(ON과 같은 틀) + 외부 평가 결과 | 성적 증명서 |
| BC | PEN, TRAX 종료 레코드 | 학적 사건 | — | 외부 식별자. 수집 쪽이 **명시적 종료 사건**을 요구하므로 학적 종료가 사건이어야 한다(행 삭제로는 안 됨) | TRAX 파일 |
| BC | 독립 Group 1–4, 해외 학교 | 학교 | 학교 분류 코드 | **학교의 관할·부문·인가**(무엇을 줄 수 있는지, 유효 기간)와 **프로그램 관할**(학교 소재지와 다를 수 있음) | — |
| AU | A–E(Year 1–10, 과목마다, 연 2회), 빅토리아 5단계 + 진전 | 척도 결과, 학기 나무 | A–E·5단계 척도 판, 유치원 예외 규칙 | **진전(지난 보고 대비)**을 계산하거나 적을 자리. 같은 학생·과목의 이전 보고 판을 참조할 수 있어야 한다 | 학기 보고서 |
| AU | HSC·RoSA·VCE(단위 S/N + 성취 수준), ATAR(외부 계산) | 과목·결과 | S/N 척도 | **이수 판정(S/N)과 성취 등급을 따로 담는 결과**. 외부 기관 결과(ATAR·연구 점수)를 읽기 전용으로 | 자격증 |
| AU | 출석 수준(1학기, 90%, 120분 넘는 부분 결석 = 반나절) | 출결 사건 | 계산 규칙 판(반올림 없음 등) | 출결 사건에 **시간(분) 정밀도**. 부분 결석을 시간으로 적어야 규칙이 반나절로 환산할 수 있다 | ACARA 출결 수집 파일 |
| AU | NSSC 8월 센서스, FTE, 학생 배경(부모 학력·직업) | 학적 | — | 학적 기간에 **전일제/시간제·FTE** 속성. 보호자 학력·직업은 민감 확장 필드(접근 정책 ADR) | 센서스·배경 자료 |
| AU | VSN·VCAA 번호·USI·NESA 번호 | — | 검증기 | 한 사람이 같은 관할에서 **목적이 다른 번호를 여러 개** 가진다 | — |
| AU | NAPLAN 4단계 | — | 척도 | 외부 평가 결과(국가 시험) | 개인 보고서 |
| NZ | NCEA: 성취·단위 기준마다 학점·수준, N/A/M/E, 60 + 20, 인증 | 학점·척도 결과 | N/A/M/E 척도, 요건 판 | **기준(standard)이 평가 단위**다. 학점을 주는 것이 과목(개설)이 아니라 개설 안의 기준. **학점 원천**을 과목 이수와 나눠야 한다. 인증은 여러 해 결과에서 계산하는 파생 판정 | NZQA 보고 파일 |
| NZ | NZROA가 정본, 1월 외부 결과 발표 | 성적 증명서 | — | **정본이 외부에 있다**: 우리 기록은 보조이고, 외부 결과를 가져와 판으로 쌓는다 | — |
| NZ | ENROL(국가 등록부, 다른 학교는 일부만 봄), NSN | 학적·전학 | — | 외부 식별자 + 외부 등록부와 맞춰 보기(reconciliation) 사건 | ENROL 연동 |
| NZ | eAR: 반나절 또는 교시, 기본 코드, 15개 코드(2025), 매일 보고 | 출결 사건 | 코드 판(26 → 15 대응) | ADR 0025 F3의 '교시 → 일 환산'과 같은 축. 반나절 단위도 1급으로 | 매일 출결 보고 |
| NZ | 진전 서술 5단계(2026), 연 2회(2027) | 척도 결과 | 5단계 척도, 'on track' 파생 규칙 | — | 학부모 보고서 |
| 공통 | 정정 거절 시 진술 첨부(ON·AU APP 13·NZ IPP 7), UK GDPR 정정권 | 정정 판 | 응답 기한 규칙(AU 30일 권장) | **기록 주석(진술) 개체 + 정정 요청 흐름**(요청·결정·이의) | 모든 출력에 진술 동반 |
| 공통 | 보존 기간(ON 55년, EN 25세까지, 출결부 6년) | — | 기록 유형 × 관할별 보존 규칙 | **보존 만료 처리**: 추가 전용 원장에서 법적 폐기를 어떻게 할지(ADR 필요) | — |

### 판단

- **결론 (추정, 근거는 위 표):** KR+US 핵심은 이 네 나라의 **구조 대부분을 흡수할 수 있다.** 학년, 학기 나무, 과목·개설, 학점, 척도 결과, 서술, 코드가 붙은 출결 사건, 마감 판, 성적 증명서가 그대로 쓰인다. 차이는 대부분 (b) 코드·척도·규칙 판과 (d) 출력 프로필로 들어간다.
- 다만 아래 다섯 가지는 출력 프로필로 해결되지 않는다. **(c) 핵심 쪽에 자리가 있어야 한다.**
  1. 학교 밖 기관이 정하는 자격과 외부 결과(GCSE·A level, NCEA, HSC·VCE·ATAR, Dogwood 평가)
  2. 관할마다 여러 개인 외부 식별자
  3. 수업 단위(AM/PM)·시간 단위 출결과 '가능 수업 단위' 분모
  4. 기준일 기준의 법정 제출 스냅샷
  5. 정보 주체의 진술 첨부와 보존 만료 처리
- US(Ed-Fi·CEDS) 모델은 학년·학점·성적 증명서·출결 코드에 강하다(추정). 그래서 (a) 범위는 넓다. 하지만 위 다섯 가지 중 자격·외부 결과와 보존 만료는 KR 학생부 모델에도 1급으로 없다(추정). KR+US 기준선에 **명시적으로 넣어야** 영어권을 출력 프로필로 받을 수 있다.

---

## 8. 토대에 주는 시사점 (ADR 0025 층에 맞춰)

각 항목은 이 조사에서 나온 **추정·제안**이다. 채택은 ADR로 한다.

1. **L1 학년 정규화 — 확인·보강.** `grade_levels`는 지역 표기와 정규 서수(학교 교육 연수 또는 나이대)를 함께 둔다. 학년 배정 기준일은 학교급·관할의 규칙 판으로 둔다(England 8/31 출생 구간, AU 나이 기준 7/1, NZ Year 0·재정 학년). 출력 프로필은 정규 서수로 변환하고, 표기 문자열로 비교하지 않는다(지침 7의 '이름으로 잇지 않는다'와 같은 원리).
2. **L1 학기 나무 — 확인.** 노드 `kind`에 `half_term`, `semester`, `reporting_period`, `census_period`를 둔다. 운영 단위와 보고 단위가 다른 나무를 허용한다(텀 4개 + 학기 2개가 같은 학년도). 학년도가 달력 연도를 넘나드는 경우와 안 넘는 경우를 모두 시험한다. ADR 0025 F1의 '학기제 3종'에 '4텀+2학기 동시'와 '학기제/비학기제 혼재'를 더한다.
3. **L2 `external_identifiers` — 확인·구체화.**
   - 칸: `scheme`(UPN·ULN·OEN·PEN·VSN·VCAA·USI·NSN·NESA·수험 번호…), `issuer`, `value`, `status`(임시·정식·대체됨·폐지), `valid_from/to`, `scope`(평생·학교 생활·시험 회차), `sensitivity`
   - 체계별 형식·검사 글자 검증기는 E2 규칙 판으로 둔다.
   - 사람을 잇는 키로 쓰지 않는다(id로만 참조).
   - OEN처럼 법으로 사용이 제한된 번호는 체계마다 열람 정책을 둔다(ADR 0025의 '민감 식별자는 별도 비공개 확장' 원칙과 같은 경로).
4. **L4 출결 — 보강.**
   - `attendance_events`에 시간 축을 셋 다 담는다: 수업 단위(`session`: AM·PM), 교시, 분 단위 시작·끝.
   - 코드 판마다 **통계 범주**를 속성으로 붙인다: 출석, 허가 결석, 무단 결석, 승인된 교외 활동, 가능 수업 단위 아님, 미확인.
   - '가능 수업 단위' 분모와 출석률·출석 수준은 계산 규칙 판으로 둔다(AU: 120분 넘는 부분 결석 = 반나절, 반올림 없음).
   - 코드 목록 판 사이 대응(EN 2024 개편, NZ 26 → 15)을 `code_lists`의 이전 코드 칸으로 표현한다.
   - '사유 미확인' 코드 → 정정 사건 흐름을 기본으로 둔다. 원래 항목 보존은 추가 전용 원장이 이미 만족한다(EN 2024 규정과 맞는다).
5. **L3/L6 자격(qualification) 층 — 새로 추가(ADR 필요).**
   - `qualifications`(판, 수여 기관 = 학교 밖일 수 있음)
   - `qualification_requirement_sets`(판, **적용 코호트 = 입학 학년도**. ON은 2024–25 Grade 9부터 요건이 다르다)
   - 요건 항목: 학점 묶음, 필수 과목, 외부 시험, 봉사 시간, 문해 요건
   - `credit_sources`: 개설 이수 / 기준(standard) 이수 / 동등 인정(PLAR·전입 TS) / 외부 결과
   - 수여·인증 사건(`award_events`)
   - 진행 감사(졸업 진행 상황)는 저장된 진실이 아니라 **원장에서 다시 계산하는 투영**이다(ADR 0025 쌍대성 원칙).
6. **L4 외부 결과 — 새로 추가.**
   - `external_results`: 원천 기관, 시험 회차, 수험 번호(외부 식별자 참조), 척도 판, 값(이중 등급 허용), 상태(잠정·확정·재채점 후 변경)
   - 학교가 고칠 수 없고, 원천이 바꾸면 이전 판을 가리키는 새 판을 쌓는다. 가져온 파일은 `source_rows`로 보존한다(지침 4).
   - NZROA·ENROL·LRS처럼 **정본이 외부에 있는** 경우 우리 기록이 보조임을 표시하고, 맞춰 보기(reconciliation) 사건을 둔다.
7. **L4 결과·수강 — 보강.**
   - 수강은 **시도(attempt) 단위 행**으로 두고, 재이수·철회도 행을 지우지 않는다(ON 전면 공개).
   - 결과는 `result_kind` 하나 안에 여러 표현을 허용한다(%와 수준, 글자와 %). 특수 결과 코드(W·R·I·IE·TS·RM·U·X·SG)와 '철회 시점 점수' 같은 상태 + 값 조합을 담는다.
   - 이수 판정(S/N, 학점 인정)과 성취 등급을 따로 담는다(VCE Units 1·2).
   - 비교과 평가 차원(ON 학습 기능 6개, BC 핵심 역량)은 `competency_frameworks`로 두고, 학생 작성 서술(자기 성찰·목표)을 `narratives` 작성자 역할로 둔다.
8. **L6 법정 제출 스냅샷 — 새로 추가(마감 판과 구분).**
   - `statutory_returns`: 수집 id, 명세 판(EN 센서스·CTF는 해마다 판), 기준일(as-of), 생성 원장 시점, 제출·재제출 판, 검증 결과
   - 마감 판이 '진실을 고정'한다면, 제출 스냅샷은 '그 기준일의 투영을 고정'한다.
   - 이를 위해 학적·속성(전일제/FTE, 기숙, 급식 지원 자격)은 **유효 기간을 가진 사건**이어야 한다. 기준일 시점의 값을 나중에 다시 계산할 수 있어야 한다(ADR 0025의 시간 축 셋과 맞는다).
   - 학적 종료는 행 삭제가 아니라 사건이다(BC TRAX 종료 레코드).
9. **정정 요청·기록 주석·보존 만료 — 새로 추가(ADR 필요).**
   - `record_annotations`: 정보 주체(또는 보호자)의 이의·정정 진술. 원 기록에 연결하고, 출력 프로필이 반드시 함께 낸다(ON·AU·NZ 공통).
   - 정정 요청 흐름: 요청 → 결정(사실/의견 구분) → 이의 → 진술 첨부
   - 기록 유형 × 관할별 보존 규칙(ON 55년, EN 25세까지, 출결부 6년)
   - 추가 전용 원장에서의 **법적 폐기 방법**(가림 판 또는 사람별 암호 키 폐기 같은 방식)을 따로 결정해야 한다. 지침 4(수정·삭제 금지)와 개인정보법의 삭제·보존 만료 의무가 맞부딪히는 지점이라 사용자 결정 대상이다.
10. **L0 학교 정의 — 보강.**
    - 학교에 `jurisdiction`(국가·주), 부문(공립·독립·해외 인증·국제), 인가 목록(`school_authorizations`: 어떤 자격·학점을 줄 수 있는지, 검사·인증 유효 기간)을 둔다.
    - **프로그램 관할**은 학교가 아니라 자격·개설에 붙인다(태국 캠퍼스가 BC Dogwood를 운영하는 경우처럼).
11. **출력 프로필 — 범위 확인.**
    - 문서형: 성적표, OST, BC 성적 증명서, EN 연간 보고서, A–E 보고서
    - **기계 연동형**: CTF XML, 센서스 파일, eAR·ENROL·TRAX·OnSIS 제출. 연동형은 연 단위 명세 판을 따라 프로필 판을 바꾼다.
    - 출력 제약 규칙(BC 'IE는 성적 증명서에 못 씀', ON 'W는 공개 기준일 이후만')은 프로필 판의 검증 규칙으로 둔다. 어기면 질문을 연다(지침 6).

### 확인 필요 목록 (2차 검증 때 원문 대조)
- EN 출결 코드 전체 표(2026 지침 8장)와 출석부 수정 보존 조항의 정확한 범위. CTF 이관 기한의 기산점. A level A*–E 원문.
- ON 수준 1–4 ↔ % 구간, 성적표 연간 횟수, 등록 학생 수 기준일, OSR 보존 기간의 부분별 차이(55년 / 5년).
- BC 서면 학습 갱신 횟수(판끼리 어긋남), 글자 등급 구간 전체, 1701 수집 기준일.
- AU Australian Education Regulations 2023 조문, ISDTN(주 간 이관), NSW 학생 번호, 독립학교의 Privacy Act 소기업 예외.
- NZ 학교 기록 처분 기준(Public Records Act), 2025 출결 코드 15개 목록.

---

## 출처

확인 날짜는 모두 2026-11-25이고, 모두 검색 엔진 발췌로 확인했다(원문 직접 열람 실패). '2차'는 정부 원문이 아닌 교육청·학교·벤더 자료다.

| 번호 | 제목 | URL | 확인 날짜 |
| --- | --- | --- | --- |
| E1 | Working together to improve school attendance 2026 (DfE) | https://assets.publishing.service.gov.uk/media/6a4f9ec6a6586e258d371bd0/Working_together_to_improve_school_attendance_2026.pdf | 2026-11-25 |
| E2 | Share your daily school attendance data (GOV.UK) | https://www.gov.uk/guidance/share-your-daily-school-attendance-data | 2026-11-25 |
| E3 | The School Attendance (Pupil Registration) (England) Regulations 2024 | https://www.legislation.gov.uk/uksi/2024/208/made | 2026-11-25 |
| E4 | Minister for Schools letter to headteachers on attendance (2024-03) | https://content.govdelivery.com/attachments/UKDFE/2024/03/01/file_attachments/2800199/Minister%20Hinds%20letter%20to%20headteachers%20on%20attendance.pdf.pdf | 2026-11-25 |
| E5 | Nottinghamshire attendance codes (2차) | https://www.nottinghamshire.gov.uk/media/dbpb32da/attendancecodes.pdf | 2026-11-25 |
| E6 | CTF 26 technical specification v1.1 | https://assets.publishing.service.gov.uk/media/6a743e1bff25cc81486b242a/CTF_26_technical_specification_v1.1.pdf | 2026-11-25 |
| E7 | Common transfer file (CTF) and co-ordinated admissions data (collection) | https://www.gov.uk/government/collections/common-transfer-file-ctf-and-co-ordinated-admissions-data | 2026-11-25 |
| E8 | Common Transfer File 20 guide | https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/911157/Common_Transfer_File_20_guide.pdf | 2026-11-25 |
| E9 | Unique pupil numbers (GOV.UK) | https://www.gov.uk/government/publications/unique-pupil-numbers | 2026-11-25 |
| E10 | UPN Guide 1.2 (DERA 보관본) | https://dera.ioe.ac.uk/id/eprint/33532/1/UPN_Guide_1.2.pdf | 2026-11-25 |
| E11 | Staffordshire — Additional Notes Temporary UPNs, January 2026 (2차) | https://www.staffordshire.gov.uk/sites/default/files/2026-01/January-2026-Additional-Notes-Temporary-UPNs.pdf | 2026-11-25 |
| E12 | Using the Learning Records Service (LRS) for learning providers and local authorities | https://gov.uk/government/publications/learner-registration-bodies-user-guide/using-the-learning-records-service-lrs-for-learning-providers-and-local-authorities | 2026-11-25 |
| E13 | ILR specification 2025 to 2026 — ULN | https://guidance.submit-learner-data.service.gov.uk/25-26/ilr/entity/Learner/field/ULN | 2026-11-25 |
| E14 | Complete the school census: data items 2026 to 2027 | https://www.gov.uk/guidance/complete-the-school-census/data-items-2026-to-2027 | 2026-11-25 |
| E15 | 2026 to 2027 school census business and technical specification v1.2 | https://assets.publishing.service.gov.uk/media/6a9ffde392e72b8ac437ef10/2026_to_2027_school_census_business_and_technical_specification_v1.2.pdf | 2026-11-25 |
| E16 | School Census Autumn 2026 LA Guide (Waltham Forest, 2차) | https://thehub-beta.walthamforest.gov.uk/sites/default/files/2026-08/School_Census_Autumn_2026_LA_Guide.pdf | 2026-11-25 |
| E17 | The Education (Pupil Information) (England) Regulations 2005 | https://www.legislation.gov.uk/uksi/2005/1437/body/made | 2026-11-25 |
| E18 | Ibid. Schedule 1 — head teacher's annual report | https://legislation.gov.uk/uksi/2005/1437/schedule/1/data.html | 2026-11-25 |
| E19 | GCSE 9 to 1 grade scale explained | https://www.gov.uk/government/publications/gcse-9-to-1-grade-scale-explained/gcse-9-to-1-grade-scale-explained | 2026-11-25 |
| E20 | Pearson — 9-1 awarding FAQs (2차) | https://qualifications.pearson.com/en/support/support-topics/results-certification/understanding-marks-and-grades/9-1-awarding-faqs.html | 2026-11-25 |
| E21 | Qualification results in England, summer 2026 (Ofqual) | https://www.gov.uk/government/publications/qualification-results-in-england-summer-2026 | 2026-11-25 |
| E22 | National curriculum in England: framework for key stages 1 to 4 | https://www.gov.uk/government/publications/national-curriculum-in-england-framework-for-key-stages-1-to-4/the-national-curriculum-in-england-framework-for-key-stages-1-to-4 | 2026-11-25 |
| E23 | Minimum school week non-statutory guidance (DERA) | https://dera.ioe.ac.uk/id/eprint/40013/1/Minimum_School_Week_Non-Statutory_Guidance.pdf | 2026-11-25 |
| E24 | 2027 key stage 2 assessment and reporting arrangements | https://www.gov.uk/government/publications/key-stage-2-assessment-and-reporting-arrangements-ara/2027-key-stage-2-assessment-and-reporting-arrangements | 2026-11-25 |
| E25 | Independent school standards guidance, April 2026 | https://assets.publishing.service.gov.uk/media/69c3d64593cc6e8b87a6f636/Independent_school_standards_guidance_April_2026.pdf | 2026-11-25 |
| E26 | Registration of independent schools (DfE) | https://assets.publishing.service.gov.uk/media/6aaa9c8cf1f8d2a39605f8c9/Registration_of_independent_schools.pdf | 2026-11-25 |
| E27 | Data protection in schools — data retention | https://www.gov.uk/guidance/data-protection-in-schools/data-retention | 2026-11-25 |
| E28 | SWGfL — GDPR rights and obligations (2차) | https://swgfl.org.uk/resources/gdpr-guidance-for-schools-and-colleges/part-5-gdpr-rights-and-obligations/ | 2026-11-25 |
| E29 | 2016 KS1 ARA — keeping and maintaining records | https://gov.uk/guidance/2016-key-stage-1-assessment-and-reporting-arrangements-ara/section-10-keeping-and-maintaining-records | 2026-11-25 |
| O1 | Ontario Student Record (OSR) guideline | https://www.ontario.ca/page/ontario-student-record-osr-guideline | 2026-11-25 |
| O2 | IPC — A Guide to Privacy and Access to Information in Ontario Schools | https://ipc.on.ca/en/node/2618 | 2026-11-25 |
| O3 | IPC — Can students and parents request correction of inaccurate records? | https://ipc.on.ca/en/node/2607 | 2026-11-25 |
| O4 | Ontario Student Transcript manual | https://www.ontario.ca/page/ontario-student-transcript-manual | 2026-11-25 |
| O5 | OSR guideline Appendix C | https://files.ontario.ca/edu-osr/edu-osr-guideline-appendix-c-en-2022-02-04.pdf | 2026-11-25 |
| O6 | York School — Ontario Ministry of Education Full Disclosure Policy (2차) | https://academicprogram.yorkschool.com/full-disclosure | 2026-11-25 |
| O7 | Growing Success | https://ontario.ca/page/growing-success-assessment-evaluation-and-reporting-ontario-schools-kindergarten-grade-12 | 2026-11-25 |
| O8 | Student assessment, evaluations and report cards | https://www.ontario.ca/page/student-assessment-evaluations-and-report-cards | 2026-11-25 |
| O9 | HWDSB — Understanding the Provincial Report Card Gr 1–12 (2차) | https://www.hwdsb.on.ca/wp-content/uploads/2022/05/9.-Understanding-the-Provincial-Report-Card-Gr-1-12-ENG.pdf | 2026-11-25 |
| O10 | Ontario Schools K–12 — 6.1 Ontario Secondary School Diploma | https://www.ontario.ca/document/ontario-schools-kindergarten-grade-12-policy-and-program-requirements/diploma-and-certificate-requirements-related-procedures | 2026-11-25 |
| O11 | Curriculum and Resources — course descriptions and prerequisites, introduction | https://www.dcp.edu.gov.on.ca/en/course-descriptions-and-prerequisites/introduction | 2026-11-25 |
| O12 | O. Reg. 440/01: Ontario Education Numbers | https://www.ontario.ca/laws/regulation/010440 | 2026-11-25 |
| O13 | Collection and use of education information | https://www.ontario.ca/page/collection-and-use-education-information | 2026-11-25 |
| O14 | Enrolment register instructions | https://www.ontario.ca/page/enrolment-register-instructions | 2026-11-25 |
| O15 | CDSBEO Attendance Handbook (2차) | https://www.cdsbeo.on.ca/policies/Form/B5-8_AttendanceHandbook.pdf | 2026-11-25 |
| O16 | Private schools: Notice of intention to operate a private school | https://ontario.ca/page/private-schools-notice-intention-operate-private-school | 2026-11-25 |
| O17 | Private schools: policy and procedures manual | https://www.ontario.ca/page/private-schools-policy-and-procedures-manual-0 | 2026-11-25 |
| B1 | BC Graduation requirements | https://www2.gov.bc.ca/gov/content/education-training/k-12/administration/legislation-policy/public-schools/graduation-requirements | 2026-11-25 |
| B2 | BC Transcript legend information | https://www2.gov.bc.ca/gov/content/education-training/k-12/support/transcripts-and-certificates/transcript-legend-information | 2026-11-25 |
| B3 | BC K–12 Student Reporting policy | https://www2.gov.bc.ca/gov/content/education-training/k-12/administration/legislation-policy/public-schools/student-reporting | 2026-11-25 |
| B4 | K–12 reporting educator summary guide | https://curriculum.gov.bc.ca/sites/curriculum.gov.bc.ca/files/pdf/reporting/k-12-reporting-educator-summary-guide.pdf | 2026-11-25 |
| B5 | Information for parents and caregivers: how will I know how my child is doing | https://www2.gov.bc.ca/assets/gov/education/administration/kindergarten-to-grade-12/information-for-parents-and-caregivers-how-will-i-know-how-my-child-is-doing.pdf | 2026-11-25 |
| B6 | Personal Education Number (PEN) information for administrators | https://www2.gov.bc.ca/gov/content/education-training/k-12/administration/program-management/pen | 2026-11-25 |
| B7 | TRAX data transfer specifications | https://www2.gov.bc.ca/assets/gov/education/administration/kindergarten-to-grade-12/exams/trax_data_transfer_specifications.pdf | 2026-11-25 |
| B8 | Deputy Minister's Bulletin — January 2025 graduation assessment results | https://blog.gov.bc.ca/ecc-dm-bulletin/article/january-2025-graduation-assessment-results/ | 2026-11-25 |
| B9 | Classification of independent schools | https://www2.gov.bc.ca/gov/content/education-training/k-12/administration/legislation-policy/independent-schools/classification-of-independent-schools | 2026-11-25 |
| B10 | British Columbia Offshore School Program | https://www2.gov.bc.ca/gov/content/education-training/k-12/administration/program-management/international-education/offshore-schools | 2026-11-25 |
| B11 | BC for High School — offshore | https://bcforhighschool.gov.bc.ca/offshore/ | 2026-11-25 |
| B12 | SD6 provincial letter grades document (2차) | https://www.sd6.bc.ca/download/416211 | 2026-11-25 |
| B13 | Course Registry overview | https://www.bced.gov.bc.ca/datacollections/course_registry_web_search/overview.php | 2026-11-25 |
| A1 | ACARA — National standards for student attendance data reporting | https://acara.edu.au/reporting/national-standards-for-student-attendance-data-reporting | 2026-11-25 |
| A2 | ACARA — National Report on Schooling: student attendance | https://acara.edu.au/reporting/national-report-on-schooling-in-australia/student-attendance | 2026-11-25 |
| A3 | NSW metadata — attendance (2020 calculation changes) | https://metadata.nsw.gov.au/item/11448/graphs | 2026-11-25 |
| A4 | Victoria PAL — Reporting student achievement: policy | https://www2.education.vic.gov.au/pal/reporting-student-achievement/policy | 2026-11-25 |
| A5 | Victoria PAL — Reporting requirements | https://www2.education.vic.gov.au/pal/reporting-student-achievement/guidance/reporting-requirements | 2026-11-25 |
| A6 | NESA — Reporting and using grades | https://curriculum.nsw.edu.au/assessment-and-reporting/reporting-and-using-grades | 2026-11-25 |
| A7 | NSW Curriculum — curriculum structure | https://curriculum.nsw.edu.au/use-the-curriculum/learn-about-nsw-curriculum/curriculum-structure | 2026-11-25 |
| A8 | Australian Education Regulation 2013 (as made) | https://legislation.gov.au/F2013L01476/asmade/2013-07-31/text/original/epub/OEBPS/document_1/document_1.html | 2026-11-25 |
| A9 | NESA — Record of School Achievement (RoSA) | https://www.nsw.gov.au/education-and-training/nesa/leaving-school/rosa | 2026-11-25 |
| A10 | NESA — HSC rules and procedures 2026: results | https://www.nsw.gov.au/education-and-training/nesa/hsc/rules-and-procedures/2026-guide/results | 2026-11-25 |
| A11 | VCAA — Find out about student numbers | https://vcaa.vic.edu.au/administration/school-administration/student-numbers/find-out-about-student-numbers | 2026-11-25 |
| A12 | VCE Administrative Handbook 2026 | https://www.vcaa.vic.edu.au/sites/default/files/2026-08/2026_VCEAdministrativeHandbook.docx | 2026-11-25 |
| A13 | USI — students | https://www.usi.gov.au/student | 2026-11-25 |
| A14 | QCAA — data management and USI procedures | https://www.qcaa.qld.edu.au/senior/vet/compliance/data-management-usi-procedures | 2026-11-25 |
| A15 | NAPLAN proficiency level descriptions | https://nap.edu.au/docs/default-source/naplan/naplan-proficiency-level-descriptions.pdf | 2026-11-25 |
| A16 | ABS — Schools methodology 2024 | https://abs.gov.au/methodologies/schools-methodology/2024 | 2026-11-25 |
| A17 | ACARA — Student background data collection for independent schools | https://www.acara.edu.au/reporting/student-background-data-collection-for-independent-schools | 2026-11-25 |
| A18 | AISNSW — School reporting and data collection (2차) | https://www.aisnsw.edu.au/school-leaders/policy-and-compliance/school-reporting-and-data-collection | 2026-11-25 |
| A19 | OAIC — APP Guidelines Chapter 13: correction of personal information | https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-13-app-13-correction-of-personal-information | 2026-11-25 |
| A20 | OAIC — Correct your personal information | https://www.oaic.gov.au/privacy/your-privacy-rights/your-personal-information/correct-your-personal-information | 2026-11-25 |
| A21 | Privacy Act 1988 (Cth) | https://www.legislation.gov.au/C2004A03712/2025-02-01 | 2026-11-25 |
| N1 | NZQA — NCEA levels and certificates | https://www2.nzqa.govt.nz/ncea/about-ncea/ncea-levels-and-certificates/ | 2026-11-25 |
| N2 | NZQA — NCEA endorsements | https://www2.nzqa.govt.nz/ncea/about-ncea/ncea-endorsements/ | 2026-11-25 |
| N3 | NZQA — NCEA Factsheet 2 | https://www2.nzqa.govt.nz/assets/About-us/Publications/Resources-and-videos/NCEA-Factsheet-2.pdf | 2026-11-25 |
| N4 | Ministry of Education — National student numbers: schools | https://www.education.govt.nz/education-professionals/schools-year-0-13/attendance-and-enrolment/national-student-numbers-schools | 2026-11-25 |
| N5 | Guide to using ENROL — creating a student record | https://education.govt.nz/school/managing-and-supporting-students/enrolling-students/guide-to-using-enrol/creating-a-student-record | 2026-11-25 |
| N6 | ENROL — Guidelines | https://applications.education.govt.nz/node/270 | 2026-11-25 |
| N7 | Education Circular 2013/21 | https://www.education.govt.nz/our-work/publications/education-circulars/education-circular-201321 | 2026-11-25 |
| N8 | Attendance registers (Ministry of Education) | https://www.education.govt.nz/education-professionals/schools-year-0-13/attendance/attendance-registers | 2026-11-25 |
| N9 | Refreshed attendance codes, Term 1 2025 | https://www.education.govt.nz/news/refreshed-attendance-codes-term-1-2025 | 2026-11-25 |
| N10 | Attendance codes (Ministry of Education) | https://www.education.govt.nz/education-professionals/schools-year-0-13/attendance/attendance-codes | 2026-11-25 |
| N11 | Daily attendance reporting | https://www.education.govt.nz/education-professionals/schools-year-0-13/attendance/daily-attendance-reporting | 2026-11-25 |
| N12 | Guide: your child's reporting and progress | https://www.education.govt.nz/parents-and-caregivers/schools-year-0-13/parent-portal/guide-your-childs-reporting-and-progress | 2026-11-25 |
| N13 | Changes to school planning and parent reporting | https://www.education.govt.nz/news/changes-school-planning-and-parent-reporting | 2026-11-25 |
| N14 | Tahurangi — Reporting and assessment requirements and expectations for 2026 | https://tahurangi.education.govt.nz/reporting-assessment-requirements-expectations-for-2026 | 2026-11-25 |
| N15 | Education Counts — student population (1 July roll returns) | https://www.educationcounts.govt.nz/know-your-region/region/student-population?region=1 | 2026-11-25 |
| N16 | Privacy Commissioner — Principle 7 | https://www.privacy.org.nz/privacy-principles/7/ | 2026-11-25 |
| N17 | Privacy Commissioner — Children's privacy guidance for the education sector, ch. 13 | https://www.privacy.org.nz/resources-and-learning/a-z-topics/protecting-children-and-young-peoples-privacy/childrens-privacy-guidance-for-the-education-sector/chapter-13-managing-information-requests/ | 2026-11-25 |
| N18 | Privacy Act 2020 (NZ) | https://legislation.govt.nz/act/public/2020/31/en/latest/ | 2026-11-25 |
| N19 | NZQA — electronic sample NZROA NCEA results | https://www2.nzqa.govt.nz/assets/Qualifications-standards/Results/electronic-sample-NZROA-NCEA-results.pdf | 2026-11-25 |
| N20 | NZQA — managing candidate information | https://www2.nzqa.govt.nz/ncea/ncea-for-teachers-and-schools/managing-national-assessment-in-schools/managing-school-data/candidate-information/ | 2026-11-25 |
