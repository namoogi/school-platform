/** 40차: 작업 토큰 '공개' 권한 (ADR 0016) — 지시하면 바로 공개, 만들기·고치기는 저절로 공개되지 않음, 범위·보관·학교 간 거부 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, asAgent, getPool } = await import('@/lib/db');
const site = await import('@/lib/site');
const agent = await import('@/lib/agent');

let A: { schoolId: string; userId: string };
let B: { schoolId: string; userId: string };
async function sql(q: string, params: unknown[] = []) {
  const c = new pg.Client({ connectionString: TEST_URL });
  await c.connect();
  try { return (await c.query(q, params)).rows; } finally { await c.end(); }
}
const story = (t: string) => ({ title: { ko: t }, blocks: [{ type: 'story_page', text: { ko: `${t} 첫 쪽` } }] });
const issue = (u: string, s: string, input: Record<string, unknown>) => asUser(u, (db) => agent.createAgentToken(db, s, input)).then((r) => r.token);
const as = <T,>(fn: Parameters<typeof asAgent<T>>[0]) => asAgent(fn);

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  for (const X of [A, B]) await asUser(X.userId, (db) => db.query(`select app.set_license($1, 5, array['intake','records','homepage','stories'])`, [X.schoolId]));
  await asUser(A.userId, (db) => site.saveSettings(db, A.schoolId, { public_slug: 'school-a-site', langs: ['ko'], default_lang: 'ko', is_open: true }));
});
afterAll(async () => { await getPool().end(); });

describe('공개 권한', () => {
  it('만들고 고쳐도 저절로 공개되지 않고, 공개를 지시하면 바로 공개된다. 공개 내림도 된다', async () => {
    const tok = await issue(A.userId, A.schoolId, { kinds: ['story'], perms: ['read', 'create', 'edit', 'publish'], days: 30 });
    await as((db) => agent.agentCreateEntry(db, tok, 'story', { key: 'sun-story', content: story('해님 동화') }));
    await as((db) => agent.agentSaveEntry(db, tok, 'story', 'sun-story', { content: story('해님 동화 2판'), base_version: 1 }));
    expect(await site.publicEntry('school-a-site', 'story', 'sun-story')).toBeNull();
    expect(await as((db) => agent.agentPublish(db, tok, 'story', 'sun-story', {}))).toMatchObject({ version: 2, published: true });
    expect((await site.publicEntry('school-a-site', 'story', 'sun-story'))!.content.title.ko).toBe('해님 동화 2판');
    // 판을 골라 공개(되돌리기)
    await as((db) => agent.agentPublish(db, tok, 'story', 'sun-story', { version: 1 }));
    expect((await site.publicEntry('school-a-site', 'story', 'sun-story'))!.version).toBe(1);
    await expect(as((db) => agent.agentPublish(db, tok, 'story', 'sun-story', { version: 9 }))).rejects.toMatchObject({ code: 'P0002' });
    expect(await as((db) => agent.agentUnpublish(db, tok, 'story', 'sun-story'))).toMatchObject({ published: false });
    expect(await site.publicEntry('school-a-site', 'story', 'sun-story')).toBeNull();
    // 책임자는 발급한 관리자, 기록은 추가만
    const pubs = await sql(`select published_by, version_id from public.site_publications p join public.site_entries e on e.id = p.entry_id where e.key = 'sun-story' order by p.id`);
    expect(pubs.length).toBe(3);
    expect(new Set(pubs.map((p) => p.published_by))).toEqual(new Set([A.userId]));
    expect((await sql(`select action from public.agent_token_uses where action like 'story.%publish' order by id`)).map((r) => r.action)).toEqual(['story.publish', 'story.publish', 'story.unpublish']);
  });

  it('공개 권한이 없거나, 범위 밖이거나, 보관했거나, 다른 학교면 거부된다 (양방향)', async () => {
    const noPub = await issue(A.userId, A.schoolId, { kinds: ['story'], perms: ['read', 'edit'], days: 7 });
    await expect(as((db) => agent.agentPublish(db, noPub, 'story', 'sun-story', {}))).rejects.toThrow('공개 권한');
    await expect(as((db) => agent.agentUnpublish(db, noPub, 'story', 'sun-story'))).rejects.toThrow('공개 권한');
    const keyed = await issue(A.userId, A.schoolId, { kinds: ['story'], keys: ['sun-story'], perms: ['publish', 'create'], days: 7 });
    const all = await issue(A.userId, A.schoolId, { kinds: ['story'], perms: ['create', 'archive', 'publish'], days: 7 });
    await as((db) => agent.agentCreateEntry(db, all, 'story', { key: 'moon-story', content: story('달님') }));
    await expect(as((db) => agent.agentPublish(db, keyed, 'story', 'moon-story', {}))).rejects.toMatchObject({ code: '42501' });
    await expect(as((db) => agent.agentPublish(db, keyed, 'page', 'sun-story', {}))).rejects.toMatchObject({ code: '42501' });
    await as((db) => agent.agentArchive(db, all, 'story', 'moon-story'));
    await expect(as((db) => agent.agentPublish(db, all, 'story', 'moon-story', {}))).rejects.toMatchObject({ code: '42501' });
    // 다른 학교: B 토큰으로 A 동화를, A 토큰으로 B 동화를 공개할 수 없다
    const tb = await issue(B.userId, B.schoolId, { kinds: ['story'], perms: ['create', 'publish'], days: 7 });
    await expect(as((db) => agent.agentPublish(db, tb, 'story', 'sun-story', {}))).rejects.toMatchObject({ code: '42501' });
    await as((db) => agent.agentCreateEntry(db, tb, 'story', { key: 'b-only', content: story('B 동화') }));
    await expect(as((db) => agent.agentPublish(db, all, 'story', 'b-only', {}))).rejects.toMatchObject({ code: '42501' });
    // 공개 기록 표에 직접 쓰기는 여전히 안 된다(함수만)
    await expect(as((db) => db.query(`insert into public.site_publications(school_id, entry_id, version_id) select school_id, id, null from public.site_entries limit 1`))).rejects.toMatchObject({ code: '42501' });
  });

  it('되살리기·설정은 여전히 토큰으로 할 수 없다', async () => {
    const all = await issue(A.userId, A.schoolId, { kinds: ['story', 'page', 'news'], perms: ['read', 'upload', 'create', 'edit', 'archive', 'publish'], days: 7 });
    await expect(as((db) => db.query(`update public.site_entries set archived_at = null`))).rejects.toMatchObject({ code: '42501' });
    await expect(as((db) => db.query(`update public.site_settings set is_open = false`))).rejects.toMatchObject({ code: '42501' });
    expect(await as((db) => agent.agentWhoami(db, all))).toMatchObject({ perms: ['read', 'upload', 'create', 'edit', 'archive', 'publish'] });
  });
});
