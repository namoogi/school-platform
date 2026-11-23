/** 36차: AI 작업 공간 — 토큰 범위 일반화(종류 × 주소 × 권한), 쪽·소식도 시안까지만, 학교 간 양방향 거부 (ADR 0013) */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';
import { PNG } from './fixture-pdf';

process.env.DATABASE_URL = TEST_URL;
const { asUser, asAgent, getPool } = await import('@/lib/db');
const site = await import('@/lib/site');
const agent = await import('@/lib/agent');
const dl = await import('@/lib/devlinks');

let A: { schoolId: string; userId: string };
let B: { schoolId: string; userId: string };
const ids: Record<string, string> = {};

async function sql(q: string, params: unknown[] = []) {
  const c = new pg.Client({ connectionString: TEST_URL });
  await c.connect();
  try { return (await c.query(q, params)).rows; } finally { await c.end(); }
}
const doc = (t: string) => ({ title: { ko: t }, blocks: [{ type: 'text', text: { ko: `${t} 본문` } }] });
const issue = (u: string, s: string, input: Record<string, unknown>) => asUser(u, (db) => agent.createAgentToken(db, s, input)).then((r) => r.token);
const as = <T,>(fn: Parameters<typeof asAgent<T>>[0]) => asAgent(fn);

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  // A: 홈페이지만(동화 기능 없음), B: 홈페이지 + 동화
  await asUser(A.userId, (db) => db.query(`select app.set_license($1, 5, array['intake','records','homepage'])`, [A.schoolId]));
  await asUser(B.userId, (db) => db.query(`select app.set_license($1, 5, array['intake','records','homepage','stories'])`, [B.schoolId]));
  await asUser(A.userId, (db) => site.saveSettings(db, A.schoolId, { public_slug: 'school-a-site', langs: ['ko'], default_lang: 'ko', is_open: true }));
  for (const [kind, key] of [['page', 'about'], ['page', 'admissions'], ['news', 'open-day']] as const) {
    ids[`${kind}:${key}`] = (await asUser(A.userId, (db) => site.createEntry(db, A.schoolId, { kind, key, content: doc(key) })))!.id;
  }
  ids['b:page:about'] = (await asUser(B.userId, (db) => site.createEntry(db, B.schoolId, { kind: 'page', key: 'about', content: doc('B about') })))!.id;
});
afterAll(async () => { await getPool().end(); });

describe('AI 작업 공간: 범위 일반화', () => {
  it('쪽 토큰은 고른 쪽의 시안만 저장하고, 다른 쪽·소식·공개는 안 된다', async () => {
    const tok = await issue(A.userId, A.schoolId, { label: '입학 안내 다듬기', kinds: ['page'], keys: ['admissions'], perms: ['read', 'edit'], agent_kind: 'claude-code', days: 7 });
    expect(await as((db) => agent.agentWhoami(db, tok))).toMatchObject({ kinds: ['page'], keys: ['admissions'], perms: ['read', 'edit'], agent_kind: 'claude-code' });
    expect((await as((db) => agent.agentEntries(db, tok, 'page')) as { key: string }[]).map((e) => e.key)).toEqual(['admissions']);
    const base = await as((db) => agent.agentEntry(db, tok, 'page', 'admissions'));
    const v = await as((db) => agent.agentSaveEntry(db, tok, 'page', 'admissions', { content: doc('입학 안내 2판'), base_version: base.latest.version }));
    expect(v).toMatchObject({ version: 2, published: false });
    expect(await site.publicEntry('school-a-site', 'page', 'admissions')).toBeNull();
    await expect(as((db) => agent.agentEntry(db, tok, 'page', 'about'))).rejects.toMatchObject({ code: 'P0002' });
    await expect(as((db) => agent.agentSaveEntry(db, tok, 'page', 'about', { content: doc('침입'), base_version: 1 }))).rejects.toMatchObject({ code: '42501' });
    await expect(as((db) => agent.agentEntries(db, tok, 'news'))).rejects.toMatchObject({ code: '42501' });
    await expect(as((db) => agent.agentSaveEntry(db, tok, 'news', 'open-day', { content: doc('침입'), base_version: 1 }))).rejects.toMatchObject({ code: '42501' });
    // 파일 올리기 권한이 없다
    await expect(as((db) => agent.agentUpload(db, tok, { name: 'x.png', type: 'image/png', bytes: PNG }))).rejects.toThrow('파일 올리기 권한');
    await expect(as((db) => db.query(`insert into public.site_publications(school_id, entry_id, version_id) values ($1, $2, null)`, [A.schoolId, ids['page:admissions']]))).rejects.toMatchObject({ code: '42501' });
    expect((await sql(`select action, detail from public.agent_token_uses`))[0]).toMatchObject({ action: 'page.version', detail: { kind: 'page', key: 'admissions' } });
  });

  it('읽기만 있는 토큰은 저장·올리기를 못 하고, 소식 전체 토큰은 소식만 본다', async () => {
    const ro = await issue(A.userId, A.schoolId, { kinds: ['page', 'news'], perms: ['read'], days: 7 });
    expect((await as((db) => agent.agentEntries(db, ro, 'page')) as unknown[]).length).toBe(2);
    await expect(as((db) => agent.agentSaveEntry(db, ro, 'news', 'open-day', { content: doc('x'), base_version: 1 }))).rejects.toThrow('고치기 권한');
    const up = await issue(A.userId, A.schoolId, { kinds: ['news'], perms: ['upload'], days: 7 });
    expect((await as((db) => agent.agentUpload(db, up, { name: 'news.png', type: 'image/png', bytes: PNG }))).reused).toBe(false);
    expect((await as((db) => agent.agentAssets(db, up))).length).toBe(1); // 올리기 권한이면 중복 확인용 목록은 본다
    await expect(as((db) => agent.agentEntries(db, up, 'news'))).rejects.toThrow('읽기 권한');
  });

  it('동화 기능이 없는 학교는 동화 토큰을 못 받고, 고른 종류에 없는 주소는 거부한다', async () => {
    await expect(issue(A.userId, A.schoolId, { kinds: ['story'], days: 7 })).rejects.toThrow('라이선스');
    await expect(issue(A.userId, A.schoolId, { kinds: ['news'], keys: ['about'], days: 7 })).rejects.toThrow('항목이 없습니다');
    await expect(issue(A.userId, A.schoolId, { kinds: ['settings'], days: 7 })).rejects.toThrow('종류');
    await expect(issue(A.userId, A.schoolId, { kinds: ['page'], perms: ['settings'], days: 7 })).rejects.toThrow('권한');
  });

  it('다른 학교의 같은 주소는 양방향으로 막힌다', async () => {
    const ta = await issue(A.userId, A.schoolId, { kinds: ['page'], keys: ['about'], days: 7 });
    const tb = await issue(B.userId, B.schoolId, { kinds: ['page'], keys: ['about'], days: 7 });
    const va = await as((db) => agent.agentSaveEntry(db, ta, 'page', 'about', { content: doc('A about 2'), base_version: 1 }));
    const vb = await as((db) => agent.agentSaveEntry(db, tb, 'page', 'about', { content: doc('B about 2'), base_version: 1 }));
    expect((await sql(`select entry_id from public.site_entry_versions where id = $1`, [va.version_id]))[0].entry_id).toBe(ids['page:about']);
    expect((await sql(`select entry_id from public.site_entry_versions where id = $1`, [vb.version_id]))[0].entry_id).toBe(ids['b:page:about']);
    // 다른 학교 관리자는 상대 학교 토큰을 발급·조회하지 못한다
    await expect(issue(B.userId, A.schoolId, { kinds: ['page'], days: 7 })).rejects.toThrow('학교 관리자');
    expect(await asUser(A.userId, (db) => agent.listAgentTokens(db, B.schoolId))).toEqual([]);
    // 홈페이지 기능을 끄면 쪽 토큰도 멈춘다
    await asUser(A.userId, (db) => db.query(`select app.set_license($1, 5, array['intake','records'])`, [A.schoolId]));
    await expect(as((db) => agent.agentWhoami(db, ta))).rejects.toMatchObject({ code: '28000' });
    await asUser(A.userId, (db) => db.query(`select app.set_license($1, 5, array['intake','records','homepage'])`, [A.schoolId]));
  });

  it('관리 목록에 범위·권한·최근 활동이 보이고, 학교별 개발 연동 문구에 안내 링크가 있다', async () => {
    const list = await asUser(A.userId, (db) => agent.listAgentTokens(db, A.schoolId));
    const t = list.find((x) => x.label === '입학 안내 다듬기')!;
    expect(t).toMatchObject({ kinds: ['page'], keys: ['admissions'], perms: ['read', 'edit'], agent_kind: 'claude-code' });
    expect(t.recent[0]).toMatchObject({ action: 'page.version' });
    const school = { id: A.schoolId, slug: 'school-a', name: '드리미 예시학교' };
    expect(dl.sessionPrompt(school, [], 'claude')).toContain('docs/agents/claude-code.md');
    expect(dl.sessionPrompt(school, [], 'codex')).toContain('docs/agents/codex.md');
  });
});
