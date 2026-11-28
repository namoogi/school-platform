# 0045. Radix Themes 도입 + 양식 배치 규약(칸 너비 = 내용 길이)

- 상태: 채택(1단계: 토대·공통 양식·사람 화면. 나머지 화면은 단계적으로)
- 날짜: 2026-11-28
- 제안: Claude(관제)
- 결정: 사용자(2026-11-28)
  - 요청: "스타일이 정돈되어 있지 않군. 전체적으로 input box와 버튼 등을 어떻게 배치할지 스타일 시트 가이드를 만들어서 … 또는 이와 관련된 UI,UX에 관한 git에 올려진 도구들이 있다면 가져와서 적용하도록."
  - 선택 1: '외부 UI 라이브러리 도입'
  - 선택 2: 토큰 이름 충돌을 알린 뒤 'Radix Themes 그대로 도입'
- 관련: ADR 0003(디자인 시스템), 0005(UI 도구, Tailwind·shadcn 보류 → 이 기록이 2단계 스타일 체계를 정함), `docs/design/DESIGN-SYSTEM.md` '양식 배치'

## 원인(진단)
- 공통 양식 부품 `ActionForm`에는 '한 줄 나열(inline)'과 '넓게(wide)' 두 가지뿐이었다.
- 그래서 46곳의 화면이 칸 너비와 단추 위치를 제각각 정했다. 날짜·선택 칸이 넓게 늘어나고, 단추가 따로 떨어지고, 기록 줄 옆에 양식이 끼었다.

## 고려한 안
| 안 | 판단 |
| --- | --- |
| 자체 규약 + 부품 확장 | 토큰 충돌 없음, 작업 적음. 사용자는 외부 도구를 골랐다 |
| shadcn/ui | Tailwind 필요(ADR 0005 보류 사유 그대로), 복사형이라 유지가 우리 몫 |
| **Radix Themes 3.3.0(채택)** | MIT, React 19 지원, Tailwind 불필요, 이미 쓰는 Radix 부품과 같은 계열. 대가: CSS 약 0.8MB(압축 전), 토큰 이름 11개 충돌 |
| Radix Themes 부분 도입 | 두 체계가 섞여 유지가 어렵다 |

## 결정
1. `@radix-ui/themes@3.3.0`(정확한 판)을 설치하고 `styles.css`를 `globals.css` 앞에 싣는다. 앱 셸(`Shell.tsx`)을 `<Theme>`로 감싼다.
   - 명암은 화면 선택을 따른다(light·dark). 강조색은 분석형 blue, 학사형 teal이고, 회색은 slate·sand다.
   - 공개 홈페이지(`/s/**`)는 셸 밖이라 감싸지 않는다.
2. 이름 충돌을 정리한다. 우리 `--space-*`·`--shadow-1~3`·`--radius-full`을 `--ds-` 앞글자로 바꾼다. Radix 부품의 색·서체·높이(`--accent-*`·`--gray-a7` 등)는 `.app`에서 우리 의미 토큰으로 다시 정의한다.
3. 양식 배치 규약(`DESIGN-SYSTEM.md` '양식 배치')
   - 칸 너비는 내용 길이에 맞춘다(xs·sm·md·lg·full). 종류로 자동으로 정한다(`fieldSize`).
   - 한 줄 양식의 단추는 마지막 칸 옆 바닥선에 둔다.
   - 상세 화면은 구획 → 기록 목록 → 양식 순서다.
   - 근거: GOV.UK Design System 'Text input — use appropriately-sized text inputs'(내용 길이에 맞춘 너비)
4. `ActionForm`을 Radix `TextField`·`TextArea`·`Button`으로 다시 만든다. 선택은 브라우저 기본 `<select>`로 남긴다.
   - 이유: Radix Themes의 Select는 목록 상자를 직접 그리는 방식이다. 키보드 입력 찾기, 휴대폰 기본 선택기, 기존 시험(`selectOption`)이 달라진다.
   - 높이·글씨는 맞춘다.
5. 1단계 적용 화면은 사람·학적(`/people`)이다. 나머지 화면은 `ActionForm`을 쓰는 곳이면 자동으로 새 규약을 따른다. 직접 입력을 늘어놓은 화면은 자동 개발 세션 대기열(`docs/automation/QUEUE.md`)에서 한 화면씩 옮긴다.

## 다시 검토할 조건
- CSS 무게가 첫 화면 속도에 문제가 되면, Radix의 쪼갠 CSS(components·tokens만)로 줄이거나 쓰지 않는 부품을 빼는 빌드를 검토한다.
- Radix Themes 4.x로 올릴 때 토큰 이름이 바뀌면 이 기록의 다시 정의 목록을 함께 고친다.

## 확인 방법
- `tests/form-layout.test.ts`: `fieldSize` 규칙
- 사람·학적 화면 캡처(학사형 밝게·분석형 다크)
  - 칸이 내용 너비로 한 줄에 선다. 단추가 바닥선에 맞는다. 초점 고리가 한 겹이다.
- `npm test`·e2e(양식이 46곳에서 쓰임)
