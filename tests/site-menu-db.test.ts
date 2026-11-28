/**
 * 126차(ADR 0046) — 두 단계 메뉴: 공개 사이트 메뉴 재료(app.public_site)에 공개된 판의 상위 메뉴와 메뉴 주소 구역이 실린다.
 * 숨긴 구역·공개 전 판·다른 학교 자료는 실리지 않는다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const site = await import('@/lib/site');

type S = { schoolId: string; userId: string };
let A: S; let B: S; let su: pg.Client;

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  for (const s of [A, B]) {
    await su.query(`insert into public.school_licenses(school_id, version, seats, modules, monthly_estimate_krw, price_snapshot, note, created_by)
                    select school_id, version + 1, seats, modules || '{homepage}', monthly_estimate_krw, price_snapshot, 'f126', created_by from public.school_licenses
                     where school_id = $1 order by version desc limit 1`, [s.schoolId]);
  }
  const settings = (slug: string) => ({ public_slug: slug, langs: ['ko'], default_lang: 'ko', theme: 'clear', site_title: { ko: slug }, is_open: true });
  await asUser(A.userId, (db) => site.saveSettings(db, A.schoolId, settings('menu-a')));
  await asUser(B.userId, (db) => site.saveSettings(db, B.schoolId, settings('menu-b')));
});
afterAll(async () => { await su.end(); await getPool().end(); });

async function page(s: S, key: string, content: Record<string, unknown>, sort: number) {
  const { id } = (await asUser(s.userId, (db) => site.createEntry(db, s.schoolId, { kind: 'page', key, content, sort })))!;
  await asUser(s.userId, (db) => site.publish(db, s.schoolId, id, undefined));
  return id;
}

describe('126차 두 단계 메뉴', () => {
  it('공개 사이트 메뉴 재료에 상위 메뉴·메뉴 주소 구역(숨김 제외, 쪽 안 순서)이 실린다', async () => {
    await page(A, 'about', { title: { ko: '학교 소개' }, blocks: [
      { type: 'section', template: 'cards', title: { ko: '인사말' }, anchor: 'greeting' },
      { type: 'section', template: 'cards', title: { ko: '숨긴 구역' }, anchor: 'secret', hidden: true },
      { type: 'heading', text: { ko: '오시는 길' }, anchor: 'way' },
      { type: 'text', text: { ko: '메뉴 주소 없음' } }] }, 1);
    await page(A, 'history', { title: { ko: '연혁' }, menu: { parent: 'about' }, blocks: [] }, 2);
    await page(B, 'b-only', { title: { ko: 'B 학교 쪽' }, blocks: [{ type: 'heading', text: { ko: 'B' }, anchor: 'b-sec' }] }, 1);
    const nav = (await site.publicSite('menu-a'))!.nav;
    expect(nav).toEqual([
      { key: 'about', title: { ko: '학교 소개' }, parent: null, sections: [{ anchor: 'greeting', title: { ko: '인사말' } }, { anchor: 'way', title: { ko: '오시는 길' } }] },
      { key: 'history', title: { ko: '연혁' }, parent: 'about', sections: [] },
    ]);
    expect(JSON.stringify((await site.publicSite('menu-b'))!.nav)).not.toContain('greeting');
  });
  it('공개하지 않은 새 판의 상위 메뉴는 공개될 때까지 메뉴에 실리지 않는다', async () => {
    const id = (await su.query(`select id from public.site_entries where school_id = $1 and key = 'history'`, [A.schoolId])).rows[0].id;
    await asUser(A.userId, (db) => site.saveVersion(db, A.schoolId, id, { content: { title: { ko: '연혁' }, blocks: [] } }));
    expect((await site.publicSite('menu-a'))!.nav.find((n) => n.key === 'history')!.parent).toBe('about');
    await asUser(A.userId, (db) => site.publish(db, A.schoolId, id, undefined));
    expect((await site.publicSite('menu-a'))!.nav.find((n) => n.key === 'history')!.parent).toBeNull();
  });
});
