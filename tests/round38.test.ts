/** 38차: 작업 토큰 권한 확장 (ADR 0014) — 만들기·고치기(구조·항목 정보)·보관, 기한 365·무기한·연장, 학교 간 양방향 거부 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, asAgent, getPool } = await import('@/lib/db');
const site = await import('@/lib/site');
const agent = await import('@/lib/agent');

let A: { schoolId: string; userId: string };
let B: { schoolId: string; userId: string };
let P: string;

async function sql(q: string, params: unknown[] = []) {
  const c = new pg.Client({ connectionString: TEST_URL });
  await c.connect();
  try { return (await c.query(q, params)).rows; } finally { await c.end(); }
}
const story = (t: string, n = 2) => ({ title: { ko: t }, blocks: Array.from({ length: n }, (_, i) => ({ type: 'story_page', text: { ko: `${t} ${i + 1}쪽` } })) });
const issue = (u: string, s: string, input: Record<string, unknown>) => asUser(u, (db) => agent.createAgentToken(db, s, input)).then((r) => r.token);
const as = <T,>(fn: Parameters<typeof asAgent<T>>[0]) => asAgent(fn);
const ALL = ['read', 'upload', 'create', 'edit', 'archive'];

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  for (const X of [A, B]) await asUser(X.userId, (db) => db.query(`select app.set_license($1, 5, array['intake','records','homepage','stories'])`, [X.schoolId]));
  await asUser(A.userId, (db) => site.saveSettings(db, A.schoolId, { public_slug: 'school-a-site', langs: ['ko'], default_lang: 'ko', is_open: true }));
  P = (await sql(`select id from private.app_users where email = 'platform@example.test'`))[0].id;
});
afterAll(async () => { await getPool().end(); });

describe('만들기·고치기·보관', () => {
  let tok: string;
  beforeAll(async () => { tok = await issue(A.userId, A.schoolId, { label: '동화 전체', kinds: ['story'], perms: ALL, days: 30 }); });

  it('새 동화를 시안으로 만들고, 같은 주소는 409, 항목 정보는 허용한 칸만 바뀐다', async () => {
    const r = await as((db) => agent.agentCreateEntry(db, tok, 'story', { key: 'new-story', content: story('새 동화'), meta: { virtue: '용기', character: '거북', evil: 'x' } }));
    expect(r).toMatchObject({ key: 'new-story', version: 1, published: false });
    expect(await site.publicEntry('school-a-site', 'story', 'new-story')).toBeNull();
    await expect(as((db) => agent.agentCreateEntry(db, tok, 'story', { key: 'new-story', content: story('또') }))).rejects.toMatchObject({ code: 'P0001' });
    const m = await as((db) => agent.agentUpdateMeta(db, tok, 'story', 'new-story', { meta: { virtue: '정직', text_in_image: 'true', visibility: 'unlisted' }, sort: 5 }));
    expect(m).toMatchObject({ meta: { virtue: '정직', character: '거북', text_in_image: 'true' }, sort: 5 });
    expect((await sql(`select visibility from public.site_entries where key = 'new-story'`))[0].visibility).toBe('public');
    expect((await sql(`select created_by from public.site_entries where key = 'new-story'`))[0].created_by).toBe(A.userId);
  });

  it('구조 바꾸기: 순서·끼우기·빼기·숨기기·종류 바꾸기를 같은 검사로 새 판에 저장하고 활동 기록에 남긴다', async () => {
    const v1 = await as((db) => agent.agentEntry(db, tok, 'story', 'new-story'));
    const r = await as((db) => agent.agentEditOps(db, tok, 'story', 'new-story', { base_version: v1.latest.version, ops: [
      { op: 'insert', at: 0, block: { type: 'section', template: 'text', title: { ko: '들어가며' }, body: { ko: '소개' } } },
      { op: 'move', from: 2, to: 1 },
      { op: 'hide', index: 2 },
      { op: 'set', path: ['blocks', 0, 'template'], value: 'quote' },
      { op: 'set', path: ['head'], value: { layout: 'editorial', eyebrow: { ko: '성품 동화' } } },
    ] }));
    expect(r.version).toBe(2);
    const v2 = await as((db) => agent.agentEntry(db, tok, 'story', 'new-story'));
    expect(v2.latest.content.blocks.map((b) => [b.type, (b as { template?: string }).template ?? null, b.hidden ?? false])).toEqual([
      ['section', 'quote', false], ['story_page', null, false], ['story_page', null, true]]);
    expect((v2.latest.content.blocks[1] as { text: { ko: string } }).text.ko).toBe('새 동화 2쪽');
    expect(v2.latest.content.head).toEqual({ layout: 'editorial', eyebrow: { ko: '성품 동화' } });
    const use = (await sql(`select detail from public.agent_token_uses where action = 'story.version' order by id desc limit 1`))[0].detail;
    expect(use).toMatchObject({ blocks_before: 2, blocks_after: 3, structure_changed: true });
    // 빼기, 전체 내용 저장(새 구조)
    const r2 = await as((db) => agent.agentEditOps(db, tok, 'story', 'new-story', { base_version: 2, ops: [{ op: 'remove', index: 0 }] }));
    expect(r2.version).toBe(3);
    const full = await as((db) => agent.agentSaveEntry(db, tok, 'story', 'new-story', { content: story('완전히 새 구조', 4), base_version: 3 }));
    expect(full.version).toBe(4);
    // 검사 실패·범위 밖 번호·늦은 판·위험한 path 는 거부
    await expect(as((db) => agent.agentEditOps(db, tok, 'story', 'new-story', { base_version: 4, ops: [{ op: 'set', path: ['blocks', 0, 'type'], value: 'script' }] }))).rejects.toThrow('알 수 없는 블록');
    await expect(as((db) => agent.agentEditOps(db, tok, 'story', 'new-story', { base_version: 4, ops: [{ op: 'move', from: 0, to: 9 }] }))).rejects.toThrow('범위 밖');
    await expect(as((db) => agent.agentEditOps(db, tok, 'story', 'new-story', { base_version: 3, ops: [{ op: 'hide', index: 0 }] }))).rejects.toMatchObject({ code: 'P0001' });
    await expect(as((db) => agent.agentEditOps(db, tok, 'story', 'new-story', { base_version: 4, ops: [{ op: 'set', path: ['__proto__', 'x'], value: 1 }] }))).rejects.toThrow('path');
  });

  it('공개 중이면 보관할 수 없고, 공개를 내린 뒤 보관하면 공개 화면에서 빠진다. 판은 그대로, 되살리기는 관리자만', async () => {
    const [{ id }] = await sql(`select id from public.site_entries where key = 'new-story'`);
    await asUser(A.userId, (db) => site.publish(db, A.schoolId, id, undefined));
    expect(await site.publicEntry('school-a-site', 'story', 'new-story')).not.toBeNull();
    await expect(as((db) => agent.agentArchive(db, tok, 'story', 'new-story'))).rejects.toMatchObject({ code: 'P0001' });
    await expect(asUser(A.userId, (db) => site.setArchived(db, A.schoolId, id, true, A.userId))).rejects.toMatchObject({ code: 'P0001' });
    await asUser(A.userId, (db) => site.publish(db, A.schoolId, id, null));
    expect(await as((db) => agent.agentArchive(db, tok, 'story', 'new-story'))).toMatchObject({ archived: true });
    const versions = (await sql(`select count(*)::int as n from public.site_entry_versions where entry_id = $1`, [id]))[0].n;
    expect(versions).toBe(4);
    // 보관한 항목: 토큰으로 보이지 않고 고칠 수 없으며, 공개도 안 된다
    await expect(as((db) => agent.agentEntry(db, tok, 'story', 'new-story'))).rejects.toMatchObject({ code: 'P0002' });
    await expect(as((db) => agent.agentSaveEntry(db, tok, 'story', 'new-story', { content: story('x'), base_version: 4 }))).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(A.userId, (db) => site.publish(db, A.schoolId, id, undefined))).rejects.toThrow('보관한 항목');
    expect(await site.publicList('school-a-site', 'story')).toEqual([]);
    // 같은 주소로 다시 만들기는 409(보관함에 있음)
    await expect(as((db) => agent.agentCreateEntry(db, tok, 'story', { key: 'new-story', content: story('또') }))).rejects.toThrow('보관함');
    // 교사·다른 학교는 되살리지 못한다, 관리자는 되살린다
    await expect(asUser(B.userId, (db) => site.setArchived(db, A.schoolId, id, false, B.userId))).rejects.toThrow();
    await asUser(A.userId, (db) => site.setArchived(db, A.schoolId, id, false, A.userId));
    expect((await asUser(A.userId, (db) => site.listEntries(db, A.schoolId))).find((e) => e.id === id)!.archived_at).toBeNull();
    expect((await sql(`select count(*)::int as n from public.site_entry_versions where entry_id = $1`, [id]))[0].n).toBe(4);
    expect((await sql(`select action from public.access_log where action like 'site.entry_%' order by id`)).map((r) => r.action)).toEqual(['site.entry_restore']);
  });

  it('권한 없는 토큰·주소 목록 밖·다른 학교는 거부된다 (양방향)', async () => {
    const editOnly = await issue(A.userId, A.schoolId, { kinds: ['story'], perms: ['read', 'edit'], days: 7 });
    await expect(as((db) => agent.agentCreateEntry(db, editOnly, 'story', { key: 'x1', content: story('x') }))).rejects.toThrow('만들기 권한');
    await expect(as((db) => agent.agentArchive(db, editOnly, 'story', 'new-story'))).rejects.toThrow('보관 권한');
    const readOnly = await issue(A.userId, A.schoolId, { kinds: ['story'], perms: ['read'], days: 7 });
    await expect(as((db) => agent.agentUpdateMeta(db, readOnly, 'story', 'new-story', { meta: { virtue: 'x' } }))).rejects.toThrow('고치기 권한');
    // 주소 목록이 있으면 그 안에서만 만든다(아직 없는 주소도 미리 정해 둘 수 있음)
    const keyed = await issue(A.userId, A.schoolId, { kinds: ['story'], keys: ['planned-story'], perms: ['read', 'create'], days: 7 });
    await expect(as((db) => agent.agentCreateEntry(db, keyed, 'story', { key: 'other-story', content: story('x') }))).rejects.toThrow('고른 주소');
    expect((await as((db) => agent.agentCreateEntry(db, keyed, 'story', { key: 'planned-story', content: story('계획한 동화') }))).version).toBe(1);
    await expect(as((db) => agent.agentCreateEntry(db, keyed, 'page', { key: 'planned-story', content: story('x') }))).rejects.toMatchObject({ code: '42501' });
    // 다른 학교: B 토큰은 A 항목을 못 보고, 같은 주소로 만들면 B 학교에 생긴다
    const tb = await issue(B.userId, B.schoolId, { kinds: ['story'], perms: ALL, days: 7 });
    await expect(as((db) => agent.agentArchive(db, tb, 'story', 'planned-story'))).rejects.toMatchObject({ code: '42501' });
    await as((db) => agent.agentCreateEntry(db, tb, 'story', { key: 'planned-story', content: story('B 동화') }));
    const owners = await sql(`select school_id from public.site_entries where key = 'planned-story' order by school_id`);
    expect(owners.map((r) => r.school_id).sort()).toEqual([A.schoolId, B.schoolId].sort());
    await expect(as((db) => agent.agentUpdateMeta(db, tok, 'story', 'planned-story', { sort: 1 }))).resolves.toBeTruthy(); // A 토큰 → A 것
    expect((await sql(`select sort from public.site_entries where key = 'planned-story' and school_id = $1`, [B.schoolId]))[0].sort).toBe(0);
    // 토큰으로 공개·되살리기는 여전히 할 수 없다
    await expect(as((db) => db.query(`update public.site_entries set archived_at = null`))).rejects.toMatchObject({ code: '42501' });
  });
});

describe('기한: 365일 · 무기한 · 연장', () => {
  it('365일·무기한을 발급하고, 무기한도 폐기하면 거부된다', async () => {
    const t365 = await issue(A.userId, A.schoolId, { label: '1년', kinds: ['story'], days: 365 });
    const forever = await issue(A.userId, A.schoolId, { label: '무기한', kinds: ['story'], days: null });
    expect((await as((db) => agent.agentWhoami(db, forever))).expires_at).toBeNull();
    const list = await asUser(A.userId, (db) => agent.listAgentTokens(db, A.schoolId));
    const y = list.find((t) => t.label === '1년')!;
    expect(Math.round((new Date(y.expires_at!).getTime() - Date.now()) / 86400000)).toBe(365);
    expect(list.find((t) => t.label === '무기한')!.expires_at).toBeNull();
    await expect(issue(A.userId, A.schoolId, { days: 400 })).rejects.toThrow('365');
    await asUser(A.userId, (db) => agent.revokeAgentToken(db, A.schoolId, list.find((t) => t.label === '무기한')!.id));
    await expect(as((db) => agent.agentWhoami(db, forever))).rejects.toMatchObject({ code: '28000' });
    expect(await as((db) => agent.agentWhoami(db, t365))).toBeTruthy();
  });

  it('연장은 토큰 값 그대로 기한만 늘리고(기한 지난 것도 되살림), 폐기한 것·다른 학교는 안 된다. 기록이 남는다', async () => {
    const t = await issue(A.userId, A.schoolId, { label: '연장할 것', kinds: ['story'], days: 7 });
    const id = (await asUser(A.userId, (db) => agent.listAgentTokens(db, A.schoolId))).find((x) => x.label === '연장할 것')!.id;
    await sql(`update public.agent_tokens set expires_at = now() - interval '1 day' where id = $1`, [id]);
    await expect(as((db) => agent.agentWhoami(db, t))).rejects.toMatchObject({ code: '28000' });
    await expect(asUser(B.userId, (db) => agent.extendAgentToken(db, A.schoolId, id, { days: 30 }))).rejects.toThrow('학교 관리자');
    const { expires_at } = await asUser(A.userId, (db) => agent.extendAgentToken(db, A.schoolId, id, { days: 30 }));
    expect(Math.round((new Date(expires_at!).getTime() - Date.now()) / 86400000)).toBe(30);
    expect(await as((db) => agent.agentWhoami(db, t))).toBeTruthy(); // 같은 토큰 값으로 다시 쓴다
    const { expires_at: e2 } = await asUser(A.userId, (db) => agent.extendAgentToken(db, A.schoolId, id, { days: 7 }));
    expect(Math.round((new Date(e2!).getTime() - Date.now()) / 86400000)).toBe(37); // 남은 기한 끝부터
    const log = (await sql(`select detail from public.access_log where action = 'agent.token_extend' order by id`)).map((r) => r.detail);
    expect(log.length).toBe(2);
    expect(log[1]).toMatchObject({ id, days: 7 });
    await asUser(A.userId, (db) => agent.revokeAgentToken(db, A.schoolId, id));
    await expect(asUser(A.userId, (db) => agent.extendAgentToken(db, A.schoolId, id, { days: 30 }))).rejects.toThrow('폐기한 토큰');
  });

  it('만료 임박·오래 안 쓴 무기한을 골라내고, 전체 관리자만 모든 학교 토큰을 본다', async () => {
    const now = Date.now();
    const iso = (d: number) => new Date(now + d * 86400000).toISOString();
    const r = agent.tokenAlerts([
      { id: 'a', expires_at: iso(10), revoked_at: null, last_used_at: null, created_at: iso(-1) },
      { id: 'b', expires_at: iso(60), revoked_at: null, last_used_at: null, created_at: iso(-1) },
      { id: 'c', expires_at: null, revoked_at: null, last_used_at: iso(-200), created_at: iso(-300) },
      { id: 'd', expires_at: null, revoked_at: null, last_used_at: iso(-10), created_at: iso(-300) },
      { id: 'e', expires_at: iso(5), revoked_at: iso(-1), last_used_at: null, created_at: iso(-3) },
    ], now);
    expect(r.soon.map((t) => t.id)).toEqual(['a']);
    expect(r.stale.map((t) => t.id)).toEqual(['c']);
    const all = await asUser(P, (db) => agent.platformAgentTokens(db));
    expect(new Set(all.map((t) => t.school_id))).toEqual(new Set([A.schoolId, B.schoolId]));
    expect(JSON.stringify(all)).not.toMatch(/sha256|agt_/);
    await expect(asUser(A.userId, (db) => agent.platformAgentTokens(db))).rejects.toThrow('전체 관리자');
  });
});
