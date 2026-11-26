/** 76차 — 기본판·보고 화면이 읽는 것: 관제 새 판 → 학교 제안 → 학교 결정(학교 관리자만), 보고 모으기 → 학교별 최신 보고. 학교·교사는 관제 영역을 못 본다 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const b = await import('@/lib/baseline');

type S = { schoolId: string; userId: string };
let A: S; let B: S; let P: string; let teacher: string;
let su: pg.Client;

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  P = (await su.query(`select id from private.app_users where email = 'platform@example.test'`)).rows[0].id;
  const { rows: [t] } = await su.query(`insert into private.app_users(email, display_name) values ('bl-teacher@school-a.test', 'x') returning id`);
  await su.query(`insert into public.memberships(user_id, school_id, role) values ($1, $2, 'teacher')`, [t.id, A.schoolId]);
  teacher = t.id;
});
afterAll(async () => { await su.end(); await getPool().end(); });

describe('기본판·보고 화면', () => {
  it('새 판 → 제안 수 → 학교 수락·보류, 보고 모으기 → 학교별 최신 보고', async () => {
    const base = (await asUser(P, (db) => b.latestBaseline(db)))!;
    const manifest = { ...base.manifest, code_lists: [...(base.manifest.code_lists ?? []),
      { list_key: 'attendance_reason', code: 'family_event', label: { ko: '가정 행사', en: 'Family event' }, attrs: { excused: true }, why: '76차 시험' }] };
    const v = await asUser(P, (db) => b.publishBaseline(db, { title: '기본판 2', manifest, why: '가정 행사 사유', base_version: base.version }));
    const counts = await asUser(P, (db) => b.offerCounts(db));
    const offered = counts.find((c) => c.to_version === v && c.status === 'offered')!;
    expect(offered.n).toBeGreaterThanOrEqual(2);

    const offerA = (await asUser(A.userId, (db) => b.baselineOffers(db, A.schoolId))).find((o) => o.to_version === v)!;
    expect((offerA.items.add as { item: { code: string } }[]).map((x) => x.item.code)).toContain('family_event');
    // 교사·다른 학교는 결정하지 못한다
    expect(await asUser(teacher, (db) => b.baselineOffers(db, A.schoolId))).toEqual([]);
    await expect(asUser(teacher, (db) => b.decideBaselineOffer(db, A.schoolId, offerA.id, 'accepted'))).rejects.toThrow();
    await expect(asUser(B.userId, (db) => b.decideBaselineOffer(db, A.schoolId, offerA.id, 'accepted'))).rejects.toThrow();
    await expect(asUser(B.userId, (db) => b.decideBaselineOffer(db, B.schoolId, offerA.id, 'accepted'))).rejects.toThrow();
    // A 수락, B 보류
    expect(await asUser(A.userId, (db) => b.decideBaselineOffer(db, A.schoolId, offerA.id, 'accepted', '받음'))).toMatchObject({ status: 'accepted', applied: 1 });
    const offerB = (await asUser(B.userId, (db) => b.baselineOffers(db, B.schoolId))).find((o) => o.to_version === v)!;
    expect(await asUser(B.userId, (db) => b.decideBaselineOffer(db, B.schoolId, offerB.id, 'held'))).toMatchObject({ status: 'held' });
    expect((await asUser(A.userId, (db) => b.schoolBaseline(db, A.schoolId)))!.version).toBe(v);

    // 보고: 관제만 모으고 본다. 학교 관리자에게 관제 화면 읽기는 자기 학교 보고만
    await expect(asUser(A.userId, (db) => b.collectSchoolReports(db))).rejects.toThrow();
    expect(await asUser(P, (db) => b.collectSchoolReports(db))).toBeGreaterThanOrEqual(2);
    const reports = await asUser(P, (db) => b.latestReports(db));
    const ra = reports.find((r) => r.school_id === A.schoolId)!;
    expect(ra).toMatchObject({ contract: 'school-report/1' });
    expect(ra.data.baseline_version).toBe(v);
    expect(reports.find((r) => r.school_id === B.schoolId)!.data.baseline_version).toBeLessThan(v);
    expect((await asUser(A.userId, (db) => b.latestReports(db))).map((r) => r.school_id)).toEqual([A.schoolId]);
    expect(await asUser(teacher, (db) => b.latestReports(db))).toEqual([]);
    // 학교 관리자에게 제안 수는 자기 학교 것만(RLS)
    expect((await asUser(A.userId, (db) => b.offerCounts(db))).filter((c) => c.to_version === v)).toEqual([{ to_version: v, status: 'accepted', n: 1 }]);
  });
});
