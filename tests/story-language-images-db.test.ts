import { afterAll, beforeAll, expect, it } from 'vitest';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';
process.env.DATABASE_URL = TEST_URL;
const { asUser, asAgent, getPool } = await import('@/lib/db');
const site = await import('@/lib/site');
const agent = await import('@/lib/agent');
let A: { schoolId: string; userId: string };
let B: typeof A;
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb(); ({ A, B } = await lookupIds());
  for (const X of [A, B]) await asUser(X.userId, (db) => db.query(`select app.set_license($1, 5, array['intake','records','homepage','stories'])`, [X.schoolId]));
  await asUser(A.userId, (db) => site.saveSettings(db, A.schoolId, { public_slug: 'image-language-test', langs: ['ko', 'th', 'en'], default_lang: 'ko', is_open: true }));
});
afterAll(async () => { await getPool().end(); });

it('언어별 그림은 사람·작업 토큰 모두 같은 학교 파일만 저장하며 공개 전에는 노출하지 않는다', async () => {
  const upload = (X: typeof A) => asUser(X.userId, (db) => site.uploadAsset(db, X.schoolId, { name: 'synthetic.png', type: 'image/png', bytes: PNG }));
  const a = (await upload(A))!; const b = (await upload(B))!;
  const content = (original: string, translated: string) => ({ title: { ko: '합성 동화', en: 'Synthetic story', th: 'นิทานตัวอย่าง' }, blocks: [
    { type: 'image', asset: original, images: { th: { asset: translated } } },
    { type: 'story_page', asset: original, text: { ko: '본문', en: 'Story', th: 'เรื่องราว' }, images: { en: { asset: translated } } },
  ] });
  for (const [X, own, other] of [[A, a, b], [B, b, a]] as const) {
    await expect(asUser(X.userId, (db) => site.createEntry(db, X.schoolId, { kind: 'story', key: 'foreign-art', content: content(own.id, other.id) }))).rejects.toThrow('이 학교');
    const token = (await asUser(X.userId, (db) => agent.createAgentToken(db, X.schoolId, { kinds: ['story'], perms: ['read', 'create', 'edit'], days: 1 }))).token;
    await expect(asAgent((db) => agent.agentCreateEntry(db, token, 'story', { key: 'foreign-art-agent', content: content(own.id, other.id) }))).rejects.toThrow('이 학교');
  }
  const entry = (await asUser(A.userId, (db) => site.createEntry(db, A.schoolId, { kind: 'story', key: 'local-art', content: content(a.id, a.id) })))!;
  expect(await site.publicAsset('image-language-test', a.id)).toBeNull();
  await asUser(A.userId, (db) => site.publish(db, A.schoolId, entry.id, undefined));
  expect(await site.publicAsset('image-language-test', a.id)).not.toBeNull();
  expect((await site.publicEntry('image-language-test', 'story', 'local-art'))?.content.blocks[0]).toMatchObject({ images: { th: { asset: a.id } } });
});
