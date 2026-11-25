/** 58차 ADR 0027 — 관제 기본판 · 학교 복제 · 보고 계약: 생성 때 복제, 학교 사본은 학교 것, 갱신은 제안 → 학교 수락(부딪침은 학교 값 유지), 계약으로만 수집 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const f = await import('@/lib/foundation');
const b = await import('@/lib/baseline');
const usage = await import('@/lib/usage');

type S = { schoolId: string; userId: string };
let A: S; let B: S; let P: string;
let su: pg.Client;

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  P = (await su.query(`select id from private.app_users where email = 'platform@example.test'`)).rows[0].id;
});
afterAll(async () => { await su.end(); await getPool().end(); });

describe('학교 생성 = 기본판 복제', () => {
  it('새 학교는 최신 기본판의 코드·척도·성적 정책 사본을 받고, 학교 기본판 기록이 남는다', async () => {
    const { rows: [s] } = await su.query(`insert into public.schools(slug, name, locale) values ('new-school', '새 학교', 'en') returning id`);
    const { rows: [c] } = await su.query(`select (select count(*) from public.code_lists where school_id = $1)::int as codes,
      (select count(*) from public.scales where school_id = $1)::int as scales, (select count(*) from public.grading_policies where school_id = $1)::int as pol,
      (select version from public.school_baselines where school_id = $1) as v`, [s.id]);
    expect(c.codes).toBeGreaterThan(20);
    expect(c).toMatchObject({ scales: 2, pol: 1, v: 1 });
    // 기본판은 학교가 읽지 못하고(관제 영역), 사본은 학교끼리 따로다
    expect((await asUser(A.userId, (db) => db.query('select * from public.baselines'))).rows).toEqual([]);
    expect((await asUser(P, (db) => b.latestBaseline(db)))?.version).toBe(1);
  });
});

describe('기본판 갱신 = 제안 → 학교 수락', () => {
  it('학교가 고친 코드는 부딪침으로 남고 학교 값이 유지된다. 수락한 학교만 새 항목을 받는다', async () => {
    // A는 '질병' 표기를 바꿨다(새 행 + 이전 코드)
    const ill = (await asUser(A.userId, (db) => f.codes(db, A.schoolId, 'attendance_reason'))).find((x) => x.code === 'illness')!;
    await asUser(A.userId, (db) => f.addCode(db, A.schoolId, { listKey: 'attendance_reason', code: 'illness', label: { ko: '질병(진단서)', en: 'Illness' }, priorCodeId: ill.id }));
    const base = await asUser(P, (db) => b.latestBaseline(db));
    const manifest = { ...base!.manifest, code_lists: [
      ...(base!.manifest.code_lists ?? []).map((c) => (c.list_key === 'attendance_reason' && c.code === 'illness' ? { ...c, label: { ko: '질병', en: 'Sick' } } : c)),
      { list_key: 'attendance_reason', code: 'bereavement', label: { ko: '경조사', en: 'Bereavement' }, attrs: { excused: true }, why: '기본판 2: 경조사 사유 추가' },
    ] };
    await expect(asUser(A.userId, (db) => b.publishBaseline(db, { title: 'x', manifest, base_version: 1 }))).rejects.toMatchObject({ code: '42501' });
    expect(await asUser(P, (db) => b.publishBaseline(db, { title: '기본판 2', manifest, why: '경조사 사유', base_version: 1 }))).toBe(2);
    await expect(asUser(P, (db) => b.publishBaseline(db, { title: 'y', manifest, base_version: 1 }))).rejects.toThrow('새 기본판');
    // 제안만 생기고 학교 사본은 아직 그대로
    const offerA = (await asUser(A.userId, (db) => b.baselineOffers(db, A.schoolId)))[0];
    expect(offerA).toMatchObject({ from_version: 1, to_version: 2, status: 'offered' });
    expect(JSON.stringify(offerA.items.add)).toContain('bereavement');
    expect(JSON.stringify(offerA.items.conflicts)).toContain('illness');
    expect((await asUser(A.userId, (db) => f.codes(db, A.schoolId, 'attendance_reason'))).map((x) => x.code)).not.toContain('bereavement');
    // B는 A의 제안을 못 보고, A의 제안을 결정할 수 없다
    expect(await asUser(B.userId, (db) => b.baselineOffers(db, A.schoolId))).toEqual([]);
    await expect(asUser(B.userId, (db) => b.decideBaselineOffer(db, A.schoolId, offerA.id, 'accepted'))).rejects.toMatchObject({ code: '42501' });
    // A 수락 → 새 항목만 반영, 고친 '질병'은 학교 값 유지
    expect(await asUser(A.userId, (db) => b.decideBaselineOffer(db, A.schoolId, offerA.id, 'accepted'))).toMatchObject({ status: 'accepted', applied: 1 });
    const after = await asUser(A.userId, (db) => f.codes(db, A.schoolId, 'attendance_reason'));
    expect(after.map((x) => x.code)).toContain('bereavement');
    expect(after.find((x) => x.code === 'illness')?.label).toEqual({ ko: '질병(진단서)', en: 'Illness' });
    expect((await asUser(A.userId, (db) => b.schoolBaseline(db, A.schoolId)))?.version).toBe(2);
    await expect(asUser(A.userId, (db) => b.decideBaselineOffer(db, A.schoolId, offerA.id, 'declined'))).rejects.toThrow('이미 결정');
    // B 보류 → B 사본 그대로, 기본판 기록 1
    const offerB = (await asUser(B.userId, (db) => b.baselineOffers(db, B.schoolId)))[0];
    await asUser(B.userId, (db) => b.decideBaselineOffer(db, B.schoolId, offerB.id, 'held', '학기 끝나고'));
    expect((await asUser(B.userId, (db) => f.codes(db, B.schoolId, 'attendance_reason'))).map((x) => x.code)).not.toContain('bereavement');
    expect((await asUser(B.userId, (db) => b.schoolBaseline(db, B.schoolId)))?.version).toBe(1);
  });
});

describe('보고 계약', () => {
  it('관제는 계약 모양으로만 모으고, 학교 관리자는 자기 보고만, 다른 학교 보고는 거부', async () => {
    const r = await asUser(A.userId, (db) => b.schoolReport(db, A.schoolId));
    expect(r.contract).toBe('school-report/1');
    expect(Object.keys(r).sort()).toEqual(['activity_30d', 'baseline_version', 'contract', 'counts', 'modules', 'profile', 'reported_at', 'school', 'storage']);
    expect(r.baseline_version).toBe(2);
    await expect(asUser(B.userId, (db) => b.schoolReport(db, A.schoolId))).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(A.userId, (db) => b.collectSchoolReports(db))).rejects.toMatchObject({ code: '42501' });
    const n = await asUser(P, (db) => b.collectSchoolReports(db));
    expect(n).toBeGreaterThanOrEqual(2);
    expect((await asUser(A.userId, (db) => db.query('select school_id from public.school_reports'))).rows.every((x) => x.school_id === A.schoolId)).toBe(true);
    // 사용량 화면도 계약을 거친다
    const u = await asUser(P, (db) => usage.schoolUsage(db, null));
    expect(u.find((x) => x.id === A.schoolId)).toMatchObject({ name: expect.any(String), files: expect.any(Number) });
  });
});
