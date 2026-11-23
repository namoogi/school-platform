import { describe, expect, it } from 'vitest';
import { characterPortraits, groupStories, storyPortraitUrls } from '@/lib/story-index';
import type { Content } from '@/lib/site-shared';
import { hasMultilingualStoryText, storyLanguages, storyTerm } from '@/lib/story-language';

describe('성품별 동화 책장', () => {
  it('룽아룬숙사 목록의 대표 그림은 동화 공개 여부와 무관하며 다른 학교에 섞이지 않는다', () => {
    const asset = (id: string) => `/school-assets/${id}`;
    const portraits = storyPortraitUrls('rungarunsuksa', [], asset);
    expect(Object.keys(portraits)).toHaveLength(8);
    expect(portraits['사슴']).toBe('/story-characters/rungarunsuksa/deer.webp');
    expect(portraits['고슴도치']).toBe('/story-characters/rungarunsuksa/hedgehog.webp');
    expect(portraits['수달']).toBeUndefined();
    expect(portraits['독수리']).toBeUndefined();
    expect(portraits['부엉이']).toBeUndefined();
    expect(storyPortraitUrls('another-school', [], asset)).toEqual({});
    expect(storyPortraitUrls('another-school', [{ title: {}, blocks: [
      { type: 'gallery', download: 'png', assets: ['their-deer'], items: [{ asset: 'their-deer', alt: { ko: '사슴' } }] },
    ] }], asset)['사슴']).toBe('/school-assets/their-deer');
  });
  it('같은 성품·캐릭터끼리 묶고 기존 에피소드 순서를 유지한다', () => {
    const stories = [
      { key: 'deer-1', title: { ko: '첫 이야기' }, meta: { virtue: '경청', character: '사슴' } },
      { key: 'bear', title: { ko: '곰 이야기' }, meta: { virtue: '경청', character: '곰' } },
      { key: 'deer-2', title: { ko: '둘째 이야기' }, meta: { virtue: ' 경청 ', character: '사슴' } },
      { key: 'together', title: { ko: '함께' }, meta: { virtue: '', character: '사슴 · 곰' } },
    ];
    const result = groupStories(stories);
    expect(result.groups.map((g) => g.stories.map((s) => s.key))).toEqual([['deer-1', 'deer-2'], ['bear']]);
    expect(result.together.map((s) => s.key)).toEqual(['together']);
    expect(groupStories([])).toEqual({ groups: [], together: [] });
  });
  it('공개 자료의 PNG 캐릭터 이름만 사용하고 숨긴 블록과 일반 장면 그림은 제외한다', () => {
    const content: Content = { title: { ko: '책' }, blocks: [
      { type: 'gallery', download: 'png', hidden: true, assets: ['hidden'], items: [{ asset: 'hidden', alt: { ko: '사슴' } }] },
      { type: 'gallery', assets: ['scene'], items: [{ asset: 'scene', alt: { ko: '사슴' } }] },
      { type: 'gallery', download: 'png', assets: ['deer'], items: [{ asset: 'deer', alt: { ko: '사슴', en: 'Deer' } }] },
      { type: 'gallery', download: 'png', assets: ['later'], items: [{ asset: 'later', alt: { ko: '사슴' } }] },
    ] };
    expect(characterPortraits([content])).toEqual({ 사슴: 'deer', Deer: 'deer' });
  });
});

describe('동화 언어', () => {
  it('제목만 번역되고 본문이 남은 언어는 목록에 노출하지 않는다', () => {
    const content: Content = { title: { ko: '제목', en: 'Title', th: 'ชื่อเรื่อง' }, blocks: [
      { type: 'section', template: 'steps', title: { ko: '흐름', en: 'Outline', th: 'โครงเรื่อง' }, items: [{ body: { ko: '내용', th: 'เนื้อหา' } }] },
      { type: 'text', hidden: true, text: { en: 'Hidden notes' } },
    ] };
    expect(storyLanguages(content)).toEqual(['ko', 'th']);
    content.blocks.push({ type: 'image', asset: 'art', caption: { ko: '설명', th: '   ' } });
    expect(storyLanguages(content)).toEqual(['ko']);
    expect(storyLanguages({ title: {}, blocks: [] })).toEqual([]);
  });
  it('한 언어로만 된 그림책과 다국어 본문을 구별하여 번역문을 숨기지 않는다', () => {
    const content: Content = { title: { ko: '제목', th: 'ชื่อเรื่อง' }, summary: {}, blocks: [
      { type: 'story_page', asset: 'thai-original', text: { th: 'เรื่องราว' } },
    ] };
    expect(storyLanguages(content)).toEqual(['th']);
    expect(hasMultilingualStoryText(content)).toBe(false);
    content.blocks = [{ type: 'story_page', asset: 'thai-original', text: { ko: '이야기', th: 'เรื่องราว' } }];
    expect(storyLanguages(content)).toEqual(['ko', 'th']);
    expect(hasMultilingualStoryText(content)).toBe(true);
  });
  it('성품과 캐릭터의 표시만 번역하고 사용자 정의 이름은 보존한다', () => {
    expect(storyTerm('경청 · 사슴', 'en')).toBe('Attentiveness · Deer');
    expect(storyTerm('용서 · 양', 'th')).toBe('การให้อภัย · แกะ');
    expect(storyTerm('경청 · 사슴', 'ko')).toBe('경청 · 사슴');
    expect(storyTerm('새로운 캐릭터', 'en')).toBe('새로운 캐릭터');
  });
});
