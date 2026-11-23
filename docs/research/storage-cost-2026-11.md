# 파일 저장소 비용 비교와 연동 계획 (2026-11-23)

- 요청(사용자): "사이트 시안을 만들어 보니 저장소 공간 비용이 많이 들 것 같다. Supabase만으로 구성하면 비용이 클 듯하니 Cloudflare 등과 비교하고, 저장소 연동 계획을 연구소에 올려 두자."
- 상태: 연구(결정 전). 결정은 관제 센터 결정 요청과 이후 ADR로 한다.
- 표기: **사실**(출처 있음) / **추정**(계산·가정) / **확인 필요**를 구분한다. 가격은 2026-11 웹 검색 결과이고 공식 페이지에서 다시 확인해야 한다.

## 1. 지금 구조 (코드에서 확인한 사실)
- 학교 홈페이지 그림·PDF(`site_assets.bytes`)와 학사 원본 파일(`source_files.original`)을 **Postgres 표의 `bytea` 열**에 넣는다. Supabase Storage(객체 저장소)도 쓰지 않는다.
- 공개 그림은 Vercel 함수가 DB에서 읽어 내보낸다(`app.public_asset`). 방문자가 그림을 볼 때마다 **DB 읽기 + Supabase egress + Vercel 함수 실행·전송**이 함께 든다.
- 크기 제한: PDF 4MB, 원본 파일 2MB(앱 검사). 그림 줄이기(리사이즈·WebP 변환)는 하지 않는다.
- 그래서 비용 문제는 "Supabase냐 Cloudflare냐"보다 **파일을 DB에 넣는 방식**이 먼저다. DB 디스크는 객체 저장소보다 GB당 5~8배 비싸고(아래 표), 백업·복원도 함께 무거워진다.

## 2. 가격 비교 (사실, 출처는 끝에)
| 항목 | Supabase (Pro $25/월) | Cloudflare R2 | Backblaze B2 | Vercel Blob (Pro) |
| --- | --- | --- | --- | --- |
| 무료·포함분 | DB 8GB, 파일 100GB, egress 250GB(+캐시 250GB) | 저장 10GB-월, 쓰기 100만·읽기 1,000만 회/월 | (내려받기 = 평균 저장량의 3배까지 무료) | Hobby: 저장 1GB, 전송 10GB |
| 저장 GB당/월 | DB 디스크 $0.125 · 파일 약 $0.021 | $0.015 (드문 접근 $0.01) | 약 $0.0070 ($6.95/TB) | $0.023 |
| 내보내기(egress) | 초과 $0.09/GB(캐시 $0.03) | **무료** | 3배 초과분 $0.01/GB, Cloudflare 경유 무료 | $0.05/GB부터 |
| 요청 단가 | — | 쓰기 $4.50/백만, 읽기 $0.36/백만 | 일부 유료 | 단순 $0.40/백만, 고급 $5/백만 |
| S3 호환 API | 있음 | 있음 | 있음 | 없음(자체 SDK) |
| 결제처 | 지금과 같음 | **새 결제처**(Cloudflare) | 새 결제처 | 지금과 같음(Vercel) |

- Supabase 무료 요금제: DB 500MB, 파일 1GB, egress 5GB(사실). **지금 이 프로젝트가 무료인지 Pro인지는 확인 필요**(점검 화면으로는 안 보임).
- Vercel 전송: Hobby 100GB 포함, Pro 1TB 포함 후 $0.15/GB부터(공식 페이지끼리 표기가 엇갈림, 확인 필요).

## 3. 대략 계산 (추정)
가정: 학교 1곳 = 그림·PDF 2GB, 한 달 방문자 내려받기 20GB. 그림 최적화를 하지 않은 지금 크기 기준.

| 학교 수 | 저장 | 내려받기/월 | Supabase 파일 저장(Pro 안) | Supabase DB에 둠(지금 방식, Pro) | Cloudflare R2 |
| --- | --- | --- | --- | --- | --- |
| 5곳 | 10GB | 100GB | 포함분 안 → 추가 $0 | DB 8GB 초과 2GB ≈ $0.25 + 함수·전송 | 무료 범위 ≈ $0 |
| 20곳 | 40GB | 400GB | egress 초과 150GB ≈ $13.5 | DB 32GB 초과 ≈ $4 + egress ≈ $13.5 + Vercel 전송 | 저장 30GB ≈ $0.45 + 요청 소액 |
| 100곳 | 200GB | 2TB | 저장 초과 ≈ $2 + egress 초과 ≈ $157 | DB 디스크 ≈ $24 + egress ≈ $157 + Vercel 전송 초과 | 저장 ≈ $2.85 + 요청 ≈ $1 |

- 학교가 늘수록 **내려받기(egress)** 비용이 저장보다 커진다. R2는 내려받기가 무료라 이 부분이 0이다.
- 지금 방식은 그림을 Vercel 함수가 내보내므로 Vercel 전송·함수 실행도 함께 든다(정밀 계산은 실제 사용량 측정 뒤).
- 실제 사용량(학교별 파일 수·크기, 월 내려받기)은 **아직 재지 않았다**. 1단계에서 잰다.

## 4. 연동 계획 (추천 순서)
0. **그림 줄이기 (어느 저장소든 먼저, 무료)** — 올릴 때 긴 변 1600px·WebP로 바꾸고 원본은 따로 두지 않거나 선택 보관. 사진 크기가 보통 1/3~1/10로 줄어든다(추정). 저장·전송이 함께 준다.
1. **사용량 재기** — 학교별·종류별 파일 수·합계 크기를 관제 화면에 보이기. 내려받기 횟수는 공개 그림 경로에서 대략 센다.
2. **저장소 어댑터 (ADR)** — `storage.put/get/url/delete` 한 겹을 두고 S3 호환 API로 구현. 메타데이터(학교·이름·크기·sha256·공개 여부)는 지금처럼 DB(RLS·school_id 유지), **바이트만 객체 저장소**로. 키는 `school/<school_id>/<sha256>`(같은 파일 중복 저장 안 함). 판 보존 원칙(발행본은 그때 자산을 가리킴) 유지 — 객체는 지우지 않고 '보관'만.
3. **공개 그림은 저장소에서 바로** — 공개된 판이 가리키는 자산만 공개 주소(CDN)로, 시안·원본 학사 파일은 서명된 짧은 주소(만료 있음)로. Vercel 함수가 바이트를 나르지 않게 한다.
4. **옮기기** — 새 파일부터 객체 저장소에 쓰고, 기존 `bytea`는 배치로 옮긴 뒤 열을 비운다(되돌릴 수 있게 sha256 대조, 옮긴 뒤 한동안 둘 다 유지).
5. **비용 경보** — 학교별 사용량 상한·경고(관제 센터 결정 요청으로).

## 5. 저장소 고르기 (결정 필요, 관제 센터에 올림)
| 안 | 장점 | 단점 |
| --- | --- | --- |
| **A. Cloudflare R2 (추천)** | 내려받기 무료, 10GB 무료, GB당 가장 싼 축, S3 호환, 학교 사이트 CDN과 잘 맞음 | **결제처가 하나 늘어남**(사용자 선호: 벤더 단일화). 계정·카드 등록 필요(확인 필요) |
| B. Supabase Storage | 결제처 그대로, RLS·로그인과 한곳, Pro면 100GB 포함 | 내려받기 초과 $0.09/GB가 학교가 늘면 커짐 |
| C. 단계적: B로 시작 → 내려받기 많아지면 A | 지금 새 결제처 없음, 어댑터 덕분에 나중에 바꾸기 쉬움 | 옮기기를 두 번 할 수 있음 |
| D. Backblaze B2 + Cloudflare | 저장 가장 쌈 | 결제처 둘, 설정 복잡 |

- 공통: 어느 안이든 0·1·2단계(그림 줄이기·사용량·어댑터)는 같다. 그래서 **0~2단계를 먼저 하고, 저장소 선택은 사용량을 본 뒤 정해도 늦지 않다.**
- 비용 정직성: 지금 학교 수(2~3곳)와 크기면 어느 안이든 월 몇 달러 이하로 추정된다. 비용이 커지는 시점은 학교 수십 곳 + 사진 많은 공개 사이트일 때다.

## 출처
- Supabase egress: https://supabase.com/docs/guides/platform/manage-your-usage/egress
- Supabase 요금(무료·Pro): https://supabase.com/pricing , https://supabase.com/docs/guides/platform/billing-on-supabase , https://supabase.com/docs/guides/storage/serving/bandwidth
- Supabase 파일·DB 초과 단가(2차 자료): https://makerkit.dev/blog/saas/supabase-pricing , https://getcostiq.com/pricing/supabase-storage/
- Cloudflare R2: https://developers.cloudflare.com/r2/pricing
- Backblaze B2: https://www.backblaze.com/cloud-storage/pricing , https://www.cloudflare.com/en-ca/partners/technology-partners/backblaze/
- Vercel: https://vercel.com/pricing , https://vercel.com/docs/vercel-blob/usage-and-pricing
