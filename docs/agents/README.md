# 학교 AI 작업 공간: 외부 에이전트 공통 안내

학교 관리자가 `/site` → 설정 → **AI 작업 공간**에서 발급한 토큰으로, 학교가 쓰는 에이전트(Claude Code·Codex 등)가 홈페이지 내용의 **시안**을 만든다.
설계: [ADR 0012](../decisions/0012-agent-work-token.md)(토큰·명령 함수), [ADR 0013](../decisions/0013-school-ai-workspace.md)(학교별 AI 작업 공간·병행 규칙), [ADR 0014](../decisions/0014-agent-token-crud.md)(만들기·고치기·보관, 기한).

- 시작 안내: [Claude Code](claude-code.md) · [Codex](codex.md)
- 일 하나의 예: [성품 동화에 캐릭터 그림·PDF 붙이기](story-agent.md)

## 토큰 범위
| 범위 | 값 |
| --- | --- |
| 항목 종류 | `story`(성품 동화) · `page`(쪽) · `news`(소식) 가운데 발급 때 고른 것 |
| 주소 | 발급 때 고른 항목(key)만. 고르지 않았으면 고른 종류 모두 |
| 권한 | `read`(읽기) · `upload`(그림·PDF 올리기) · `create`(새 항목 + 첫 판) · `edit`(새 판: 내용·구조, 항목 정보·순서) · `archive`(보관) · `publish`(공개·공개 내림) 가운데 고른 것 |
| 기한 | 7·30·90·365일 또는 무기한. 학교 관리자가 연장하거나 폐기한다(폐기하면 바로 멈춤) |

어떤 토큰으로도 할 수 없는 일(서버가 거부): **되살리기**, 홈페이지 설정, 구성원, 다른 학교. 공개 중인 항목은 보관할 수 없다. 공개·공개 내림은 `publish` 권한이 있는 토큰만 한다.

## 지킬 것
- 토큰은 환경 변수 `SCHOOL_AGENT_TOKEN`으로만 쓴다. 출력·로그·커밋·채팅·문서에 남기지 않는다.
- 실제 학생 이름·사진을 지어내거나 넣지 않는다. 사실(날짜·연락처·수치)은 지어내지 않고, 모르면 비워 두고 사람에게 묻는다. 학생이 나오는 실제 사진은 학생·보호자 공개 허가를 받은 것만 쓴다(확인은 학교 관리자 책임, 관제 D-4).
- 새 판은 최신 판을 읽고, 그 위에 고친다. 저장할 때 읽은 판 번호(`base_version`)를 보낸다. 그 사이 사람이나 다른 에이전트가 새 판을 만들었으면 **409** → 다시 읽어 고친다. 남의 판을 덮어쓰지 않는다.
- 끝나면 사람에게 "무엇을 몇 판으로 저장했는지"를 알린다.
- **공개는 사람이 공개를 지시했을 때만 한다**(`publish` 권한). 만들거나 고쳤다고 스스로 공개하지 않는다. 공개 전에 무엇을(어느 항목 몇 판) 공개하는지 사람에게 보여 주고, 공개한 뒤 공개 주소를 알린다. 지시가 없으면 학교 관리자가 `/site`에서 시안을 보고 공개한다.

## API
기본 주소 `https://onschools.vercel.app`. 모든 요청에 머리 `x-agent-token: $SCHOOL_AGENT_TOKEN`. 로그인 쿠키는 보내지 않는다.

| 요청 | 권한 | 하는 일 |
| --- | --- | --- |
| `GET /api/agent/me` | — | 학교·종류·주소·권한·기한 |
| `GET /api/agent/entries/<kind>` | read | 범위 안 항목 목록(최신 판·공개 판 번호) |
| `GET /api/agent/entries/<kind>/<key>` | read | 최신 판 `latest.version`, `latest.content` |
| `POST /api/agent/entries/<kind>` | create | 새 항목 `{ key, content, meta?, note? }` → `{ key, version: 1, published: false }`. 같은 주소가 있으면(보관함 포함) 409 |
| `POST /api/agent/entries/<kind>/<key>/versions` | edit | 새 판 = 전체 내용(구조 포함) `{ content, note, base_version }` → `{ version, published: false }` |
| `POST /api/agent/entries/<kind>/<key>/edit` | edit | 구조 연산 `{ ops, base_version, note? }`. 아래 '구조 바꾸기' |
| `PATCH /api/agent/entries/<kind>/<key>` | edit | 항목 정보·순서 `{ meta: { virtue, character, text_in_image }, sort }`(동화만 meta, 허용한 칸만) |
| `POST /api/agent/entries/<kind>/<key>/publish` | publish | 바로 공개 `{ version? }`(비우면 최신 판). **사람이 공개를 지시했을 때만** 부른다 |
| `POST /api/agent/entries/<kind>/<key>/unpublish` | publish | 공개 내림 |
| `POST /api/agent/entries/<kind>/<key>/archive` | archive | 보관(소프트 삭제). 공개 중이면 409 → 사람에게 공개 내림을 부탁 |
| `GET /api/agent/assets` | read 또는 upload | 이 학교 그림·PDF(id, name, mime, size_bytes, sha256) |
| `POST /api/agent/assets?name=<파일 이름>` | upload | 본문에 파일 그대로, `Content-Type`에 형식 → `{ id, reused }` |

- 34차 동화 경로 `/api/agent/stories…`도 그대로 쓸 수 있다(`entries/story…`와 같음).
- 파일: PNG·JPG·WEBP 그림 5MB, PDF 4MB(웹용으로 줄인 것). 자바스크립트·첨부 파일·양식·암호가 든 PDF는 거부된다.
- 내용(`content`)은 `{ title, summary?, cover?, blocks[] }`. 블록 종류: heading·text·notice·image·gallery·section·news_list·video·story_page·download. 내용이 가리키는 그림·파일은 모두 그 학교에 올린 것이어야 한다. 모양은 최신 판에서 그대로 본뜬다.

```bash
H="x-agent-token: $SCHOOL_AGENT_TOKEN"; S=https://onschools.vercel.app
curl -s -H "$H" $S/api/agent/me
curl -s -H "$H" $S/api/agent/entries/page/admissions > latest.json
# latest.json 의 latest.content 를 고쳐 new.json 에 { "content": …, "note": "…", "base_version": <latest.version> }
curl -s -H "$H" -H 'content-type: application/json' -d @new.json $S/api/agent/entries/page/admissions/versions
```

## 구조 바꾸기
화면 편집과 같은 연산을 최신 판에 차례로 적용한다(`src/lib/site-edit.ts`). 블록 번호는 0부터.

| 연산 | 모양 |
| --- | --- |
| 옮기기 | `{ "op": "move", "from": 2, "to": 0 }` |
| 끼우기 | `{ "op": "insert", "at": 1, "block": { "type": "section", "template": "cards", … } }` |
| 빼기 | `{ "op": "remove", "index": 3 }` |
| 숨기기·보이기 | `{ "op": "hide", "index": 1 }` (판에 남고 방문자에게만 안 보임) |
| 값 바꾸기 | `{ "op": "set", "path": ["blocks", 0, "template"], "value": "quote" }`, `{ "op": "set", "path": ["head"], "value": { "layout": "editorial" } }` |

1. `GET …/<kind>/<key>`로 최신 판(`latest.version`, `latest.content.blocks`)을 읽는다.
2. 블록 배열을 보고 연산을 만든다. 많이 바꾸면 전체 내용을 고쳐 `…/versions`로 보내도 된다.
3. `base_version`(읽은 판)과 함께 저장한다. 결과는 사람 편집과 같은 검사를 거친다.
4. **409**면 그 사이 누가 새 판을 만든 것이다. 다시 읽고, 바뀐 점을 살려 연산을 다시 만든다. 덮어쓰지 않는다.

## 오류
| 상태 | 뜻 · 할 일 |
| --- | --- |
| 401 | 토큰이 없거나 틀림·기한 지남·폐기 → 사람에게 새 토큰 요청 |
| 403 | 범위 밖(종류·주소) 또는 권한 없음 → 범위를 넓히지 말고 사람에게 알림 |
| 404 | 그 항목이 없거나 범위 밖 |
| 400 | 파일 형식·크기·PDF 내용·블록 형식 → 메시지대로 고침 |
| 409 | 그 사이 새 판이 생김 → 다시 읽어 고친 뒤 저장 |
| 413 | 파일이 너무 큼 |
