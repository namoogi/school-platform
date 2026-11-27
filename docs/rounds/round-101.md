# 101차: 다국어 전환 6묶음 — 서버 오류 이름표 (ADR 0039)

> **요약** 서버가 돌려주는 실패 안내를 문장 대신 이름표로 던지고, 응답할 때 요청한 사람의 언어로 바꾼다. 앱 코드의 오류는 전부 옮겼고(홈페이지·동화 쪽 제외), DB 안내는 자주 나오는 29개만 연결했다.

> **왜** 영어 화면을 쓰는 사람도 "학교 관리자만 할 수 있습니다." 같은 실패 안내는 한국어로 봤다. 화면 코드는 바꾸지 않고 서버 응답만 그 사람 언어로 바뀐다.

```terms
용어 | 쉬운 설명 | 예시
이름표 | 문장 대신 쓰는 고유 이름. 언어별 사전에서 문장을 찾는다 | `err.schoolAdminOnly` → "학교 관리자만 할 수 있습니다." / "Only school admins can do this."
값(채우기 자리) | 문장 속 바뀌는 부분 | `{what}을(를) 찾을 수 없습니다.` 의 what = 학생
```

## 한 일
- `src/lib/errors.ts`: `AppError` + 오류 종류 5개(`ValidationError`·`NotFoundError`·`ForbiddenError`·`NoSchoolError`·`StorageError`). 이름표로 던지면 `key`·`vars`, `message`는 한국어 기준 문구. 값 속 명사·이름표도 번역(`localVars`).
- `src/lib/api.ts`: `errorResponse(e, { userId, schoolLang })` → `{ error: 사용자 언어 문구, code: 이름표 }`. `fail(status, key)`로 바로 거절. 언어 순서는 화면과 같다(사용자 설정 → 쿠키 → 학교 기본 언어 → 브라우저 → 한국어).
- 앱 오류 옮김: 정적 문구 218곳(이름표 137) + 값이 든 문구 31곳(이름표 17, 명사 55) + 작업 토큰·관제 API·언어 설정·구글 로그인 등 고정 거절.
- DB 안내: `db.*` 29개. DB 문구와 글자가 같을 때만 번역, 값이 든 DB 문구는 한국어 그대로.
- 시험 `tests/server-errors.test.ts`: 이름표/문장 구분, 영어 응답, 값 속 명사 번역, `db.*` 문구가 마이그레이션과 같은지, 코드에서 던지는 이름표가 모두 사전에 있는지.
- 이름표 합계 239개, 영어 포함.

## 확인
- 로컬: `curl`로 쿠키 `lang=en` → "That language isn't available.", `accept-language: en-US`(작업 토큰 API) → "A work token (x-agent-token) is required."
- `npm test` 460 통과, `tsc`, `check:repo`, `lint:i18n`.

## 남은 일
- 나머지 DB 고정 문구 약 340개(`db.*`). 새 DB 함수는 고정 문구 + `db.*` 이름표(AGENTS.md).
- 홈페이지 `site*.ts` 오류(약 70곳)는 홈페이지 세션 몫.
