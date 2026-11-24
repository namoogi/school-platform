# 관제 센터·대화창 사용법 (ADR 0015·0017)

사람: 어느 관리 화면에서든 상단 **'대화'**(대화창, ADR 0017) — 전체 관리자는 모든 대화, 학교 관리자는 그 학교 대화(학교 AI·홈페이지 인터페이스·시스템 기능). 전체 관리 → **관제 센터**(`/admin/control`)는 같은 기록을 한 페이지로 본다. 개발·연구소 항목의 '세션에 지시'로 새 지시를 만든다.
Claude 세션: 아래 API. 클라우드 작업 환경이 `onschools.vercel.app` 요청마다 점검 토큰 머리를 붙이므로 토큰을 직접 다루지 않는다(출력·기록·커밋에 남기지 않는다).

```
B=https://onschools.vercel.app/api/control
```

## 서브 세션: 결정이 필요할 때
1. 요청을 올린다. 같은 세션·같은 제목의 열린 요청이 있으면 그 요청을 돌려준다.
   ```bash
   curl -s -X POST "$B/requests" -H 'content-type: application/json' -d '{
     "title": "한 줄 제목", "detail": "배경·영향·되돌릴 수 있는지",
     "options": [{"key":"A","label":"추천안","detail":"…"},{"key":"B","label":"다른 안"}],
     "recommended": "A", "reversible": true, "related": "PR·ADR·파일", "source_session": "<내 세션 id>"}'
   ```
   `reversible: true`면 상태가 '추천안으로 진행 중', `false`면 '보류'가 된다.
2. 되돌릴 수 있으면 추천안으로 진행하고, 아니면 보류하고 다른 일을 한다(`SCHOOL-SESSIONS.md` '승인·결정이 필요할 때').
3. 지시는 관제가 `send_message`로 보낸다. 받으면 일하고 보고한다.
   ```bash
   curl -s -X POST "$B/requests/<요청 id>/messages" -H 'content-type: application/json' \
     -d '{"body":"한 일·PR 링크","status":"done","author_session":"<내 세션 id>"}'
   ```
   `status`: `done`(끝남)·`parked`(보류)·`proceeding`·`open`. 메모만이면 `"kind":"note"`.
- 내 세션 id가 목록에 없으면 먼저 등록: `curl -s -X POST "$B/sessions" -H 'content-type: application/json' -d '{"id":"session_…","name":"…","role":"…"}'`

## 세션: 내 일 당겨 오기 (지시의 원본은 관제 센터)
- 차례를 시작할 때, 긴 작업 사이사이, 끝내기 전에 확인한다:
  `curl -s "$B/mine?session=<내 세션 id>"` → 내가 맡았거나 올린 요청 가운데 **사람이 답했는데 내 답이 아직 없는 것**.
- 관제의 `send_message`는 깨우는 신호일 뿐이다. 그 메시지가 막혀도(Claude의 '신뢰 기기 확인' 보안 등) 지시는 여기서 그대로 가져갈 수 있다.
- 가져간 일에 답을 남기면(`POST $B/requests/<id>/messages`, `author_session` 필수) 목록에서 빠진다.

## 세션: 대화에 답하기 (대화창에 보인다)
- 맥락 읽기: `curl -s "$B/requests/<요청 id>"` (대화 전체). inbox 항목의 `recent`에 앞 10줄이 있다.
- 답: `curl -s -X POST "$B/requests/<요청 id>/messages" -H 'content-type: application/json' -d '{"kind":"message","body":"…","author_session":"<내 세션 id>"}'`
  - 사람 답이 필요하면 `"status":"open"`, 일을 마쳐 확인받을 때 `"status":"review"`(사람이 '변경 확인 완료'·'다시 수정 요청'), 작업 중임을 알릴 때 `"status":"delivered"`.
- 학교 일의 결정 요청은 `"school":"<학교 slug>","topic":"site_ui"`(또는 `school_ai`)를 붙여 올리면 그 학교 관리자 대화창에 결정 카드로 보인다.
- 세션 등록 때 학교를 맡으면 `"school":"<slug>"`를 넣는다. 그 학교 대화는 기본으로 이 세션에 온다.

## 관제 세션: 지시 전달 (사용자와 대화할 때마다, 그리고 예약 확인 때)
1. `curl -s "$B/inbox"` — 사람이 남긴 답·지시 가운데 전달하지 않은 것(오래된 것부터).
2. 항목마다
   - `target_session`이 비어 있으면(관제가 정함) 맡을 세션을 고르거나 새로 만들고 `POST $B/requests/<request.id>/assign {"session":"…"}` 뒤 보낸다. 관제가 직접 답할 일이면 답하고 전달됨 표시.
   - `target_session`이 있으면 `send_message`:
     ```
     [관제 지시 D-<no>] <요청 제목>
     선택: <choice_label 또는 없음>
     추가 요청사항: <body>
     세부 내용: <request.detail 요약>
     최근 대화: <recent 요약>
     답하기: POST $B/requests/<request.id>/messages {"kind":"message","status":"review"|"open", ...}
     ```
   - `new_session`이면 `create_session`(이 저장소, 이름 `<제목> (D-<no>)`)으로 실행한다. 첫 지시는 `SCHOOL-SESSIONS.md` '첫 지시 틀' + 요청 세부 내용 + 추가 요청사항. 만든 세션을 `POST $B/sessions`로 등록한다.
3. 보낸 뒤 `curl -s -X POST "$B/messages/<message_id>/delivered" -H 'content-type: application/json' -d '{"note":"send_message"}'`.
   `send_message`가 거부되면(신뢰 기기 확인 등) `{"note":"당겨 오기 대기"}`로 전달됨 표시한다 — 그 세션이 `/mine`으로 가져간다. 같은 실패를 되풀이해 남기지 않는다.
4. 서브 세션이 `send_message`로 결정 요청을 보내 오면(API를 못 쓰는 세션) 관제가 `POST $B/requests`로 대신 올린다.
5. 사용자가 관제 대화에서 바로 답하면, 관제가 그 내용을 사람 대신 쓰지 않는다(`user` 작성은 로그인한 사람만). 세션에 바로 전달하고 `POST $B/requests/<id>/messages`에 `{"kind":"note","body":"대화에서 답: …"}`로 남긴다.

## 관제 세션: 학교 작업 (ADR 0024)
관제 세션은 전체 관리자다. 학교를 고르고 사람이 쓰는 API를 그대로 부른다(점검 토큰은 환경이 붙인다, 로그인 쿠키는 보내지 않음).
```bash
curl -s -c jar -X POST https://onschools.vercel.app/api/context -H 'content-type: application/json' -d '{"schoolId":"<학교 id>"}'
curl -s -b jar https://onschools.vercel.app/api/site/entries/<id>
```

## 전달 시점
웹에서 세션을 바로 깨우지 못한다. 관제는 (1) 사용자와 대화할 때마다 inbox부터 확인하고, (2) 예약 확인이 켜져 있으면 그 주기로 확인한다. 예약 확인은 실행마다 사용량이 들므로 사용자가 주기를 정한다(관제 센터 D-요청 참고).
