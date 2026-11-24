/** 51차(ADR 0024): 관제 세션의 학교 작업 권한 — 점검 토큰으로 학교 작업 토큰을 발급해 AI 작업 API로 쓰고 공개한다 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, asAgent, getPool } = await import('@/lib/db');
const insp = await import('@/lib/inspector');
const c = await import('@/lib/control');
const site = await import('@/lib/site');
const agent = await import('@/lib/agent');

let A: { schoolId: string; userId: string };
let B: { schoolId: string; userId: string };
let T: string;
const page = (t: string) => ({ title: { ko: t }, blocks: [{ type: 'text', body: { ko: `${t} 본문` } }] });

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  for (const X of [A, B]) await asUser(X.userId, (db) => db.query(`select app.set_license($1, 5, array['intake','records','homepage','stories'])`, [X.schoolId]));
  await asUser(A.userId, (db) => site.saveSettings(db, A.schoolId, { public_slug: 'school-a-site', langs: ['ko'], default_lang: 'ko', is_open: true }));
  await asUser(B.userId, (db) => site.saveSettings(db, B.schoolId, { public_slug: 'school-b-site', langs: ['ko'], default_lang: 'ko', is_open: true }));
  const cl = new pg.Client({ connectionString: TEST_URL });
  await cl.connect();
  const P = (await cl.query(`select id from private.app_users where email = 'platform@example.test'`)).rows[0].id;
  await cl.end();
  T = (await asUser(P, (db) => insp.createInspectorToken(db, { label: '관제', days: 7 }))).token;
});
afterAll(async () => { await getPool().end(); });

describe('관제 세션의 학교 작업 권한', () => {
  it('점검 토큰으로 학교 작업 토큰을 발급 → 쪽 만들기·새 판·공개, 그 학교 AI 작업 공간과 접근 기록에 남는다', async () => {
    const r = await asAgent((db) => c.control.schoolToken(db, T, { slug: 'school-a-site', kinds: ['page', 'news'], perms: ['read', 'upload', 'create', 'edit', 'publish'], days: 7, label: '전경 그림' })) as { token: string; school: string };
    expect(r.token).toMatch(agent.AGENT_TOKEN_RE);
    await asAgent((db) => agent.agentCreateEntry(db, r.token, 'page', { key: 'campus', content: page('학교 모습') }));
    await asAgent((db) => agent.agentSaveEntry(db, r.token, 'page', 'campus', { content: page('학교 모습 2판'), base_version: 1 }));
    // 판 규칙 그대로: 틀린 base_version 은 409
    await expect(asAgent((db) => agent.agentSaveEntry(db, r.token, 'page', 'campus', { content: page('덮어쓰기'), base_version: 1 }))).rejects.toThrow('새 판');
    await asAgent((db) => agent.agentPublish(db, r.token, 'page', 'campus', {}));
    expect((await site.publicEntry('school-a-site', 'page', 'campus'))!.content.title.ko).toBe('학교 모습 2판');
    const list = await asUser(A.userId, (db) => agent.listAgentTokens(db, A.schoolId));
    expect(list.find((t) => t.label === '관제 세션 · 전경 그림')).toMatchObject({ agent_kind: 'claude-code' });
    const cl = new pg.Client({ connectionString: TEST_URL });
    await cl.connect();
    const { rows } = await cl.query(`select actor_label from public.access_log where school_id = $1 and action = 'agent.token_create_control'`, [A.schoolId]);
    await cl.end();
    expect(rows).toHaveLength(1);
    // 학교 경계: A 토큰으로 B 학교 항목은 없다(학교는 토큰이 정함)
    await asAgent((db) => c.control.schoolToken(db, T, { slug: 'school-b-site', kinds: ['page'], perms: ['read', 'create'], days: 1 }))
      .then((b) => asAgent((db) => agent.agentCreateEntry(db, (b as { token: string }).token, 'page', { key: 'campus', content: page('B 학교') })));
    expect((await site.publicEntry('school-a-site', 'page', 'campus'))!.content.title.ko).toBe('학교 모습 2판');
  });

  it('점검 토큰이 틀리거나, 없는 학교·기한 초과·없는 권한이면 거부', async () => {
    await expect(asAgent((db) => c.control.schoolToken(db, 'insp_' + '0'.repeat(64), { slug: 'school-a-site', kinds: ['page'], perms: ['read'] }))).rejects.toMatchObject({ code: '28000' });
    await expect(asAgent((db) => c.control.schoolToken(db, T, { slug: 'no-such-site', kinds: ['page'], perms: ['read'] }))).rejects.toThrow('학교 홈페이지가 없습니다');
    await expect(asAgent((db) => c.control.schoolToken(db, T, { slug: 'school-a-site', kinds: ['page'], perms: ['read'], days: 90 }))).rejects.toThrow('1~30일');
    await expect(asAgent((db) => c.control.schoolToken(db, T, { slug: 'school-a-site', kinds: ['page'], perms: ['settings'] }))).rejects.toThrow('권한은');
  });

  it('학교 관리자(로그인)는 이 함수를 부를 수 없다', async () => {
    await expect(asUser(A.userId, (db) => db.query(`select control.issue_school_token($1, 'school-a-site', array['page'], array['read'], 7, '')`, [T]))).rejects.toMatchObject({ code: '42501' });
  });
});
