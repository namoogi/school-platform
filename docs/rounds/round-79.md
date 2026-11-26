# 79차: 운영 DB 마이그레이션 전환 완료 (관제 센터 #17)

- 날짜: 2026-11-26 · 세션: 관제
- 선생님이 한 일
  - GitHub 환경 `production`의 Secrets에 `DATABASE_URL`·`DATABASE_PASSWORD`(78차)를 넣었다.
  - Vercel Deploy Hook `after-migrate`(main)를 만들고 그 주소를 같은 Secrets의 `VERCEL_DEPLOY_HOOK_URL`에 넣었다.

## 관제가 한 일
1. 워크플로를 수동 실행했다(run 45815962873).
   - 적용 대기 0이라 DB는 바뀌지 않았다.
   - 배포 훅이 운영 배포를 만들었다(`after-migrate`, 8297f96). 이 배포는 READY가 됐다.
2. Vercel 운영 환경 변수 `MIGRATIONS_BY_ACTIONS=1`을 넣었다(plain, production만, API).
   - 이제 운영 빌드는 마이그레이션을 적용하지 않는다. 대기 0을 확인한 뒤 시드·학교 준비만 한다.
3. `vercel.json`에서 main 자동 배포를 껐다(이 PR).
   - 이후 운영 배포는 main CI 통과 → '운영 DB 마이그레이션' → 배포 훅 순서로만 일어난다.

## 확인
- 이 PR의 병합 커밋에서 위 흐름이 처음부터 끝까지 돌았는지, 운영 배포 빌드 기록에 'GitHub Actions가 적용' 문구가 있는지 확인한다(결과는 관제 센터 #17).

## 되돌리기
1. Vercel에서 `MIGRATIONS_BY_ACTIONS`를 지운다.
2. `vercel.json`에서 `"main": false`를 지운다.

이러면 예전 방식(운영 빌드가 적용)으로 돌아간다.

## 남은 것
- 미리보기 DB 분리(선택): Supabase 무료 프로젝트를 Vercel Preview 범위에 연결
