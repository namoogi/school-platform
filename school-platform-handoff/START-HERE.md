# 학교 플랫폼을 이어서 개발하는 방법

## 시작점

이 폴더를 연결한 **새 학교 플랫폼 GitHub 저장소** 루트에 넣는다. GitHub 저장소, Vercel 프로젝트, Supabase 프로젝트는 드리미포털과 각각 독립적으로 운영한다는 2026년 11월 22일 사용자 결정을 적용한다. 기존 포털 저장소를 동기화하거나 그 배포 설정, 학생 데이터, 로그인 세션, 서비스 키를 가져오는 절차는 새 프로젝트의 의존 사항에서 제외한다.

- [Claude 공유판 최신 변경과 채택 여부](CLAUDE-UPDATE.md)
- [14차 첫 작업 및 완료 기준](ROUND-14.md)
- [13차 화면](reference/site/round-13.html) · [온라인 서체 스튜디오](https://school-platform-review.education-dr-5097.chatgpt.site/round-13#typography) · [온라인 학사 문서실](https://school-platform-review.education-dr-5097.chatgpt.site/round-13#records)
- [시안의 변경 원칙](reference/AGENTS.md) · [화면 설계 기준](reference/site/design-r13.md)

## 화면을 찾는 곳

| 작업 | 참고 화면과 소스 |
| --- | --- |
| 자료를 여러 번 추가하고 규칙 확인 | reference/site/round-06.html, academic-intake-r06.js, academic-module-design-r05.md |
| 한국 학생부·해외 학교 양식·영문 Transcript | reference/site/round-13.html#records, records-r10.js |
| 학교별 다국어 서체·조합·행간 | reference/site/round-13.html#typography, typography-r13.js, global-r13.css, type-assets/ |
| 학교의 개선 요청과 운영팀 작업 배정 | reference/site/round-13.html#support, support-r13.js |
| 개인정보 처리와 학교 간 공유 | reference/site/round-13.html#privacy, round-07.html |
| 서비스 가격·손익과 개발 제안 | reference/site/round-13.html#pricing, #profit, #review |

표 안의 소스 파일은 모두 reference/site/ 기준이다. 터미널에서 이 문서가 있는 폴더로 이동한 뒤 다음 명령으로 원본을 볼 수 있다.

```sh
python3 -m http.server 8080 --bind 127.0.0.1 --directory reference/site
```

브라우저에서 http://127.0.0.1:8080/round-13.html 을 연다. 1~13차를 공개했던 HTML, 스타일, 스크립트, 웹폰트와 라이선스 등은 시안의 배포 원본과 일치한다. 기준 커밋은 a116f7d6fedaac38d8e70d046bf63423b35f588a 이다. 현재 화면의 버튼 동작과 브라우저 저장은 UX를 설명한다. 새 앱의 로그인, 권한, 영속 저장, 자료 분석은 각각 구현하고 검증한다. 과거 버전은 독립적으로 다시 열고 외부 페이지는 새 탭에서 비교한다.

## Claude에게 전달할 첫 작업

> school-platform-handoff/START-HERE.md, CLAUDE-UPDATE.md, ROUND-14.md를 읽고 14차 첫 기능을 구현해 줘. 세 문서는 모두 school-platform-handoff 폴더에 있다. GitHub·Vercel·Supabase는 기존 드리미포털과 각각 별도다. 기존 시안에서 다중 첨부와 학사 문서실을 먼저 열어 보고, 합성 자료 두 세트로 학교별 로그인 → 자료 누적 등록 → 근거 질문과 수정 → 확정한 규칙으로 예시 문서 한 장 발행까지 완성해 줘. 새 저장소의 구성과 연결된 개발 환경을 먼저 확인하고, 작업 브랜치에서 구현·테스트해 검토용 PR을 남겨 줘. 전용 클라우드 프로젝트 설정이 비어 있으면 가능한 로컬 작업을 진행하고, 필요한 새 프로젝트 설정 이름과 미검증 항목을 알려 줘.

다음 작업부터는 저장소의 문서 경로, 작업 이슈, 직전 PR을 이어받는다. 13차 기준 자료를 매번 다시 첨부할 필요는 없다. 루트의 Claude/Codex 작업 지침에는 독립 인프라와 변경 원칙을 반영하되 새 저장소의 기존 지침과 병합한다.
