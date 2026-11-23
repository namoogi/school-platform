# Codex로 학교 홈페이지 시안 만들기

학교 선생님이 **자기 구독**의 ChatGPT Codex(Codex CLI·Codex 클라우드)에서 쓰는 안내다. 공통 규칙·API: [README.md](README.md). 동화 그림·PDF 일은 [story-agent.md](story-agent.md).

## 준비 (선생님)
1. `/site` → 설정 → **AI 작업 공간**에서 에이전트 'Codex', 맡길 종류·항목·권한, 기한(7일 권장)을 골라 발급하고 복사한다.
2. 토큰은 환경 변수로만 준다.
   - Codex CLI(Mac 터미널): `export SCHOOL_AGENT_TOKEN=<복사한 값>` 뒤 `codex` 실행
   - Codex 클라우드: 환경의 비밀(secret)에 `SCHOOL_AGENT_TOKEN`을 넣고, 인터넷 허용 목록에 `onschools.vercel.app`을 넣는다.
3. 이 저장소(namoogi/school-platform)를 작업 폴더로 쓰면 `scripts/agent-story-upload.mjs`를 바로 쓸 수 있다.

## 첫 지시 예
```
학교 홈페이지 시안 작업이다. AGENTS.md 의 '외부 에이전트' 줄과 docs/agents/README.md, docs/agents/codex.md 를 먼저 읽어라.
토큰은 환경 변수 SCHOOL_AGENT_TOKEN 에 있다. 값을 출력·커밋하지 마라.
할 일: <예: 성품 동화 'after-the-rain'의 캐릭터 3명을 투명 배경 PNG(1024px)로 그리고, 웹용 PDF(4MB 이하)를 만들어
docs/agents/story-agent.md 의 manifest 형식으로 out/after-the-rain 에 두고, --dry-run 뒤 업로드하라>
저장한 판 번호를 알려라. 공개는 내가 한다.
```

## 참고
- Codex가 만든 그림·PDF는 저장소에 커밋하지 않는다(실제 학교 자료).
- Node가 프록시를 거쳐야 하는 환경이면 `NODE_USE_ENV_PROXY=1`(Node 24) 또는 curl을 쓴다.
