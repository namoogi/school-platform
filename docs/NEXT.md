# 다음 세션 인계 (2026-11-23, 31차 끝)

새 Claude 세션은 이 파일 → `AGENTS.md` → `docs/rounds/round-27~31.md` → ADR 0006~0010 순서로 읽고 시작한다.
(사람이 연 세션의 시작 절차: `.claude/skills/session-start`)

## 지금 상태 (운영 onschools.vercel.app 기준)
- 학교 화면: 학사 업무형(ADR 0006). 전체 관리: 분석 대시보드형 다크 + 화이트 반전(ADR 0007). 사용자별 화면 선택은 DB에 저장된다.
- 학교 홈페이지·성품 동화 모듈(ADR 0008): `/site` 관리, `/s/<주소>` 공개.
- 룽아룬숙사: 운영 DB에 학교가 있다(`rungarunsuksa`, 태국어, 시범). 31차로 새벽빛 테마·가져오기·옛 주소 호환이 있다. 내용은 선생님이 묶음을 올리기 전까지 0, 홈페이지 닫힘.
- Claude 점검 접근(ADR 0010)
  - 작업 환경(Default)의 Network secret `onschools.vercel.app`(머리 `x-inspector-token`)이 들어 있다.
  - 클라우드 세션은 로그인 없이 운영 화면을 읽기 전용으로 볼 수 있다.
  - 확인: `curl https://onschools.vercel.app/admin`이 200이고 화면에 'Claude 점검(읽기 전용)'이 보이면 된다.
  - Playwright는 `chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } })`로 띄운다.

## 이어서 할 일 (순서대로)
1. **룽아룬숙사 이전 마무리** (31차 기능 배포 뒤, 선생님 손이 필요한 일)
   - 선생님: 운영 `/site` 설정 칸의 '기존 홈페이지 가져오기'에 묶음 zip(`friends/pages.json` 포함판)을 올린다 → 시안 확인 → '가져온 시안 모두 공개' → '홈페이지 열기'.
   - 그다음 Claude: 룽아룬숙사 세션(`session_013RZyUqmXotCXgQK1a22bDW`)에 넘겨주기 배포를 요청한다. `vercel.json` redirects `/:path*` → `https://onschools.vercel.app/s/rungarunsuksa/:path*`(처음 307, 확인 뒤 308). 플랫폼 호환 경로가 /about·/friends/** 를 받는다.
   - 그 세션은 답장 도구가 없다. 파일을 대화 기록에 조각으로 출력하게 하고 `list_events`로 읽는다(31차 방식).
2. **성품 동화** 「비가 지워도 남는 것」: 가져오기로 시안이 생긴다. 선생님 결정 대기: 성품 이름, 영상 위치(YouTube 일부 공개 또는 Drive), 드리미학교 학생 작품 3편과 #1185 공개 여부.

## 함께 도는 것
- 매시간 자동 개발 세션: `session_013RZyUomAv7AE6YjhpHp6Kc`. 예약 작업이 37분마다 깨운다. PR까지만 하고 병합하지 않는다.
- 자동 PR #13·#18·#24는 2026-11-23 병합(ADR 0004 단계 1 운영 DB 적용 확인). ADR 0009(세션 연결)는 '제안' 상태로 선생님 결정 대기.

## 작업 규칙 요약
- 사용자 지시는 그 자체로 승인이다. 구현 → 테스트 → 병합 → 운영 배포 확인(점검 토큰으로 직접)까지 끝낸다.
- 답은 한국어로 한다. 범위가 갈릴 때만 선택지를 묻는다.
