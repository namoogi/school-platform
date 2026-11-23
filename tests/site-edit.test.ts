/** 35차 화면 편집(ADR 0011 1단계): DB 없이 도는 편집 함수 · 숨김 블록 검사 */
import { describe, expect, it } from 'vitest';
import {
  featurePalette, getAt, insertBlock, LAYOUT_PALETTE, moveBlock, removeBlock, sameContent, setAt, setLangText, toggleHidden, translationState,
} from '@/lib/site-edit';
import { fillDownloads, validateContent, type Content } from '@/lib/site';

const base = (): Content => ({
  title: { ko: '학교 소개', en: 'About' },
  blocks: [
    { type: 'heading', text: { ko: '하나' } },
    { type: 'text', text: { ko: '둘' } },
    { type: 'section', template: 'cards', title: { ko: '셋' }, items: [{ title: { ko: '카드' } }] },
  ],
});
const PHOTO = '6f1c1b1e-9a1d-4b5e-8c7a-0b1a2c3d4e5f';

describe('편집 함수', () => {
  it('setAt 은 고친 사본을 만들고 원본은 그대로 둔다', () => {
    const c = base();
    const n = setAt(c, ['blocks', 2, 'items', 0, 'title', 'en'], 'Card');
    expect(getAt(n, ['blocks', 2, 'items', 0, 'title'])).toEqual({ ko: '카드', en: 'Card' });
    expect(getAt(c, ['blocks', 2, 'items', 0, 'title'])).toEqual({ ko: '카드' });
    expect(n.blocks[0]).toBe(c.blocks[0]); // 길 밖의 블록은 같은 객체
    expect(setAt(c, ['head', 'eyebrow'], { ko: '머리말' }).head).toEqual({ eyebrow: { ko: '머리말' } });
  });

  it('언어별 글: 빈 글이면 그 언어를 뺀다', () => {
    const c = setLangText(base(), ['title'], 'th', 'เกี่ยวกับ');
    expect(c.title).toEqual({ ko: '학교 소개', en: 'About', th: 'เกี่ยวกับ' });
    expect(setLangText(c, ['title'], 'en', '').title).toEqual({ ko: '학교 소개', th: 'เกี่ยวกับ' });
  });

  it('옮기기·넣기·지우기·숨기기', () => {
    const c = base();
    expect(moveBlock(c, 0, 2).blocks.map((b) => b.type)).toEqual(['text', 'section', 'heading']);
    expect(moveBlock(c, 0, -1)).toBe(c); // 범위 밖은 그대로
    expect(insertBlock(c, 1, { type: 'notice', text: {} }).blocks.map((b) => b.type)).toEqual(['heading', 'notice', 'text', 'section']);
    expect(removeBlock(c, 1).blocks).toHaveLength(2);
    const hidden = toggleHidden(c, 1);
    expect(hidden.blocks[1].hidden).toBe(true);
    expect('hidden' in toggleHidden(hidden, 1).blocks[1]).toBe(false);
  });

  it('번역 표시: 비어 있음(점선)과 원문이 바뀜(물결)', () => {
    expect(translationState({ ko: '가' }, { ko: '가' }, 'en', 'ko')).toBe('missing');
    expect(translationState({ ko: '가', en: 'A' }, { ko: '가', en: 'A' }, 'en', 'ko')).toBeNull();
    expect(translationState({ ko: '가나', en: 'A' }, { ko: '가', en: 'A' }, 'en', 'ko')).toBe('stale');
    expect(translationState({ ko: '가나', en: 'AB' }, { ko: '가', en: 'A' }, 'en', 'ko')).toBeNull(); // 번역도 고침
    expect(translationState({ ko: '가' }, {}, 'ko', 'ko')).toBeNull(); // 기본 언어 글은 물결 표시 없음
    expect(translationState({ ko: '가' }, {}, 'en', 'th')).toBe('missing'); // 기본 언어(th)가 비어도 다른 언어 글이 있으면
    expect(translationState({}, {}, 'en', 'ko')).toBeNull();
  });

  it('빈 칸 차이는 변경으로 보지 않는다', () => {
    expect(sameContent(base(), { ...base(), summary: {} })).toBe(true);
    expect(sameContent({ blocks: [{ text: { ko: '가' }, type: 'text' }], title: { ko: 'x' } } as Content, { title: { ko: 'x' }, blocks: [{ type: 'text', text: { ko: '가' } }] })).toBe(true); // 열쇠 순서 무관
    expect(sameContent(base(), setLangText(base(), ['title'], 'en', 'About us'))).toBe(false);
  });
});

describe('숨김 블록 · 팔레트가 만든 블록은 같은 내용 검사를 통과한다', () => {
  it('hidden: true 는 지키고, 다른 값은 버린다', () => {
    const v = validateContent({ title: { ko: 'x' }, blocks: [{ type: 'text', text: { ko: '숨김' }, hidden: true }, { type: 'text', text: { ko: '보임' }, hidden: 'yes' }] });
    expect(v.blocks[0]).toEqual({ type: 'text', text: { ko: '숨김' }, hidden: true });
    expect(v.blocks[1]).toEqual({ type: 'text', text: { ko: '보임' } });
  });

  it('레이아웃 10종 · 기능 블록(사진이 필요한 것은 사진을 넣어)', () => {
    const blocks = [...LAYOUT_PALETTE, ...featurePalette('page'), ...featurePalette('story')].map((p) => p.make(p.needsPhoto ? PHOTO : undefined));
    expect(LAYOUT_PALETTE).toHaveLength(10);
    const v = validateContent({ title: { ko: 'x' }, blocks });
    expect(v.blocks).toHaveLength(blocks.length);
  });

  it('사진 없이 그림 블록은 통과하지 못한다(그래서 팔레트가 사진부터 고르게 한다)', () => {
    const img = featurePalette('page').find((p) => p.id === 'image')!;
    expect(img.needsPhoto).toBe(true);
    expect(() => validateContent({ title: { ko: 'x' }, blocks: [img.make()] })).toThrow('그림');
  });
});


describe('장면 캐릭터 PNG', () => {
  const input = (extra = {}) => ({ title: { ko: '동화' }, blocks: [{ type: 'gallery', download: 'png', scene: 2, items: [{ asset: PHOTO, alt: { ko: '곰' }, file_name: 'forged.jpg' }], ...extra }] });
  it('장면·이름을 보존하고 실제 학교 PNG의 파일 정보를 판에 채운다', () => {
    const content = validateContent(input());
    expect(content.blocks[0]).toMatchObject({ type: 'gallery', scene: 2, assets: [PHOTO] });
    expect(content.blocks[0]).not.toHaveProperty('items.0.file_name');
    const filled = fillDownloads(content, [{ id: PHOTO, name: 'bear.png', mime: 'image/png', size_bytes: 1024 }]);
    expect(filled.blocks[0]).toMatchObject({ items: [{ asset: PHOTO, alt: { ko: '곰' }, file_name: 'bear.png', size_bytes: 1024 }] });
    expect(content.blocks[0]).not.toHaveProperty('items.0.file_name');
  });
  it('다른 학교 자산·JPEG·PDF를 PNG로 내려받게 할 수 없다', () => {
    const content = validateContent(input());
    expect(() => fillDownloads(content, [])).toThrow('이 학교에 올린 PNG');
    for (const mime of ['image/jpeg', 'application/pdf']) expect(() => fillDownloads(content, [{ id: PHOTO, name: 'fake.png', mime, size_bytes: 1024 }])).toThrow('PNG');
  });
  it('잘못된 장면 번호·내려받기 형식을 거부하고 일반 갤러리를 유지한다', () => {
    for (const scene of [0, -1, 1.5, 201, '2']) expect(() => validateContent(input({ scene }))).toThrow('장면 번호');
    expect(() => validateContent(input({ download: 'jpg' }))).toThrow('PNG');
    const ordinary = validateContent(input({ download: undefined, scene: undefined }));
    expect(fillDownloads(ordinary, []).blocks).toEqual(ordinary.blocks);
  });
});
