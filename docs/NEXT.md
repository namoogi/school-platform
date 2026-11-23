# 다음 세션 인계 (2026-11-23, 30차 끝)

새 Claude 세션은 이 파일 → `AGENTS.md` → `docs/rounds/round-27~30.md` → ADR 0006~0010 순서로 읽고 시작한다.
(사람이 연 세션의 시작 절차: `.claude/skills/session-start`)

## 지금 상태 (운영 onschools.vercel.app 기준)
- 학교 화면: 학사 업무형(ADR 0006). 전체 관리: 분석 대시보드형 다크 + 화이트 반전(ADR 0007). 사용자별 화면 선택은 DB에 저장된다.
- 학교 홈페이지·성품 동화 모듈(ADR 0008): `/site` 관리, `/s/<주소>` 공개.
- 룽아룬숙사: 운영 DB에 학교가 있다(`rungarunsuksa`, 태국어, 시범, 홈페이지 닫힘, 내용 0). `ops/schools.json` + `scripts/provision.mjs`.
- Claude 점검 접근(ADR 0010)
  - 작업 환경(Default)의 Network secret `onschools.vercel.app`(머리 `x-inspector-token`)이 들어 있다.
  - 클라우드 세션은 로그인 없이 운영 화면을 읽기 전용으로 볼 수 있다.
  - 확인: `curl https://onschools.vercel.app/admin`이 200이고 화면에 'Claude 점검(읽기 전용)'이 보이면 된다.
  - Playwright는 `chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } })`로 띄운다.

## 이어서 할 일 (순서대로)
1. **룽아룬숙사 이전 2단계: 새벽빛 매거진(dawn) 테마 이식**
   - 필요한 것: Rung Arun Suksa 세션(선생님 컴퓨터, VS Code)의 구조·디자인 정보다. 아직 받지 못했다.
   - 받는 법: `mcp__claude-code-remote__send_message`로 session `session_013RZyUqmXotCXgQK1a22bDW`에 "플랫폼 이전용 정보(묶음 형식·사이트 구조·디자인 토큰과 CSS·언어 처리)를 이 세션으로 보내 달라"고 요청한다.
   - 또는 선생님이 Mac에서 `gh auth login`을 마치면 코드가 GitHub `namoogi/rung-arun-site`(비공개)에 올라온다. 그때 `add_repo`로 붙인다.
2. **이전 3단계: '기존 홈페이지 가져오기'**(`/site`)
   - 묶음 zip(선생님 컴퓨터, 51개 파일 약 64MB)은 브라우저에서 fflate로 풀고, 그림을 한 장씩 `/api/site/assets`로 올린 뒤 시안을 만든다.
   - 서버 요청 한도는 약 4.5MB다. 영상은 올리지 않고 주소로만 연결한다.
3. **성품 동화** 「비가 지워도 남는 것」(MyBook #1313): 코끼리 그림은 고쳐졌다(ready).
   - 쪽 그림 16장·태국어 글·태국어 영상(52MB)이 선생님 컴퓨터 `Desktop/dreamy-books-export/1313-…/`에 있다.
   - 선생님 결정 대기: 성품 이름, 영상 위치(YouTube 일부 공개 또는 Drive), 드리미학교 학생 작품 3편과 #1185 공개 여부.
4. **이전 4b단계:** 공개 확인 뒤 rungarunsuksa.vercel.app → 플랫폼 주소로 전환한다(선생님 확인 후).
5. **작은 수정:** 점검 계정으로 학교에 들어가면 상단에 "접근이 기록됩니다"가 뜨지만 실제로는 토큰 마지막 사용만 남는다. 문구를 고친다.

## 함께 도는 것
- 매시간 자동 개발 세션: `session_013RZyUomAv7AE6YjhpHp6Kc`. 예약 작업이 37분마다 깨운다. PR까지만 하고 병합하지 않는다.
- 열린 자동 PR #13·#18·#24는 선생님이 지시하면 병합한다. #18이 ADR 0009를 쓴다. 30차는 0010을 썼다.

## 작업 규칙 요약
- 사용자 지시는 그 자체로 승인이다. 구현 → 테스트 → 병합 → 운영 배포 확인(점검 토큰으로 직접)까지 끝낸다.
- 답은 한국어로 한다. 범위가 갈릴 때만 선택지를 묻는다.
