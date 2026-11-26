/** 71차 — 학기 구조 직접 정하기(근거 필수·판·409·관리자만), 그 판으로 학기 만들기, 학적 조회. 학교 간 분리 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const pp = await import('@/lib/people');
const ac = await import('@/lib/academics');

type S = { schoolId: string; userId: string };
let A: S; let B: S; let su: pg.Client; let teacher: string;

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  const { rows: [t] } = await su.query(`insert into private.app_users(email, display_name) values ('ac-teacher@school-a.test', 'x') returning id`);
  await su.query(`insert into public.memberships(user_id, school_id, role) values ($1, $2, 'teacher')`, [t.id, A.schoolId]);
  teacher = t.id;
});
afterAll(async () => { await su.end(); await getPool().end(); });

describe('학기 구조 직접 정하기', () => {
  it('근거가 있어야 하고, 판으로 쌓이며, 낡은 판은 409, 교사·다른 학교는 거부', async () => {
    await expect(asUser(A.userId, (db) => ac.definePeriodRule(db, A.schoolId, { periods: [{ id: 's1', label: '1학기' }], base_version: 0 }))).rejects.toThrow('근거');
    const r1 = await asUser(A.userId, (db) => ac.definePeriodRule(db, A.schoolId, { periods: [{ id: 's1', label: '1학기' }, { id: 's2', label: '2학기' }], rationale: '학사 규정 제3조', base_version: 0 }));
    expect(r1.version).toBe(1);
    await expect(asUser(A.userId, (db) => ac.definePeriodRule(db, A.schoolId, { periods: [{ id: 't1', label: '1텀' }], rationale: 'x', base_version: 0 }))).rejects.toThrow('새 판');
    await expect(asUser(teacher, (db) => ac.definePeriodRule(db, A.schoolId, { periods: [{ id: 't1', label: '1텀' }], rationale: 'x', base_version: 1 }))).rejects.toThrow();
    await expect(asUser(B.userId, (db) => ac.definePeriodRule(db, A.schoolId, { periods: [{ id: 't1', label: '1텀' }], rationale: 'x', base_version: 1 }))).rejects.toThrow();
    const r2 = await asUser(A.userId, (db) => ac.definePeriodRule(db, A.schoolId, { periods: [{ id: 's1', label: '봄학기' }, { id: 's2', label: '가을학기' }], rationale: '이름 바꿈', base_version: 1 }));
    expect(r2.version).toBe(2);
    expect((await asUser(A.userId, (db) => ac.latestPeriodRule(db, A.schoolId)))!.value.periods.map((p) => p.label)).toEqual(['봄학기', '가을학기']);
    expect(await asUser(B.userId, (db) => ac.latestPeriodRule(db, B.schoolId))).toBeNull();
  });

  it('최신 판으로 학년도 학기를 만들고, 학적 조회는 그 학교 것만', async () => {
    const out = await asUser(A.userId, async (db) => {
      const y = await pp.addAcademicYear(db, A.schoolId, { label: '2027', startsOn: '2027-03-01', endsOn: '2028-03-01' });
      const rule = (await ac.latestPeriodRule(db, A.schoolId))!;
      await pp.createTermsFromRule(db, A.schoolId, y, rule.id);
      const lv = await pp.addSchoolLevel(db, A.schoolId, { code: 'ac', name: '고등' });
      const p = await pp.addPerson(db, A.schoolId, { name: '학적 학생' });
      await pp.enroll(db, A.schoolId, { personId: p, levelId: lv, startsOn: '2027-03-02' });
      return { terms: await pp.listTerms(db, A.schoolId, y), p, enrolled: await ac.enrolledToday(db, A.schoolId) };
    });
    expect(out.terms.map((t) => t.label)).toEqual(['봄학기', '가을학기']);
    expect(await asUser(A.userId, (db) => ac.personEnrollments(db, A.schoolId, out.p))).toMatchObject([{ level_name: '고등', status: 'enrolled', starts_on: '2027-03-02' }]);
    expect(await asUser(B.userId, (db) => ac.personEnrollments(db, B.schoolId, out.p))).toEqual([]);
    expect(out.enrolled[out.p]).toBeUndefined(); // 2027년 시작이라 오늘은 아직 재학 전
  });
});
