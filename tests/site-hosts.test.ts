/** 47차: 학교 자체 주소 → 공개 홈페이지 (ADR 0023) — DB 없이 도는 경로 규칙 시험 */
import { describe, expect, it } from 'vitest';
import { friendsKey, hostForSlug, hostLink, routeSchoolHost, slugForHost } from '@/lib/site-hosts';

describe('학교 자체 주소', () => {
  it('주소 ↔ 학교', () => {
    expect(slugForHost('rungarunsuksa.vercel.app')).toBe('rungarunsuksa');
    expect(slugForHost('RungArunSuksa.vercel.app:443')).toBe('rungarunsuksa');
    expect(slugForHost('onschools.vercel.app')).toBeNull();
    expect(slugForHost(null)).toBeNull();
    expect(hostForSlug('rungarunsuksa')).toBe('rungarunsuksa.vercel.app');
    expect(hostForSlug('school-a-site')).toBeNull();
  });

  it('옛 주소가 모두 같은 자리로 열린다(넘겨주기 없이)', () => {
    const r = (p: string) => routeSchoolHost('rungarunsuksa', p);
    expect(r('/')).toEqual({ kind: 'rewrite', to: '/s/rungarunsuksa' });
    for (const k of ['about', 'admissions', 'contact', 'curriculum', 'gallery', 'life']) expect(r(`/${k}`)).toEqual({ kind: 'rewrite', to: `/s/rungarunsuksa/p/${k}` });
    expect(r('/news')).toEqual({ kind: 'rewrite', to: '/s/rungarunsuksa/news' });
    expect(r('/news/making')).toEqual({ kind: 'rewrite', to: '/s/rungarunsuksa/news/making' });
    expect(r('/p/about')).toEqual({ kind: 'rewrite', to: '/s/rungarunsuksa/p/about' });
    expect(r('/friends')).toEqual({ kind: 'rewrite', to: '/s/rungarunsuksa/p/friends', defaultLang: 'ko' });
    expect(r('/friends/letters/welcome')).toEqual({ kind: 'rewrite', to: '/s/rungarunsuksa/p/friends-letter-welcome', defaultLang: 'ko' });
    expect(r('/friends/connect')).toMatchObject({ to: '/s/rungarunsuksa/p/friends-connect' });
    expect(r('/stories/after-the-rain')).toEqual({ kind: 'rewrite', to: '/s/rungarunsuksa/stories/after-the-rain' });
  });

  it('그림·정적 파일은 그대로, 관리 화면은 플랫폼 주소로', () => {
    const r = (p: string) => routeSchoolHost('rungarunsuksa', p);
    expect(r('/s/rungarunsuksa/a/1234')).toEqual({ kind: 'pass' });
    expect(r('/_next/static/x.js')).toEqual({ kind: 'pass' });
    expect(r('/assets/school-logo.jpg')).toEqual({ kind: 'pass' });
    expect(r('/login')).toEqual({ kind: 'platform', to: 'https://onschools.vercel.app/login' });
    expect(r('/auth/dreami')).toEqual({ kind: 'platform', to: 'https://onschools.vercel.app/login' });
    expect(r('/admin/control')).toEqual({ kind: 'platform', to: 'https://onschools.vercel.app/admin/control' });
    expect(r('/site')).toMatchObject({ kind: 'platform' });
  });

  it('링크 모양과 후원자 주소 규칙', () => {
    expect(hostLink('/p/about')).toBe('/about');
    expect(hostLink('/p/news')).toBe('/p/news'); // 고정 경로와 겹치면 그대로
    expect(hostLink('/news/making')).toBe('/news/making');
    expect(friendsKey([])).toBe('friends');
    expect(friendsKey(['admin'])).toBe('friends');
    expect(friendsKey(['letters', 'learning'])).toBe('friends-letter-learning');
  });
});
