/** 27차: 학교 홈페이지 · 성품 동화 — 공개된 판만 방문자에게, 학교 간 분리, 라이선스 기능 확인, 판 보존 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const site = await import('@/lib/site');

let A: { schoolId: string; userId: string };
let B: { schoolId: string; userId: string };
let T: string; // A 학교 교사
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

async function sql(q: string, params: unknown[] = []) {
  const c = new pg.Client({ connectionString: TEST_URL });
  await c.connect();
  try { return (await c.query(q, params)).rows; } finally { await c.end(); }
}

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  // A 학교만 홈페이지·성품 동화 기능을 켠다 (학교 관리자가 라이선스 변경)
  await asUser(A.userId, (db) => db.query(`select app.set_license($1, 5, array['intake','records','homepage','stories'])`, [A.schoolId]));
  T = (await sql(`insert into private.app_users(email, display_name) values ('teacher-a@school-a.test', '예시 교사') returning id`))[0].id;
  await sql(`insert into public.memberships(school_id, user_id, role) values ($1, $2, 'teacher')`, [A.schoolId, T]);
});
afterAll(async () => { await getPool().end(); });

const about = (t: string) => ({ title: { ko: t, en: 'About' }, blocks: [{ type: 'text', text: { ko: `${t} 본문` } }] });

describe('학교 홈페이지', () => {
  it('설정을 열기 전에는 방문자에게 사이트가 없다', async () => {
    expect(await site.publicSite('school-a-site')).toBeNull();
    await asUser(A.userId, (db) => site.saveSettings(db, A.schoolId, { public_slug: 'school-a-site', langs: ['ko', 'en'], default_lang: 'ko', site_title: { ko: '드리미 예시학교' }, is_open: false }));
    expect(await site.publicSite('school-a-site')).toBeNull();
    await asUser(A.userId, (db) => site.saveSettings(db, A.schoolId, { public_slug: 'school-a-site', langs: ['ko', 'en'], default_lang: 'ko', site_title: { ko: '드리미 예시학교' }, is_open: true }));
    expect(await site.publicSite('school-a-site')).toMatchObject({ slug: 'school-a-site', default_lang: 'ko', langs: ['ko', 'en'], nav: [] });
  });

  it('시안은 방문자에게 안 보이고, 공개한 판만 보인다. 새 판을 만들어도 공개본은 그대로', async () => {
    const { id } = (await asUser(A.userId, (db) => site.createEntry(db, A.schoolId, { kind: 'page', key: 'about', content: about('학교 소개') })))!;
    expect(await site.publicEntry('school-a-site', 'page', 'about')).toBeNull();
    await asUser(A.userId, (db) => site.publish(db, A.schoolId, id, undefined));
    expect((await site.publicEntry('school-a-site', 'page', 'about'))!.content.title.ko).toBe('학교 소개');
    await asUser(A.userId, (db) => site.saveVersion(db, A.schoolId, id, { content: about('학교 소개 2판') }));
    expect((await site.publicEntry('school-a-site', 'page', 'about'))!.version).toBe(1);
    expect((await asUser(A.userId, (db) => site.listEntries(db, A.schoolId))).find((e) => e.id === id)!.status).toBe('changed');
    await asUser(A.userId, (db) => site.publish(db, A.schoolId, id, undefined));
    expect((await site.publicEntry('school-a-site', 'page', 'about'))!.content.title.ko).toBe('학교 소개 2판');
    expect((await site.publicSite('school-a-site'))!.nav).toEqual([{ key: 'about', title: { ko: '학교 소개 2판', en: 'About' }, parent: null, sections: [] }]);
    // 공개 내림
    await asUser(A.userId, (db) => site.publish(db, A.schoolId, id, null));
    expect(await site.publicEntry('school-a-site', 'page', 'about')).toBeNull();
    expect((await asUser(A.userId, (db) => site.listEntries(db, A.schoolId))).find((e) => e.id === id)!.status).toBe('hidden');
  });

  it('판·공개 기록은 고치거나 지울 수 없다', async () => {
    await expect(sql(`update public.site_entry_versions set content = '{}'`)).rejects.toThrow();
    await expect(sql(`delete from public.site_publications`)).rejects.toThrow();
  });

  it('교사는 시안을 만들고 판을 더할 수 있지만 공개는 못 한다', async () => {
    const { id } = (await asUser(T, (db) => site.createEntry(db, A.schoolId, { kind: 'story', key: 'brave-elephant', virtue: '용기', character: '코끼리', content: { title: { ko: '용감한 코끼리' }, blocks: [{ type: 'story_page', text: { ko: '첫 쪽' } }] } })))!;
    await asUser(T, (db) => site.saveVersion(db, A.schoolId, id, { content: { title: { ko: '용감한 코끼리' }, blocks: [{ type: 'story_page', text: { ko: '고친 첫 쪽' } }] } }));
    await expect(asUser(T, (db) => site.publish(db, A.schoolId, id, undefined))).rejects.toThrow('권한');
    await asUser(A.userId, (db) => site.publish(db, A.schoolId, id, undefined));
    const list = await site.publicList('school-a-site', 'story');
    expect(list.map((s) => s.key)).toEqual(['brave-elephant']);
    expect(list[0].meta).toEqual({ virtue: '용기', character: '코끼리' });
  });

  it('다른 학교 구성원은 읽지도 쓰지도 못한다 (양방향)', async () => {
    expect(await asUser(B.userId, (db) => site.listEntries(db, A.schoolId))).toEqual([]);
    expect(await asUser(B.userId, (db) => site.getSettings(db, A.schoolId))).toBeNull();
    await expect(asUser(B.userId, (db) => site.createEntry(db, A.schoolId, { kind: 'page', key: 'x', content: about('침입') }))).rejects.toThrow();
    // A도 B 학교에는 못 쓴다 (B는 기능도 꺼져 있음)
    await expect(asUser(A.userId, (db) => site.createEntry(db, B.schoolId, { kind: 'page', key: 'x', content: about('침입') }))).rejects.toThrow();
    await expect(asUser(B.userId, (db) => site.saveSettings(db, B.schoolId, { public_slug: 'school-b-site', langs: ['en'], default_lang: 'en', is_open: true }))).rejects.toThrow('라이선스');
  });

  it('그림은 지금 공개된 판이 가리킬 때만 방문자에게 내준다', async () => {
    const { id: img } = (await asUser(A.userId, (db) => site.uploadAsset(db, A.schoolId, { name: 'dot.png', type: 'image/png', bytes: PNG })))!;
    const { id } = (await asUser(A.userId, (db) => site.createEntry(db, A.schoolId, { kind: 'news', key: 'open-day', content: { title: { ko: '공개 수업' }, cover: img, blocks: [{ type: 'image', asset: img }] } })))!;
    expect(await site.publicAsset('school-a-site', img)).toBeNull();
    await asUser(A.userId, (db) => site.publish(db, A.schoolId, id, undefined, { photoConsent: true }));
    expect((await site.publicAsset('school-a-site', img))!.mime).toBe('image/png');
    await expect(asUser(A.userId, (db) => site.uploadAsset(db, A.schoolId, { name: 'x.svg', type: 'image/svg+xml', bytes: Buffer.from('<svg/>') }))).rejects.toThrow('PNG');
  });

  it('라이선스에서 홈페이지 기능을 끄면 공개 사이트도 닫힌다', async () => {
    await asUser(A.userId, (db) => db.query(`select app.set_license($1, 5, array['intake','records'])`, [A.schoolId]));
    expect(await site.publicSite('school-a-site')).toBeNull();
    expect(await site.publicList('school-a-site', 'story')).toEqual([]);
    await asUser(A.userId, (db) => db.query(`select app.set_license($1, 5, array['intake','records','homepage','stories'])`, [A.schoolId]));
    expect(await site.publicSite('school-a-site')).not.toBeNull();
  });

  it('영상은 허용한 주소만, 내용 형식은 검사한다', () => {
    expect(() => site.validateContent({ title: { ko: 'x' }, blocks: [{ type: 'video', url: { ko: 'https://evil.example/v' } }] })).toThrow('YouTube');
    expect(() => site.validateContent({ title: {}, blocks: [] })).toThrow('제목');
    expect(site.validateContent({ title: { th: 'นิทาน' }, blocks: [{ type: 'video', url: { th: 'https://youtu.be/abc' } }] }).blocks[0]).toEqual({ type: 'video', url: { th: 'https://youtu.be/abc' } });
  });
});
