/** ADR 0038: 학교별 격리 등급 판 — 전체 관리자만 쓰고, 학교는 자기 학교 판만 읽으며, 판은 고치지 않고 base_version 이 다르면 409 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const pl = await import('@/lib/placement');
const svc = await import('@/lib/services');

let A: { schoolId: string; userId: string };
let B: { schoolId: string; userId: string };
let platformId: string;
let su: pg.Client;
beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  platformId = (await su.query(`select id from private.app_users where email = 'platform@example.test'`)).rows[0].id;
}, 60_000);
afterAll(async () => { await su.end(); await getPool().end(); });

describe('격리 등급 판', () => {
  it('기록이 없으면 공용 기본(빈 목록)', async () => {
    expect(await asUser(platformId, (db) => pl.currentPlacements(db))).toEqual({});
  });

  it('학교 관리자는 등급을 바꿀 수 없다', async () => {
    await expect(asUser(A.userId, (db) => pl.setPlacement(db, A.schoolId, { tier: 'dedicated', state: 'planned', reason: '스스로', base_version: 0 })))
      .rejects.toThrow(/전체 관리자/);
  });

  it('전체 관리자가 새 판을 쌓고, 보고 고친 판이 낡으면 409', async () => {
    const v1 = await asUser(platformId, (db) => pl.setPlacement(db, A.schoolId, { tier: 'dedicated', state: 'planned', reason: '큰 학교 성능 분리', monthly_cost_usd: '15', base_version: 0 }));
    expect(v1).toEqual({ version: 1 });
    await expect(asUser(platformId, (db) => pl.setPlacement(db, A.schoolId, { tier: 'dedicated', state: 'moving', reason: '옮기기 시작', base_version: 0 })))
      .rejects.toMatchObject({ code: 'P0409' });
    const v2 = await asUser(platformId, (db) => pl.setPlacement(db, A.schoolId, { tier: 'dedicated', state: 'moved', target_url: 'https://a.example.org', reason: '옮김', base_version: 1 }));
    expect(v2).toEqual({ version: 2 });
    const cur = await asUser(platformId, (db) => pl.currentPlacements(db));
    expect(cur[A.schoolId]).toMatchObject({ version: 2, tier: 'dedicated', state: 'moved', target_url: 'https://a.example.org' });
  });

  it('검사: 옮김에는 주소, 공용은 늘 운영 중, 이유 필수', async () => {
    await expect(asUser(platformId, (db) => pl.setPlacement(db, B.schoolId, { tier: 'independent', state: 'moved', reason: 'x', base_version: 0 }))).rejects.toThrow(/주소/);
    await expect(asUser(platformId, (db) => pl.setPlacement(db, B.schoolId, { tier: 'dedicated', state: 'planned', reason: '', base_version: 0 }))).rejects.toThrow(/이유/);
    const v = await asUser(platformId, (db) => pl.setPlacement(db, B.schoolId, { tier: 'shared', state: 'moving', reason: '되돌림', base_version: 0 }));
    expect(v).toEqual({ version: 1 });
    expect((await su.query('select state from public.school_placements where school_id = $1', [B.schoolId])).rows[0].state).toBe('active');
  });

  it('학교는 자기 학교 판만 읽는다(양방향)', async () => {
    const seenByA = (await asUser(A.userId, (db) => db.query('select school_id from public.school_placements'))).rows.map((r) => r.school_id);
    const seenByB = (await asUser(B.userId, (db) => db.query('select school_id from public.school_placements'))).rows.map((r) => r.school_id);
    expect(new Set(seenByA)).toEqual(new Set([A.schoolId]));
    expect(new Set(seenByB)).toEqual(new Set([B.schoolId]));
  });

  it('판은 고치거나 지울 수 없다', async () => {
    await expect(su.query(`update public.school_placements set reason = 'x' where school_id = $1`, [A.schoolId])).rejects.toThrow();
    await expect(su.query(`delete from public.school_placements where school_id = $1`, [A.schoolId])).rejects.toThrow();
  });

  it('옮긴 학교(원본 이용 중지)의 구성원은 학교 화면 대신 새 주소 안내를 받는다 — 주소는 DB 옮김 판에서', async () => {
    await su.query(`update public.schools set status = 'suspended' where id = $1`, [A.schoolId]);
    try {
      await expect(asUser(A.userId, (db) => svc.currentSchool(db, A.schoolId))).rejects.toBeInstanceOf(svc.MovedSchoolError);
      expect(await asUser(A.userId, (db) => pl.myMovedSchools(db))).toEqual([{ name: expect.any(String), target_url: 'https://a.example.org' }]);
      // B(옮김 판 없음)는 다른 학교의 옮김 주소를 보지 않는다
      expect(await asUser(B.userId, (db) => pl.myMovedSchools(db))).toEqual([]);
    } finally {
      await su.query(`update public.schools set status = 'active' where id = $1`, [A.schoolId]);
    }
  });

  it('이력은 학교 수와 상관없이 한 번에 읽는다', async () => {
    const h = await asUser(platformId, (db) => pl.placementHistories(db));
    expect(h[A.schoolId].map((x) => x.version)).toEqual([2, 1]);
    expect(h[B.schoolId].map((x) => x.version)).toEqual([1]);
  });
});
