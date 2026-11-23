# 대표 캐릭터 11종 완성 (2026-11-24)

사용자가 빠진 수달·독수리·부엉이도 추출 또는 생성해 목록에 넣도록 요청했다. 앞 차시의 이름만 표시는 이 요청으로 대체한다.

## 제작과 범위

- 기존 05-1 수달, 08-1 독수리, 11-1 부엉이 스토리보드를 참조해 내장 image_gen으로 단독 캐릭터를 재구성했다. 픽셀 그대로 잘라낸 원본이 아니라 동일 캐릭터의 모습을 참고한 생성 이미지다.
- 투명 RGBA PNG, 1024×1024, 한 명씩, 글자·배경·소품 없음. 기존 8종은 그대로 보존.
- 목록에는 경량 WebP 3장을 추가한다. 룽아룬숙사에만 적용하고 언어 필터는 유지한다.
- PNG는 학교 자산으로도 올려 후속 동화 제작에서 재사용할 수 있게 한다. 동화 본문·판·공개 상태는 변경하지 않는다.

## 생성 기록

### otter

- 참조: `05_otter/05-1_storyboard.jpg`
- PNG SHA-256: `7e977cdc81c8efe0b12fc202aa505477533f2787353bc05e0754dcfab18c4a71`
- PNG: 1032390 bytes; WebP: 25580 bytes.

최종 프롬프트:

```text
Use case: background-extraction / identity-preserve. Asset type: children's picture-book character portrait for the Rung Arun Suksa virtue story index. Edit the supplied storyboard into ONE isolated full-body character: the brown OTTER (not bear) with cream muzzle and long cream chest/belly, small round ears, whiskers, thick tapering curved tail, short rounded legs. Input image is the identity and illustration-style reference. Preserve that character's recognizable face, markings, proportions and warm watercolor / colored-pencil storybook texture. Pose: standing upright with both feet visible, one paw gently raised in a thoughtful pause, friendly attentive open eyes and soft smile. Reconstruct hidden body parts naturally where needed. Keep the whole character centered with generous transparent margins, square composition around 1024x1024. Match the existing soft painterly cute animal illustration rather than flat vector or glossy 3D. Genuine transparent RGBA background. Remove all other characters, scenery, school buildings, ground, shadows, balls, books, maps, props, panels and text. No clothing, no letters, no watermark, no border, no checkerboard painted into the image. Exactly one character, anatomically coherent, no extra limbs.
```

### eagle

- 참조: `08_eagle/08-1_storyboard.jpg`
- PNG SHA-256: `79360d48024be89e3fc5989157897e1c3060650311f29404c73f14b7c526cd7c`
- PNG: 1373739 bytes; WebP: 34294 bytes.

최종 프롬프트:

```text
Use case: background-extraction / identity-preserve. Asset type: children's picture-book character portrait for the Rung Arun Suksa virtue story index. Edit the supplied storyboard into ONE isolated full-body character: the young BALD EAGLE with white feathered head, warm brown layered wings and body, bright golden yellow hooked beak and two golden feet. Input image is the identity and illustration-style reference. Preserve that character's recognizable face, markings, proportions and warm watercolor / colored-pencil storybook texture. Pose: standing upright, both feet visible, wings relaxed with one wing slightly raised in a friendly responsible greeting, gentle large eyes and warm smile. Reconstruct hidden body parts naturally where needed. Keep the whole character centered with generous transparent margins, square composition around 1024x1024. Match the existing soft painterly cute animal illustration rather than flat vector or glossy 3D. Genuine transparent RGBA background. Remove all other characters, scenery, school buildings, ground, shadows, balls, books, maps, props, panels and text. No clothing, no letters, no watermark, no border, no checkerboard painted into the image. Exactly one character, anatomically coherent, no extra limbs.
```

### owl

- 참조: `11_owl/11-1_storyboard.jpg`
- PNG SHA-256: `0916928ff4c70a1122e29dea24dbcd4c6778ee76b5407da5aeaa853bc44c74bb`
- PNG: 1179446 bytes; WebP: 28366 bytes.

최종 프롬프트:

```text
Use case: background-extraction / identity-preserve. Asset type: children's picture-book character portrait for the Rung Arun Suksa virtue story index. Edit the supplied storyboard into ONE isolated full-body character: the little BROWN OWL with two small ear tufts, warm brown layered feather body, large cream heart-shaped facial discs, small yellow beak and two yellow feet. Input image is the identity and illustration-style reference. Preserve that character's recognizable face, markings, proportions and warm watercolor / colored-pencil storybook texture. Pose: standing upright, both feet visible, wings resting beside body, curious friendly open eyes and a slight thoughtful head tilt. Reconstruct hidden body parts naturally where needed. Keep the whole character centered with generous transparent margins, square composition around 1024x1024. Match the existing soft painterly cute animal illustration rather than flat vector or glossy 3D. Genuine transparent RGBA background. Remove all other characters, scenery, school buildings, ground, shadows, balls, books, maps, props, panels and text. No clothing, no letters, no watermark, no border, no checkerboard painted into the image. Exactly one character, anatomically coherent, no extra limbs.
```

## 검증

- PNG 3종의 실제 alpha 0~255, 1024×1024 크기 확인. 학교 자산 3개 업로드 완료.
- typecheck, check:repo, build 통과. 단위 테스트 8개 파일·55개 통과.
- 로컬 Postgres가 없어 DB 통합/E2E 미실행. 운영 배포 후 실제 목록 결과는 PR에 기록한다.
