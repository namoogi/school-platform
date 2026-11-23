# 관제 센터 사용법 (ADR 0015)

사람: 전체 관리 → **관제 센터**(`/admin/control`). 세부 내용을 보고 선택지를 고르거나 추가 요청사항을 적어 '지시 보내기'. 개발·연구소 항목의 '세션에 지시'로 새 지시를 만든다.
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

## 관제 세션: 지시 전달 (사용자와 대화할 때마다, 그리고 예약 확인 때)
1. `curl -s "$B/inbox"` — 사람이 남긴 답·지시 가운데 전달하지 않은 것(오래된 것부터).
2. 항목마다
   - `target_session`이 있으면 `send_message`:
     ```
     [관제 지시 D-<no>] <요청 제목>
     선택: <choice_label 또는 없음>
     추가 요청사항: <body>
     세부 내용: <request.detail 요약>
     끝나면 보고: POST $B/requests/<request.id>/messages {"status":"done", ...}
     ```
   - `new_session`이면 `create_session`(이 저장소, 이름 `<제목> (D-<no>)`)으로 실행한다. 첫 지시는 `SCHOOL-SESSIONS.md` '첫 지시 틀' + 요청 세부 내용 + 추가 요청사항. 만든 세션을 `POST $B/sessions`로 등록한다.
3. 보낸 뒤 `curl -s -X POST "$B/messages/<message_id>/delivered" -H 'content-type: application/json' -d '{"note":"send_message"}'`.
4. 서브 세션이 `send_message`로 결정 요청을 보내 오면(API를 못 쓰는 세션) 관제가 `POST $B/requests`로 대신 올린다.
5. 사용자가 관제 대화에서 바로 답하면, 관제가 그 내용을 사람 대신 쓰지 않는다(`user` 작성은 로그인한 사람만). 세션에 바로 전달하고 `POST $B/requests/<id>/messages`에 `{"kind":"note","body":"대화에서 답: …"}`로 남긴다.

## 전달 시점
웹에서 세션을 바로 깨우지 못한다. 관제는 (1) 사용자와 대화할 때마다 inbox부터 확인하고, (2) 예약 확인이 켜져 있으면 그 주기로 확인한다. 예약 확인은 실행마다 사용량이 들므로 사용자가 주기를 정한다(관제 센터 D-요청 참고).
