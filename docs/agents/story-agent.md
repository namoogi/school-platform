# 외부 에이전트 안내: 성품 동화 작업 (Codex 등)

학교 관리자가 발급한 **외부 작업 토큰**으로, 한 학교의 **성품 동화 시안**에 캐릭터 그림과 PDF를 올린다. 설계: [ADR 0012](../decisions/0012-agent-work-token.md).

## 할 일과 하지 말 일
- 할 수 있다: 그 학교에 그림·PDF 올리기, 토큰 범위 안 동화의 **새 판(시안)** 저장, 그 동화와 그 학교 자산 목록 읽기.
- 할 수 없다(서버가 거부): 공개·공개 내림, 홈페이지 설정, 쪽·소식, 새 동화 만들기, 다른 동화(토큰이 한 동화로 좁혀졌을 때), 다른 학교.
- 하지 말 것
  - 토큰 원문을 출력·로그·커밋·채팅에 남기지 않는다. 환경 변수 `SCHOOL_AGENT_TOKEN`으로만 쓴다.
  - 실제 학생 사진·이름을 그림에 넣지 않는다.
  - 기존 판의 글·쪽 그림을 지우지 않는다. 새 판은 최신 판 블록을 그대로 두고 덧붙인다(아래 스크립트가 그렇게 한다).
- 공개는 사람이 한다: 학교 관리자가 `/site` → 성품 동화 → 시안 미리보기 → '최신 판 공개'.

## 파일 규격
| 파일 | 권장 | 한도 |
| --- | --- | --- |
| 캐릭터 그림 | PNG, **투명 배경**(RGBA), 정사각형 긴 변 **1024px**, 캐릭터 한 명씩, 글자 없이 | 5MB, PNG·JPG·WEBP |
| 동화 PDF | **웹용**: 그림 150dpi 정도·JPEG 압축, 글꼴 포함, 자바스크립트·첨부 파일·양식·암호 없음 | **4MB**(서버 요청 한도). 넘으면 더 줄인다. 인쇄용 원본은 따로 보관 |

- 언어별 PDF가 있으면 파일을 나누어 `pdfs`에 여러 개 적는다(한국어·English·ไทย).
- 같은 파일(내용이 같으면)은 다시 올려도 새로 저장되지 않는다.

## 한 번에 올리기 (스크립트)
저장소의 `scripts/agent-story-upload.mjs`를 쓴다. Node 20 이상.

```bash
export SCHOOL_AGENT_TOKEN=agt_...     # 선생님이 넣어 준 값. 출력하지 않는다
node scripts/agent-story-upload.mjs ./out/brave-elephant --dry-run   # 먼저 확인
node scripts/agent-story-upload.mjs ./out/brave-elephant             # 올리고 새 판 저장
```

폴더 예:
```
out/brave-elephant/
  manifest.json
  characters/popo.png
  characters/mimi.png
  brave-elephant-ko.pdf
```

`manifest.json` 예 (글은 언어별로, 없는 언어는 빼도 된다):
```json
{
  "story_key": "brave-elephant",
  "note": "캐릭터 2명 · PDF(한국어)",
  "characters": {
    "title": { "ko": "등장인물", "en": "Characters", "th": "ตัวละคร" },
    "items": [
      { "file": "characters/popo.png", "name": { "ko": "코끼리 포포", "en": "Popo" }, "body": { "ko": "겁이 많지만 친구를 위해 용기를 내요." }, "alt": { "ko": "웃고 있는 아기 코끼리" } },
      { "file": "characters/mimi.png", "name": { "ko": "새 미미" }, "body": { "ko": "포포의 가장 친한 친구" } }
    ]
  },
  "pdfs": [
    { "file": "brave-elephant-ko.pdf", "label": { "ko": "동화 PDF 내려받기", "en": "Download the storybook" }, "note": { "ko": "웹용 16쪽" } }
  ]
}
```

스크립트가 하는 일: 토큰 확인 → 동화 최신 판 읽기 → 파일 올리기 → 최신 판 블록 + '등장인물' 카드 구역 + 'PDF 내려받기' 블록으로 새 판 저장. 다시 돌리면 이전에 붙인 같은 제목의 등장인물 구역과 내려받기 블록을 바꿔 끼운다.

## API (직접 부를 때)
기본 주소 `https://onschools.vercel.app`. 모든 요청에 머리 `x-agent-token: $SCHOOL_AGENT_TOKEN`. 로그인 쿠키는 보내지 않는다.

| 요청 | 하는 일 |
| --- | --- |
| `GET /api/agent/me` | 학교·범위·기한 |
| `GET /api/agent/stories` | 범위 안 동화 목록(최신 판·공개 판 번호) |
| `GET /api/agent/stories/<key>` | 최신 판 내용 `latest.content` |
| `GET /api/agent/assets` | 이 학교 그림·PDF 목록(id, name, mime, size_bytes, sha256) |
| `POST /api/agent/assets?name=<파일 이름>` | 본문에 파일 그대로, `Content-Type`에 형식 → `{ id, reused }` |
| `POST /api/agent/stories/<key>/versions` | `{ content, note }` → `{ version, published: false }` |

```bash
H="x-agent-token: $SCHOOL_AGENT_TOKEN"
curl -s -H "$H" https://onschools.vercel.app/api/agent/me
curl -s -H "$H" -H 'content-type: image/png' --data-binary @characters/popo.png \
  'https://onschools.vercel.app/api/agent/assets?name=popo.png'
curl -s -H "$H" https://onschools.vercel.app/api/agent/stories/brave-elephant > latest.json
# latest.json 의 latest.content.blocks 뒤에 블록을 덧붙여 저장
curl -s -H "$H" -H 'content-type: application/json' -d @new-version.json \
  https://onschools.vercel.app/api/agent/stories/brave-elephant/versions
```

덧붙이는 블록 모양:
```json
{ "type": "section", "template": "cards", "title": { "ko": "등장인물" },
  "items": [ { "title": { "ko": "코끼리 포포" }, "body": { "ko": "…" }, "asset": "<그림 id>", "alt": { "ko": "…" } } ] }
{ "type": "download", "asset": "<PDF id>", "label": { "ko": "동화 PDF 내려받기" }, "note": { "ko": "웹용 16쪽" } }
```
- 파일 이름·크기는 서버가 채운다. 내용이 가리키는 그림·파일은 모두 그 학교 것이어야 한다.

## 오류
| 상태 | 뜻 |
| --- | --- |
| 401 | 토큰이 없거나, 틀렸거나, 기한이 지났거나, 폐기됨 → 선생님께 새 토큰 요청 |
| 403 | 토큰 범위 밖(다른 동화·쪽 등) |
| 400 | 파일 형식·크기·PDF 내용(자바스크립트 등)·블록 형식 문제. 메시지대로 고친다 |
| 413 | 파일이 너무 큼(PDF 4MB) |

## 실행 환경 참고
- Codex 클라우드에서 돌리면 그 환경의 인터넷 허용 목록에 `onschools.vercel.app`이 있어야 한다.
- 프록시를 거치는 환경이면 Node 24의 `NODE_USE_ENV_PROXY=1`을 켜거나, curl을 쓴다.
