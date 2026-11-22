# 명령 함수 제한 소유 역할 시험 (ADR 0004 B4, 단계 1 착수 전)

- 날짜: 2026-11-22 · 자동 실행(Claude 개발 세션)
- 환경: 로컬 PostgreSQL 16 (클라우드 컨테이너, 54322 포트). **Supabase 관리형 DB에서는 시험하지 않았다**(설정 변경 금지 규칙).

## 시험한 것

로그인·슈퍼유저·`BYPASSRLS`·`CREATEROLE` 권한이 없는 역할(`probe_writer`)이 소유한 `SECURITY DEFINER` 함수로만 쓰기를 허용할 수 있는지.

| # | 시나리오 | 기대 | 결과 |
| --- | --- | --- | --- |
| 1 | 요청 역할(`authenticated` 역할 흉내)이 표에 직접 INSERT | 거부 | `permission denied for table t` ✅ |
| 2 | 요청 역할이 명령 함수로 같은 학교 행 추가 | 허용 | 1행 추가 ✅ |
| 3 | 명령 함수로 다른 학교 행 추가 | RLS 거부(소유 역할에도 RLS 적용) | `new row violates row-level security policy` ✅ |
| 4 | 비슈퍼유저 로그인 → 요청 역할 → `SET ROLE probe_writer` | 거부 | `permission denied to set role` ✅ |
| 5 | `pg_has_role(요청 역할, 소유 역할, 'MEMBER')` | false | false ✅ |

주의: 세션 사용자가 슈퍼유저(로컬 `postgres`)이면 `SET ROLE`은 어떤 역할로도 된다. 요청 경계는 "요청 역할이 소유 역할의 구성원이 아니다"로 판단해야 하며, 4번은 비슈퍼유저 로그인으로 따로 확인했다. 앱이 임의 SQL을 받지 않으므로 세션 사용자 자체는 신뢰 경계 안에 있다(기존 `asUser()`와 같은 전제).

## 결론

- 로컬 PG16에서는 **가능**. 단계 1 마이그레이션에 `app_writer` 역할(nologin·nosuperuser·nobypassrls·nocreaterole·noinherit)을 만들고 새 표의 쓰기 명령 함수 소유자로 쓴다.
- 함수 소유자를 바꾸려면 마이그레이션 실행 사용자가 그 역할로 `SET ROLE` 할 수 있어야 한다. 슈퍼유저가 아니면(Supabase `postgres`) 마이그레이션이 `grant app_writer to current_user`를 먼저 실행한다. 이 경로는 **Supabase에서 확인 필요**(PG15 `CREATEROLE` 동작, Supabase가 `postgres`에 주는 권한).
- `authenticated`·`anon`에는 `app_writer`를 부여하지 않는다. 테스트(`tests/adr0004-step1.test.ts`)가 `pg_has_role`로 매번 확인한다.

시험 SQL은 이 문서의 표 순서대로 `create role … ; create function … security definer; alter function … owner to …`를 실행한 것이며 저장소에는 넣지 않았다(같은 내용을 통합 테스트가 실제 마이그레이션에 대해 확인한다).
