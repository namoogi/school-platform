/** 48차: 공개 화면 → 교직원 로그인 → 그 쪽 화면 편집 (DB 없이 도는 규칙 시험) */
import { describe, expect, it } from 'vitest';
import { safeBack, safeNext } from '@/lib/next-path';
import { staffEditHref } from '@/components/site/SiteFrame';
import type { PublicSite } from '@/lib/site';

const site = (own = false): PublicSite => ({ slug: 'rungarunsuksa', school: 'x', default_lang: 'th', langs: ['th'], theme: 'dawn', title: {}, stories: true, has_news: true, nav: [], on_own_host: own });

describe('돌아갈 곳 검사', () => {
  it('로그인 뒤 경로는 이 사이트 안만', () => {
    expect(safeNext('/site/open?slug=a')).toBe('/site/open?slug=a');
    for (const bad of ['//evil.test/x', 'https://evil.test', '/\\evil', '', 'site']) expect(safeNext(bad)).toBeNull();
  });
  it('편집 뒤 돌아갈 곳은 공개 경로나 등록된 학교 주소만', () => {
    expect(safeBack('/s/rungarunsuksa/p/about')).toBe('/s/rungarunsuksa/p/about');
    expect(safeBack('https://rungarunsuksa.vercel.app/about')).toBe('https://rungarunsuksa.vercel.app/about');
    expect(safeBack('https://onschools.vercel.app/s/x')).toBe('https://onschools.vercel.app/s/x');
    for (const bad of ['https://evil.test/', 'http://rungarunsuksa.vercel.app/', '/site', '//evil.test']) expect(safeBack(bad)).toBeNull();
  });
});

describe('교직원 로그인 링크', () => {
  it('플랫폼 주소: 같은 주소의 /site/open, 돌아올 곳은 /s/…', () => {
    const u = new URL(staffEditHref(site(), '/p/about'), 'https://onschools.vercel.app');
    expect(u.pathname).toBe('/site/open');
    expect(Object.fromEntries(u.searchParams)).toEqual({ slug: 'rungarunsuksa', kind: 'page', key: 'about', back: '/s/rungarunsuksa/p/about' });
  });
  it('학교 주소: 플랫폼에서 로그인·편집하고 학교 주소로 돌아온다', () => {
    const h = staffEditHref(site(true), '/news/making');
    expect(h.startsWith('https://onschools.vercel.app/site/open?')).toBe(true);
    const q = new URL(h).searchParams;
    expect([q.get('kind'), q.get('key'), q.get('back')]).toEqual(['news', 'making', 'https://rungarunsuksa.vercel.app/news/making']);
    expect(new URL(staffEditHref(site(true), '')).searchParams.get('key')).toBe('home');
    expect(new URL(staffEditHref(site(true), '/stories')).searchParams.get('kind')).toBe('story');
  });
});
