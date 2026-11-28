# 학교 AI 작업 공간: 외부 에이전트 공통 안내

학교 관리자가 `/site` → 설정 → **AI 작업 공간**에서 발급한 토큰으로, 학교가 쓰는 에이전트(Claude Code·Codex 등)가 홈페이지 내용의 **시안**을 만든다.
설계: [ADR 0012](../decisions/0012-agent-work-token.md)(토큰·명령 함수), [ADR 0013](../decisions/0013-school-ai-workspace.md)(학교별 AI 작업 공간·병행 규칙), [ADR 0014](../decisions/0014-agent-token-crud.md)(만들기·고치기·보관, 기한).

- 가장 쉬운 시작: `/site` → 설정 → AI 작업 공간에서 발급 → **AI 연결** 글을 내 AI 대화창에 붙여 넣기
- 시작 안내: [Claude Code](claude-code.md) · [Codex](codex.md)
- 반복 작업: [현재 구독으로 콘텐츠 번역·시안 저장](subscription-translation.md)
- 일 하나의 예: [성품 동화에 캐릭터 그림·PDF 붙이기](story-agent.md)
- 일 하나의 예: [옛 홈페이지를 새 디자인으로 옮기는 일 돕기](site-migrate.md)

## 토큰 범위
| 범위 | 값 |
| --- | --- |
| 항목 종류 | `story`(성품 동화) · `page`(쪽) · `news`(소식) · `package`(학사 꾸러미 정의, 61차) 가운데 발급 때 고른 것 |
| 주소 | 발급 때 고른 항목(key)만. 고르지 않았으면 고른 종류 모두. 학사 꾸러미는 학교 단위라 주소가 없다 |
| 권한 | `read`(읽기) · `upload`(그림·PDF 올리기) · `create`(새 항목 + 첫 판) · `edit`(새 판: 내용·구조, 항목 정보·순서) · `archive`(보관) · `publish`(공개·공개 내림) · `autopublish`(자동 공개: 저장하면 바로 공개, `publish`와 함께만) 가운데 고른 것 |
| 기한 | 7·30·90·365일 또는 무기한. 학교 관리자가 연장하거나 폐기한다(폐기하면 바로 멈춤) |

어떤 토큰으로도 할 수 없는 일(서버가 거부): **되살리기**, 홈페이지 설정, 구성원, 다른 학교. 공개 중인 항목은 보관할 수 없다. 공개·공개 내림은 `publish` 권한이 있는 토큰만 한다.

## 지킬 것
- 토큰은 두 길로 받는다(ADR 0022). ① **AI 연결 글**: 학교 관리자가 발급 직후 '연결 글 한 번에 복사'로 지시문과 토큰을 대화창에 붙여 넣는다. 글의 `export SCHOOL_AGENT_TOKEN='…'` 한 줄로 환경 변수에 넣고, 그 뒤로는 `$SCHOOL_AGENT_TOKEN`으로만 쓴다. ② 환경 변수 `SCHOOL_AGENT_TOKEN`(Codex 비밀·셸 export).
- 어느 쪽이든 토큰 값을 다시 출력·로그·커밋·문서·다른 대화에 쓰지 않는다. 대화 기록에 남는 대신 간편한 방식이므로, 학교 관리자는 필요한 범위만·짧은 기한(7일)으로 발급하고 일이 끝나면 폐기한다(폐기하면 바로 멈춤, 활동 기록에 남음).
- **사진 자리는 실제 사진**(2026-11-25 선생님 결정): 표지(`cover`)·구역 사진·카드·사진 줄·갤러리·소식 표지에는 학교에서 찍은 실제 사진만 넣는다. 생성하거나 스케치·수채화처럼 바꾼 그림은 디자인 요소로만 쓴다 — 안내 띠(`section` `template: cta`)의 `asset`(장식 그림, 대체 글 없이 그려짐)과 성품 동화 그림. 실제 사진이 없으면 그림으로 채우지 말고 칸을 비우거나 사람에게 사진을 요청한다.
- 실제 학생 이름·사진을 지어내거나 넣지 않는다. 사실(날짜·연락처·수치)은 지어내지 않고, 모르면 비워 두고 사람에게 묻는다. 학생이 나오는 실제 사진은 학생·보호자 공개 허가를 받은 것만 쓴다(확인은 학교 관리자 책임, 관제 D-4). 사람이 사진 든 판을 공개할 때는 공개 창에서 허가 확인을 거치고 기록이 남는다(122차). 토큰으로 공개할 때는 이 확인이 없으므로, 사람이 확인했다고 말한 사진만 공개한다.
- 새 판은 최신 판을 읽고, 그 위에 고친다. 저장할 때 읽은 판 번호(`base_version`)를 보낸다. 그 사이 사람이나 다른 에이전트가 새 판을 만들었으면 **409** → 다시 읽어 고친다. 남의 판을 덮어쓰지 않는다.
- 끝나면 사람에게 "무엇을 몇 판으로 저장했는지"를 알린다.
- **공개는 사람이 공개를 지시했을 때만 한다**(`publish` 권한). 만들거나 고쳤다고 스스로 공개하지 않는다. 공개 전에 무엇을(어느 항목 몇 판) 공개하는지 사람에게 보여 주고, 공개한 뒤 공개 주소를 알린다. 지시가 없으면 학교 관리자가 `/site`에서 시안을 보고 공개한다.
- **자동 공개 토큰**(`autopublish`, ADR 0021): 학교 관리자가 발급 때 '저장하면 바로 공개'를 정해 둔 토큰이다. 만들기·새 판 저장의 응답이 `published: true`면 이미 방문자에게 보인다. 저장하기 전에 내용·그림·사실을 한 번 더 확인하고, 저장한 뒤 공개 주소와 판 번호를 사람에게 알린다. 잘못 올렸으면 이전 판으로 다시 공개(`publish {version}`)하거나 공개를 내린다.

## 누가·어느 세션이 했는지 남기기 (83차)
- 모든 요청에 머리 두 개를 함께 붙인다. 학교 관리자가 /site 'AI 작업 공간' 목록의 '세션·작업자' 칸에서 본다.
  - `x-agent-session`: 이 작업 세션(대화) 이름. 예: `동화-수정-1`
  - `x-agent-operator`: 작업하는 사람 이름이나 이메일
- 한글·공백은 URL 인코딩(`encodeURIComponent`)해서 보낸다. 서버가 풀고, 제어 문자는 지우며, 길이를 자른다(80·120자).
- `GET /api/agent/me` 응답의 `you`에 받은 값이 그대로 보이면 제대로 간 것이다.
- 이 값은 **에이전트가 스스로 알린 값**이다. 확인된 신원이 아니다. 신원은 토큰으로 가린다.
- 같은 토큰을 여러 세션에서 함께 쓰지 않는다. 세션마다 토큰을 따로 받는다. 특히 자동 공개 토큰은 한 세션에서만 쓴다.
- 스크립트 `scripts/agent-story-upload.mjs`는 환경 변수 `SCHOOL_AGENT_SESSION`·`SCHOOL_AGENT_OPERATOR`가 있으면 이 머리를 붙인다.

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
- 내용(`content`)은 `{ title, summary?, cover?, blocks[], menu? }`. 두 단계 메뉴(ADR 0046): 쪽의 `menu.parent`(다른 쪽 주소 이름 또는 `news`)로 상위 메뉴 아래에 넣고, 블록의 `anchor`(영문 소문자·숫자·하이픈)로 그 구역을 하위 메뉴로 보인다. 공개해야 메뉴에 반영된다. 블록 종류: heading·text·notice·image·gallery·section·news_list·video·story_page·download. 내용이 가리키는 그림·파일은 모두 그 학교에 올린 것이어야 한다. 모양은 최신 판에서 그대로 본뜬다.

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

## 템플릿 빈 칸 채우기 (66차, ADR 0031)
학교 AI가 하는 일의 중심이다(ADR 0032: 무거운 분석은 플랫폼 유료 API가 아니라 학교 구독 AI가 한다).
- 학교 관리자가 준 자료(소개서·안내문)를 읽는다. 학교 관리자가 옛 홈페이지 주소를 주면 **공개된 쪽만** 직접 읽어도 된다(로그인 쪽·개인 게시판은 읽지 않는다).
- 서버의 규칙 기반 제안(`/site/templates/<key>` 화면)은 1차 배치일 뿐이다. 학교 AI는 맥락을 읽고 더 정확하게 채운다.

학교가 템플릿으로 시작한 쪽은 `meta.template`(예: `story@1`)이 있다. 쪽(page)을 다루는 토큰은 `GET /api/agent/templates`로 템플릿마다 빈 칸 목록을 읽는다.
- 빈 칸 목록에 담긴 것: 쪽 주소, 내용 안 경로(`path`, 예: `["blocks", 1, "items"]`), 종류(글·목록·사진·연락처), 안내
- 할 일
  1. 학교 관리자가 준 학교 자료(소개서·안내문)를 읽고, 그 쪽 최신 판의 **안내 자리 `[ … ]`가 남은 칸만** 채운다.
  2. `base_version`과 함께 새 판으로 저장한다(시안).
- 하지 않을 일
  - 자료에 없는 사실(연도·숫자·이름·연락처)은 지어내지 않고 안내 자리를 그대로 둔다.
  - 학교가 이미 쓴 칸은 바꾸지 않는다.
  - 공개는 사람이 한다(`publish` 권한이 있어도 지시가 있을 때만).

## 학사 꾸러미 정의 (61차, ADR 0025 F5)
`package` 종류 토큰은 학교가 원하는 기록(봉사 시간·독서·상담·동아리 등)을 **정의**로 만든다. 표나 코드를 올리지 않는다(에이전트 DDL 없음).

| 요청 | 권한 | 하는 일 |
| --- | --- | --- |
| `GET /api/agent/packages` | read | 정의(최신 판·검사 결과)와 꾸러미(최신 판·켜짐 상태) |
| `POST /api/agent/definitions` `{ kind, code, spec, why, base_version }` | create(새 코드) · edit(새 판) | 정의 새 판. 응답 `{ version, valid, issues }` |
| `POST /api/agent/packages` `{ code, title, members: [{ kind, code, version? }], why, base_version }` | create · edit | 꾸러미 새 판(판을 안 적으면 그 정의의 최신 판). 응답 `{ version, valid, issues, members }` |
| `GET /api/agent/packages/<code>/preview?lang=ko` | read | 합성 자료(예시 학생 1·2·3)로 그린 양식·목록·출력 |

정의 종류와 `spec` 모양:
- `record_type`: `{ title: {ko,en}, subject: person|offering|person_offering, flow?: <flow code>, fields: [{ key, type, label: {ko,en}, privacy, required?, max_length?, options?: [{code,label}] }] }`
  - `type`: text·longtext·number·integer·date·boolean·choice·multi_choice·hours·url
  - `privacy`(칸마다 필수): directory·internal·sensitive·restricted
- `form`: `{ record_type, sections: [{ title?, fields: [key…] }] }` · `view`: `{ record_type, columns: [key… | person | state | recorded_at] }`
- `output`: `{ record_type, blocks: [{type: heading|text, text} | {type: field, key} | {type: fields|table, keys}] }`
- `flow`: `{ states: [{key,label}], initial, final: [key…], transitions: [{ from, to, roles: [admin|teacher|author] }] }`

검사기가 오류로 막는 것:
- **숨은 참조**: 학생·수업은 정해진 열로만 잇는다. `*_id`·`*_email`·`*_name`, `student_…`, `name`·`email` 같은 칸은 둘 수 없다.
- 개인정보 등급이 없는 칸, 플랫폼 핵심 기록 이름(attendance·grades 등)
- 끝 상태에서 나가는 전환(끝난 기록의 정정은 사유와 함께 새 기록으로 한다), 끝 상태에 닿지 않는 흐름
- 꾸러미 안에서 풀리지 않는 이름(없는 기록 유형·칸·흐름)

오류가 있는 판도 저장은 되지만(`valid: false`) 그 판은 켤 수 없다. **켜기·끄기와 실제 기록 쓰기는 사람(학교 관리자·교직원)이 한다.** 검사를 통과하고 미리보기를 확인했으면 사람에게 `/packages`에서 켜 달라고 말한다.

## 오류
| 상태 | 뜻 · 할 일 |
| --- | --- |
| 401 | 토큰이 없거나 틀림·기한 지남·폐기 → 사람에게 새 토큰 요청 |
| 403 | 범위 밖(종류·주소) 또는 권한 없음 → 범위를 넓히지 말고 사람에게 알림 |
| 404 | 그 항목이 없거나 범위 밖 |
| 400 | 파일 형식·크기·PDF 내용·블록 형식 → 메시지대로 고침 |
| 409 | 그 사이 새 판이 생김 → 다시 읽어 고친 뒤 저장 |
| 413 | 파일이 너무 큼 |
