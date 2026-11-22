# 새 클라우드 프로젝트 연결 (14차 기준)

14차는 로컬 Postgres 16에서 구현하고 테스트했습니다. 이 세션에는 이 프로젝트 전용 Vercel·Supabase 자격 증명이 없어 **클라우드 연결은 검증하지 못했습니다.** 아래는 연결에 필요한 설정입니다. 드리미포털의 프로젝트·키를 재사용하지 않습니다.

## 1. Supabase (새 개발 프로젝트)

| 항목 | 권장값 |
| --- | --- |
| 프로젝트 이름 | `school-platform-dev` |
| 리전 | 사용자 위치에 가까운 곳 (예: Northeast Asia (Seoul)) |
| 쓰는 기능 | Postgres만 사용. 14차는 Supabase Auth·Storage·Data API를 쓰지 않음 |

마이그레이션과 시드는 **직접 연결**(Project Settings → Database → Direct connection, 5432)로 적용합니다. 검토용으로 공개할 배포라면 기본 예시 비밀번호를 쓰지 말고 새 값을 지정하세요.

```bash
DATABASE_URL='<direct connection string>' npm run db:migrate
```

```bash
DATABASE_URL='<direct connection string>' SEED_PASSWORD_A='<새 비밀번호>' SEED_PASSWORD_B='<새 비밀번호>' npm run db:seed
```

## 2. Vercel (새 프로젝트)

| 항목 | 값 |
| --- | --- |
| 프로젝트 이름 | `school-platform` |
| 연결 저장소 | `namoogi/school-platform` |
| Framework | Next.js (자동 인식), 빌드 명령 기본값 |
| 환경 변수 `DATABASE_URL` | Supabase **Transaction pooler** 연결 문자열 (6543 포트) |
| 환경 변수 `SESSION_SECRET` | 48바이트 이상 임의 문자열 (`openssl rand -base64 48`). Preview·Production 각각 다르게 |

## 3. 연결 후 확인할 항목 (미검증)

- [ ] Supabase에서 마이그레이션이 오류 없이 적용되는지. 특히 `create role` 블록(이미 있는 `authenticated`·`anon`은 건너뜀), `private`·`app` 스키마 생성, 트리거 생성.
- [ ] Transaction pooler를 거쳐도 `set local role authenticated`와 `set_config(..., true)`가 트랜잭션 안에서 유지되는지. 로컬 테스트 `npm test`를 Supabase 개발 DB에 대고 한 번 실행하면 확인됩니다. (`TEST_DATABASE_URL`은 개발 DB 전용으로만 쓰고, 테스트가 스키마를 초기화하므로 운영 DB에는 절대 쓰지 않습니다.)
- [ ] `pg`의 SSL 설정. 연결 문자열의 `sslmode` 값에 따라 인증서 검증 방식이 달라지므로, 연결 오류가 나면 Supabase가 제공하는 CA 인증서를 쓰는 설정을 추가해야 합니다.
- [ ] Supabase Data API(PostgREST)가 `public` 스키마를 노출하더라도 anon 권한을 회수했고 모든 표에 RLS가 켜져 있는지 대시보드의 Security Advisor로 확인.
- [ ] 검토 배포 URL에서 `npm run test:e2e`와 같은 흐름을 수동으로 한 번 실행.
