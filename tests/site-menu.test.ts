/** 126차(ADR 0046): 두 단계 메뉴 — 내용 검사(상위 메뉴·메뉴 주소)와 메뉴 나무 만들기. DB 없이 돈다 */
import { describe, expect, it } from 'vitest';
import { buildNavTree, navEntriesOf, validateContent, type NavEntry } from '@/lib/site';

const href = (k: string, a?: string) => `/p/${k}${a ? `#${a}` : ''}`;

describe('126차 메뉴 내용 검사', () => {
  it('상위 메뉴와 메뉴 주소를 받고 소문자로 고친다', () => {
    const c = validateContent({ title: { ko: '연혁' }, menu: { parent: 'About' }, blocks: [
      { type: 'section', template: 'cards', title: { ko: '오시는 길' }, anchor: 'Way' },
      { type: 'heading', text: { ko: '제목' } },
    ] });
    expect(c.menu).toEqual({ parent: 'about' });
    expect(c.blocks[0].anchor).toBe('way');
    expect(c.blocks[1].anchor).toBeUndefined();
  });
  it('메뉴 주소는 제목 있는 구역·제목·소식 목록·신청 칸에만', () => {
    expect(() => validateContent({ title: { ko: 'x' }, blocks: [{ type: 'image', asset: '00000000-0000-4000-8000-000000000001', anchor: 'photos' }] })).toThrow('제목이 있는');
    expect(() => validateContent({ title: { ko: 'x' }, blocks: [{ type: 'section', template: 'cards', anchor: 'no-title' }] })).toThrow('제목이 있는');
    expect(validateContent({ title: { ko: 'x' }, blocks: [{ type: 'inquiry', title: { ko: '상담 신청' }, anchor: 'apply' }] }).blocks[0].anchor).toBe('apply');
  });
  it('방문자에게 안 그려지는 구역(닫힌 신청 칸·소식 없는 소식 목록)은 메뉴에서 뺀다', () => {
    const pages = [{ key: 'admission', content: { title: { ko: '입학' }, blocks: [
      { type: 'inquiry' as const, title: { ko: '상담 신청' }, anchor: 'apply' },
      { type: 'news_list' as const, title: { ko: '입학 소식' }, count: 3, style: 'list' as const, anchor: 'news' }] } }];
    expect(navEntriesOf(pages, { inquiry: false, news: false })[0].sections).toEqual([]);
    expect(navEntriesOf(pages, { inquiry: true, news: true })[0].sections!.map((x) => x.anchor)).toEqual(['apply', 'news']);
  });
  it('빈 상위 메뉴는 남기지 않는다', () => {
    expect(validateContent({ title: { ko: 'x' }, menu: { parent: '' }, blocks: [] }).menu).toBeUndefined();
  });
  it('잘못된 상위 메뉴·메뉴 주소·같은 주소 두 번은 거부한다', () => {
    expect(() => validateContent({ title: { ko: 'x' }, menu: { parent: 'home' }, blocks: [] })).toThrow('상위 메뉴는');
    expect(() => validateContent({ title: { ko: 'x' }, menu: { parent: '학교' }, blocks: [] })).toThrow('상위 메뉴는');
    expect(() => validateContent({ title: { ko: 'x' }, blocks: [{ type: 'heading', text: { ko: 'a' }, anchor: '1way' }] })).toThrow('메뉴 주소는 영문');
    expect(() => validateContent({ title: { ko: 'x' }, blocks: [{ type: 'heading', text: { ko: 'a' }, anchor: 'site-main' }] })).toThrow('메뉴 주소는 영문');
    expect(() => validateContent({ title: { ko: 'x' }, blocks: [
      { type: 'heading', text: { ko: 'a' }, anchor: 'way' }, { type: 'heading', text: { ko: 'b' }, anchor: 'way' }] })).toThrow('두 번 있습니다');
  });
});

describe('126차 메뉴 나무', () => {
  const entries: NavEntry[] = [
    { key: 'about', title: { ko: '학교 소개' }, sections: [{ anchor: 'greeting', title: { ko: '인사말' } }, { anchor: 'way', title: { ko: '오시는 길' } }] },
    { key: 'history', title: { ko: '연혁' }, parent: 'about' },
    { key: 'learning', title: { ko: '배움' } },
    { key: 'letters', title: { ko: '가정통신문' }, parent: 'news' },
    { key: 'orphan', title: { ko: '없는 상위' }, parent: 'gone' },
    { key: 'deep', title: { ko: '세 단계' }, parent: 'history' },
  ];
  it('상위 = 상위 없는 쪽, 하위 = 메뉴 주소 구역 다음 하위 쪽', () => {
    const tree = buildNavTree(entries, href, { href: '/news', title: { ko: '소식' } });
    expect(tree.map((n) => n.key)).toEqual(['p:about', 'p:learning', 'p:orphan', 'p:deep', 'news']);
    expect(tree[0].children.map((c) => c.href)).toEqual(['/p/about#greeting', '/p/about#way', '/p/history']);
    expect(tree.find((n) => n.key === 'news')!.children.map((c) => c.key)).toEqual(['p:letters']);
  });
  it('소식이 없으면 소식 아래 쪽은 상위로 올라온다', () => {
    const tree = buildNavTree(entries, href);
    expect(tree.map((n) => n.key)).toContain('p:letters');
    expect(tree.some((n) => n.key === 'news')).toBe(false);
  });
  it('상위·하위 정보가 없으면 지금과 같은 한 줄 메뉴다', () => {
    const flat = buildNavTree([{ key: 'a', title: { ko: 'A' } }, { key: 'b', title: { ko: 'B' } }], href);
    expect(flat.map((n) => [n.key, n.children.length])).toEqual([['p:a', 0], ['p:b', 0]]);
  });
  it('쪽 내용에서 메뉴 재료를 만든다(숨긴 구역 제외, 홈 제외)', () => {
    const nav = navEntriesOf([
      { key: 'home', content: { title: { ko: '홈' }, blocks: [] } },
      { key: 'about', content: { title: { ko: '소개' }, blocks: [
        { type: 'section', template: 'cards', title: { ko: '인사말' }, anchor: 'greeting' },
        { type: 'section', template: 'cards', title: { ko: '숨김' }, anchor: 'hidden', hidden: true },
        { type: 'heading', text: { ko: '오시는 길' }, anchor: 'way' }] } },
      { key: 'history', content: { title: { ko: '연혁' }, blocks: [], menu: { parent: 'about' } } },
    ], { inquiry: true, news: true });
    expect(nav).toEqual([
      { key: 'about', title: { ko: '소개' }, parent: null, sections: [{ anchor: 'greeting', title: { ko: '인사말' } }, { anchor: 'way', title: { ko: '오시는 길' } }] },
      { key: 'history', title: { ko: '연혁' }, parent: 'about', sections: [] },
    ]);
  });
});
