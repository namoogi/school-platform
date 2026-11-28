# 77차: 운영 DB 마이그레이션을 GitHub Actions로 옮길 준비 (관제 센터 #17)

- 날짜: 2026-11-26 · 세션: 관제
- 근거
  - 관제 센터 결정 요청 #17에 사용자가 `actions_free`를 골랐다(2026-11-25): GitHub Actions + 무료 미리보기 Supabase 프로젝트.
  - ADR 0019 A4
- 판단
  - 운영 DB 주소 같은 비밀값은 관제가 받지 않는다. 그래서 **비밀값이 들어오기 전에는 아무것도 바뀌지 않게** 만든다.
  - 전환은 두 개의 스위치로 나눈다. 하나는 비밀값이 들어오면 워크플로가 도는 것, 다른 하나는 Vercel 환경 변수 `MIGRATIONS_BY_ACTIONS=1`이다. 두 스위치 모두 되돌릴 수 있다.

## 한 일
- `.github/workflows/migrate-production.yml`
  - main의 `CI` 통과(push) 뒤, 또는 수동 실행으로 돈다.
  - `production` 환경 비밀값 `PRODUCTION_DATABASE_URL`이 없으면 건너뛴다.
  - 있으면 순서대로 한다: 대기 목록 → 마이그레이션·예시 시드·학교 준비 → 대기 0 확인 → Vercel 배포 훅 호출(`VERCEL_DEPLOY_HOOK_URL`이 있을 때).
  - 실행은 하나씩만 한다(concurrency, 취소 없음).
- `scripts/migrate.mjs --check --strict`: 대기 중인 파일이 있으면 종료 코드 2를 낸다.
- `scripts/predeploy.mjs`
  - 운영 빌드에서 `MIGRATIONS_BY_ACTIONS=1`이면 DB를 바꾸지 않고 `--check --strict`만 한다. 대기 중인 파일이 남아 있으면 빌드를 멈추고 이유를 알린다.
  - 이 변수가 없으면 지금과 같다.
- `docs/SETUP-MIGRATIONS-CI.md`: 선생님이 할 일(GitHub 환경 비밀값·Vercel 배포 훅·미리보기 DB), 관제가 이어서 할 일, 되돌리기

## 시험
- `--check --strict`: 대기 0이면 0을 낸다. 대기가 있으면 2를 내는지는 빈 DB에서 확인했다.
- `predeploy.mjs` 구문
- 워크플로 YAML 구문
- 기존 CI 전체

## 못 한 것(선생님 비밀값 필요)
- 실제 운영 비밀값으로 워크플로를 돌리는 것, 배포 훅 호출, Vercel `MIGRATIONS_BY_ACTIONS` 켜기, main 자동 배포 끄기
- 미리보기 Supabase 프로젝트 만들기
