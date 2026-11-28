# 134차: 번호는 관제가 나눠 준다 — 차시·결정 기록·마이그레이션 (ADR 0051)

- 날짜: 2026-11-28 · 세션: 학사 시스템 개발 전담
- 사용자: "차시 번호 미리 나눠 주는 규칙 PR 올려"

> **요약** 차시 번호(`N차`)·결정 기록 번호·마이그레이션 번호를 세션이 'main 최대 + 1'로 직접 고르지 않고, 관제 센터에서 받는다. `npm run number -- round "제목"` 한 줄이면 된다. 동시에 받아도 겹치지 않는다.

> **왜** 여러 세션이 같은 날 같은 번호를 골라 병합 직전에 부딪쳤다(오늘만 다섯 번 넘게). 그때마다 파일 이름·본문·PR 제목을 고쳐야 했다.

```terms
용어 | 쉬운 설명 | 예시
차시 번호 | 한 번의 작업 묶음에 붙이는 일련번호 | 134차, docs/rounds/round-134.md
floor | 세션이 저장소에서 본 가장 큰 번호 | main과 브랜치에 133차까지 있으면 133
빈 번호 | 받았지만 쓰지 않은 번호 | 136차를 받고 일을 접으면 136차는 비어 있음
```

## 흐름
```
세션: npm run number -- round "편집 화면"
  → 스크립트: main + 원격 브랜치에서 floor(133) 계산
  → 관제 API POST /api/control/numbers {kind:'round', session, title, floor:133}
  → DB: 종류별 잠금 → greatest(지금까지 준 최대, 133) + 1 = 134 → 기록
  ← {"label":"134차"}
```

## 한 일
- 마이그레이션 `20261128002100_control_numbers.sql`: 표 `control_numbers`(고치기·지우기 막음, 전체 관리자만 읽음), `control.reserve_number`·`control.numbers`(점검 토큰, `control_writer` 소유).
- API `GET/POST /api/control/numbers`, `src/lib/control.ts`의 `reserve`·`numbers`.
- 스크립트 `scripts/reserve-number.mjs`(`npm run number`), `--dry`로 floor만 보기. 지금 커밋·로컬·원격 브랜치를 모두 세고, 번호를 하나도 못 찾으면 받지 않는다(원격을 못 받은 환경에서 1부터 받아 겹치지 않게, Codex 검토).
- 규칙: `docs/COLLABORATION.md` 2절 '번호 받기', 세션 시작 점검 6단계, `docs/automation/CONTROL-CENTER.md` '번호 받기'. ADR 0051.
- 이 차시의 번호(134차·0051·002100)는 장치가 생기기 전이라 열린 PR과 브랜치를 보고 손으로 골랐다(`--dry`의 floor와 같음).

## 시험
- `tests/control-numbers.test.ts` 6개: floor보다 크고 이어 받기, 낡은 floor도 겹치지 않음, ADR 네 자리, 마이그레이션 오늘 날짜 + 100, 동시 8개가 모두 다름, 잘못된 요청 400·토큰 401, 고치기·지우기 거부, 학교 사용자는 표를 못 읽음.
- `tests/rls-gate.test.ts`: 새 플랫폼 표를 이유와 함께 목록에 넣음.
- 비슈퍼유저 마이그레이션 점검 통과.

## 확인하지 못한 것·다음
- 운영에서 실제로 번호를 받아 보는 것은 병합·마이그레이션 뒤(관제 기록에 남김).
- 관제 API에 닿지 못하는 환경(점검 토큰이 없는 Codex 클라우드 등)은 번호 없이 진행하고 PR 전에 받는다. Codex 쪽 방법은 다음.
