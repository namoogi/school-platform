/** Layout regression checks. Actual geometry is checked separately in the browser. */
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { describe, expect, it, vi } from 'vitest';
import { SiteFrame } from '@/components/site/SiteFrame';
import { SiteBlocks } from '@/components/site/SiteRenderer';
import { cardLayout } from '@/components/site/card-layout';
import { SITE_TEMPLATES } from '@/lib/site-templates';
import { samplePages, sampleAssetUrl, sampleNews } from '@/lib/site-template-samples';
import type { PublicSite } from '@/lib/site';
import type { Content, SiteProfile } from '@/lib/site-shared';

// Next navigation is not mounted during static component rendering.
vi.mock('@/components/site/AutoCloseDetails', () => ({
  AutoCloseDetails: ({ className, summary, children }: { className: string; summary: React.ReactNode; children: React.ReactNode }) =>
    createElement('details', { className }, createElement('summary', null, summary), children),
}));
Object.assign(globalThis, { React });

const profile: SiteProfile = {
  tagline: { ko: '예시 소개' }, address: { ko: '합성 학교 주소' },
  phone: ['000-000-0000'], footer: { ko: '예시 학교 바닥 안내' },
};
function frame(theme: PublicSite['theme'], extra: { hidden?: boolean; profile?: SiteProfile } = {}) {
  const site: PublicSite = {
    slug: 'layout-example', school: '예시 학교', title: { ko: '예시 학교' }, theme,
    default_lang: 'ko', langs: ['ko'], stories: false, has_news: false,
    nav: [{ key: 'about', title: { ko: '소개' } }],
  };
  return parse(renderToStaticMarkup(createElement(SiteFrame, {
    site, lang: 'ko', current: 'home', path: '/', profile, children: null, ...extra,
  })));
}

describe('template layout boundaries', () => {
  it('dawn keeps the original three areas, with address before the phone and no new heading', () => {
    const dom = frame('dawn');
    const footer = dom.querySelector('.site-footer-grid')!;
    expect(footer.children.map((n) => n.getAttribute('class') ?? n.tagName)).toEqual([
      'site-footer-brand', 'NAV', 'site-footer-contact', 'site-footer-note',
    ]);
    expect(footer.querySelectorAll('h3')).toHaveLength(0);
    expect(footer.querySelector('.site-footer-contact')!.children.map((n) => n.text)).toEqual(['합성 학교 주소', '000-000-0000']);
    expect(dom.querySelector('.site-menu-kit')).toBeNull();
    expect(dom.querySelector('.site-visit')).toBeNull();
  });
  it('campus and hidden pages retain their simple footer and receive no kit contact action', () => {
    for (const dom of [frame('campus'), frame('ivory', { hidden: true })]) {
      expect(dom.querySelector('.site-footer-grid')).toBeNull();
      expect(dom.querySelector('.site-footer-inline')).not.toBeNull();
      expect(dom.querySelector('.site-visit')).toBeNull();
    }
  });
  it.each(['ivory', 'studio', 'play'] as const)('%s has four footer areas and a reachable contact action', (theme) => {
    const dom = frame(theme);
    expect(dom.querySelector('.site-footer-grid')!.children).toHaveLength(5);
    expect(dom.querySelector('.site-footer-contact h3')!.text).toBe('연락');
    expect(dom.querySelector('.site-footer-grid > nav')!.firstChild!.text).toBe('메뉴');
    expect(dom.querySelector('.site-footer-address p')!.text).toBe('합성 학교 주소');
    expect(dom.querySelector('.site-visit')!.getAttribute('href')).toBe('#site-contact');
    expect(dom.querySelector('#site-contact')).not.toBeNull();
    expect(dom.querySelector('.site-menu-kit')).not.toBeNull();
  });
  it('uses the existing footer contact text when structured contact details are absent; an explicit action takes priority', () => {
    const dom = frame('ivory', { profile: { address: profile.address, footer: profile.footer } });
    expect(dom.querySelector('#site-contact p')!.text).toBe('예시 학교 바닥 안내');
    expect(dom.querySelector('.site-footer-note')!.text).not.toContain('예시 학교 바닥 안내');
    const explicit = frame('ivory', { profile: { ...profile, visit: { label: { ko: '방문' }, href: '/p/visit' } } });
    expect(explicit.querySelector('.site-visit')!.getAttribute('href')).toBe('/s/layout-example/p/visit');
  });
  it('renders all 12 representative pages without changing stored blocks, including shared news and inquiry headings', () => {
    let count = 0;
    for (const template of SITE_TEMPLATES.filter((t) => ['story', 'project', 'kinder'].includes(t.key))) {
      for (const content of Object.values(samplePages(template))) {
        const before = JSON.stringify(content);
        const dom = parse(renderToStaticMarkup(createElement(SiteBlocks, {
          content, lang: 'ko', fallback: 'ko', assetUrl: sampleAssetUrl, news: sampleNews(),
          inquiry: { open: true, slug: null, page: 'example' },
        })));
        expect(dom.querySelectorAll('.sec-copy').every((el) => ['heading', 'stack'].includes(el.getAttribute('data-layout')!))).toBe(true);
        for (const heading of dom.querySelectorAll('.sec-copy[data-layout="heading"]')) {
          const action = heading.querySelector('.site-button, .site-link');
          if (action) expect(heading.lastChild).toBe(action);
        }
        expect(JSON.stringify(content)).toBe(before);
        for (const grid of dom.querySelectorAll('ul[data-layout="cards"]')) {
          expect(Number(grid.getAttribute('data-count'))).toBe(grid.children.length);
          expect(Number(grid.getAttribute('data-columns'))).toBe(cardLayout(grid.children.length)['data-columns']);
        }
        count++;
      }
    }
    expect(count).toBe(12);
  });
  it.each([[0, 1], [1, 1], [2, 2], [3, 3], [4, 4], [5, 3], [6, 3], [7, 3], [8, 4], [9, 3], [12, 4], [18, 3]])(
    '%i visible cards choose %i columns without changing stored items', (count, columns) => {
      expect(cardLayout(count)).toEqual({ 'data-count': count, 'data-columns': columns });
      for (const template of ['cards', 'photos'] as const) {
        const content: Content = { title: { en: 'Example' }, blocks: [{ type: 'section', template, variant: 'filter', items: Array.from({ length: count }, (_, i) => ({ title: { en: `Item ${i}` }, tag: { en: i % 2 ? 'B' : 'A' } })) }] };
        const before = JSON.stringify(content);
        const dom = parse(renderToStaticMarkup(createElement(SiteBlocks, { content, lang: 'en', fallback: 'en', assetUrl: sampleAssetUrl })));
        const grid = dom.querySelector('ul[data-layout="cards"]');
        if (count) {
          expect(grid!.getAttribute('data-count')).toBe(String(count));
          expect(grid!.getAttribute('data-columns')).toBe(String(columns));
          expect(grid!.children).toHaveLength(count);
        } else expect(grid).toBeNull();
        expect(JSON.stringify(content)).toBe(before);
      }
    },
  );
  it('footer menu spacing stays compact, top aligned, and at least 24px tall through tokens', () => {
    const ast = postcss.parse(`/* 100차:${readFileSync('src/app/globals.css', 'utf8').split('/* 100차:')[1]}`);
    const declarations = (suffix: string) => {
      const values: Record<string, string> = {};
      ast.walkRules((rule) => {
        if (rule.parent?.type === 'root' && rule.selector.endsWith(suffix)) rule.walkDecls((decl) => { values[decl.prop] = decl.value; });
      });
      return values;
    };
    expect(declarations('.site-footer-grid')['align-items']).toBe('start');
    expect(declarations('.site-footer-grid > nav')).toMatchObject({ 'align-content': 'start', 'row-gap': 'var(--t-space-2)' });
    expect(declarations('.site-footer-grid > nav a')['min-height']).toBe('var(--t-space-5)');
    expect(declarations('.site-footer-grid > nav h3')['margin-bottom']).toBe('var(--t-space-1)');
  });
  it('every rule in the new CSS layer explicitly excludes campus and dawn; spacing uses tokens', () => {
    const css = readFileSync('src/app/globals.css', 'utf8').split('/* 100차:')[1];
    const ast = postcss.parse(`/* 100차:${css}`);
    ast.walkRules((rule) => {
      for (const selector of rule.selectors) {
        expect(selector).toContain('.site[data-theme]:not([data-theme="campus"]):not([data-theme="dawn"])');
      }
      rule.walkDecls((decl) => {
        if (/^(padding|margin|gap|row-gap|column-gap)/.test(decl.prop)) expect(decl.value).not.toMatch(/\d+(px|rem|vw)/);
      });
    });
  });
});
