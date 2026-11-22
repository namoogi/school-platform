# 학교 운영 플랫폼 · 디자인 기준 9차

## 설계 순서

1. 역할과 이번 방문의 과업을 한 문장으로 정한다. 학부모 알림장의 대표 과업은 자녀의 학교 안내에 참여 여부를 회신하는 일이다.
2. 최초 진입, 입력, 제출, 정상 완료, 빈 상태, 수정·취소 경로를 먼저 그린다. 운영 서비스는 전송 실패와 중복 제출도 설계한다.
3. 공통 요소와 학교별 설정을 분리한 뒤 시각안을 만든다. 기준 화면과 결정 이유를 해당 차시에 남긴다.
4. 구현 전후에 같은 과업으로 비교한다. 자동 검사를 보완해 보호자가 별도 설명 없이 회신·확인·수정할 수 있는지 직접 관찰한다.

## 공통 요소와 학교별 표현

- 공통 요소는 탐색 순서, 버튼 역할, 입력 상태, 초점 처리, 완료 메시지다. 마감일과 제출값을 텍스트로 보여준다.
- 학교 이름·언어·강조색·학기 명칭은 학교별 설정이다. 9차의 CSS는 학교 테마용 --school, --tint, --note와 공통 본문·선·보조 글색을 사용한다.
- 새벽빛과 숲빛은 디자인 탐색용이다. 본문의 일반 크기 대비 목표는 4.5:1이다. 주요 회신 버튼의 최소 높이는 44 CSS px이다.
- 내부 메뉴는 현재 탭에서, 다른 화면과 차시는 target="_blank" 및 rel="noopener"로 연다. 원래 탭의 필터와 입력을 보존한다.
- 시안에는 가상 자료를 사용한다. 운영에서 보호자와 연결된 자녀의 발행된 자료만 열람하도록 검증한다.

## 차시별 리뷰 기록 양식

| 역할·과업 | 화면 상태 | 관찰한 문제 | 수정 내용 | 재확인 결과 |
| --- | --- | --- | --- | --- |
| 학부모 · 참여 여부 회신 | | | | |
| 학부모 · 회신 수정 | | | | |
| 학부모 · 새 안내 없음 | | | | |

## 도구를 검토할 때

학교 시각안을 탐색할 때 Stitch DESIGN.md, 공유 스타일을 관리할 때 Penpot 토큰 또는 Figma Make kits, 구현 후 디자인 리뷰에는 Impeccable, 컴포넌트별 회귀 검사에는 Storybook을 검토한다. 9차는 HTML·CSS·JS로 별도 유료 서비스 없이 구현했다. 외부 도구 도입이나 접근성 인증을 전제로 하지 않는다.

- Google Stitch https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-design-md/
- Penpot https://help.penpot.dev/user-guide/design-systems/design-tokens/
- Figma https://help.figma.com/hc/en-us/articles/35946832653975-Use-your-design-system-package-in-Make-kits
- Impeccable https://github.com/pbakaus/impeccable
- Storybook https://storybook.js.org/addons/%40storybook/addon-a11y
- WCAG 2.2 https://www.w3.org/TR/WCAG22/
