# 43차: Cloudflare R2 파일 저장소 + 학교별 사용량·요금 추정 (ADR 0018)

- 날짜: 2026-11-23 · 세션: 관제(학교 플랫폼 전체)
- 사용자 지시: R2를 지금 연결(계정 있음, 세팅 방법 안내). 학교별 AI·저장소 사용량으로 요금 추정.

## 한 일
- `src/lib/storage.ts`: R2(S3 호환, aws4fetch) — 올리기(크기 대조), 10분 서명 주소. 설정 없으면 DB.
- 업로드: 사람(`uploadAsset`)·작업 토큰(`agent.can_upload` → R2 → `agent.register_asset`) 모두 R2 우선.
- 읽기: 공개 그림·구성원 미리보기가 R2 파일이면 302 서명 주소(PDF는 내려받기).
- 전체 관리 → **사용량·저장소**: R2 상태·연결 확인·DB 파일 복사(25개씩, DB 사본 유지), 학교별 파일·DB/R2 저장·AI 호출·외부 에이전트 작업·월 추정. 학교 설정에 '우리 학교 사용량'.
- DB: `site_assets.object_key`(자기 해시로 한 번만), `usage_events`(AI 사용 기록, 추가만).
- 세팅 안내 `docs/SETUP-R2.md`.

## 시험
- `tests/round43.test.ts` 9개(로컬 S3 흉내 서버), 전체 `npm test` 27파일 203개, E2E 31/31(43차 단계).
- 운영 조건 흉내(빈 request.jwt.claims + 학교 rungarunsuksa) 마이그레이션 통과.

## 남은 일
- 선생님: 버킷·토큰·Vercel 변수(`docs/SETUP-R2.md`). 그 뒤 연결 확인 → 복사.
- DB 사본 비우기(확인 뒤 결정), 학사 원본 파일 R2, 그림 줄이기(WebP), 내려받기 세기, 학교별 사용량 상한·경보.
- 운영 배포는 Vercel 하루 한도로 2026-11-24 22:50 예약 배포에서 확인.
