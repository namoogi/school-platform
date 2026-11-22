# 학교 운영 플랫폼

학교 자료를 읽어 학사 규칙을 추정하고, 관리자 확인을 거친 규칙으로 학사 문서를 발행하는 플랫폼입니다. 드리미포털과 저장소·배포·DB가 별도입니다.

현재 차시: **14차** · [14차 결과](docs/rounds/round-14.md) · [13차까지의 인계 자료](school-platform-handoff/START-HERE.md)

## 구성

| 위치 | 내용 |
| --- | --- |
| `src/app` | Next.js App Router 화면과 API (`/intake`, `/review`, `/documents`) |
| `src/lib/services.ts` | 자료 등록, 재분석, 질문 답변, 양식 버전, 발행 |
| `src/lib/analyze.ts` | 규칙 기반 분석기 (학기·평가 기간 관계, 파일·행 근거) |
| `src/lib/db.ts` | 요청마다 RLS가 걸린 트랜잭션 (`asUser`) |
| `supabase/migrations` | 스키마, RLS, 변경 불가 트리거 |
| `scripts/` | 마이그레이션 적용기, 합성 예시 시드 |
| `tests/` | 통합 테스트(vitest), 브라우저 E2E(Playwright) |

## 로컬 실행

Postgres 16 이상이 필요합니다. (Docker나 Supabase CLI 없이 동작)

```bash
cp .env.example .env.local
```

```bash
set -a; . ./.env.local; set +a
```

```bash
npm install && npm run db:reset && npm run dev
```

http://localhost:3000 에서 예시 계정으로 로그인합니다. 로컬 기본 비밀번호는 `demo-pass-a`, `demo-pass-b`입니다. (`SEED_PASSWORD_A/B`로 바꿀 수 있음)

| 학교 | 계정 | 자료 |
| --- | --- | --- |
| 드리미 예시학교 (두 학기) | admin-a@school-a.test | `school-platform-handoff/fixtures/school-a-*.csv` |
| Rungarun Example School (세 텀) | admin-b@school-b.test | `school-platform-handoff/fixtures/school-b-*.csv` |

## 테스트

```bash
npm test
```

```bash
npm run build && npm run test:e2e
```

통합 테스트는 `school_platform_test`, E2E는 `school_platform_e2e` DB를 매번 새로 만듭니다. 접속 기준은 `TEST_ADMIN_DATABASE_URL` (기본 `postgres://postgres@127.0.0.1:54322/postgres`)입니다.

## 클라우드 연결

[docs/SETUP-CLOUD.md](docs/SETUP-CLOUD.md)에 새 Supabase·Vercel 프로젝트에 필요한 설정을 정리했습니다.
