# 성품 목록의 대표 캐릭터 그림 (2026-11-24)

## 문제와 변경

사용자는 목록의 ‘경청 · 사슴’, ‘감사 · 고슴도치’ 글자 옆에 캐릭터 그림이 나오기를 요청했다. 기존 목록은 공개된 동화의 PNG 갤러리에서 대표 그림을 찾았으므로, 갤러리가 시안인 동안 이미지가 모두 비어 있었다.

룽아룬숙사 목록에 사용자가 지정한 원본 8종의 경량 사본을 직접 배치한다. 성품명·캐릭터 이름 옆에 한 장씩, 그 아래에 에피소드 제목이 나온다. 특정 동화를 공개하거나 내려도 이 대표 그림은 유지된다. 수달·독수리·부엉이는 사용자 결정대로 이름만 표시한다.

## 자료와 범위

- 출처: 사용자가 만든 ChatGPT 동화 작업의 after-the-rain-animation-assets.zip 원본 PNG.
- 투명도를 유지한 웹 표시용 WebP 사본. 320×360 범위 안에서 비율을 유지한다. 원본 파일·학교 저장 자산·동화 시안은 변경하지 않는다.
- 1쪽의 잘못된 코끼리는 사용하지 않고 10쪽 원본을 사용한다.
- 이 8종은 사용자가 요청한 공개 목록의 장식 자산으로 배포한다. 시안 DB를 방문자 권한으로 읽거나 학교 자산의 접근 정책을 바꾸지 않는다.
- 룽아룬숙사 주소에만 적용한다. 다른 학교는 기존의 공개된 갤러리 자료만 사용한다.
- 언어별 동화 필터와 번역 내용, 동화 공개 상태는 그대로 유지한다.

## 원본 추적

| 캐릭터 파일 | 원본 위치 | 원본 SHA-256 | 표시용 크기 |
| --- | --- | --- | --- |
| deer.webp | scenes/scene-01/sprites/03_deer.png | 60b87dd0c6223e6fa26814daf1d6c14140b2d46d90f3d87847931c20b462882b | 45,406 bytes |
| hedgehog.webp | scenes/scene-01/sprites/02_hedgehog.png | ebc96cca8ebe0de1441cbc185af05184ad5e9cf74caf85ad4c0d8089e81ce3cb | 52,758 bytes |
| sheep.webp | scenes/scene-01/sprites/08_sheep.png | 5f879087d7cf78de715a1a2d34e9c6ccf7cba8874e9183acc4ceb6998569c1bb | 38,488 bytes |
| squirrel.webp | scenes/scene-01/sprites/05_squirrel.png | b9a61a4f9a744c876c2d443e714d7655dfa918c23aadaa61fb16f17f6099f70f | 46,512 bytes |
| pelican.webp | scenes/scene-01/sprites/07_pelican.png | 46cb260ee30d7bebdbb61b46899b81995bcc9147f6b642438a256c4b8d184e36 | 32,304 bytes |
| butterfly.webp | scenes/scene-01/sprites/06_butterfly.png | eb5f552f262e2bd8af8520fb48c19695a8c5a6cd7f4191a0953a94ac5ecbc4ac | 34,214 bytes |
| elephant.webp | scenes/scene-10/sprites/04_elephant.png | e86cc72a9f98ed652df95f33fa1b00bef71641e565b764206dafae19a4b917cd | 44,320 bytes |
| bear.webp | scenes/scene-01/sprites/01_bear.png | 7f9f98e512d255b5d3049b920d18cb7962a9aba1f06e7e472f5b8201a74c6c85 | 45,394 bytes |

전체 표시용 그림 339,396 bytes.

## 확인

- `npm run typecheck`, `npm run check:repo`, `npm run build` 통과.
- `npm run test:unit`: 8개 파일, 55개 테스트 통과.
- `npm test`, `npm run test:e2e`: 로컬 Postgres(127.0.0.1:54322)가 없어 미실행.
- 운영 배포 결과는 PR에 기록한다. 실제 공개 목록에서 8종 이미지 로드, 이름만 표시되는 3종, 글자 옆 배치와 에피소드 링크를 확인한다.
