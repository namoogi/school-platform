# REA 갈래 보고서: 교육 데이터 표준과 도메인 모델

- 작성: 2026-11-25 · 조사 갈래: 교육 데이터 표준·도메인 모델 (학교 플랫폼 핵심 데이터 모델 근거)
- 표기: **사실 (출처)** = 1차 문서·공식 저장소에서 확인 / **사실 (검색 요약)** = 웹 검색 결과 요약에서만 확인, 원문 미열람 / **추정** = 조사자 판단 / **확인 필요** = 근거 부족
- 개인정보 없음. 표준 문서의 엔터티·필드 이름은 원문 철자 그대로 적었다.

## 0. 방법과 한계 (먼저 읽기)

1. 이 세션 네트워크는 **GitHub·raw.githubusercontent.com·npm·PyPI만 열려 있고**, 표준 기관 사이트(docs.ed-fi.org, ceds.ed.gov, imsglobal.org, standards.1edtech.org, a4l.org, schema.org, neis.go.kr, data.go.kr, moe.go.th)는 프록시가 막았다. 그래서
   - Ed-Fi·CEDS·Open Badges·xAPI·Caliper·schema.org는 **공식 GitHub 저장소를 직접 받아** 모델 파일·DDL·스키마를 읽었다(가장 강한 근거).
   - CASE는 공식 사이트 대신 **OpenSALT(CASE 구현체) 저장소에 들어 있는 CASE 1.1 JSON 스키마**를 읽었다(2차 사본).
   - OneRoster는 공식 문서를 못 열어 **웹 검색 요약 + 제3자 TypeScript 패키지(@longsightgroup/oneroster)의 1.2 형 정의**로 교차 확인했다(2차).
   - CLR 2.0, SIF, LIS/LTI, 한국·태국 자료는 **웹 검색 요약만** 근거다.
2. 공식 사이트를 열어 다시 확인하려면 세션 네트워크 설정에서 위 호스트를 허용해야 한다.
3. Ed-Fi는 요청서의 v5.x 이후 **v6.0(2025-11-14)·v6.1(2026-05-07)** 이 이미 나와 있어 둘 다 반영했다.

---

## 1. 표준별 요약

### 1.1 Ed-Fi Data Standard (v5.2 → v6.1, 저장소 HEAD는 6.2 개발판)

| 항목 | 내용 | 근거 |
| --- | --- | --- |
| 목적 | K-12 시스템 간 상호운용을 위한 데이터 표준. 도메인별 모델 + XML(Bulk Interchange)·REST(Resource API) 바인딩 | 사실 (https://github.com/Ed-Fi-Alliance-OSS/Ed-Fi-Data-Standard README) |
| 거버넌스 | Ed-Fi Alliance(비영리). 변경은 Tracker(DATASTD)·RFC로 공개 진행 | 사실 (같은 README; RFC 27 = DS 6.0, 검색 요약 https://edfi.atlassian.net/wiki/spaces/rc/pages/1018757138) |
| 라이선스 | Apache License 2.0 | 사실 (저장소 LICENSE·README) |
| 판 | 태그 v5.0.0~v5.2.0, v6.0.0, v6.0.1, v6.1.0. HEAD 커밋(2026-11-20)은 "6.2 Model Changes", XML 네임스페이스 `http://ed-fi.org/6.2.0` | 사실 (저장소 태그·Descriptors/*.xml) |
| v6 변화 | v6.0은 **파괴적 변경**: StudentEducationOrganizationAssociation(SEOA)·Staff 분해, 교원양성(EPDM) 모델을 Core로 편입. 2026–27 학년도 배치 목표. v6.1은 비파괴 | 사실 (검색 요약 https://docs.ed-fi.org/reference/data-exchange/data-standard/whats-new/whats-new-v60 , …/whats-new-v61) |
| v6 신규 확인 | v6.1.0 태그에는 `StudentDemographic`·`StudentDirectory`·`StudentIdentificationCode`, **Path 도메인**(`Path`·`PathPhase`·`PathMilestone`·`StudentPath`·`StudentPathPhaseStatus`·`StudentPathMilestoneStatus`)이 있고 v5.2.0에는 없다. 기술자(descriptor) 파일 203개(v5.2) → 267개(HEAD) | 사실 (저장소 태그 비교, Models/Path.mmd) |
| "Unifying Data Model" | Ed-Fi가 v3 이후 모델을 부르는 이름으로 알려져 있으나 이번에 원문으로 확인하지 못함 | 확인 필요 |

**핵심 엔터티와 식별(identity, 모델 파일의 "I" 표시 = 자연 키)** — 사실 (저장소 `Models/*.mmd`)

| 영역 | 엔터티 | 식별(자연 키) |
| --- | --- | --- |
| 교육기관 | `EducationOrganization`(상위형), `School`, `LocalEducationAgency`, `StateEducationAgency`, `EducationOrganizationNetwork`, `OrganizationDepartment`, `FeederSchoolAssociation` | 각 `…Id` 정수; Feeder는 FeederSchool+School+BeginDate |
| 달력 | `Session`(Term 기술자, BeginDate·EndDate·TotalInstructionalDays), `GradingPeriod`, `Calendar`, `CalendarDate`, `AcademicWeek` | Session = SessionName+SchoolYear+School; GradingPeriod = School+GradingPeriod(기술자)+GradingPeriodName+SchoolYear |
| 사람 | `Student`, `Staff`, `Contact`(구 Parent), `Person`(PersonId+SourceSystem) | StudentUniqueId / StaffUniqueId / ContactUniqueId |
| 소속·관계 | `StudentSchoolAssociation`(EntryDate·ExitWithdrawDate·EntryGradeLevel…), `StaffSchoolAssociation`, `StaffEducationOrganizationAssignmentAssociation`(BeginDate), `StaffEducationOrganizationEmploymentAssociation`, `StudentContactAssociation`(Relation, LegalGuardian, EmergencyContactStatus, ContactRestrictions…) | SSA = Student+School+**EntryDate**; 배정 = Staff+EdOrg+StaffClassification+**BeginDate** |
| 교육과정 | `Course`(CourseCode+EducationOrganization, `CourseDefinedBy`·`CompetencyLevel`·`LearningStandard` 참조·학점), `CourseOffering`(LocalCourseCode+School+Session → Course), `Section`(SectionIdentifier+CourseOffering), `ClassPeriod`, `Location`, `Program` | |
| 수강·배정 | `StudentSectionAssociation`(BeginDate·EndDate·HomeroomIndicator·AttemptStatus), `StaffSectionAssociation`(BeginDate), `GeneralStudentProgramAssociation` | Student+Section+**BeginDate** |
| 출결 | `StudentSchoolAttendanceEvent`, `StudentSectionAttendanceEvent`, `StudentProgramAttendanceEvent`, `SectionAttendanceTakenEvent`(출석 체크 완료 사건), `StaffAbsenceEvent` | 공통 `AttendanceEvent` = EventDate + AttendanceEventCategory(기술자) + 사유 |
| 성적부 | `GradebookEntry`(GradebookEntryIdentifier+Namespace), `StudentGradebookEntry` | |
| 성적표 | `Grade`(GradeType+StudentSectionAssociation+GradingPeriod; LetterGradeEarned·NumericGradeEarned·DiagnosticStatement·LearningStandardGrade), `ReportCard`, `CompetencyObjective`, `StudentCompetencyObjective`(CompetencyLevel·DiagnosticStatement) | |
| 성취 기준 | `LearningStandard`(LearningStandardId, ParentLearningStandard, Namespace, URI, ContentStandard), `LearningStandardEquivalenceAssociation` | |
| 학적부·증명 | `StudentAcademicRecord`(Student+EdOrg+SchoolYear+**Term**; 누적·학기 학점, Diploma, GPA, Recognition), `CourseTranscript`(CourseAttemptResult+Course+StudentAcademicRecord), `GraduationPlan` | |
| 자격 | `Credential`(교원 자격 성격; CredentialIdentifier+발급 주), `CredentialEvent`, `Certification`, `CertificationExam(Result)` | |
| 경로(v6) | `Path`→`PathPhase`→`PathMilestone`, `StudentPath`(Period), `StudentPathPhaseStatus`·`StudentPathMilestoneStatus`(완료 표시·상태 사건) | |

**식별자**: 자연 키(복합) 중심. 연관 엔터티는 날짜(EntryDate·BeginDate)를 키에 넣어 **같은 사람-기관 관계가 여러 기간 존재**할 수 있게 한다. 외부 식별자는 `StudentIdentificationCode`(식별 체계 기술자 + 부여 기관)처럼 별도 행. — 사실 (Models)

**시간·이력**: 연관에 시작·종료일(유효 기간). 기술자 자체도 `EffectiveBeginDate`·`EffectiveEndDate`·`PriorDescriptor`(직전 동등 코드)를 가진다. 출결은 사건 행. 레코드(시스템) 시간 축은 표준에 없다. — 사실 (Schemas/Bulk/Ed-Fi-Core.xsd `DescriptorType`) / 시스템 시간 부재는 추정

**확장**:
- **기술자(Descriptor)**: 열거형 대신 `CodeValue`·`ShortDescription`·`Description`·`Namespace`(URI)를 가진 코드 행. Ed-Fi 기본값은 `uri://ed-fi.org/<이름>Descriptor`이고, 주·학군은 자기 네임스페이스로 값을 추가·대체한다. — 사실 (Descriptors/AttendanceEventCategoryDescriptor.xml, XSD) · 주가 자기 URL에 어휘를 게시하는 관행은 사실 (검색 요약 https://docs.ed-fi.org/reference/data-exchange/xsd-guidelines/implementation/descriptors)
- **확장 모델**: MetaEd 언어로 확장 프로젝트를 쓰고, 기존 리소스에 더한 필드는 API JSON의 `_ext` 노드 아래에 둔다(코어 필드를 바꾸지 않음). 새 엔터티·새 기술자도 확장으로 추가. — 사실 (검색 요약 https://docs.ed-fi.org/reference/ed-fi-api/8/platform-dev-guide/extensibility-customization/extending-api-datamodel)

### 1.2 CEDS (Common Education Data Standards) — IDS v14

| 항목 | 내용 | 근거 |
| --- | --- | --- |
| 목적 | 조기교육~K12~고등·직업·성인·노동(P-20W) 공통 어휘. 요소(Element)·옵션 세트(Option Set) + 정규화 모델 IDS + 데이터 웨어하우스 | 사실 (https://github.com/CEDStandards/CEDS-IDS doc/CEDS-Data-Model-Guide.pdf, V14) |
| 거버넌스 | 미국 연방 교육부(NCES) 주도 공개 이니셔티브, 오픈소스 커뮤니티(이슈로 사용 사례 제안) | 기관 주도는 추정(공식 사이트 미열람) · 이슈 기반 제안은 사실 (README) |
| 라이선스 | CEDS-IDS·CEDS-Elements·DW 저장소 Apache-2.0 | 사실 (https://github.com/CEDStandards) |
| 구성 | CEDS-Elements, **CEDS-Ontology(RDF)**, CEDS-IDS(3NF 운영 저장소), CEDS-Data-Warehouse(별 스키마) | 사실 (GitHub 조직 목록) |
| DES 상태 | V14 안내서: "CEDS Ontology가 **Domain Entity Schema(DES)를 대체**해 주 개념 틀이 되었다" | 사실 (Data Model Guide V14 p.6) |
| NDS | 요청서의 NDS(Normalized Data Schema)는 현재 IDS(Integrated Data Store)로 불리는 것으로 보임 | 추정 |

**핵심 구조** — 사실 (CEDS-IDS `src/ddl/CEDS-IDS.sql`, 표 1,166개; 안내서)
- 상위 개념 4개: **Person · Organization · Resource · Relationship**. "사람은 기관과의 관계 안에서, 정해진 기간 동안에만 역할을 가진다"(안내서 p.12).
- `Organization` 하나에 학교·학군·**과목(Course)·분반(CourseSection)까지 모두 기관 유형**으로 들어간다(`RefOrganizationType`에 `K12School`, `Course`, `CourseSection` 코드). 기관 간 관계는 `OrganizationRelationship(Parent_OrganizationId, OrganizationId)`.
- `OrganizationPersonRole(OrganizationId, PersonId, RoleId, EntryDate, ExitDate, …)` 하나로 학적·교직원 배정·수강을 표현하고, 세부는 하위 표가 붙는다: `K12StudentEnrollment`, `K12StudentCourseSection`(성적·이수 학점·재수강 코드), `K12StaffAssignment`. 안내서 예: 병가로 빠졌다 돌아온 교사는 같은 분반에 **기간이 다른 OrganizationPersonRole 두 행**.
- 달력: `OrganizationCalendar` → `OrganizationCalendarSession`(BeginDate·EndDate·`MarkingTermIndicator`·`SchedulingTermIndicator`·`AttendanceTermIndicator`) → `OrganizationCalendarDay`·`OrganizationCalendarEvent`.
- 출결: `RoleAttendanceEvent(OrganizationPersonRoleId, Date, RefAttendanceEventTypeId, RefAttendanceStatusId, …)` — **역할(소속)에 매단 사건**.
- 보호자: `PersonRelationship(PersonId, RelatedPersonId, CustodialRelationshipIndicator, EmergencyContactIndicator, LivesWithIndicator, PrimaryContactIndicator, ContactRestrictions…)`.
- 역량: `CompetencyFramework` → `CompetencySet` → `CompetencyDefinition`(Identifier·Statement·Version·`CurrentVersionIndicator`·`PreviousVersionIdentifier`·`ValidStartDate`·`ValidEndDate`·부모 참조) + `CompetencyDefAssociation`. 분반은 `RelatedCompetencyDefinitions`.
- 자격: `CredentialDefinition`·`CredentialAward`(+Evidence·Credit·Status)·`CredentialIssuer`.
- 학습 활동: `LearnerActivity`·`LearnerAction`·`LearningResource`.
- PBL: `OrganizationProjectBasedLearning(RefProjectBasedLearningTypeId, ProjectBasedLearningIndicator)` — 기관 특성 표시 수준뿐.

**식별자**: 모든 표가 **대리 키**(surrogate key)를 쓰고 자연 키는 공존(`PersonIdentifier`, `OrganizationIdentifier` + 식별 체계 코드). 업무 규칙(식별자 유일성 등)은 구현이 정한다. v8부터 상·하위형 표의 공유 기본키를 풀어 "판 관리"를 쉽게 했다. — 사실 (안내서 pp.15–17)

**시간·이력**: 거의 모든 표에 `RecordStartDateTime`·`RecordEndDateTime`·`RecordStatusId`·`DataCollectionId` — **레코드 유효 시간 + 수집 단위**. 관계 표는 별도로 업무 유효 기간(EntryDate/ExitDate)을 가진다. 즉 **두 시간 축(업무 기간·레코드 기간)** 을 함께 둔다. — 사실 (DDL 열 목록)

**확장/선택**: 옵션 세트는 `Ref*` 표(Code·Description·Definition·SortOrder). CEDS는 "모든 구현을 다 맞추려 하지 않는다"며 추가 업무 규칙을 구현에 맡긴다. 공식 확장 문법은 없다. — 사실 (안내서 p.10, p.17) / 확장 문법 부재는 추정

### 1.3 1EdTech OneRoster 1.2

| 항목 | 내용 | 근거 |
| --- | --- | --- |
| 목적 | SIS → 학습 도구(LMS 등)로 **명부·성적부·자료 배정**을 CSV 또는 REST로 전달 | 사실 (검색 요약 https://www.imsglobal.org/spec/oneroster/v1p2) |
| 구성 | 1.2에서 서비스 셋으로 분리: Rostering, Gradebook, Resources. 정보 모델 문서 + REST 바인딩 + CSV 바인딩. CSV 22개 파일·REST 81개 끝점 | 사실 (검색 요약 https://standards.1edtech.org/oneroster/specifications/standards/v1p2/services/rostering/im , https://1edtech.org/blog/rostering-resources-and-gradebook-standards) |
| 판 | 1.2 Final(2022-09-19 문서일) | 사실 (검색 요약, gradebook 정보모델 문서 표지) |
| 거버넌스·라이선스 | 1EdTech 회원 작업반. 명세 문서는 IMS 명세 라이선스로 공개 열람, 적합성 인증은 1EdTech 프로그램 | 라이선스 문구는 사실 (openbadges 저장소의 1EdTech 명세 라이선스 동일 체계, 1.6절) · OneRoster 개별 적용은 추정 |

**클래스·필드** — 사실 (제3자 1.2 형 정의 https://www.npmjs.com/package/@longsightgroup/oneroster `dist/v1p2/model/*.d.ts`) + 공식 문서로 재확인 필요
- 공통 기반: `sourcedId`, `status`(`active` | `tobedeleted`), `dateLastModified`, `metadata`(자유 키-값).
- `Org`: name, type(`department`·`school`·`district`·`local`·`state`·`national`), identifier, parent/children.
- `AcademicSession`: title, startDate, endDate, type(`gradingPeriod`·`semester`·`schoolYear`·`term`), schoolYear, parent/children — **학년도·학기·평가기간을 한 클래스의 트리**로.
- `Course`; `Class`: title, classCode, classType(`homeroom`·`scheduled`), course, school, **terms[]**, periods, subjects, resources — 반(홈룸)과 분반을 같은 클래스로.
- `User`: givenName·familyName·preferred*·pronouns, `userIds[]`, `userMasterIdentifier`, **`roles[]`(roleType primary/secondary, role, org, beginDate, endDate)**, `userProfiles[]`, `agents`(보호자 연결로 알려짐 — 확인 필요). 역할 값: administrator, aide, guardian, parent, proctor, relative, student, teacher, districtAdministrator, siteAdministrator, systemAdministrator 등.
- `Enrollment`: user, class, school, role, primary, beginDate, endDate.
- `Demographics`(별도 클래스).
- Gradebook: `Category`, `LineItem`(class, school, category, gradingPeriod/academicSession, scoreScale, resultValueMin/Max, **learningObjectiveSet**), `Result`(lineItem, student, scoreStatus, score, textScore, comment, scoreDate, learningObjectiveSet, inProgress·incomplete·late·missing), `ScoreScale`, `AssessmentLineItem`·`AssessmentResult`(1.2 신규). 1.2에서 User에 roles·userProfiles 추가 — 사실 (검색 요약 https://kb.infinitecampus.com/help/oneroster---whats-new-in-12)
- **출결 클래스 없음**, 서술형 평가는 Result.comment/textScore 수준. — 추정(위 형 정의에 없음)

**식별자**: `sourcedId`는 **보내는 시스템의 안정적 식별자**(GUID 권장으로 알려짐). **시간**: `dateLastModified`로 증분 동기화, 삭제는 `tobedeleted` 상태로 알림(소프트 삭제). 역할·수강의 beginDate/endDate. **확장**: `metadata` 객체(키-값)와 어휘 확장. — sourcedId·status·metadata는 사실(형 정의), GUID 권장은 확인 필요

### 1.4 1EdTech LIS·LTI 경계

- **LIS(Learning Information Services) 2.0**: 고등교육 중심 SIS↔LMS 명세(사람·과정·소속·성과). **LTI Advantage의 NRPS(Names and Role Provisioning Services)는 LIS 2.0과 W3C Organization Ontology를 바탕**으로 하며, 과정(context) 안 사용자·역할 목록을 준다. NRPS = 이전 Membership Service, AGS(Assignment and Grade Services) = 이전 Gradebook Service. 역할 어휘는 `http://purl.imsglobal.org/vocab/lis/v2/membership#Learner` 형태의 LIS v2 URI. — 사실 (검색 요약 https://www.imsglobal.org/node/161971 , https://www.imsglobal.org/lti-advantage-faq)
- 경계 정리(추정): **SIS(우리 플랫폼)가 원장**, OneRoster는 명부·성적을 대량 동기화, LTI는 외부 도구를 수업 맥락으로 띄우고(launch) NRPS·AGS로 그 맥락의 명부·점수만 주고받는다. 즉 LTI 맥락 = 우리 `course_offerings`(또는 분반) id, LTI 사용자 = `person_accounts`, 역할 = `offering_staff`/`offering_enrollments` 역할에서 투영.

### 1.5 A4L SIF (Schools Interoperability Framework)

- Access 4 Learning(A4L) 커뮤니티가 관리. 지역별 데이터 모델(북미 NA 4.x, 호주 AU 3.x, 뉴질랜드 NZ 3.x 등)과 인프라(SIF 3) 명세. 북미 데이터 모델 구현 명세 4.1(2020-08). — 사실 (검색 요약 https://files.a4l.org/Implementation/NA/4.1/ImplementationSpecification.pdf)
- 객체: `StudentPersonal`, `SchoolInfo`, `LEAInfo`, `StudentSchoolEnrollment`, `TeachingGroup`(학생이 집단에 들고 나는 것을 기록), `StudentSectionEnrollment`, `AttendanceCodeInfo` 등. 객체마다 `RefId`(GUID)로 유일 식별하고 다른 객체를 `…RefId`로 참조, `LocalId`·`StateProvinceId`는 별도 필드. — 사실 (검색 요약 https://files.a4l.org/Implementation/AU/3.6.4/SIFAUStudentBaselineProfileSBPAndSupportingObjects.html , NA 4.0 SIS 작업반 페이지)
- 라이선스·최신 판 번호(Infinite Campus 문서는 v2.7을 "현재"라 함)는 상충 — 확인 필요.
- 설계 교훈(추정): **모든 객체에 전역 GUID + 지역 식별자 분리**, 지역 프로필(AU/NZ/UK)로 국가별 차이를 흡수하는 구조는 한국·태국 학교를 함께 다루는 우리에게 참고가 된다.

### 1.6 1EdTech CASE 1.1 (역량·성취기준 교환)

- 목적: 성취기준·역량 체계(framework)를 기계가 읽는 형태로 게시·교환. 정보 모델 + REST/JSON + 적합성 안내. v1.1에서 CFDocument에 `frameworkType`·`caseVersion`, CFItem에 `subject` 추가, CFAssociation에 `notes`. — 사실 (검색 요약 https://standards.1edtech.org/case/specifications/standards/v1p1/im)
- 구조 — 사실 (OpenSALT 저장소 사본 https://github.com/opensalt/opensalt `core/config/schema/case-v1p1-cfpackage-schema.json`)
  - `CFPackage` = `CFDocument` 1개 + `CFItems[]` + `CFAssociations[]` + `CFDefinitions`(`CFConcept`·`CFSubject`·`CFLicense`·`CFItemType`·`CFAssociationGrouping`) + `CFRubrics[]`(→`CFRubricCriterion`→`CFRubricCriterionLevel`).
  - CFDocument 필수: identifier, uri, creator, title, lastChangeDateTime. 그 밖에 version, **adoptionStatus, statusStartDate, statusEndDate**, licenseURI.
  - CFItem 필수: identifier, fullStatement, uri, lastChangeDateTime. humanCodingScheme(사람용 코드), CFItemType, educationLevel, statusStartDate/EndDate.
  - CFAssociation: originNodeURI → destinationNodeURI, `associationType` ∈ {`isChildOf`, `isPeerOf`, `isPartOf`, `exactMatchOf`, `precedes`, `isRelatedTo`, `replacedBy`, `exemplar`, `hasSkillLevel`, `isTranslationOf`} 또는 `ext:` 접두 사용자 정의.
  - 모든 객체에 `extensions` 칸.
- **식별자**: UUID `identifier` + 역참조 가능한 `uri`. **이력**: 항목을 고치지 않고 `replacedBy` 연관과 상태 기간으로 판을 잇는다.
- CFRubric은 "수행·과제·**프로젝트** 평가 도구"로 명시. — 사실 (검색 요약 https://www.imsglobal.org/case-10-specification-information-model)

### 1.7 Open Badges 3.0 · CLR 2.0

**Open Badges 3.0** — 사실 (https://github.com/1EdTech/openbadges-specification `ob_v3p0/`)
- W3C Verifiable Credentials Data Model 2.0 정렬. "정의된 성취 주장"과 "기술(skill) 주장"을 서명된 자격증명으로 발급, CLR로 묶을 수 있음(abstract.md).
- 클래스: `AchievementCredential`(=OpenBadgeCredential; `awardedDate`, `credentialSubject`, `endorsement`), `AchievementSubject`(수령자, `result[]`), `Achievement`(achievementType, criteria, alignment, creditsAvailable, fieldOfStudy, humanCode, resultDescription, version, related…), `Alignment`, `Criteria`, `Evidence`, `Profile`(발급자), `Result`, `ResultDescription`, `RubricCriterionLevel`, `EndorsementCredential`, `IdentityObject`(해시된 수령자 식별 가능).
- `AchievementType` 확장 열거: Achievement, Assessment, Assignment, Award, Badge, Certificate, Competency, **Course**, CoCurricular, CommunityService, Diploma, Fieldwork, LearningProgram, MicroCredential, SecondarySchoolDiploma 등.
- `AlignmentTargetType`: `CFItem`, `CFRubric`, `CFRubricCriterion`, `CFRubricCriterionLevel`, `ceasn:Competency`, `ceterms:Credential`, CTDL → **CASE 항목에 직접 정렬**.
- `ResultType`: GradePointAverage, LetterGrade, Percent, PerformanceLevel, RawScore, RubricCriterionLevel, RubricScore, ScaledScore, Status…; `ResultStatusType`: Completed, Enrolled, Failed, InProgress, OnHold, Provisional, Withdrew.
- 확장: (1) 확장 가능 클래스에 새 속성·클래스(JSON Schema + JSON-LD context 공개 호스팅 필수), (2) 확장 열거는 **`ext:` 접두**, (3) API 끝점 추가. 확장은 필수가 될 수 없고 적합성 시험 대상 아님(extending.md).
- 라이선스: IMS 명세 문서 라이선스(https://www.imsglobal.org/speclicense.html), 저장소 license.md.

**CLR 2.0** — 사실 (검색 요약 https://www.imsglobal.org/spec/clr/v2p0 , https://purl.imsglobal.org/spec/clr/vocab.html)
- `ClrCredential`(VC 2.0 적합) → `ClrSubject`(학습자) → 여러 `AchievementCredential` 묶음 + `Association`(두 성취 사이 의미 관계, `associationType`, 예: 원천 성취가 대상 성취의 자식). OB 3.0 위에 쌓은 **학습 이력 묶음(성적증명 대체·보완)**.
- 최종 판 날짜와 associationType 열거 전체 — 확인 필요.

### 1.8 xAPI · Caliper (학습 활동 사건)

**xAPI** — 사실 (https://github.com/adlnet/xAPI-Spec README·xAPI-Data.md)
- 저장소는 1.0.3; 현행은 **xAPI 2.0**(IEEE 쪽 문서로 이전).
- Statement = actor·verb·object(+result·context·timestamp·stored·authority·attachments).
- **"Statements are immutable"**: 문장은 고칠 수 없고, 되돌리려면 `http://adlnet.gov/expapi/verbs/voided` 동사로 **무효화 문장을 새로 추가**한다(무효화 문장 자체는 다시 무효화 불가, 원본은 삭제되지 않음). — 우리 플랫폼의 "추가만, 정정은 새 판" 원칙과 같은 구조.
- 라이선스 Apache 2.0(저장소 LICENSE). 관리 ADL.

**Caliper Analytics** — 사실 (https://github.com/1EdTech/caliper-spec `caliper-spec.md`, 저장소 본문은 1.1)
- Event 속성: id, type, actor, action, object, eventTime, target, generated, edApp, referrer, **group**(과정·분반 맥락), **membership**(그 맥락에서의 역할), session, federatedSession, extensions.
- 메트릭 프로필: Annotation, Assessment, Assignable, Forum, Grading, Media, Reading, Session, Tool Use, Basic. JSON-LD 직렬화, Sensor API로 전송.
- Caliper 1.2 최종판 존재 여부·변경점 — 확인 필요.

### 1.9 Schema.org (교육 관련 어휘)

사실 (https://github.com/schemaorg/schemaorg `data/releases/next/schemaorg-current-https.ttl`, `data/schema.ttl`)
- `EducationalOccupationalCredential`: "졸업장·학위·자격·배지 등"; 현 개발 릴리스에서 `schema:Credential`의 하위형으로 정리 중이며 **pending** 영역 표시. 관련 속성 `credentialCategory`·`recognizedBy`·`validFor`(Credential 영역), `competencyRequired`.
- `Course`(교육 과정 정의, CreativeWork) ↔ `CourseInstance`(특정 시간·장소·방식·**학생 분반**으로 열린 회차, Event) — Ed-Fi Course/CourseOffering 구분과 같은 축.
- `EducationalOccupationalProgram`, `AlignmentObject`(자료와 교육 체계 노드 정렬), `DefinedTerm`/`DefinedTermSet`(코드 목록 표현).
- 용도(추정): 학교 홈페이지 공개 수업 아카이브·학교 소개의 **검색엔진용 구조화 데이터**로만 쓴다. 내부 모델 기준으로는 약하다.

### 1.10 한국 국가 자료

| 자료 | 내용 | 근거 |
| --- | --- | --- |
| NEIS | 교육행정정보시스템, KERIS가 운영. 학교·교육청을 연결 | 사실 (검색 요약 https://en.wikipedia.org/wiki/National_Education_Information_System) |
| NEIS 교육정보 개방 포털 OpenAPI | 학교기본정보, 학사일정(시도교육청·행정표준코드·학년도·주야과정·학교과정·수업공제일명·학사일자 등), 학교급별 시간표(학년도·학기·학년·교시, 고교는 계열·학과·강의실), 반정보, 학교학과·계열정보, 강의실정보, 급식 — **학교 단위 공개 자료** | 사실 (검색 요약; 2차 https://github.com/my-school-info/neis-api , https://wikidocs.net/475732) |
| 공공데이터 표준데이터 | 전국초중등학교시간표정보표준데이터 등, 항목명·영문명·타입·길이 표준 메타데이터 | 사실 (검색 요약 https://www.data.go.kr/en/data/15107735/standard.do) |
| KEM(교육정보 메타데이터) | 2004-12 초·중등 교육자료 메타데이터 국가 표준 승인(KERIS 개발). 학습자원 메타데이터이지 학생 기록 표준이 아님 | 사실 (검색 요약 https://www.hangyo.com/mobile/article.html?no=17850) · 현행 여부 확인 필요 |
| 학생 단위 데이터 항목 표준 | **공개된 학생 단위 교육 데이터 표준(Ed-Fi·CEDS 수준)은 찾지 못했다.** 학교생활기록부 항목(인적·학적, 출결, 창의적 체험활동, 교과학습발달상황, 행동특성 및 종합의견 등)은 교육부 훈령 '학교생활기록 작성 및 관리지침'이 정하는 것으로 알고 있으나 이번에 원문을 열람하지 못함 | 미발견 사실 / 학생부 항목 근거는 확인 필요 |
| 대안학교 | 미인가 대안학교는 NEIS를 쓰지 않을 가능성이 높아, 학교코드·학생부 체계가 없을 수 있다 | 추정 |

### 1.11 태국 국가 자료

| 자료 | 내용 | 근거 |
| --- | --- | --- |
| 교육부(MOE) 교육 데이터 표준 구조 | "โครงสร้างมาตรฐานข้อมูลด้านการศึกษา" Version 17.0(2022-11-10 갱신): `SCHOOL`(SCHOOLID, SCHOOLNAME…) 등 표별 필드·타입·길이·PK·NOT NULL 정의 | 사실 (검색 요약 https://catalog.moe.go.th/dataset/e39c6518-a5a6-451e-acb1-d04d15cbe0ea/resource/03fe9b53-ae5f-4e67-bec8-93b2faadca4d/download/-version-17-1.pdf) |
| 학생 표 | "ตารางโครงสร้างมาตรฐานข้อมูลนักเรียน (STUDENT)" 데이터 사전 | 사실 (검색 요약 https://catalog.moe.go.th/en/dataset/dataset-13_14/resource/121faddc-34d0-40c2-8568-45f6baaec1e6) · 필드 목록 확인 필요 |
| MOE Data Exchange APIs Spec v1.13(2019) | 학생 표에 StudentStatus 필드 추가 등 개정 이력 | 사실 (검색 요약 https://catalog.moe.go.th/dataset/6171d62e-3715-487a-951a-824e8bd4e7d8/resource/67292bf3-0a15-4e41-958d-ce9b584dcc13/download/moe-data-exchange-apis-specification-v1.13.pdf) |
| OBEC DMC | 기초교육위원회(OBEC) 개별 학생 자료 저장 체계 DMC가 공개 통계의 원천 | 사실 (검색 요약 https://data.go.th/en/dataset/obec-student-013) · DMC 스키마 문서는 미발견 |
| 학술 2차 | 학생 46필드·졸업생 23필드 표준(장애·교육 불리 코드 OBEC 연동) | 사실 (검색 요약, KMUTNB 학회 발표 슬라이드) · 원문 확인 필요 |

결론: 태국은 **표 단위 데이터 표준(국가 보고용)** 이 공개돼 있고, 한국은 **학교 단위 공개 API·표준데이터** 만 공개돼 있다. 둘 다 내부 운영 모델로 삼을 수준은 아니고, **내보내기 매핑 대상**으로 둔다(추정).

---

## 2. 종합

### 2.1 교차표: 중립 핵심 엔터티 ↔ 표준 ↔ 현 저장소

현 저장소 표는 `supabase/migrations/`와 ADR 0004(`docs/decisions/0004-domain-model-normalization.md`) 기준(사실, 저장소). "—"는 대응 없음.

| 중립 핵심(제안) | Ed-Fi (v6) | CEDS IDS | OneRoster 1.2 | 기타 표준 | 현 저장소 |
| --- | --- | --- | --- | --- | --- |
| 학교/교육기관 | EducationOrganization · School · LEA · EducationOrganizationNetwork | Organization(+K12School) · OrganizationRelationship | Org(type, parent) | SIF SchoolInfo/LEAInfo · schema.org EducationalOrganization · NEIS 학교기본정보(행정표준코드) · 태국 SCHOOL(SCHOOLID) | `schools`, `school_levels` |
| 학년도 | SchoolYear(열거) | OrganizationCalendar(+학년도 속성, 확인 필요) | AcademicSession type=schoolYear | — | `academic_years` |
| 학기·평가기간 | Session(Term 기술자) · GradingPeriod | OrganizationCalendarSession(Marking/Scheduling/Attendance 표시) | AcademicSession term/semester/gradingPeriod + parent | NEIS 시간표 '학기' | `terms` |
| 수업일·일정 | Calendar · CalendarDate · AcademicWeek | OrganizationCalendarDay/Event | — | NEIS 학사일정 | (없음, 확정 규칙 안) |
| 사람 | Person · Student · Staff · Contact | Person · PersonDetail(기간) · PersonIdentifier | User · userIds · Demographics | SIF StudentPersonal · xAPI Agent · OB IdentityObject | `people`, `person_names`, `person_accounts` |
| 외부 식별자 | StudentIdentificationCode · StaffIdentificationCode | PersonIdentifier · OrganizationIdentifier | userIds · identifier | SIF LocalId/StateProvinceId | (없음) |
| 소속/역할(학적·재직) | StudentSchoolAssociation(EntryDate~ExitWithdrawDate) · StaffEducationOrganizationAssignmentAssociation(BeginDate) · StaffSchoolAssociation | OrganizationPersonRole(EntryDate~ExitDate) + K12StudentEnrollment / K12StaffEmployment | User.roles[](beginDate~endDate) | SIF StudentSchoolEnrollment | `memberships`(계정 권한), `enrollments_school`(학적) |
| 보호자 관계 | StudentContactAssociation(Relation, LegalGuardian, ContactRestrictions) | PersonRelationship | User role parent/guardian (+agents, 확인 필요) | — | ADR 0004 `guardian_links`(계획) |
| 교육과정·과목(정의) | Course(CourseDefinedBy, CompetencyLevel, LearningStandard) | Course(Organization 하위형) | Course | schema.org Course · OB achievementType=Course | `subjects`, `course_types` |
| 개설(수업) | CourseOffering(LocalCourseCode+School+Session) | (CourseSection이 겸함) | Class(course, terms[]) | schema.org CourseInstance · LTI context | `course_offerings` |
| 분반 | Section(SectionIdentifier+CourseOffering) | CourseSection | Class(classType=scheduled) | SIF TeachingGroup | (개설=분반으로 겸함, 추정) |
| 반(학급)·기수 | StudentSectionAssociation.HomeroomIndicator · Cohort/StudentCohortAssociation | K12StudentCohort(확인 필요) | Class(classType=homeroom) | NEIS 반정보 | `homerooms`, `homeroom_assignments`, `cohorts` |
| 수강/배정 | StudentSectionAssociation(BeginDate~EndDate) · StaffSectionAssociation | OrganizationPersonRole + K12StudentCourseSection / K12StaffAssignment | Enrollment(role, primary, beginDate~endDate) | SIF StudentSectionEnrollment · Caliper membership · LTI NRPS | `offering_enrollments`, `offering_staff` |
| 출결 사건 | Student{School,Section,Program}AttendanceEvent · SectionAttendanceTakenEvent | RoleAttendanceEvent | — | SIF AttendanceCodeInfo | (없음, ADR 0004 record_items 계획) |
| 성취 기준·역량 체계 | LearningStandard(+Parent, Namespace) · LearningStandardEquivalenceAssociation · CompetencyObjective | CompetencyFramework/Set/Definition/DefAssociation | LineItem/Result.learningObjectiveSet | **CASE** CFDocument/CFItem/CFAssociation/CFRubric · OB Alignment · schema.org AlignmentObject | (없음) |
| 평가 항목 | GradebookEntry · Assessment | Assessment(+Form/Item/Subtest) | LineItem · Category · ScoreScale · AssessmentLineItem | Caliper AssignableEvent/AssessmentEvent | ADR 0004 `assessments`(계획) |
| 결과(성적·서술) | StudentGradebookEntry · Grade(Letter/Numeric/DiagnosticStatement/LearningStandardGrade) · StudentCompetencyObjective · ReportCard | K12StudentCourseSectionMark · AssessmentResult | Result(score, textScore, comment, scoreStatus) | OB Result/ResultDescription · xAPI result | ADR 0004 `assessment_results`, `narratives`(계획) |
| 기록 마감 판 | (명시 없음) StudentAcademicRecord(학년도+Term 단위) 가 가장 가까움 | RecordStart/EndDateTime · RecordStatus · DataCollection | (없음) | xAPI 불변+무효화 · OB/CLR 서명 스냅샷 | ADR 0004 `offering_closures`(계획), `published_documents` |
| 자격·성적증명 | StudentAcademicRecord · CourseTranscript · Diploma · GraduationPlan | CredentialDefinition/Award · K12StudentAcademicRecord | — | **OB 3.0 AchievementCredential · CLR 2.0 ClrCredential** · schema.org EducationalOccupationalCredential | `published_documents`, `document_templates` |
| 프로그램·경로 | Program · GeneralStudentProgramAssociation · Path/PathPhase/PathMilestone/StudentPath | PersonProgramParticipation · OrganizationProjectBasedLearning | — | schema.org EducationalOccupationalProgram | (없음) |
| 학습 활동 사건 | (Survey 등 일부) | LearnerActivity · LearnerAction | — | **xAPI Statement · Caliper Event** | `usage_events`(용도 다름) |
| 코드 목록 | Descriptor(CodeValue+Namespace+Effective 기간+PriorDescriptor) | Ref* 옵션 세트 | 열거 + 확장 어휘 | OB `ext:` · CASE `ext:` · schema.org DefinedTermSet | `course_types` 등 개별 표 |

### 2.2 채택할 모델링 패턴

1. **사람·기관·관계 분리 + 기간 있는 연관 엔터티** (CEDS "역할은 기관과의 시간 한정 관계", Ed-Fi `*Association`의 날짜 포함 키, OneRoster roles/enrollment begin~end) — 사실 근거.
   - 적용(추정): 학적(`enrollments_school`)·반 배정·수강·담당 배정은 모두 `(school_id, person_id, 대상_id, begin_date, end_date)` 행. 한 사람이 같은 대상에 여러 기간을 가질 수 있게 하고, 겹침은 제약(배제 제약 `EXCLUDE USING gist`)으로 막는다. "현재" 값은 뷰.
2. **시간 축 둘을 구분** (CEDS: 업무 EntryDate/ExitDate + 레코드 RecordStart/EndDateTime; Ed-Fi: 업무 날짜만) — 사실.
   - 적용(추정): 업무 유효 기간 = 연관 행의 begin/end. 레코드 시간 = 우리 판(version) 행의 `created_at`/대체 판 id. 확정 = 마감 판. 세 가지를 한 열에 섞지 않는다.
3. **사건(event)형 기록은 추가만** (Ed-Fi AttendanceEvent, CEDS RoleAttendanceEvent, xAPI 불변 문장 + `voided` 정정) — 사실.
   - 적용(추정): 출결·관찰·포트폴리오 증거는 사건 행으로 쌓고, 정정은 원 사건을 가리키는 정정 사건(무효화·대체). ADR 0004의 "확정 판·자식 행 수정 금지", AGENTS.md 규칙 4·8·10과 같은 방향.
4. **코드 목록(기술자)을 학교별로** (Ed-Fi Descriptor의 Namespace·유효 기간·PriorDescriptor, CEDS Ref 옵션 세트, OB/CASE `ext:`) — 사실.
   - 적용(추정): `code_lists(id, school_id NULL=플랫폼 기본, list_key, code, label, namespace, effective_from, effective_to, prior_code_id, maps_to_standard)`. 출결 구분·성적 유형·역할·관계·갈래 같은 값을 코드 대신 이 표로. 학교 값은 플랫폼 기본값 또는 외부 표준 값(`maps_to_standard`)에 사상해 내보내기를 가능하게 한다. 코드 행도 수정 대신 새 행 + `prior_code_id`.
5. **성취 기준·역량 층을 과목과 분리** (CASE, CEDS Competency*, Ed-Fi LearningStandard·CompetencyObjective, OneRoster learningObjectiveSet, OB Alignment→CFItem) — 사실.
   - 적용(추정): `competency_frameworks`(CFDocument) → `competency_items`(CFItem, 사람용 코드·진술·판) → `competency_associations`(CFAssociation 유형 그대로: isChildOf, isPartOf, exactMatchOf, replacedBy, precedes…) + `rubrics`(CFRubric→Criterion→Level). 과목·개설·평가 항목·결과는 **역량 항목 id에 정렬**만 한다. 국가 교육과정 성취기준과 학교 고유 역량(신앙·인성 포함)을 같은 구조의 다른 framework로 둔다.
6. **정의(과목) ↔ 개설(수업) ↔ 분반** 3단 구분 (Ed-Fi Course/CourseOffering/Section, schema.org Course/CourseInstance, OneRoster Course/Class) — 사실.
   - 적용(추정): 현 `subjects`/`course_offerings`를 유지하고, 분반은 필요해질 때 `offering_sections`로 추가(한 개설 = 기본 분반 1개 자동). 통계 모집단 키(ADR 0004 P6)는 개설 id 그대로.
7. **대리 키 + 외부 식별자 표** (CEDS 대리 키·PersonIdentifier, SIF RefId+LocalId, OneRoster sourcedId/userIds) — 사실. Ed-Fi식 복합 자연 키는 키 변경 연쇄를 부르므로 **식별용으로 쓰지 않는다**(추정).
   - 적용: `external_identifiers(school_id, subject_type, subject_id, system_code, value, valid_from, valid_to)`; NEIS 학교코드·행정표준코드·태국 SCHOOLID·OneRoster sourcedId를 여기에. 주민·국가 ID 같은 민감 식별자는 넣지 않거나 별도 비공개 스키마(ADR 0001 경계).
8. **소프트 삭제·증분 동기화 신호** (OneRoster `status=tobedeleted`·`dateLastModified`) — 사실. 우리 보관(archive)·판 구조와 맞고, 외부로 내보낼 때 그대로 투영 가능(추정).
9. **학습 이력은 서명 가능한 스냅샷으로 내보냄** (OB 3.0·CLR 2.0이 VC 2.0 기반) — 사실. 발행본(published_documents) 스냅샷 원칙과 같은 성격이므로, 발행본 종류의 하나로 "CLR/OB 내보내기"를 둔다(추정).

### 2.3 프로젝트 수업·역량 기반·학생 설계 수업은 어디에 들어가나

표준이 주는 근거:
- Ed-Fi `Course.CourseDefinedBy` 값은 LEA·National Organization·School·SEA뿐 → **학생이 정의하는 과목은 표준 밖**(사실, Descriptors/CourseDefinedByDescriptor.xml). `Course.CompetencyLevel`, `StudentCompetencyObjective`(역량 수준 + 서술)로 역량 기반 이수를 표현할 여지는 있음(사실).
- Ed-Fi v6 **Path**(경로→단계→이정표, 학생별 단계 상태 사건)는 개인 맞춤 경로·졸업 계획에 쓸 수 있는 가장 가까운 표준 구조(사실: 모델 존재 / 용도 적합성은 추정).
- CEDS `OrganizationProjectBasedLearning`은 기관 특성 표시뿐(사실) → 프로젝트 자체의 모델은 표준에 없다.
- CASE `CFRubric`은 "프로젝트 평가 도구"를 명시(사실), OB `achievementType`에 Course·Competency·CoCurricular·Fieldwork·CommunityService·LearningProgram이 있어 **프로젝트 결과를 배지/성취로 발급**할 수 있다(사실).
- xAPI/Caliper는 과목 구조 없이 "누가·무엇을·어떤 맥락에서" 활동 사건을 쌓는다(사실) → 프로젝트 과정 증거 기록에 맞다(추정).

제안(추정):
1. **학생 설계 수업 = 제안 → 승인 → 개설**의 판 흐름. `course_proposals`(제안자 person_id, 목적, 정렬할 역량 항목 id들, 평가 루브릭, 멘토 후보) 판을 쌓고, 학교가 승인하면 그 판을 가리키는 `subjects` 판(정의 주체 = 학교, `proposed_by_person_id` 기록)과 `course_offerings`를 만든다. 정의 권한은 언제나 학교(표준과 일치), 저작자는 학생.
2. **프로젝트 = 개설의 한 갈래(`course_types`)**. 인원 1명~여러 명, 기간은 학기와 어긋날 수 있으므로 개설에 자체 begin/end(기본값 = 학기). 멘토·외부 전문가는 `offering_staff` 역할 코드(계정 없는 person 허용, ADR 0004 P3).
3. **결과는 역량 축으로**. 평가 항목(`assessments`)은 루브릭 기준 + 역량 항목에 정렬, 결과는 수준(코드 목록)·서술·증거 링크. 점수형 과목과 같은 표를 쓰되 `result_kind`(점수·등급·수준·P/F·서술)로 구분 — OneRoster Result(score/textScore/comment)·OB ResultType과 사상 가능.
4. **과정 증거는 사건 기록**: `learning_evidence_events`(actor person, 동사 코드, 대상: 개설·과제·산출물 자산, 맥락: 역량 항목, 시각) — xAPI 형태를 닮게 하되 내부 id 참조만. 산출물 파일은 기존 자산(R2) 참조.
5. **개인 경로**: 학생별 학습 계획(Ed-Fi Path 모양: 경로·단계·이정표·상태 사건)을 확장 모듈로 두고, 핵심에는 넣지 않는다(학교마다 다름).
6. **마감**: 프로젝트·학생 설계 수업도 개설 단위 마감 판(ADR 0004 B)을 그대로 쓴다. 학점·이수 인정 규칙은 `course_types` 규칙 판에서 읽는다.
7. **증명**: 학교 고유 역량(예: 신앙·공동체·섬김 같은 학교 정의 역량)은 학교 framework로, 국가 성취기준과 `exactMatchOf`/`isRelatedTo`로 연결해 두면, 인가 학교는 학생부 서식으로, 미인가 학교는 CLR/OB 묶음으로 같은 원장에서 발행할 수 있다.

### 2.4 권고: 최소 핵심 + 확장 전략

**A. 최소 핵심(플랫폼이 소유, 형이 정해진 표, 모두 `school_id` + RLS + 복합 FK)**

| 묶음 | 표(이미 있음 ✔ / 추가 제안 +) |
| --- | --- |
| 기관·달력 | ✔ `schools`, ✔ `school_levels`, ✔ `academic_years`, ✔ `terms`(+ `kind`: 학기/평가기간, `parent_term_id`), + `calendar_days`(나중) |
| 사람·계정 | ✔ `people`, ✔ `person_names`, ✔ `person_accounts`, ✔ `memberships`, + `external_identifiers`, + `guardian_links`(PersonRelationship 모양: 관계 코드·법정 보호자·연락 제한, 기간) |
| 소속 | ✔ `enrollments_school`(학적, 기간), ✔ `cohorts`, ✔ `homerooms`·`homeroom_assignments`(기간), + 교직원 배정(기간·직무 코드) |
| 과목·수업 | ✔ `subjects`(판), ✔ `course_types`(규칙 판), ✔ `course_offerings`, ✔ `offering_staff`·`offering_enrollments`(기간·역할 코드), + `offering_sections`(필요 시) |
| 출결 | + `attendance_events`(추가만; 대상 = 학교일 또는 개설, 날짜·교시, 구분 코드, 사유, 정정 대상 id) + `attendance_taken_events` |
| 역량 | + `competency_frameworks` / `competency_items` / `competency_associations` / `rubrics`(CASE 모양, 판·상태 기간) |
| 평가·결과 | + `assessments`(개설·평가기간·척도·정렬 역량), + `assessment_results`(result_kind, 값, 서술, 증거), + `narratives` |
| 확정·발행 | + `offering_closures`(마감 판, 정정 = 새 판), ✔ `published_documents`(스냅샷), ✔ `document_templates` |
| 코드 목록 | + `code_lists`(학교별·플랫폼 기본·표준 사상·유효 기간·이전 코드) |

**B. 확장 전략(학교·AI 에이전트가 기능을 쌓는 방식)**
1. **1단계 — 코드 목록으로 해결**: 출결 구분, 성적 유형, 관계, 역할, 갈래, 결과 수준 등 "값의 차이"는 `code_lists`에 학교 값 추가(Ed-Fi 기술자 방식). 스키마 변경 없음.
2. **2단계 — 판이 있는 설정**: 학교 규칙·한도·계산법은 `school_settings`/규칙 판(ADR 0004 P8). 
3. **3단계 — 모듈 확장 표**: 새 개념(프로젝트 계획·개인 경로·동아리·상담 등)은 `ext_<모듈>_*` 표로, 반드시 `school_id` + RLS + 핵심 표 `(id, school_id)` 복합 FK(Ed-Fi `_ext`가 코어를 바꾸지 않고 옆에 붙는 것과 같은 원리). 모듈 등록은 기존 `module_catalog`로. 마이그레이션·ADR 경로로만 만들고 에이전트가 임의 DDL을 하지 않는다(AGENTS.md 외부 에이전트 조항과 일치).
4. **4단계 — 메타데이터 칸**: 참조가 아닌 표시용 부가 속성만 `metadata jsonb`(OneRoster metadata·CASE/OB extensions 방식). **사람·수업·학교 참조를 JSON 안에 숨기지 않는다**(ADR 0004 B2 그대로).
5. **표준은 내부 스키마가 아니라 어댑터로**: OneRoster CSV/REST 내보내기(LMS 명부·성적), LTI 1.3 + NRPS/AGS(외부 도구), CASE 가져오기(국가·학교 성취기준), OB 3.0/CLR 2.0 발행(학습 이력·졸업 증명), xAPI 수신(외부 학습 활동), schema.org JSON-LD(홈페이지), NEIS·태국 MOE 형식 내보내기(보고). 각 어댑터는 `code_lists.maps_to_standard`와 `external_identifiers`로 사상한다.
6. **판 동시성**: 확장 표도 판으로 쌓는 경우 `base_version` 409 규칙(AGENTS.md 10)을 그대로 따른다.

**C. 일부러 하지 않을 것(추정)**
- CEDS처럼 과목·분반까지 `Organization` 하나로 합치는 초일반화: RLS·FK가 흐려지고 질의가 어려워진다.
- Ed-Fi 복합 자연 키를 기본키로 쓰기: 이름·코드 변경이 키 변경으로 번진다(ADR 0004 P2와 충돌).
- OneRoster `User.password`처럼 자격 비밀을 데이터 모델에 넣기.
- 인구학 정보(인종·장애·경제 불리 등) 핵심 포함: 필요해지면 별도 비공개 확장 + 접근 정책 ADR(AGENTS.md 9).

### 2.5 열린 질문(확인 필요)

1. OneRoster 1.2 공식 정보 모델로 필드·열거(특히 `agents`, Demographics, GUID 권장) 재확인.
2. CLR 2.0 최종 판 날짜와 `associationType` 열거.
3. 한국 '학교생활기록 작성 및 관리지침' 항목 체계를 학생부 발행 서식의 기준으로 삼을지 — 인가·미인가 학교 구분과 함께.
4. 태국 MOE v17 STUDENT 표 필드 목록(룽가룬 예시학교 보고용 사상).
5. Ed-Fi "Unifying Data Model" 명칭과 v6 What's New 원문(SEOA 분해 세부).

---

## 3. 출처 표

| # | 출처 | 종류 | 열람 방식 | 사용한 곳 |
| --- | --- | --- | --- | --- |
| S1 | https://github.com/Ed-Fi-Alliance-OSS/Ed-Fi-Data-Standard (HEAD 2026-11-20, 태그 v5.2.0·v6.1.0; `Models/*.mmd`, `Descriptors/*.xml`, `Schemas/Bulk/Ed-Fi-Core.xsd`, LICENSE) | 1차(공식 저장소) | git clone | 1.1, 2.1–2.3 |
| S2 | https://docs.ed-fi.org/reference/data-exchange/data-standard/whats-new/whats-new-v60 · …/whats-new-v61 | 1차 | 검색 요약 | 1.1 |
| S3 | https://docs.ed-fi.org/reference/ed-fi-api/8/platform-dev-guide/extensibility-customization/extending-api-datamodel | 1차 | 검색 요약 | 1.1 확장 |
| S4 | https://docs.ed-fi.org/reference/data-exchange/xsd-guidelines/implementation/descriptors | 1차 | 검색 요약 | 1.1 기술자 |
| S5 | https://edfi.atlassian.net/wiki/spaces/rc/pages/1018757138 (RFC 27, DS 6.0) | 1차 | 검색 요약 | 1.1 거버넌스 |
| S6 | https://github.com/CEDStandards (조직 저장소 목록·라이선스) | 1차 | WebFetch | 1.2 |
| S7 | https://github.com/CEDStandards/CEDS-IDS (`src/ddl/CEDS-IDS.sql`, `src/reference-data/Populate-CEDS-Ref-Tables.sql`, `doc/CEDS-Data-Model-Guide.pdf` V14) | 1차 | git clone | 1.2, 2.1–2.2 |
| S8 | https://www.imsglobal.org/spec/oneroster/v1p2 · https://standards.1edtech.org/oneroster/specifications/standards/v1p2/services/rostering/im · …/gradebook/im · …/resources/im | 1차 | 검색 요약 | 1.3 |
| S9 | https://1edtech.org/blog/rostering-resources-and-gradebook-standards | 1차(기관 블로그) | 검색 요약 | 1.3 |
| S10 | https://kb.infinitecampus.com/help/oneroster---whats-new-in-12 | 2차(공급사) | 검색 요약 | 1.3 |
| S11 | https://www.npmjs.com/package/@longsightgroup/oneroster (`dist/v1p2/model/*.d.ts`) | 2차(제3자 구현) | npm 내려받기 | 1.3 필드 |
| S12 | https://www.imsglobal.org/node/161971 (NRPS) · https://www.imsglobal.org/lti-advantage-faq | 1차 | 검색 요약 | 1.4 |
| S13 | https://files.a4l.org/Implementation/NA/4.1/ImplementationSpecification.pdf · https://files.a4l.org/Implementation/AU/3.6.4/SIFAUStudentBaselineProfileSBPAndSupportingObjects.html · https://files.a4l.org/Implementation/NA/4.0/StudentInformationSystemsWorkingGroup.html | 1차 | 검색 요약 | 1.5 |
| S14 | https://standards.1edtech.org/case/specifications/standards/v1p1/im · https://www.imsglobal.org/case-10-specification-information-model | 1차 | 검색 요약 | 1.6 |
| S15 | https://github.com/opensalt/opensalt (`core/config/schema/case-v1p1-cfpackage-schema.json`) | 2차(구현체 사본) | git 부분 clone | 1.6 구조 |
| S16 | https://github.com/1EdTech/openbadges-specification (`ob_v3p0/common_credentials.lines`, `extending.md`, `abstract.md`, `license.md`, `context-3.0.3.json`) | 1차 | git clone | 1.7 |
| S17 | https://www.imsglobal.org/spec/clr/v2p0 · https://purl.imsglobal.org/spec/clr/vocab.html | 1차 | 검색 요약 | 1.7 CLR |
| S18 | https://github.com/adlnet/xAPI-Spec (`README.md`, `xAPI-Data.md` 2.3.1·2.3.2, LICENSE) | 1차 | git clone | 1.8, 2.2 |
| S19 | https://github.com/1EdTech/caliper-spec (`caliper-spec.md` v1.1) | 1차 | git clone | 1.8 |
| S20 | https://github.com/schemaorg/schemaorg (`data/releases/next/schemaorg-current-https.ttl`, `data/schema.ttl`) | 1차 | raw 내려받기 | 1.9 |
| S21 | https://en.wikipedia.org/wiki/National_Education_Information_System | 2차 | 검색 요약 | 1.10 |
| S22 | https://www.data.go.kr/en/data/15107735/standard.do | 1차(공공데이터) | 검색 요약 | 1.10 |
| S23 | https://github.com/my-school-info/neis-api · https://wikidocs.net/475732 | 2차 | 검색 요약 | 1.10 NEIS API |
| S24 | https://www.hangyo.com/mobile/article.html?no=17850 (KEM) | 2차(언론) | 검색 요약 | 1.10 |
| S25 | https://catalog.moe.go.th/dataset/e39c6518-a5a6-451e-acb1-d04d15cbe0ea/resource/03fe9b53-ae5f-4e67-bec8-93b2faadca4d/download/-version-17-1.pdf · https://catalog.moe.go.th/en/dataset/dataset-13_14/resource/121faddc-34d0-40c2-8568-45f6baaec1e6 · https://catalog.moe.go.th/dataset/6171d62e-3715-487a-951a-824e8bd4e7d8/resource/67292bf3-0a15-4e41-958d-ce9b584dcc13/download/moe-data-exchange-apis-specification-v1.13.pdf | 1차(정부 카탈로그) | 검색 요약 | 1.11 |
| S26 | https://data.go.th/en/dataset/obec-student-013 | 1차(정부 공개데이터) | 검색 요약 | 1.11 DMC |
| S27 | 저장소 `docs/decisions/0004-domain-model-normalization.md`, `supabase/migrations/*.sql`, `AGENTS.md` | 내부 | 로컬 읽기 | 2.1, 2.4 |
