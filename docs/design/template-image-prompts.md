# 템플릿 예시 그림 만들기 (89차, ADR 0034)

> **요약** 템플릿 미리보기·썸네일에 들어갈 예시 사진 38장의 프롬프트입니다(89차 22장 + 90차 대표 3종 16장). **대표 3종(이야기·프로젝트·유치원) 22장은 #143에서 Codex 구독 이미지 도구로 생성·등록했고, 썸네일도 갱신했습니다.** 생성 출처·프롬프트·크기·용량은 [사진 목록](template-photo-manifest.json), 구현·시험 결과는 [인계 문서](issue-143-handoff.md)에 있습니다. 나머지 템플릿은 사진 준비 전까지 SVG 자리 그림을 씁니다.

> **왜** 템플릿을 '완성 디자인'으로 고르려면 첫 화면의 큰 사진이 필요합니다. 학교에 들어가는 것은 학교 자기 사진이고, 이 그림들은 미리보기·예시 전용입니다.

## 공통 규칙 (모든 그림)
- 사진처럼 자연스러운 빛. **사람은 뒷모습·손·먼 거리 실루엣만**(알아볼 수 있는 얼굴 없음).
- **그림 안에 글자·간판·로고 없음**(템플릿 글이 그 위에 올라갑니다).
- 실존 학교·건물·브랜드를 닮게 하지 않습니다.
- 크기: 첫 화면(hero)은 가로 16:9(1600×900 이상), 나머지는 4:3(1200×900 이상). JPG.
- 첫 화면 사진은 **아래쪽 1/3이 비교적 단순**해야 제목 글이 잘 읽힙니다.

## 넣는 법
- 파일 이름 그대로 첨부해 주세요(예: `notice-hero.jpg`).
- 세션은 받은 그림을 `public/site-templates/img/`에 넣습니다.
- 그다음 `src/lib/site-template-samples.ts`의 `SAMPLE_PHOTOS`에 이름을 더하고 `npm run templates:thumbs`로 썸네일을 다시 찍습니다.

## 프롬프트 (영어 프롬프트를 그대로 쓰면 됩니다)

### 알림 중심형 · 디자인 '맑은 하늘'(파랑)
| 파일 | 자리 | 프롬프트 |
| --- | --- | --- |
| `notice-hero.jpg` | 첫 화면 | Photorealistic wide shot of a friendly public elementary school building on a clear blue morning, red-brick and white walls, a tidy schoolyard with a few trees, blue sky with soft clouds, calm and welcoming mood, 16:9 |
| `notice-calendar.jpg` | 바로 가기 카드 1 | Photorealistic close-up of a paper wall calendar on a bright classroom wall with colored pencils and sticky notes nearby, soft daylight, blue accents, 4:3 |
| `notice-lunch.jpg` | 바로 가기 카드 2 | Photorealistic top-down view of a Korean school lunch tray with rice, soup, vegetables and fruit on a light table, bright natural light, 4:3 |
| `notice-way.jpg` | 바로 가기 카드 3 | Photorealistic tree-lined walking path leading to a school gate in the morning, a crosswalk and a small bus stop shelter, clear sky, 4:3 |

### 이야기형 · 디자인 '아이보리 편집'(아이보리·짙은 초록) — 대표 3종
| 파일 | 자리 | 프롬프트 |
| --- | --- | --- |
| `story-hero.jpg` | 첫 화면 | Photorealistic forest path at early morning with soft golden mist, a small wooden schoolhouse visible between the trees, warm beige and green tones, quiet and hopeful mood, 16:9 |
| `story-day.jpg` | 학교의 하루 | Photorealistic children seen from behind walking together on a forest trail with small backpacks, warm morning light, 4:3 |
| `story-learning.jpg` | 배움의 방식 | Photorealistic wooden table in a sunny classroom with leaves, a magnifying glass, notebooks and hand-drawn plant sketches, warm natural light, 4:3 |
| `story-season-1.jpg` | 사계절 콜라주(큰 칸) | Photorealistic spring forest path with fresh green leaves and cherry blossoms, morning light, calm, square 1:1 |
| `story-season-2.jpg` | 사계절 콜라주 | Photorealistic small school vegetable garden in summer with tomatoes and watering cans, 1:1 |
| `story-season-3.jpg` | 사계절 콜라주 | Photorealistic woodworking corner in autumn with hand tools, wood shavings and a half-finished stool, warm light, 1:1 |
| `story-season-4.jpg` | 사계절 콜라주 | Photorealistic cozy school reading room in winter with wooden shelves, a window showing snow, 1:1 |
| `story-season-5.jpg` | 사계절 콜라주 | Photorealistic long wooden table set with simple home-cooked dishes and bowls, steam rising, top view, 1:1 |

### 입학 모집형 · 디자인 '힘찬 시작'(붉은 강조)
| 파일 | 자리 | 프롬프트 |
| --- | --- | --- |
| `admissions-hero.jpg` | 첫 화면 | Photorealistic bright modern classroom with large windows, a few students seen from behind raising hands toward a whiteboard, warm sunlight, energetic and optimistic mood, 16:9 |
| `admissions-class.jpg` | 차별점 1 | Photorealistic small circle of eight chairs around a round table in a cozy classroom, open books on the table, soft daylight, 4:3 |
| `admissions-books.jpg` | 차별점 2 | Photorealistic stack of picture books and notebooks on a desk with two different colored bookmarks, a globe in the background, warm light, 4:3 |
| `admissions-mentor.jpg` | 차별점 3 | Photorealistic two people seen from behind sitting side by side at a desk looking at a notebook together, window light, calm mentoring mood, 4:3 |

### 프로젝트형 · 디자인 '작업실'(노랑·검정) — 대표 3종
| 파일 | 자리 | 프롬프트 |
| --- | --- | --- |
| `project-hero.jpg` | 첫 화면 | Photorealistic maker workshop classroom with cardboard prototypes, a 3D printer, hand tools and colorful sticky notes on a wall, students' hands working at a large table, bright yellow accents, 16:9 |
| `project-river.jpg` | 프로젝트 1 | Photorealistic hand-made map model of a small river and village on a table, with water sample bottles and a notebook, daylight, 4:3 |
| `project-market.jpg` | 프로젝트 2 | Photorealistic small outdoor market stall made by students with baskets of vegetables from a school garden, hand-drawn price cards without readable text, sunny day, 4:3 |
| `project-work-1.jpg` | 작품(과학) | Photorealistic hand-drawn water quality map of a small river laid on a table with test tubes and colored pins, 4:3 |
| `project-work-2.jpg` | 작품(사회) | Photorealistic open handmade ledger notebook with coins, receipts and a calculator on a wooden desk, no readable text, 4:3 |
| `project-work-3.jpg` | 작품(예술) | Photorealistic colorful mural sketch on large paper taped to a brick wall with paint cans below, 4:3 |
| `project-work-4.jpg` | 작품(과학) | Photorealistic student-made rainwater barrel prototype from recycled plastic with a small tap, outdoors, 4:3 |
| `project-work-5.jpg` | 작품(사회) | Photorealistic small video camera on a tripod in a cozy living room facing an empty armchair, warm light, 4:3 |
| `project-work-6.jpg` | 작품(예술) | Photorealistic simple handmade wooden chair in a school workshop with clamps and sawdust, 4:3 |

### 사명·후원형 · 디자인 '등불'(따뜻한 갈색)
| 파일 | 자리 | 프롬프트 |
| --- | --- | --- |
| `mission-hero.jpg` | 첫 화면 | Photorealistic small rural school building on a hillside at dusk with warm light glowing from the windows, mountains in the background, gentle and hopeful mood, warm amber tones, 16:9 |
| `mission-village.jpg` | 섬기는 마을 | Photorealistic dirt path through a mountain village with small houses and terraced fields, children seen far away from behind walking to school, soft morning light, 4:3 |

### 국제·다국어형 · 디자인 '지평'(청록)
| 파일 | 자리 | 프롬프트 |
| --- | --- | --- |
| `international-hero.jpg` | 첫 화면 | Photorealistic modern school campus with glass and wood buildings surrounded by tropical trees and a green lawn, clear sky, airy and international atmosphere, teal tones, 16:9 |
| `international-early.jpg` | 유아 과정 | Photorealistic bright early-years classroom corner with wooden blocks, soft rugs and picture books, no people, 4:3 |
| `international-primary.jpg` | 초등 과정 | Photorealistic primary classroom with world map, small desks and colorful books, students seen from behind, daylight, 4:3 |
| `international-secondary.jpg` | 중등 과정 | Photorealistic secondary school science lab with microscopes and notebooks on white benches, large windows, 4:3 |

### 한 쪽 소개형 · 디자인 '씨앗'(연두)
| 파일 | 자리 | 프롬프트 |
| --- | --- | --- |
| `single-study.jpg` | 하는 일 1 | Photorealistic cozy living-room study table with children's hands writing in notebooks, a plant and a lamp, homeschool atmosphere, soft green tones, 4:3 |
| `single-outing.jpg` | 하는 일 2 | Photorealistic small group of children seen from behind walking into a sunny farm field with baskets, light green tones, 4:3 |

### 유치원형 · 디자인 '놀이터'(복숭아·분홍·노랑) — 대표 3종
| 파일 | 자리 | 프롬프트 |
| --- | --- | --- |
| `kinder-hero.jpg` | 첫 화면(둥글게 오림) | Photorealistic bright kindergarten playground with colorful wooden play equipment and a sandbox, small children seen from behind playing, soft peach and yellow tones, square 1:1, subject centered |
| `kinder-class-1.jpg` | 새싹반(만 3세) | Photorealistic cozy toddler classroom corner with soft cushions, large wooden blocks and picture books, no people, 4:3 |
| `kinder-class-2.jpg` | 꽃잎반(만 4세) | Photorealistic pretend-play kitchen corner in a kindergarten with toy pots and play food, warm light, no people, 4:3 |
| `kinder-class-3.jpg` | 열매반(만 5세) | Photorealistic kindergarten table with crayons, letter blocks and simple drawings, children's hands only, 4:3 |
| `kinder-play.jpg` | 놀이로 배워요(둥글게 오림) | Photorealistic children's hands planting seedlings in a small garden bed with tiny watering cans, sunny, square 1:1 |

## 확인
- 3장 이상이므로 생성 전에 이 프롬프트를 확인해 주세요(선생님 기본 원칙). 고치고 싶은 장면은 이 문서를 고쳐 다시 정합니다.
- 받은 그림은 사람 얼굴·글자·로고가 없는지 확인한 뒤 넣습니다.
