# Cloudflare R2 연결 (ADR 0018)

학교 홈페이지 그림·PDF를 DB 대신 Cloudflare R2(비공개 버킷)에 저장한다. 키·비밀값은 **Vercel 환경 변수에만** 넣고, 채팅·코드·문서에 붙여넣지 않는다.

## 1. 버킷 만들기 (Cloudflare 대시보드)
1. Cloudflare 대시보드 → **R2 Object Storage** → **Create bucket**
2. 이름: `onschools-assets` (다른 이름이면 아래 R2_BUCKET 에 그 이름)
3. 위치: Automatic(또는 Location hint: Asia-Pacific), 저장 등급: **Standard** (Infrequent Access는 무료분이 없음)
4. **공개 접근(Public access·r2.dev·Custom domain)은 켜지 않는다.** 앱이 공개 여부를 판단한 뒤 10분짜리 서명 주소로만 내준다.
5. CORS 설정은 필요 없다(브라우저가 R2에 직접 올리지 않음).

## 2. API 토큰 만들기
1. R2 Object Storage 개요 → **Manage R2 API Tokens**(API 토큰 관리) → **Create API token**
2. 권한: **Object Read & Write**
3. 적용 범위: **Apply to specific buckets only** → `onschools-assets`
4. 기한(TTL): 원하는 대로(무기한이면 폐기 전까지 유효)
5. 만들면 **Access Key ID**와 **Secret Access Key**가 한 번만 보인다 → 바로 3단계에 넣는다.
6. **Account ID**는 R2 개요 화면 오른쪽(또는 S3 주소 `https://<Account ID>.r2.cloudflarestorage.com`의 앞부분)에 있다.

## 3. Vercel 환경 변수
Vercel → 프로젝트(school-platform) → Settings → **Environment Variables** → 아래 네 개를 **Production**(권장: Preview도)에 추가. 비밀값은 Sensitive로.

| 이름 | 값 |
| --- | --- |
| `R2_ACCOUNT_ID` | Account ID |
| `R2_ACCESS_KEY_ID` | Access Key ID |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key |
| `R2_BUCKET` | `onschools-assets` |

환경 변수는 **다음 배포부터** 적용된다.

## 4. 확인과 옮기기
1. 배포 뒤 전체 관리 → **사용량·저장소** → 'R2' 칸이 '설정됨 · onschools-assets'
2. **연결 확인** → "연결됨 · 버킷 … 에 쓰고 읽었습니다." (버킷에 `health/check.txt` 하나가 생김)
3. **DB 파일을 R2로 복사** — 25개씩, 남은 개수가 0이 될 때까지. DB 사본은 남긴다.
4. (선택) **DB 사본 비우기** — 복사가 끝나면 단추가 보인다. R2 내용의 sha256이 같은 것만 비운다. 되돌릴 수 없으므로 공개 홈페이지 그림이 R2에서 열리는지 먼저 확인한다(ADR 0047).
5. 공개 홈페이지에서 그림이 그대로 보이는지 확인. 이제 그림 주소는 R2 서명 주소로 넘어간다(302).

## 안 될 때
- '설정 전'으로 보임: 변수 이름 철자, Production에 넣었는지, 넣은 뒤 다시 배포했는지.
- '연결 확인' 실패(403): 토큰 범위가 그 버킷인지, 권한이 Read & Write인지.
- 키를 바꾸거나 폐기하면 Vercel 값도 바꾸고 다시 배포.
