# 운영 DB 마이그레이션을 GitHub Actions로 옮기기 (77차, ADR 0019 A4 · 관제 센터 #17)

선생님이 고른 안: **GitHub Actions + 무료 미리보기 Supabase 프로젝트**(`actions_free`, 2026-11-25).

## 왜
- 지금은 Vercel 운영 빌드 안에서 운영 DB 마이그레이션을 적용한다. 2026-11-23 운영 배포 실패 2번이 모두 이 단계였다.
- 미리보기 빌드는 운영 DB를 같이 써서, 병합 전 브랜치를 실제 DB로 시험할 수 없다.

## 바뀐 뒤 흐름
1. PR 병합 → `CI`(테스트·빌드·e2e)가 main에서 통과한다.
2. `운영 DB 마이그레이션`(`.github/workflows/migrate-production.yml`)이 이어서 돈다.
   1. 대기 목록 확인
   2. 마이그레이션 적용
   3. 대기 0 확인
3. 성공하면 Vercel 배포 훅을 불러 운영 배포를 만든다.
4. 운영 빌드(`MIGRATIONS_BY_ACTIONS=1`)는 마이그레이션을 적용하지 않는다. 대기 중인 파일이 남아 있으면 빌드를 멈추고(`migrate.mjs --check --strict`), 없으면 예시 시드·학교 준비만 한다. 그래서 앱이 아직 없는 표를 쓰는 일이 생기지 않는다.

비밀값이 없으면 워크플로는 건너뛰고, 지금 방식(운영 빌드가 적용)이 그대로 돈다. **선생님이 1~3을 마치기 전에는 아무것도 바뀌지 않는다.**

## 선생님이 할 일 (비밀값은 채팅에 붙여 넣지 말고 각 화면에 직접 넣기)

### 1. GitHub 환경 `production`과 비밀값 (78차: 두 개만)
GitHub 저장소 → Settings → Environments → New environment → 이름 `production`.

그 환경의 **Environment secrets**(Variables 아님 — Secrets는 로그에서 가려진다)에 아래 두 값을 넣는다. 이름은 Vercel과 같다. Vercel처럼 주소와 비밀번호를 나눠 넣는다. 비밀번호에 특수기호가 있어도 스크립트가 변환해 넣는다(`scripts/pg-options.mjs`).

| 이름 | 값 | 어디서 |
|---|---|---|
| `DATABASE_URL` | Transaction pooler 주소. `[YOUR-PASSWORD]`는 그대로 둔다 | Supabase → 위쪽 **Connect** → Direct(Connection string) → **Transaction pooler**(포트 6543) |
| `DATABASE_PASSWORD` | DB 비밀번호 원문 | 선생님이 정한 값. Supabase도 Vercel(Sensitive)도 다시 보여 주지 않으니 비밀번호 관리자에 보관. 모르면 Supabase에서 재설정하고 Vercel `DATABASE_PASSWORD`도 같은 값으로 바꾼 뒤 재배포 |

예시 시드 비밀번호·관리자 이메일은 GitHub에 넣지 않는다. 시드·학교 준비는 계속 Vercel 운영 빌드가 한다.

원하면 같은 화면의 'Required reviewers'에 선생님을 넣는다. 그러면 운영 DB 적용 전에 승인 단추가 생긴다.

### 2. Vercel 배포 훅
Vercel → 프로젝트 → Settings → Git → Deploy Hooks → 이름 `after-migrate`, 브랜치 `main` → 만든 주소를 복사한다.

GitHub 환경 `production`의 비밀값 `VERCEL_DEPLOY_HOOK_URL`에 넣는다.

### 3. 관제에 "넣었다"고 알리기
관제 센터 #17에 답하거나 대화창에 적는다. 그다음은 관제가 한다.

1. 워크플로를 한 번 수동 실행(workflow_dispatch)해 연결을 확인한다. 대기 0이면 아무것도 바꾸지 않는다.
2. Vercel 운영 환경 변수 `MIGRATIONS_BY_ACTIONS=1`을 넣는다.
3. `vercel.json`에서 main 자동 배포를 끈다(`git.deploymentEnabled.main: false`). 이후 운영 배포는 마이그레이션이 성공했을 때 훅으로만 일어난다.

### 4. 미리보기 DB (무료)
1. Supabase에서 새 무료 프로젝트를 만든다(예: `onschools-preview`). 7일 동안 쓰지 않으면 일시 정지되고, 대시보드에서 다시 켤 수 있다.
2. Vercel 환경 변수에서 **Preview 범위에만** 아래 값을 넣는다.
   - `DATABASE_URL` = 새 프로젝트 주소
   - `PREVIEW_APPLY_MIGRATIONS=1`
   - `SEED_PASSWORD_A`·`SEED_PASSWORD_B` = 미리보기용 새 값

이러면 미리보기 빌드가 자기 DB에 마이그레이션·시드를 적용한다. 운영 DB는 건드리지 않는다.

## 되돌리기
1. Vercel에서 `MIGRATIONS_BY_ACTIONS`를 지운다.
2. `vercel.json` main 자동 배포를 다시 켠다.

이러면 예전 방식으로 돌아간다. GitHub 비밀값은 남아 있어도 해가 없다. 워크플로가 같은 파일을 다시 적용하지 않기 때문이다(파일마다 트랜잭션 잠금 + 적용 기록).

## 확인한 것 / 못 한 것
- 확인
  - `migrate.mjs --check --strict`(대기 0이면 종료 코드 0, 있으면 2)
  - `predeploy.mjs` 분기(`MIGRATIONS_BY_ACTIONS` 없으면 지금과 같음)
  - 워크플로 YAML 구문
- 못 한 것
  - 실제 운영 비밀값으로 워크플로 실행(선생님 비밀값 필요)
  - 배포 훅 호출
