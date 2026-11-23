/** 26차: 사용자별 화면 선택 — 본인 것만 읽고 쓰고, 어떤 화면에서도 같은 데이터 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const ui = await import('@/lib/ui');

let A: { schoolId: string; userId: string };
let B: { schoolId: string; userId: string };

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
});
afterAll(async () => { await getPool().end(); });

describe('화면 선택(user_preferences)', () => {
  it('저장 전에는 기본값: 전체 관리 = 분석형 어두운 화면, 학교 = 학사 업무형 흰 화면', async () => {
    expect(await asUser(A.userId, (db) => ui.getUiPrefs(db))).toEqual(ui.UI_DEFAULTS);
  });

  it('범위별로 형식·명암을 따로 바꾸고 다시 읽으면 그대로다', async () => {
    await asUser(A.userId, (db) => ui.setUiPref(db, { scope: 'school', ui: 'analytics' }));
    await asUser(A.userId, (db) => ui.setUiPref(db, { scope: 'platform', mode: 'light' }));
    expect(await asUser(A.userId, (db) => ui.getUiPrefs(db))).toEqual({
      platform: { ui: 'analytics', mode: 'light' }, school: { ui: 'analytics', mode: 'light' },
    });
  });

  it('잘못된 값은 거부하고 기록하지 않는다', async () => {
    await expect(asUser(A.userId, (db) => ui.setUiPref(db, { scope: 'school', ui: 'neon' }))).rejects.toThrow('지원하지 않는 화면 형식');
    await expect(asUser(A.userId, (db) => ui.setUiPref(db, { scope: 'x', mode: 'dark' }))).rejects.toThrow('화면 범위');
    await expect(asUser(A.userId, (db) => ui.setUiPref(db, { scope: 'school' }))).rejects.toThrow('바꿀 값이 없습니다');
  });

  it('다른 사용자의 설정은 읽을 수도 바꿀 수도 없다 (양방향)', async () => {
    // B는 A의 행을 볼 수 없고, 자기 기본값만 본다
    expect(await asUser(B.userId, (db) => ui.getUiPrefs(db))).toEqual(ui.UI_DEFAULTS);
    const seen = await asUser(B.userId, async (db) => (await db.query('select user_id from public.user_preferences')).rows);
    expect(seen).toEqual([]);
    // B가 A의 user_id로 넣거나 고치려 하면 RLS가 막는다
    await expect(asUser(B.userId, (db) => db.query(
      `insert into public.user_preferences (user_id, school_ui) values ($1, 'campus')`, [A.userId]))).rejects.toThrow(/row-level security/);
    const upd = await asUser(B.userId, (db) => db.query(`update public.user_preferences set school_ui = 'campus' where user_id = $1`, [A.userId]));
    expect(upd.rowCount).toBe(0);
    // B가 자기 것을 바꿔도 A의 설정은 그대로
    await asUser(B.userId, (db) => ui.setUiPref(db, { scope: 'school', mode: 'dark' }));
    expect((await asUser(A.userId, (db) => ui.getUiPrefs(db))).school).toEqual({ ui: 'analytics', mode: 'light' });
    const seenByA = await asUser(A.userId, async (db) => (await db.query('select user_id from public.user_preferences')).rows);
    expect(seenByA).toEqual([{ user_id: A.userId }]);
  });
});
