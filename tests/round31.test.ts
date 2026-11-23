/** 31차: 새벽빛 블록·사이트 정보·숨은 쪽 — 내용 검사, 공개 판 기준 그림 노출, 학교 간 분리 (합성 자료) */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const site = await import('@/lib/site');

let A: { schoolId: string; userId: string };
let B: { schoolId: string; userId: string };
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  for (const s of [A, B]) await asUser(s.userId, (db) => db.query(`select app.set_license($1, 5, array['intake','records','homepage','stories'])`, [s.schoolId]));
  await asUser(A.userId, (db) => site.saveSettings(db, A.schoolId, { public_slug: 'dawn-a', langs: ['th', 'en', 'ko'], default_lang: 'th', theme: 'dawn', site_title: { th: 'โรงเรียน A' }, is_open: true }));
  await asUser(B.userId, (db) => site.saveSettings(db, B.schoolId, { public_slug: 'dawn-b', langs: ['en'], default_lang: 'en', theme: 'campus', site_title: { en: 'School B' }, is_open: true }));
});
afterAll(async () => { await getPool().end(); });

const base = { title: { th: 'หน้า' } };

describe('31차 내용 검사', () => {
  it('잡지형 구역·최근 소식·갤러리 묶음을 받는다', () => {
    const c = site.validateContent({ ...base, blocks: [
      { type: 'section', template: 'cards', title: { th: 'การ์ด' }, items: [{ title: { th: 'หนึ่ง' }, href: '/p/about' }], button: { label: { th: 'ดู' }, href: 'https://example.com/x' } },
      { type: 'news_list', count: 4, style: 'list' },
      { type: 'gallery', items: [{ asset: '00000000-0000-4000-8000-000000000001', category: 'art', alt: { en: 'A' } }], filters: [{ key: 'art', label: { en: 'Art' } }] },
    ] });
    expect(c.blocks[0]).toMatchObject({ type: 'section', template: 'cards', items: [{ href: '/p/about' }] });
    expect(c.blocks[2]).toMatchObject({ type: 'gallery', assets: ['00000000-0000-4000-8000-000000000001'] });
  });

  it('위험한 링크·모르는 구역 모양·틀린 전화·묶음 이름은 거부한다', () => {
    const bad = (blocks: unknown[], extra: Record<string, unknown> = {}) => () => site.validateContent({ ...base, ...extra, blocks });
    expect(bad([{ type: 'section', template: 'cta', button: { label: { th: 'x' }, href: 'javascript:alert(1)' } }])).toThrow('링크');
    expect(bad([{ type: 'section', template: 'cta', button: { label: { th: 'x' }, href: 'http://example.com' } }])).toThrow('링크');
    expect(bad([{ type: 'section', template: 'marquee' }])).toThrow('구역 모양');
    expect(bad([{ type: 'news_list', count: 50 }])).toThrow('1~10');
    expect(bad([{ type: 'gallery', items: [{ asset: '00000000-0000-4000-8000-000000000001', category: 'Art Room' }] }])).toThrow('묶음');
    expect(bad([], { site: { phone: ['<script>'] } })).toThrow('전화');
    expect(bad([], { site: { facebook: 'javascript:x' } })).toThrow('링크');
  });
});

describe('31차 사이트 정보·숨은 쪽', () => {
  it('로고는 첫 화면 판이 공개된 뒤에만 방문자에게 보인다', async () => {
    const { id: logo } = (await asUser(A.userId, (db) => site.uploadAsset(db, A.schoolId, { name: 'logo.png', type: 'image/png', bytes: PNG })))!;
    const { id: home } = (await asUser(A.userId, (db) => site.createEntry(db, A.schoolId, {
      kind: 'page', key: 'home', sort: 0, note: '기존 홈페이지 가져오기',
      content: { ...base, head: { layout: 'opening' }, site: { logo, phone: ['000-0000000'], address: { th: 'ที่อยู่' } }, blocks: [] },
    })))!;
    expect(await site.publicAsset('dawn-a', logo)).toBeNull();
    await asUser(A.userId, (db) => site.publish(db, A.schoolId, home, undefined));
    expect((await site.publicAsset('dawn-a', logo))!.mime).toBe('image/png');
    const e = (await site.publicEntry('dawn-a', 'page', 'home'))!;
    expect(e.content.site).toMatchObject({ logo, phone: ['000-0000000'] });
    expect(e.content.head).toEqual({ layout: 'opening' });
    // 다른 학교 주소로는 같은 그림이 나오지 않는다
    expect(await site.publicAsset('dawn-b', logo)).toBeNull();
  });

  it('숨은 쪽(후원자)은 주소로만 열리고 메뉴에 나오지 않는다. 정렬 순서가 메뉴 차례가 된다', async () => {
    const mk = (key: string, sort: number, visibility = 'public') => asUser(A.userId, (db) => site.createEntry(db, A.schoolId, { kind: 'page', key, sort, visibility, content: { title: { th: key, ko: key }, blocks: [] } }));
    for (const [k, s, v] of [['contact', 70], ['about', 10], ['friends', 900, 'unlisted']] as const) {
      const { id } = (await mk(k, s, v))!;
      await asUser(A.userId, (db) => site.publish(db, A.schoolId, id, undefined));
    }
    expect((await site.publicSite('dawn-a'))!.nav.map((n) => n.key)).toEqual(['about', 'contact']);
    expect((await site.publicEntry('dawn-a', 'page', 'friends'))!.visibility).toBe('unlisted');
  });

  it('동화의 그림 안 글 표시는 항목 정보에 남는다', async () => {
    const { id } = (await asUser(A.userId, (db) => site.createEntry(db, A.schoolId, { kind: 'story', key: 'rain', text_in_image: true, character: 'ช้าง · หมี', content: { title: { th: 'ฝน' }, blocks: [] } })))!;
    const d = await asUser(A.userId, (db) => site.getEntry(db, A.schoolId, id));
    expect(d!.entry.meta).toMatchObject({ text_in_image: 'true', character: 'ช้าง · หมี' });
  });

  it('동화의 성품 이름·주인공은 만든 뒤에도 학교 관리자가 고친다. 그림 안 글 표시는 남고, 다른 학교는 못 고친다', async () => {
    const story = (await asUser(A.userId, (db) => site.listEntries(db, A.schoolId))).find((e) => e.key === 'rain')!;
    await asUser(A.userId, (db) => site.updateEntry(db, A.schoolId, story.id, { virtue: ' 우정 · 함께함 ', character: 'ช้าง' }));
    const d = await asUser(A.userId, (db) => site.getEntry(db, A.schoolId, story.id));
    expect(d!.entry.meta).toMatchObject({ virtue: '우정 · 함께함', character: 'ช้าง', text_in_image: 'true' });
    await expect(asUser(B.userId, (db) => site.updateEntry(db, B.schoolId, story.id, { virtue: 'x' }))).rejects.toThrow();
    // 쪽에는 성품 정보가 붙지 않는다
    const page = (await asUser(A.userId, (db) => site.listEntries(db, A.schoolId))).find((e) => e.key === 'about')!;
    await asUser(A.userId, (db) => site.updateEntry(db, A.schoolId, page.id, { virtue: 'x' }));
    expect((await asUser(A.userId, (db) => site.getEntry(db, A.schoolId, page.id)))!.entry.meta).toEqual({});
  });

  it('B 학교는 A 학교 항목에 새 판을 더할 수 없다 (가져오기의 새 판 경로)', async () => {
    const aHome = (await asUser(A.userId, (db) => site.listEntries(db, A.schoolId))).find((e) => e.key === 'home')!;
    await expect(asUser(B.userId, (db) => site.saveVersion(db, B.schoolId, aHome.id, { content: { ...base, blocks: [] } }))).rejects.toThrow();
    const bList = await asUser(B.userId, (db) => site.listEntries(db, B.schoolId));
    expect(bList.some((e) => e.id === aHome.id)).toBe(false);
  });
});
