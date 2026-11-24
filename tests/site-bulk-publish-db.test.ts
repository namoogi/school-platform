/** 로컬 Postgres에서 실제 RLS·공개 이력·번역 노출 확인. */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';
import { bulkPublishStories } from '@/lib/site-bulk-publish';
process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const site = await import('@/lib/site');
let A: { schoolId: string; userId: string };
let B: typeof A;
beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb(); ({ A, B } = await lookupIds());
  for (const X of [A, B]) await asUser(X.userId, (db) => db.query(`select app.set_license($1, 5, array['intake','records','homepage','stories'])`, [X.schoolId]));
  await asUser(A.userId, (db) => site.saveSettings(db, A.schoolId, { public_slug: 'bulk-test-site', langs: ['ko', 'th'], default_lang: 'ko', is_open: true }));
});
afterAll(async () => { await getPool().end(); });
const content = { title: { ko: '예시 동화', th: 'นิทานตัวอย่าง' }, blocks: [] };

it('양방향 학교 경계를 지키고 선택한 번역 판만 공개하며 재시도는 중복 기록하지 않는다', async () => {
  const a = (await asUser(A.userId, (db) => site.createEntry(db, A.schoolId, { kind: 'story', key: 'bulk-a', content })))!;
  const b = (await asUser(B.userId, (db) => site.createEntry(db, B.schoolId, { kind: 'story', key: 'bulk-b', content })))!;
  const request = (id: string) => ({ items: [{ id, base_version: 1, live_version: null }] });
  for (const [viewer, owner, entry] of [[A, B, b], [B, A, a]] as const) {
    expect((await asUser(viewer.userId, (db) => bulkPublishStories(db, viewer.schoolId, request(entry.id)))).results[0].status).toBe('skipped');
    expect((await asUser(viewer.userId, (db) => bulkPublishStories(db, owner.schoolId, request(entry.id)))).results[0].status).toBe('skipped');
  }
  expect((await asUser(A.userId, (db) => bulkPublishStories(db, A.schoolId, request(a.id)))).results[0].status).toBe('published');
  expect((await site.publicEntry('bulk-test-site', 'story', 'bulk-a'))?.content.title.th).toBe(content.title.th);
  expect((await asUser(A.userId, (db) => bulkPublishStories(db, A.schoolId, request(a.id)))).results[0].status).toBe('unchanged');
  expect((await asUser(A.userId, (db) => site.getEntry(db, A.schoolId, a.id))).publications).toHaveLength(1);
  await asUser(A.userId, (db) => site.saveVersion(db, A.schoolId, a.id, { content, base_version: 1 }));
  expect((await asUser(A.userId, (db) => bulkPublishStories(db, A.schoolId, request(a.id)))).results[0].status).toBe('skipped');
  expect((await site.publicEntry('bulk-test-site', 'story', 'bulk-a'))?.version).toBe(1);
  await asUser(A.userId, (db) => site.publish(db, A.schoolId, a.id, null));
  expect((await asUser(A.userId, (db) => bulkPublishStories(db, A.schoolId, { items: [{ id: a.id, base_version: 2, live_version: null }] }))).results[0].status).toBe('skipped');
});
