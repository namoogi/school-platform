# 78차: 운영 DB 마이그레이션 워크플로를 비밀값 두 개로 줄임 (관제 센터 #17)

- 날짜: 2026-11-26 · 세션: 관제
- 사용자 지적: 77차 안내가 SEED 비밀번호·관리자 이메일까지 GitHub에 요구했다. 결정 카드(#17)에는 'DB 주소'만 있었다. 게다가 Vercel 값은 Sensitive라 다시 볼 수 없었고, 처음 설정 때 따로 보관하라는 안내도 없었다.
- 사용자 조치: GitHub에 `DATABASE_URL`·`DATABASE_PASSWORD`를 나눠 넣었다. 비밀번호의 특수기호 때문에 주소에 비밀번호를 직접 넣으면 계속 오류가 났었다. Vercel도 같은 방식이다.

## 고친 것
- `migrate-production.yml`
  - 마이그레이션만 적용한다(대기 목록 → 적용 → 대기 0 확인 → 배포 훅).
  - 비밀값은 `DATABASE_URL`(`[YOUR-PASSWORD]` 그대로) + `DATABASE_PASSWORD` 두 개다.
  - 비밀번호는 `scripts/pg-options.mjs`가 변환해 넣는다(이미 있던 경로).
- `predeploy.mjs`: `MIGRATIONS_BY_ACTIONS=1`일 때 대기 0을 확인한 뒤 시드·학교 준비만 한다(계속 Vercel이 함).
- `docs/SETUP-MIGRATIONS-CI.md`: 비밀값 두 개, 어디서 확인하는지, 다시 볼 수 없다는 점
- `AGENTS.md`: 비밀값 안내 규칙(만드는 곳·다시 볼 수 있는지·보관, 결정 카드 목록을 늘리지 않음)

## 시험
- 특수기호(`@ : / # ? % &`) 비밀번호를 가진 로컬 역할로 `[YOUR-PASSWORD]` 주소 + `DATABASE_PASSWORD` 접속을 시험했다. `--check --strict`가 종료 코드 0으로 끝났다.
- 워크플로 YAML 구문, `predeploy.mjs` 구문, CI 전체
- 병합 뒤 main CI가 통과하면 워크플로가 처음으로 실제 비밀값으로 돈다(대기 0이면 바꾸는 것 없음). 결과는 이 차시 PR 댓글이 아니라 관제 센터 #17에 남긴다.
