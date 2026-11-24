/** 45차: 작업 토큰 자동 공개 (ADR 0020) — 저장하면 바로 공개, 공개 권한과 함께만, 범위·학교 경계 그대로 */
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

describe('자동 공개 권한 (ADR 0020)', () => {
  it('자동 공개는 공개 권한과 함께만 발급된다', async () => {
    await expect(issue(A.userId, A.schoolId, { kinds: ['story'], perms: ['read', 'create', 'autopublish'], days: 7 })).rejects.toThrow('공개 권한과 함께');
    await issue(A.userId, A.schoolId, { kinds: ['story'], perms: ['read'], days: 7 });
    await expect(sql(`update public.agent_tokens set perms = array['read','autopublish'] where id = (select id from public.agent_tokens limit 1)`)).rejects.toThrow('perms_check');
  });

  it('만들면 첫 판이, 새 판을 저장하면 그 판이 바로 공개된다', async () => {
    const tok = await issue(A.userId, A.schoolId, { kinds: ['story'], perms: ['read', 'create', 'edit', 'publish', 'autopublish'], days: 7 });
    const c = await as((db) => agent.agentCreateEntry(db, tok, 'story', { key: 'auto-story', content: story('자동 동화') }));
    expect(c).toMatchObject({ version: 1, published: true, auto_published: true });
    expect((await site.publicEntry('school-a-site', 'story', 'auto-story'))!.content.title.ko).toBe('자동 동화');
    const v = await as((db) => agent.agentSaveEntry(db, tok, 'story', 'auto-story', { content: story('자동 동화 2판'), base_version: 1 }));
    expect(v).toMatchObject({ version: 2, published: true });
    expect((await site.publicEntry('school-a-site', 'story', 'auto-story'))!.version).toBe(2);
    const uses = await sql(`select action from public.agent_token_uses where school_id = $1 and action like 'story.%' order by id`, [A.schoolId]);
    expect(uses.map((u) => u.action)).toEqual(expect.arrayContaining(['story.publish']));
    const pubs = await sql(`select published_by from public.site_publications p join public.site_entries e on e.id = p.entry_id where e.key = 'auto-story'`);
    expect(pubs.length).toBe(2);
    expect(pubs.every((p) => p.published_by === A.userId)).toBe(true); // 책임자 = 발급 관리자
  });

  it('공개 권한만 있는 토큰은 저장해도 공개되지 않는다(지시해야 공개)', async () => {
    const tok = await issue(A.userId, A.schoolId, { kinds: ['story'], perms: ['read', 'create', 'edit', 'publish'], days: 7 });
    const c = await as((db) => agent.agentCreateEntry(db, tok, 'story', { key: 'manual-story', content: story('수동 동화') }));
    expect(c.published).toBe(false);
    expect(await site.publicEntry('school-a-site', 'story', 'manual-story')).toBeNull();
  });

  it('범위·학교 경계는 그대로: B의 자동 공개 토큰으로 A 동화를 고치거나 공개할 수 없다(양방향)', async () => {
    await asUser(B.userId, (db) => site.saveSettings(db, B.schoolId, { public_slug: 'school-b-site', langs: ['en'], default_lang: 'en', is_open: true }));
    const tb = await issue(B.userId, B.schoolId, { kinds: ['story'], perms: ['read', 'create', 'edit', 'publish', 'autopublish'], days: 7 });
    const ta = await issue(A.userId, A.schoolId, { kinds: ['story'], perms: ['read', 'create', 'edit', 'publish', 'autopublish'], days: 7 });
    await expect(as((db) => agent.agentSaveEntry(db, tb, 'story', 'auto-story', { content: story('침입'), base_version: 2 }))).rejects.toThrow();
    await as((db) => agent.agentCreateEntry(db, tb, 'story', { key: 'b-story', content: story('B 동화') }));
    await expect(as((db) => agent.agentSaveEntry(db, ta, 'story', 'b-story', { content: story('침입'), base_version: 1 }))).rejects.toThrow();
    expect((await site.publicEntry('school-a-site', 'story', 'auto-story'))!.version).toBe(2);
    expect((await site.publicEntry('school-b-site', 'story', 'b-story'))!.content.title.ko).toBe('B 동화');
    // 주소를 정한 자동 공개 토큰은 그 주소 밖을 만들 수 없다
    const keyed = await issue(A.userId, A.schoolId, { kinds: ['story'], keys: ['only-this'], perms: ['create', 'edit', 'publish', 'autopublish'], days: 7 });
    await expect(as((db) => agent.agentCreateEntry(db, keyed, 'story', { key: 'other', content: story('밖') }))).rejects.toThrow();
  });

  it('보관한 항목에는 저장도 공개도 되지 않는다(저장만 남지 않음)', async () => {
    const tok = await issue(A.userId, A.schoolId, { kinds: ['story'], perms: ['read', 'create', 'edit', 'archive', 'publish', 'autopublish'], days: 7 });
    await as((db) => agent.agentCreateEntry(db, tok, 'story', { key: 'to-archive', content: story('보관 예정') }));
    await as((db) => agent.agentUnpublish(db, tok, 'story', 'to-archive'));
    await as((db) => agent.agentArchive(db, tok, 'story', 'to-archive'));
    const before = (await sql(`select count(*)::int as n from public.site_entry_versions v join public.site_entries e on e.id = v.entry_id where e.key = 'to-archive'`))[0].n;
    await expect(as((db) => agent.agentSaveEntry(db, tok, 'story', 'to-archive', { content: story('보관 뒤'), base_version: 1 }))).rejects.toThrow();
    const after = (await sql(`select count(*)::int as n from public.site_entry_versions v join public.site_entries e on e.id = v.entry_id where e.key = 'to-archive'`))[0].n;
    expect(after).toBe(before);
  });
});
