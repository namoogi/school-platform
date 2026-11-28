/**
 * 122차 (사용자 지시 2026-11-28): 공개 창의 사진 공개 허가 확인.
 * - 사진이 든 판은 확인(photoConsent) 없이 공개되지 않는다. 확인하면 시각·사진 목록이 공개 기록에 남는다.
 * - 사진이 없는 판(또는 PDF만 있는 판)은 확인 없이 공개된다. 공개 내림은 확인이 필요 없다.
 * - 공개 창의 사진 목록(publishPhotos)은 이 학교 항목만 (양방향).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const site = await import('@/lib/site');

let A: { schoolId: string; userId: string };
let B: { schoolId: string; userId: string };
let img: string;
let withPhoto: string;
let noPhoto: string;
let bEntry: string;
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

async function sql(q: string, params: unknown[] = []) {
  const c = new pg.Client({ connectionString: TEST_URL });
  await c.connect();
  try { return (await c.query(q, params)).rows; } finally { await c.end(); }
}
const lastPub = async (entryId: string) => (await sql(
  'select version_id, published_by, photo_consent_at, photo_consent_assets from public.site_publications where entry_id = $1 order by id desc limit 1', [entryId]))[0];

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  for (const S of [A, B]) {
    await asUser(S.userId, (db) => db.query(`select app.set_license($1, 5, array['intake','records','homepage'])`, [S.schoolId]));
    await asUser(S.userId, (db) => site.saveSettings(db, S.schoolId, { public_slug: S === A ? 'consent-a' : 'consent-b', langs: ['ko'], default_lang: 'ko', is_open: true }));
  }
  img = (await asUser(A.userId, (db) => site.uploadAsset(db, A.schoolId, { name: 'class.png', type: 'image/png', bytes: PNG })))!.id;
  withPhoto = (await asUser(A.userId, (db) => site.createEntry(db, A.schoolId, { kind: 'news', key: 'field-day', content: {
    title: { ko: '체육 대회' }, cover: img,
    blocks: [{ type: 'image', asset: img }, { type: 'section', template: 'cards', items: [{ title: { ko: '카드' }, asset: img }] }],
  } })))!.id;
  noPhoto = (await asUser(A.userId, (db) => site.createEntry(db, A.schoolId, { kind: 'page', key: 'about', content: { title: { ko: '학교 소개' }, blocks: [{ type: 'text', text: { ko: '글만 있음' } }] } })))!.id;
  bEntry = (await asUser(B.userId, (db) => site.createEntry(db, B.schoolId, { kind: 'page', key: 'about', content: { title: { ko: 'B 소개' }, blocks: [] } })))!.id;
});
afterAll(async () => { await getPool().end(); });

describe('공개 창: 사진 공개 허가 확인', () => {
  it('공개 창은 그 판의 사진을 한 번씩 보여 준다(겉표지·그림·카드 사진 같은 그림은 하나로)', async () => {
    const r = await asUser(A.userId, (db) => site.publishPhotos(db, A.schoolId, { targets: [{ entryId: withPhoto }, { entryId: noPhoto }] }));
    expect(r.photos).toEqual([{ id: img, name: 'class.png' }]);
    expect(r.entries.map((e) => e.photos.length)).toEqual([1, 0]);
  });

  it('사진이 든 판은 확인 없이 공개되지 않는다(방문자에게도 안 보임)', async () => {
    await expect(asUser(A.userId, (db) => site.publish(db, A.schoolId, withPhoto, undefined))).rejects.toThrow('공개 허가');
    await expect(asUser(A.userId, (db) => site.publish(db, A.schoolId, withPhoto, undefined, { photoConsent: false }))).rejects.toThrow('공개 허가');
    expect(await site.publicEntry('consent-a', 'news', 'field-day')).toBeNull();
  });

  it('확인하면 공개되고, 확인한 사람·시각·사진 목록이 공개 기록에 남는다', async () => {
    const r = await asUser(A.userId, (db) => site.publish(db, A.schoolId, withPhoto, undefined, { photoConsent: true }));
    expect(r).toMatchObject({ ok: true, photos: 1 });
    const p = await lastPub(withPhoto);
    expect(p.published_by).toBe(A.userId);
    expect(p.photo_consent_at).not.toBeNull();
    expect(p.photo_consent_assets).toEqual([img]);
    expect((await site.publicEntry('consent-a', 'news', 'field-day'))!.version).toBe(1);
  });

  it('사진 없는 판은 확인 없이 공개되고 확인 칸은 비어 있다 · 공개 내림도 확인이 필요 없다', async () => {
    await asUser(A.userId, (db) => site.publish(db, A.schoolId, noPhoto, undefined));
    expect(await lastPub(noPhoto)).toMatchObject({ photo_consent_at: null, photo_consent_assets: null });
    await asUser(A.userId, (db) => site.publish(db, A.schoolId, withPhoto, null));
    expect(await lastPub(withPhoto)).toMatchObject({ version_id: null, photo_consent_at: null });
  });

  it('확인 기록은 짝으로만 남고, 공개 기록은 고칠 수 없다', async () => {
    await expect(sql(`insert into public.site_publications(school_id, entry_id, version_id, published_by, photo_consent_at) select school_id, entry_id, version_id, published_by, now() from public.site_publications where entry_id = $1 limit 1`, [noPhoto])).rejects.toThrow();
    await expect(sql(`update public.site_publications set photo_consent_assets = null where entry_id = $1`, [withPhoto])).rejects.toThrow();
  });
});

describe('다른 학교 항목은 공개 창에서도 다룰 수 없다 (양방향)', () => {
  it('B → A 항목 사진 목록·공개 거부', async () => {
    await expect(asUser(B.userId, (db) => site.publishPhotos(db, B.schoolId, { targets: [{ entryId: withPhoto }] }))).rejects.toThrow('찾을 수 없');
    await expect(asUser(B.userId, (db) => site.publish(db, B.schoolId, withPhoto, undefined, { photoConsent: true }))).rejects.toThrow();
  });
  it('A → B 항목 사진 목록·공개 거부', async () => {
    await expect(asUser(A.userId, (db) => site.publishPhotos(db, A.schoolId, { targets: [{ entryId: bEntry }] }))).rejects.toThrow('찾을 수 없');
    await expect(asUser(A.userId, (db) => site.publish(db, A.schoolId, bEntry, undefined, { photoConsent: true }))).rejects.toThrow();
  });
});
