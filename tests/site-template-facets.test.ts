// 134차(ADR 0050): 템플릿 세 축(메뉴 구조·첫 화면·내용) 거르기와 메뉴 구조(옆 메뉴·따라오는 차례)
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SITE_TEMPLATES } from '@/lib/site-templates';
import { CONTENT_KINDS, facetCounts, filterTemplates, FIRST_SCREENS, NAV_LAYOUTS } from '@/lib/site-template-facets';
import { validateContent, type PublicSite } from '@/lib/site';
import { SiteFrame } from '@/components/site/SiteFrame';
import { CATALOG } from '@/lib/i18n/catalog';

describe('템플릿 세 축', () => {
  it('모든 템플릿이 세 축 값을 갖고, 이름표가 있다', () => {
    for (const t of SITE_TEMPLATES) {
      expect(NAV_LAYOUTS, t.key).toContain(t.nav);
      expect(FIRST_SCREENS, t.key).toContain(t.first);
      expect(t.contents.length, t.key).toBeGreaterThan(0);
      for (const c of t.contents) expect(CONTENT_KINDS).toContain(c);
    }
    for (const [axis, values] of [['nav', NAV_LAYOUTS], ['first', FIRST_SCREENS], ['content', CONTENT_KINDS]] as const) {
      expect(CATALOG).toHaveProperty(`site.facet.${axis}`);
      for (const v of values) expect(CATALOG, `${axis}.${v}`).toHaveProperty(`site.facet.${axis}.${v}`);
    }
  });
  it('거르기는 칸끼리 함께 적용하고, 모르는 값은 거르지 않는다', () => {
    expect(filterTemplates(SITE_TEMPLATES, {}).length).toBe(SITE_TEMPLATES.length);
    expect(filterTemplates(SITE_TEMPLATES, { nav: 'onepage' }).map((t) => t.key)).toEqual(['single']);
    expect(filterTemplates(SITE_TEMPLATES, { content: 'admission' }).map((t) => t.key)).toEqual(['admissions', 'international']);
    expect(filterTemplates(SITE_TEMPLATES, { content: 'admission', first: 'landing', nav: 'top' }).map((t) => t.key)).toEqual(['admissions', 'international']);
    expect(filterTemplates(SITE_TEMPLATES, { nav: 'side', content: 'kinder' })).toEqual([]);
    expect(filterTemplates(SITE_TEMPLATES, { nav: 'zzz' }).length).toBe(SITE_TEMPLATES.length);
    const c = facetCounts(SITE_TEMPLATES, { content: 'admission' });
    expect(c.nav).toMatchObject({ top: 2, side: 0, onepage: 0 });
  });
  it('메뉴 구조가 위 메뉴가 아니면 홈 사이트 정보에 적히고, 검사기가 값을 확인한다', () => {
    const home = (k: string) => SITE_TEMPLATES.find((t) => t.key === k)!.pages.find((p) => p.key === 'home')!.content;
    expect(home('notice').site?.layout).toBe('side');
    expect(home('single').site?.layout).toBe('onepage');
    expect(home('story').site?.layout).toBeUndefined();
    expect(validateContent(home('notice') as never).site?.layout).toBe('side');
    expect(() => validateContent({ ...home('notice'), site: { layout: 'mega' } } as never)).toThrow();
    expect(validateContent({ ...home('story'), site: { layout: 'top' } } as never).site?.layout).toBeUndefined();
  });
});

describe('메뉴 구조 그리기', () => {
  const site = (over: Partial<PublicSite> = {}): PublicSite => ({
    slug: 'x', school: '예시', default_lang: 'ko', langs: ['ko'], theme: 'clear', title: { ko: '예시학교' }, stories: false, has_news: false, inquiry_open: false,
    nav: [{ key: 'about', title: { ko: '학교 소개' } }, { key: 'greeting', title: { ko: '인사말' }, parent: 'about' }, { key: 'way', title: { ko: '오시는 길' }, parent: 'about' }, { key: 'contact', title: { ko: '문의' } }],
    home_sections: [{ anchor: 'intro', title: { ko: '소개' } }, { anchor: 'join', title: { ko: '함께하기' } }],
    ...over,
  } as PublicSite);
  const html = (layout: 'side' | 'onepage' | undefined, current: string, over?: Partial<PublicSite>) =>
    renderToStaticMarkup(createElement(SiteFrame, { site: site(over), lang: 'ko', current, path: '/', profile: layout ? { layout } : {}, children: createElement('p', null, '본문') }));
  it('옆 메뉴형: 하위 쪽이 있는 묶음 안에서만 형제 쪽 메뉴가 붙고, 지금 쪽을 표시한다', () => {
    const h = html('side', 'p:way');
    expect(h).toContain('data-testid="site-side"');
    expect(h).toMatch(/class="site-localnav"[^>]*aria-label="학교 소개"/);
    expect(h).toContain(`<a aria-current="page" href="/s/x/p/way">오시는 길</a>`);
    expect(html('side', 'p:contact')).not.toContain('site-side'); // 하위 쪽 없는 상위 쪽
    expect(html('side', 'home')).not.toContain('site-side');
    expect(html(undefined, 'p:way')).not.toContain('site-side'); // 위 메뉴형
    expect(html('side', 'p:way', { theme: 'campus' })).not.toContain('site-side'); // 키트 테마만
  });
  it('한 쪽 스크롤형: 홈에서만 구역 차례가 따라온다', () => {
    const h = html('onepage', 'home');
    expect(h).toContain('data-testid="site-toc"');
    expect(h).toMatch(/href="[^"]*#intro"[^>]*>소개<\/a>/);
    expect(html('onepage', 'p:about')).not.toContain('site-toc');
    expect(html(undefined, 'home')).not.toContain('site-toc');
  });
});
