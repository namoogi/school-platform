/** 83차 — 작업 토큰 사용 기록에 세션 이름·작업자(자기 신고) 남기기. 정리(제어 문자·길이)·목록 요약·기록 불변·학교 간 분리 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, asAgent, getPool } = await import('@/lib/db');
const site = await import('@/lib/site');
const agent = await import('@/lib/agent');
const { agentHeader } = await import('@/lib/agent-api');

let A: { schoolId: string; userId: string };
let B: { schoolId: string; userId: string };
async function sql(q: string, params: unknown[] = []) {
  const c = new pg.Client({ connectionString: TEST_URL });
  await c.connect();
  try { return (await c.query(q, params)).rows; } finally { await c.end(); }
}
const story = (t: string) => ({ title: { ko: t }, blocks: [{ type: 'story_page', text: { ko: `${t} 1쪽` } }] });

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  for (const X of [A, B]) await asUser(X.userId, (db) => db.query(`select app.set_license($1, 5, array['intake','records','homepage','stories'])`, [X.schoolId]));
  await asUser(A.userId, (db) => site.saveSettings(db, A.schoolId, { public_slug: 'school-a-83', langs: ['ko'], default_lang: 'ko', is_open: true }));
}, 60_000);
afterAll(async () => { await getPool().end(); });

describe('토큰 사용 기록의 세션·작업자', () => {
  it('요청이 알린 세션·작업자가 기록 줄에 붙고, 안 알리면 비어 있다. 목록은 세션별로 요약한다', async () => {
    const { token: tok } = await asUser(A.userId, (db) => agent.createAgentToken(db, A.schoolId, { label: '여러 세션', kinds: ['story'], perms: ['read', 'create', 'edit'], days: 30 }));
    const id = (await sql(`select id from public.agent_tokens where label = '여러 세션'`))[0].id;
    await asAgent((db) => agent.agentCreateEntry(db, tok, 'story', { key: 's83-a', content: story('가') }), { session: '동화-1', operator: '홍길동' });
    await asAgent((db) => agent.agentCreateEntry(db, tok, 'story', { key: 's83-b', content: story('나') }), { session: '동화-2', operator: 'kim@school.test' });
    await asAgent((db) => agent.agentCreateEntry(db, tok, 'story', { key: 's83-c', content: story('다') }));
    const rows = await sql(`select session_label, operator from public.agent_token_uses where token_id = $1 order by id`, [id]);
    expect(rows).toEqual([{ session_label: '동화-1', operator: '홍길동' }, { session_label: '동화-2', operator: 'kim@school.test' }, { session_label: null, operator: null }]);
    const list = await asUser(A.userId, (db) => agent.listAgentTokens(db, A.schoolId));
    const t = list.find((x) => x.id === id)!;
    expect(t.sessions.map((s) => [s.session_label, s.operator, s.n]).sort()).toEqual([['동화-1', '홍길동', 1], ['동화-2', 'kim@school.test', 1]]);
    expect(t.recent[0]).toMatchObject({ session_label: null, operator: null });
    expect(t.recent[1]).toMatchObject({ session_label: '동화-2', operator: 'kim@school.test' });
  });

  it('제어 문자는 지우고 길이는 자른다. 기록은 여전히 고치지 못한다', async () => {
    const { token: tok } = await asUser(A.userId, (db) => agent.createAgentToken(db, A.schoolId, { label: '정리', kinds: ['story'], perms: ['read', 'create'], days: 7 }));
    const id = (await sql(`select id from public.agent_tokens where label = '정리'`))[0].id;
    await asAgent((db) => agent.agentCreateEntry(db, tok, 'story', { key: 's83-d', content: story('라') }), { session: `a\u0007b\n${'x'.repeat(200)}`, operator: '  ' });
    const [r] = await sql(`select id, session_label, operator from public.agent_token_uses where token_id = $1`, [id]);
    expect(r.session_label).toBe(`ab${'x'.repeat(78)}`);
    expect(r.operator).toBeNull();
    await expect(sql(`update public.agent_token_uses set operator = '바꿈' where id = $1`, [r.id])).rejects.toThrow();
  });

  it('다른 학교 관리자는 그 기록을 못 본다(양방향)', async () => {
    const a = await asUser(B.userId, (db) => db.query(`select count(*)::int as n from public.agent_token_uses where school_id = $1`, [A.schoolId]));
    expect(a.rows[0].n).toBe(0);
    const { token: tb } = await asUser(B.userId, (db) => agent.createAgentToken(db, B.schoolId, { label: 'B', kinds: ['story'], perms: ['read', 'create'], days: 7 }));
    await asAgent((db) => agent.agentCreateEntry(db, tb, 'story', { key: 's83-b1', content: story('비') }), { session: 'B세션', operator: 'b@school.test' });
    const b = await asUser(A.userId, (db) => db.query(`select count(*)::int as n from public.agent_token_uses where school_id = $1`, [B.schoolId]));
    expect(b.rows[0].n).toBe(0);
  });
});

describe('agentHeader', () => {
  const req = (h: Record<string, string>) => new Request('http://x/api/agent/me', { headers: h });
  it('URL 인코딩한 한글을 풀고, 없으면 null', () => {
    expect(agentHeader(req({ 'x-agent-operator': encodeURIComponent('홍길동 선생님') }), 'x-agent-operator', 120)).toBe('홍길동 선생님');
    expect(agentHeader(req({}), 'x-agent-operator', 120)).toBeNull();
  });
  it('잘못된 인코딩은 그대로 두고, 길이를 자른다', () => {
    expect(agentHeader(req({ 'x-agent-session': '%E0%A4%A' }), 'x-agent-session', 80)).toBe('%E0%A4%A');
    expect(agentHeader(req({ 'x-agent-session': 'y'.repeat(100) }), 'x-agent-session', 80)).toHaveLength(80);
  });
});
