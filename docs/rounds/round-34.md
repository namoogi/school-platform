# 34차: 외부 작업 토큰(성품 동화 전용) + 동화 PDF 내려받기 (ADR 0012)

## 사용자 지시 (2026-11-23)
"룽아룬숙사 홈페이지에서 동화 페이지에 한해서만 Codex로 작업 세션을 주고, Codex에서 동화 PDF 생성 및 캐릭터 PNG 제작한 것을 동화 페이지에 업데이트한다."
- 관제 세션이 정한 통로: 학교 관리자가 발급하는 범위 제한 작업 토큰(이 학교 성품 동화만, 시안만, 기한·폐기·사용 기록). 이미지 도구는 구독 중인 ChatGPT Codex.

## 한 일
- **ADR 0012** 외부 작업 토큰: 안 비교(에이전트 계정+RLS / 명령 함수 / 현행) → 명령 함수 방식 채택.
- **마이그레이션 `20261123001200_agent_tokens.sql`**
  - 역할 `agent_request`(요청, 표 권한 없음) · `agent_writer`(함수 소유, BYPASSRLS 없음, RLS 적용).
  - 표 `agent_tokens`(sha256만, 7·30·90일, 폐기, 마지막 사용, 지우기 금지) · `agent_token_uses`(추가만).
  - `agent` 스키마 함수 6개: whoami · stories · story · assets · upload_asset · save_story. 공개·설정·쪽·소식·새 항목·다른 학교는 함수가 없다.
  - 발급·폐기 `app.create_agent_token`·`app.revoke_agent_token`(학교 관리자, 성품 동화 기능, 운영 기록).
  - `site_assets`에 PDF 허용(4MB, `%PDF-` 머리를 DB 제약으로).
- **앱**
  - `asAgent()`(db.ts), `/api/agent/*`(머리 `x-agent-token`, 쿠키와 섞이면 400), `/api/site/agent-tokens`(관리자).
  - `/site` 설정 칸 '외부 작업 토큰' 패널: 발급(원문 한 번만), 맡길 동화 고르기, 상태·마지막 사용·한 일 수, 폐기.
  - PDF 검사 `src/lib/pdf-check.ts`: 머리·끝·크기, 실행 기능(/JavaScript·/JS·/Launch·/EmbeddedFile·/XFA 등·암호화) 거부, `#xx` 이름 풀기, 압축 객체 묶음 풀어 보기, 그림 스트림은 보지 않음(오탐 방지). 업로드 형식은 파일 앞부분으로 판정.
  - 새 블록 **`download`**(PDF 내려받기): 언어별 이름·설명, 파일 이름·크기는 저장 때 서버가 채워 판 스냅샷에 남김. 공개 화면·미리보기는 PDF를 `attachment` + CSP sandbox로만 준다. 편집기의 동화 블록에 '잡지형 구역'·'PDF 내려받기'를 더했다.
- **Codex용**: `docs/agents/story-agent.md`(할 일·하지 말 일·규격·API·curl), `scripts/agent-story-upload.mjs`(폴더+manifest → 업로드 → 등장인물 카드 구역 + 내려받기 블록을 덧붙인 새 판). AGENTS.md에 '외부 에이전트' 한 줄.

## 다른 세션과 겹치는 파일
- `site-shared.ts`(Block에 `download` 추가), `site.ts`(검사·`fillDownloads`·업로드 검사), `SiteRenderer.tsx`(download 그리기), `SiteClient.tsx`(편집 칸·AssetPick의 PDF 모드). 블록 종류를 더했으니 실시간 편집 세션도 `download`를 알아야 한다.

## 검증
- `npm run test:unit` (pdf-check 5 새로), `npm test` 17파일 133개 통과(round34 7 새로), `npm run build`, `npm run test:e2e` 24/24(34차 단계 + axe serious 0건), `npm run check:repo`, `tsc`.
- 확인하지 못한 것: 운영 Supabase에 마이그레이션 적용(배포 빌드가 적용) 뒤 실제 토큰 발급·Codex 업로드는 선생님이 한다. 실제 16쪽 PDF의 크기(4MB 안에 드는지)는 Codex 결과물로 확인해야 한다.

## 선생님이 할 일
1. 운영 `/site` → 설정 → '외부 작업 토큰' → 맡길 동화 고르고 기한(7일 권장) → 발급 → 복사(한 번만 보임).
2. Codex CLI(Mac): `export SCHOOL_AGENT_TOKEN=<복사한 값>` 뒤 Codex에게 `docs/agents/story-agent.md`대로 캐릭터 PNG·웹용 PDF를 만들고 `node scripts/agent-story-upload.mjs <폴더> --dry-run` → 실제 실행을 시킨다. Codex 클라우드면 그 환경 인터넷 허용에 onschools.vercel.app.
3. `/site` → 성품 동화 → 시안 미리보기 확인 → '최신 판 공개'.
4. 끝나면 토큰 폐기.
