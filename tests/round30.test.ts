/** 30차: Claude 점검 접근 — 토큰으로만, 읽기 전용, 발급·폐기는 전체 관리자 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, asSystem, getPool, INSPECTOR_ID } = await import('@/lib/db');
const insp = await import('@/lib/inspector');
const admin = await import('@/lib/admin');

let A: { schoolId: string; userId: string };
let P: string;
const verify = (t: string) => asSystem(async (db) => (await db.query('select private.inspector_user_for($1) as id', [t])).rows[0].id as string | null);

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A } = await lookupIds());
  const c = new pg.Client({ connectionString: TEST_URL });
  await c.connect();
  P = (await c.query(`select id from private.app_users where email = 'platform@example.test'`)).rows[0].id;
  await c.end();
});
afterAll(async () => { await getPool().end(); });

describe('Claude 점검 접근', () => {
  it('전체 관리자가 발급한 토큰은 점검 계정으로 확인되고, 폐기·기한 지남은 거부된다', async () => {
    const { token } = await asUser(P, (db) => insp.createInspectorToken(db, { label: '테스트', days: 7 }));
    expect(token).toMatch(/^insp_[0-9a-f]{64}$/);
    expect(await verify(token)).toBe(INSPECTOR_ID);
    expect(await verify(token.replace(/.$/, (c) => (c === '0' ? '1' : '0')))).toBeNull();
    const [t] = await asUser(P, (db) => insp.listInspectorTokens(db));
    expect(t).toMatchObject({ label: '테스트', revoked_at: null });
    expect(t.last_used_at).not.toBeNull();
    await asUser(P, (db) => insp.revokeInspectorToken(db, t.id));
    expect(await verify(token)).toBeNull();
    const { token: t2 } = await asUser(P, (db) => insp.createInspectorToken(db, { days: 7 }));
    await asSystem((db) => db.query(`update private.inspector_tokens set expires_at = now() - interval '1 minute' where revoked_at is null`));
    expect(await verify(t2)).toBeNull();
  });

  it('학교 관리자·점검 계정 자신은 토큰을 발급하지 못한다', async () => {
    await expect(asUser(A.userId, (db) => insp.createInspectorToken(db, { days: 7 }))).rejects.toThrow('전체 관리자');
    await expect(asUser(INSPECTOR_ID, (db) => insp.createInspectorToken(db, { days: 7 }))).rejects.toThrow();
  });

  it('점검 계정은 모든 학교 화면을 읽을 수 있지만 아무것도 바꾸지 못한다', async () => {
    const schools = await asUser(INSPECTOR_ID, (db) => admin.overview(db));
    expect(schools.length).toBeGreaterThanOrEqual(2);
    await expect(asUser(INSPECTOR_ID, (db) => db.query(`select app.set_license($1, 5, array['intake'])`, [A.schoolId]))).rejects.toMatchObject({ code: '25006' });
    await expect(asUser(INSPECTOR_ID, (db) => db.query(`insert into public.user_preferences(user_id) values (app.uid())`))).rejects.toMatchObject({ code: '25006' });
  });

  it('시드를 다시 돌려도 점검 계정의 권한은 내려가지 않는다', async () => {
    const r = await asSystem((db) => db.query(`select is_platform_admin from private.app_users where id = $1`, [INSPECTOR_ID]));
    expect(r.rows[0].is_platform_admin).toBe(true);
  });
});
