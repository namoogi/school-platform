# 새 클라우드 프로젝트 연결

GitHub 저장소, Vercel 프로젝트, Supabase 프로젝트는 드리미포털과 각각 별도입니다. 포털의 프로젝트·키를 재사용하지 않습니다.

## 연결 방식

**Vercel 빌드가 Supabase에 마이그레이션과 예시 시드를 적용합니다.** (`scripts/predeploy.mjs`)

- DB 비밀번호가 담긴 연결 문자열은 **Vercel 환경 변수에만** 넣습니다. 저장소, 채팅, 개발 세션에는 두지 않습니다.
- 로컬 `npm run build`에서는 predeploy가 아무것도 하지 않습니다. (`VERCEL=1`일 때만 동작)
- 마이그레이션은 이미 적용한 파일을 건너뛰고, 동시에 도는 빌드끼리는 잠금으로 한 번만 적용합니다.
- Preview와 Production이 같은 개발 DB를 씁니다. 운영 학교 자료를 넣기 전에 운영용 Supabase 프로젝트를 따로 만들고 Production 환경 변수만 그쪽으로 바꿉니다.

## 1. Supabase에서 연결 문자열 복사

1. 새 프로젝트 대시보드 위쪽의 **Connect** 버튼을 누릅니다.
2. **Transaction pooler** 연결 문자열(포트 `6543`)을 복사합니다. 형태: `postgresql://postgres.<프로젝트ref>:[YOUR-PASSWORD]@aws-0-<리전>.pooler.supabase.com:6543/postgres`
3. `[YOUR-PASSWORD]`를 프로젝트를 만들 때 정한 DB 비밀번호로 바꿉니다. 비밀번호를 잊었으면 Project Settings → Database에서 재설정합니다.

대시보드 메뉴 이름은 바뀔 수 있습니다. 찾기 어려우면 Project Settings → Database에서 Connection string을 찾습니다.

## 2. Vercel 환경 변수 (Project Settings → Environment Variables)

Production과 Preview 둘 다에 체크합니다.

| 이름 | 값 |
| --- | --- |
| `DATABASE_URL` | 1번에서 만든 Transaction pooler 연결 문자열 |
| `SESSION_SECRET` | 32자 이상 임의 문자열. 비밀번호 생성기로 만든 긴 문자열이면 됩니다 |
| `SEED_PASSWORD_A` | 예시 관리자 A의 새 비밀번호 (10자 이상, `demo-pass`로 시작하지 않음) |
| `SEED_PASSWORD_B` | 예시 관리자 B의 새 비밀번호 (같은 조건) |

변수가 비어 있거나 조건에 맞지 않으면 빌드가 실패하고, 빌드 로그에 `[predeploy]`로 시작하는 이유가 나옵니다.

## 3. 다시 배포

환경 변수는 저장한 뒤의 배포부터 적용됩니다. Deployments에서 최근 배포의 **Redeploy**를 누르거나 브랜치에 새 커밋을 올립니다.

- 14차 앱은 아직 `round-14/first-flow` 브랜치(PR #1)에만 있습니다. 검토 주소는 PR의 **Preview** 배포입니다.
- `main`에는 인계 자료만 있어 Production 배포에는 앱이 없습니다. PR을 병합하면 Production 주소에서도 열립니다.
- Preview 주소는 기본적으로 Vercel 로그인(Deployment Protection)이 필요합니다.

## 4. 연결 후 확인할 항목

빌드 로그에서:
- [ ] `[predeploy] preview 빌드 · DB 호스트 …pooler.supabase.com`
- [ ] `적용: 20261122000100_round14_core.sql` (첫 배포) 또는 `새로 적용할 마이그레이션 없음`
- [ ] `예시 데이터 준비 완료`

배포 주소에서 (README의 E2E 흐름과 같은 순서):
- [ ] 예시 A·B 관리자로 각각 로그인
- [ ] fixtures CSV 등록 → 관리자 확인 → 문서 발행
- [ ] A 화면에서 B 발행본 주소를 열면 404

Supabase 대시보드에서:
- [ ] Security Advisor에서 RLS가 꺼진 표가 없는지 확인. 이 앱은 Supabase Data API(PostgREST)를 쓰지 않으므로, Data API를 꺼 두면 노출 면이 더 줄어듭니다.

## SSL

Supabase 주소에는 암호화 연결을 씁니다. 기본값은 서버 인증서를 검증하지 않습니다. 검증까지 하려면 Supabase에서 CA 인증서를 받아 `DATABASE_SSL=verify`, `DATABASE_CA_CERT=<PEM 본문>`을 추가합니다. (`scripts/pg-options.mjs`)

## 아직 검증하지 못한 점

개발 세션의 네트워크에서는 Supabase·Vercel에 직접 접속할 수 없어, 아래는 첫 배포 로그로 확인해야 합니다.

- Supabase에서 마이그레이션이 오류 없이 적용되는지 (`authenticated`·`anon` 역할은 이미 있어 건너뜀)
- Transaction pooler를 거쳐도 `set local role authenticated`가 트랜잭션 안에서 유지되는지. 이 부분이 실패하면 로그인 후 화면에서 권한 오류가 납니다.
