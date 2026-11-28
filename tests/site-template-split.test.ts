// 133차: 여러 쪽 템플릿의 하위 메뉴는 별도 쪽이다(구역으로 내려가지 않는다). 한 쪽 구조만 구역 차례를 쓴다
import { describe, expect, it } from 'vitest';
import { SITE_TEMPLATES } from '@/lib/site-templates';
import { samplePages } from '@/lib/site-template-samples';
import { splitSubmenuPages } from '@/lib/site-template-split';
import { validateContent, type Block } from '@/lib/site';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteBlocks } from '@/components/site/SiteRenderer';

const anchorsOf = (blocks: Block[]) => blocks.filter((b) => (b as { anchor?: string }).anchor);
const hrefs = (v: unknown, out: string[] = []): string[] => {
  if (Array.isArray(v)) v.forEach((x) => hrefs(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (k === 'href' && typeof x === 'string') out.push(x); else hrefs(x, out); }
  return out;
};

describe('하위 메뉴 = 별도 쪽', () => {
  it('여러 쪽 템플릿에는 메뉴 주소(구역 하위 메뉴)가 남지 않고, 하위 쪽마다 상위 쪽이 있다', () => {
    for (const t of SITE_TEMPLATES.filter((x) => x.key !== 'single')) {
      const keys = new Set(t.pages.map((p) => p.key));
      expect(keys.size, t.key).toBe(t.pages.length);
      for (const p of t.pages) {
        expect(anchorsOf(p.content.blocks), `${t.key}/${p.key}`).toEqual([]);
        validateContent(p.content as never);
        const parent = p.content.menu?.parent;
        if (parent && parent !== 'news') {
          const up = t.pages.find((x) => x.key === parent);
          expect(up, `${t.key}/${p.key} → ${parent}`).toBeTruthy();
          expect(up!.content.menu?.parent, '한 단계만').toBeFalsy();
        }
      }
      expect(t.pages.some((p) => p.content.menu?.parent && p.content.menu.parent !== 'news'), t.key).toBe(true);
    }
  });
  it('상위 쪽 맨 앞에 하위 쪽 바로 가기가 있고, 옛 "쪽#구역" 링크는 새 쪽 주소로 바뀐다', () => {
    for (const t of SITE_TEMPLATES.filter((x) => x.key !== 'single')) {
      // 원본에서 메뉴 주소 구역이 있던 상위 쪽(나눈 쪽)
      const src = t.source ?? [];
      const split = new Set(src.filter((x) => x.key !== 'home' && !x.content.menu?.parent
        && (anchorsOf(x.content.blocks).length || src.some((c) => c.content.menu?.parent === x.key))).map((x) => x.key));
      expect(split.size, t.key).toBeGreaterThan(0);
      for (const p of t.pages.filter((x) => split.has(x.key))) {
        const kids = t.pages.filter((c) => c.content.menu?.parent === p.key).map((c) => `/p/${c.key}`);
        const first = p.content.blocks[0] as { variant?: string; items?: { href?: string }[] };
        expect(first.variant, `${t.key}/${p.key}`).toBe('quicklinks');
        expect(first.items?.map((i) => i.href)).toEqual(kids);
      }
      for (const pages of [t.pages.map((p) => p.content), Object.values(samplePages(t))]) {
        expect(hrefs(pages).filter((h) => /^\/p\/[a-z0-9-]+#/.test(h)), t.key).toEqual([]);
      }
    }
    const story = SITE_TEMPLATES.find((t) => t.key === 'story')!;
    expect(hrefs(story.pages.find((p) => p.key === 'home')!.content)).toContain('/p/day');
  });
  it('하위 쪽의 구역 제목은 남기고(표 설명·제목 구조), 화면에서 쪽 제목과 겹치는 제목만 감춘다', () => {
    const story = SITE_TEMPLATES.find((t) => t.key === 'story')!;
    const grades = story.pages.find((p) => p.key === 'grades')!.content;
    expect((grades.blocks[0] as { title?: { ko?: string } }).title?.ko).toBe('학년별 배움');
    const html = renderToStaticMarkup(createElement(SiteBlocks, { content: grades, lang: 'ko', fallback: 'ko', assetUrl: () => '' }));
    expect(html).toContain('<h2 class="site-h2 sr-only">학년별 배움</h2>');
    expect(html).toContain('<caption class="sr-only">학년별 배움</caption>');
    const other = renderToStaticMarkup(createElement(SiteBlocks, { content: { ...grades, title: { ko: '다른 제목' } }, lang: 'ko', fallback: 'ko', assetUrl: () => '' }));
    expect(other).toContain('<h2 class="site-h2">학년별 배움</h2>');
    // 신청 칸은 제목을 떼어 기본 제목을 쓴다
    const apply = story.pages.find((p) => p.key === 'apply')!.content.blocks[0] as { type: string; title?: unknown };
    expect(apply.type).toBe('inquiry');
    expect(apply.title).toBeUndefined();
  });
  it('프로젝트형: 원래 하위 쪽(학생 작품)만 있는 상위 쪽에도 바로 가기가 붙는다', () => {
    const project = SITE_TEMPLATES.find((t) => t.key === 'project')!;
    const first = project.pages.find((p) => p.key === 'projects')!.content.blocks[0] as { variant?: string; items?: { href?: string }[] };
    expect(first.variant).toBe('quicklinks');
    expect(first.items?.map((i) => i.href)).toEqual(['/p/works']);
  });
  it('한 쪽 구조(single)는 구역 차례를 그대로 쓴다', () => {
    const single = SITE_TEMPLATES.find((t) => t.key === 'single')!;
    expect(single.source).toBeUndefined();
    expect(anchorsOf(single.pages[0].content.blocks).length).toBeGreaterThan(0);
  });
  it('주소 이름이 겹치면 상위 쪽 이름을 앞에 붙이고, 홈·하위 쪽은 나누지 않는다', () => {
    const sec = (anchor: string): Block => ({ type: 'section', template: 'text', title: { ko: anchor }, anchor } as Block);
    const { pages } = splitSubmenuPages([
      { kind: 'page', key: 'home', sort: 0, content: { title: { ko: '홈' }, blocks: [sec('top')] } },
      { kind: 'page', key: 'about', sort: 1, content: { title: { ko: '소개' }, blocks: [sec('about'), sec('way')] } },
      { kind: 'page', key: 'note', sort: 2, content: { title: { ko: '알림' }, blocks: [sec('x')], menu: { parent: 'news' } } },
    ]);
    expect(pages.map((p) => [p.key, p.content.menu?.parent ?? null])).toEqual([['home', null], ['about', null], ['about-about', 'about'], ['way', 'about'], ['note', 'news']]);
    expect(pages.flatMap((p) => anchorsOf(p.content.blocks))).toEqual([]);
  });
});
