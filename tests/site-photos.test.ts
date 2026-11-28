/** 122차: 판 안의 사진 id 모으기 (공개 창의 사진 공개 허가 확인) — DB 없이 */
import { describe, expect, it } from 'vitest';
import { photoAssetIds } from '@/lib/site-photos';
import type { Content } from '@/lib/site-shared';

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const c = '33333333-3333-4333-8333-333333333333';
const pdf = '44444444-4444-4444-8444-444444444444';

describe('photoAssetIds', () => {
  it('겉표지·로고·그림·사진 묶음·구역 사진·카드 사진·동화 쪽을 순서대로 한 번씩 모은다', () => {
    const content = {
      title: { ko: 'x' }, cover: a, site: { logo: b },
      blocks: [
        { type: 'image', asset: a },
        { type: 'gallery', assets: [b, c], items: [{ asset: b }, { asset: c }] },
        { type: 'section', template: 'cards', asset: c, items: [{ asset: a }, {}] },
        { type: 'story_page', asset: c, text: {} },
      ],
    } as unknown as Content;
    expect(photoAssetIds(content)).toEqual([a, b, c]);
  });
  it('PDF 내려받기는 사진이 아니다 · 빈 내용은 빈 목록', () => {
    expect(photoAssetIds({ title: { ko: 'x' }, blocks: [{ type: 'download', asset: pdf }] } as unknown as Content)).toEqual([]);
    expect(photoAssetIds(null)).toEqual([]);
  });
});
