/** 관제 지시 당겨 오기: 세션이 /api/control/mine 으로 자기 일만 가져간다(send_message 가 막혀도) */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, asAgent, getPool } = await import('@/lib/db');
const insp = await import('@/lib/inspector');
const c = await import('@/lib/control');
const route = await import('@/app/api/control/mine/route');

let P: string; let T: string;
const RAS = 'session_013RZyUq3bukJr2ggdSiQ2vt';
const OTHER = 'session_013RZyUqUFVPBGjdxpiXsrU2';
const mine = async (s: string, token = T) => {
  const res = await route.GET(new Request(`http://x/api/control/mine?session=${s}`, { headers: { 'x-inspector-token': token } }));
  return { status: res.status, body: await res.json() };
};

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  const cl = new pg.Client({ connectionString: TEST_URL }); await cl.connect();
  P = (await cl.query(`select id from private.app_users where email = 'platform@example.test'`)).rows[0].id; await cl.end();
  T = (await asUser(P, (db) => insp.createInspectorToken(db, { days: 7 }))).token;
});
afterAll(async () => { await getPool().end(); });

describe('관제 지시 당겨 오기', () => {
  it('사람이 답한 내 요청만 나오고, 내가 답하면 빠진다. 다른 세션 일은 안 나온다', async () => {
    const before = (await mine(RAS)).body as { no: number }[];
    expect(before).toEqual([]); // 시작 내용: 사람 답이 아직 없다
    const d7 = (await asUser(P, (db) => c.listControl(db))).requests.find((r) => r.no === 7)!;
    await asUser(P, (db) => c.answerRequest(db, d7.id, { choice: 'draft', body: '시안으로' }));
    const got = (await mine(RAS)).body as { no: number; id: string }[];
    expect(got.map((r) => r.no)).toEqual([7]);
    expect((await mine(OTHER)).body).toEqual([]);
    await asAgent((db) => c.control.post(db, T, d7.id, { kind: 'message', body: '안 올림', status: 'review', author_session: RAS }));
    expect((await mine(RAS)).body).toEqual([]);
  });

  it('토큰·세션 id 가 없으면 거부', async () => {
    expect((await mine(RAS, 'insp_' + '0'.repeat(64))).status).toBe(401);
    const res = await route.GET(new Request('http://x/api/control/mine', { headers: { 'x-inspector-token': T } }));
    expect(res.status).toBe(400);
  });
});
