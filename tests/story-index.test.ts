import { describe, expect, it } from 'vitest';
import { characterPortraits, groupStories } from '@/lib/story-index';
import type { Content } from '@/lib/site-shared';

describe('성품별 동화 책장', () => {
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
