/** F2 마감 판 동시성 — 같은 판을 두고 동시에 마감해도 판이 갈라지지 않고, 진 쪽은 409(P0409), 같은 요청 키 동시 재전송은 같은 판을 돌려준다 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const pp = await import('@/lib/people');
const cs = await import('@/lib/courses');
const g = await import('@/lib/grading');

type S = { schoolId: string; userId: string };
let A: S; let B: S;
let su: pg.Client;
let teacherA: string; let otherTeacherA: string;
let year: string; let offering: string; let subject: string;
let krScale: string; let usScale: string;
const students: string[] = [];

async function account(email: string, s: S, role: 'admin' | 'teacher') {
  const { rows: [u] } = await su.query(`insert into private.app_users(email, display_name) values ($1, $1) returning id`, [email]);
  await su.query('insert into public.memberships(user_id, school_id, role) values ($1, $2, $3)', [u.id, s.schoolId, role]);
  return u.id as string;
}

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  teacherA = await account('f2c-lead@school-a.test', A, 'teacher');
  otherTeacherA = await account('f2c-other@school-a.test', A, 'teacher');
  const { rows: [rule] } = await su.query(
    `insert into public.school_rules(school_id, topic, version, value, decision, evidence, confirmed_by)
     values ($1, 'period_structure', 1, '{"periods":[{"id":"s1","label":"1학기","assessments":[]},{"id":"s2","label":"2학기","assessments":[]}]}', 'accepted', '[]', $2) returning id`,
    [A.schoolId, A.userId]);
  const setup = await asUser(A.userId, async (db) => {
    const level = await pp.addSchoolLevel(db, A.schoolId, { code: 'high', name: '고등' });
    const y = await pp.addAcademicYear(db, A.schoolId, { label: '2026', startsOn: '2026-03-01', endsOn: '2027-03-01' });
    await pp.createTermsFromRule(db, A.schoolId, y, rule.id);
    const term = (await pp.listTerms(db, A.schoolId, y))[0].id;
    const type = await cs.addCourseType(db, A.schoolId, { code: 'required', name: '필수' });
    await cs.setCourseTypeRule(db, A.schoolId, type, { trigger: 'term_start', publishable: false, passFailAllowed: false });
    const subj = await cs.addSubject(db, A.schoolId, { code: 'MATH', name: '수학', levelId: level });
    const off = await cs.createOffering(db, A.schoolId, { termId: term, subjectId: subj, typeId: type, levelId: level, credits: 4 });
    const lead = await pp.addPerson(db, A.schoolId, { name: 'F2 담당 교사' });
    await pp.linkAccount(db, A.schoolId, lead, teacherA);
    await cs.assignStaff(db, A.schoolId, off, lead, 'lead');
    const ids: string[] = [];
    for (let i = 1; i <= 5; i++) ids.push(await pp.addPerson(db, A.schoolId, { name: `F2 학생 ${i}` }));
    return { y, off, subj, ids };
  });
  year = setup.y; offering = setup.off; subject = setup.subj; students.push(...setup.ids);
  // 합성 수강(5명 중 1명 철회): 수강 상태 전환 절차는 ADR 0004 단계 2 시험이 지키므로 여기서는 표 소유자로 바로 넣는다
  for (const [i, p] of students.entries()) {
    await su.query(`insert into public.offering_enrollments(school_id, offering_id, person_id, status, source, created_by, updated_by)
                    values ($1, $2, $3, $4, 'staff', $5, $5)`, [A.schoolId, offering, p, i === 4 ? 'withdrawn' : 'enrolled', A.userId]);
  }
  // 58차(ADR 0027): 학교 생성 때 기본판에서 한·미 척도와 기본 성적 정책(1판)이 복제돼 있다
  const { rows: sc } = await su.query(`select code, id from public.scales where school_id = $1`, [A.schoolId]);
  krScale = sc.find((r) => r.code === 'kr_achievement').id;
  usScale = sc.find((r) => r.code === 'us_letter').id;
});
afterAll(async () => { await su.end(); await getPool().end(); });

describe('마감 판 동시성', () => {
  it('같은 base_version으로 동시에 두 번 마감하면 판은 하나, 진 쪽은 409', async () => {
    const tries = await Promise.allSettled([1, 2, 3].map((i) =>
      asUser(A.userId, (db) => g.closeOffering(db, A.schoolId, offering, { base_version: 0, requestKey: `race-close-${i}-aaaa`, scaleId: krScale }))));
    const ok = tries.filter((t) => t.status === 'fulfilled');
    const bad = tries.filter((t) => t.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    for (const b of bad) expect(b.reason).toMatchObject({ code: 'P0409' });
    const { rows } = await su.query('select version from public.offering_closures where offering_id = $1', [offering]);
    expect(rows.map((r) => r.version)).toEqual([1]);
  });

  it('같은 요청 키를 동시에 다시 보내면 모두 같은 판을 돌려준다', async () => {
    const tries = await Promise.allSettled([1, 2, 3].map(() =>
      asUser(A.userId, (db) => g.closeOffering(db, A.schoolId, offering, { base_version: 1, requestKey: 'race-correct-same', reason: '동시 정정 시험', scaleId: krScale }))));
    const vals = tries.map((t) => (t.status === 'fulfilled' ? t.value.version : (t as PromiseRejectedResult).reason?.code));
    expect(vals).toEqual([2, 2, 2]);
    const { rows } = await su.query('select version from public.offering_closures where offering_id = $1 order by version', [offering]);
    expect(rows.map((r) => r.version)).toEqual([1, 2]);
  });
});
