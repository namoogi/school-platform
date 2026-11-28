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
// 카드 칸은 고칠 수 없으므로(가드 트리거) 시험에서 기한만 옮길 때는 트리거를 건너뛴다(슈퍼유저 연결)
const backdate = async (cl: pg.Client, expr: string, id: string) => {
  await cl.query('begin');
  await cl.query("set local session_replication_role = replica");
  await cl.query(`update public.control_requests set due_at = ${expr} where id = $1`, [id]);
  await cl.query('commit');
};
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

  it('기한이 지난 기한 진행 카드는 사람 답이 없어도 나오고(due), 상태를 닫으면 빠진다 (ADR 0048)', async () => {
    const r = await asAgent((db) => c.control.file(db, T, {
      title: '기한 지난 카드', source_session: RAS, door: 'default', ask: '목록을 카드로 바꿀까요?',
      changes: '카드 3열', unchanged: '글 그대로', undo: '목록형 다시 고르기',
      options: [{ key: 'a', label: '카드' }, { key: 'b', label: '목록' }], recommended: 'a',
      due_at: new Date(Date.now() + 3600000).toISOString(), default_action: '카드로 바꿈',
    })) as { id: string };
    expect((await mine(RAS)).body.some((x: { id: string }) => x.id === r.id)).toBe(false); // 기한 전
    // 사람이 메모만 남기고(전달 안 함) 세션이 기한 전에 답했어도, 기한 지남은 따로 나온다
    await asUser(P, (db) => c.answerRequest(db, r.id, { body: '메모만', target_session: null }));
    await asAgent((db) => c.control.post(db, T, r.id, { kind: 'note', body: '기한 전 메모', author_session: RAS }));
    const cl = new pg.Client({ connectionString: TEST_URL }); await cl.connect();
    await backdate(cl, `clock_timestamp() + interval '300 milliseconds'`, r.id);
    expect((await cl.query('select status from public.control_requests where id = $1', [r.id])).rows[0].status).toBe('proceeding');
    await cl.end();
    await new Promise((ok) => setTimeout(ok, 500));
    const got = (await mine(RAS)).body as { id: string; due?: boolean }[];
    expect(got.find((x) => x.id === r.id)).toMatchObject({ due: true });
    expect((await mine(OTHER)).body.some((x: { id: string }) => x.id === r.id)).toBe(false);
    // 기한 뒤 메모는 실행 기록이 아니다
    await asAgent((db) => c.control.post(db, T, r.id, { kind: 'note', body: '곧 진행', author_session: RAS }));
    expect(((await mine(RAS)).body as { id: string; due?: boolean }[]).find((x) => x.id === r.id)).toMatchObject({ due: true });
    // 보고만 하고 상태를 그대로 두면 계속 나온다(관제 센터 '답 필요'에 남지 않게 상태를 닫아야 함)
    await asAgent((db) => c.control.post(db, T, r.id, { kind: 'report', body: '추천안으로 진행함', author_session: RAS }));
    expect(((await mine(RAS)).body as { id: string; due?: boolean }[]).find((x) => x.id === r.id)).toMatchObject({ due: true });
    await asAgent((db) => c.control.post(db, T, r.id, { kind: 'report', body: '끝', status: 'done', author_session: RAS }));
    expect((await mine(RAS)).body.some((x: { id: string }) => x.id === r.id)).toBe(false);
  });

  it('기한이 지나도 사람이 선택지를 골랐으면(메모로만 저장해도) 추천안 대신 그 답이 간다', async () => {
    const r = await asAgent((db) => c.control.file(db, T, {
      title: '고른 카드', source_session: RAS, door: 'default', ask: '목록을 카드로 바꿀까요?',
      changes: '카드 3열', unchanged: '글 그대로', undo: '목록형 다시 고르기',
      options: [{ key: 'a', label: '카드' }, { key: 'b', label: '목록' }], recommended: 'a',
      due_at: new Date(Date.now() + 3600000).toISOString(), default_action: '카드로 바꿈',
    })) as { id: string };
    await asUser(P, (db) => c.answerRequest(db, r.id, { choice: 'b', target_session: null }));
    const cl = new pg.Client({ connectionString: TEST_URL }); await cl.connect();
    await backdate(cl, `now() - interval '1 minute'`, r.id);
    await cl.end();
    const got = ((await mine(RAS)).body as { id: string; due?: boolean }[]).find((x) => x.id === r.id);
    expect(got).toBeTruthy();
    expect(got?.due).toBeUndefined();
  });

  it('토큰·세션 id 가 없으면 거부', async () => {
    expect((await mine(RAS, 'insp_' + '0'.repeat(64))).status).toBe(401);
    const res = await route.GET(new Request('http://x/api/control/mine', { headers: { 'x-inspector-token': T } }));
    expect(res.status).toBe(400);
  });
});
