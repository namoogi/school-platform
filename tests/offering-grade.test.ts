/** 110차 — 수업 학년 칸 + 학기 시작 자동 수강을 학년 단위로, 마감 판이 있으면 목록에 '마감' (관제 승인 #26) */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const demo = await import('@/lib/demo-school');
const cs = await import('@/lib/courses');
const pp = await import('@/lib/people');
const f = await import('@/lib/foundation');
const gs = await import('@/lib/grade-schemes');

type S = { schoolId: string; userId: string };
let A: S;
let su: pg.Client;
let platformId: string;
let demoId: string;

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  platformId = (await su.query(`select id from private.app_users where email = 'platform@example.test'`)).rows[0].id;
  demoId = (await asUser(platformId, (db) => demo.buildDemoSchool(db))).schoolId;
}, 120_000);
afterAll(async () => { await su.end(); await getPool().end(); });

const as = <T>(fn: (db: Parameters<Parameters<typeof asUser>[1]>[0]) => Promise<T>) => asUser(platformId, fn);
const gradeId = async (schoolId: string, code: string) =>
  (await su.query(`select id from public.grade_levels where school_id = $1 and code = $2`, [schoolId, code])).rows[0].id as string;

describe('수업 학년 칸', () => {
  it('시연 학교: 학년 수업 36개가 학기 시작으로 그 학년 학생만 받고, 마감 판이 있어 목록에 마감으로 보인다', async () => {
    const { rows } = await su.query(
      `select c.grade_level_id, (select count(*) from public.offering_enrollments e where e.offering_id = c.id and e.status = 'enrolled')::int n
         from public.course_offerings c where c.school_id = $1`, [demoId]);
    expect(rows).toHaveLength(36);
    expect(rows.every((r) => r.grade_level_id && r.n === demo.PER_GRADE)).toBe(true);
    const { term1, elem } = await as(async (db) => ({
      term1: (await pp.listTerms(db, demoId, (await pp.listAcademicYears(db, demoId))[0].id))[0].id,
      elem: (await pp.listSchoolLevels(db, demoId)).find((l) => l.code === 'elementary')!.id,
    }));
    const list = await as((db) => cs.offeringsOfTerm(db, demoId, term1, elem));
    expect(list).toHaveLength(18);
    expect(list.every((o) => o.status === 'closed' && o.grade_ordinal != null)).toBe(true);
    // 학년 순서(초1 → 초6)로 정렬
    expect(list[0].grade_ordinal).toBe(1);
    expect(list.at(-1)!.grade_ordinal).toBe(6);
  });

  it('학년이 있는 수업은 그 학년 학생만, 학년이 없는 수업은 예전처럼 학교급 전체(2학기)', async () => {
    const { term2, elem, type, kor } = await as(async (db) => {
      const year = (await pp.listAcademicYears(db, demoId))[0].id;
      return {
        term2: (await pp.listTerms(db, demoId, year))[1].id,
        elem: (await pp.listSchoolLevels(db, demoId)).find((l) => l.code === 'elementary')!.id,
        type: (await su.query(`select id from public.course_types where school_id = $1 and code = 'grade_core'`, [demoId])).rows[0].id as string,
        kor: (await su.query(`select id from public.subjects where school_id = $1 and code = 'E-KOR'`, [demoId])).rows[0].id as string,
      };
    });
    const e2 = await gradeId(demoId, 'e2');
    const graded = await as((db) => cs.createOffering(db, demoId, { termId: term2, subjectId: kor, typeId: type, levelId: elem, gradeLevelId: e2, credits: 0, section: '초2-2학기' }));
    const whole = await as((db) => cs.createOffering(db, demoId, { termId: term2, subjectId: kor, typeId: type, levelId: elem, credits: 0, section: '전체' }));
    await as((db) => cs.startTerm(db, demoId, term2));
    const roster = async (o: string) => (await su.query(
      `select e.person_id from public.offering_enrollments e where e.offering_id = $1 and e.status = 'enrolled'`, [o])).rows.map((r) => r.person_id).sort();
    const e2Students = (await su.query(
      `select ha.person_id from public.homeroom_assignments ha join public.homerooms h on h.id = ha.homeroom_id
        where h.grade_level_id = $1`, [e2])).rows.map((r) => r.person_id).sort();
    expect(e2Students).toHaveLength(demo.PER_GRADE);
    expect(await roster(graded)).toEqual(e2Students);
    expect(await roster(whole)).toHaveLength(6 * demo.PER_GRADE);
    const listed = await as((db) => cs.offeringsOfTerm(db, demoId, term2, elem));
    expect(listed.find((o) => o.id === graded)).toMatchObject({ grade_level_id: e2, grade_ordinal: 2, status: 'active' });
    expect(listed.find((o) => o.id === whole)).toMatchObject({ grade_level_id: null, status: 'active' });
  });

  it('다른 학교급·다른 학교의 학년은 거부한다', async () => {
    const { term2, elem, type, kor } = await as(async (db) => {
      const year = (await pp.listAcademicYears(db, demoId))[0].id;
      return {
        term2: (await pp.listTerms(db, demoId, year))[1].id,
        elem: (await pp.listSchoolLevels(db, demoId)).find((l) => l.code === 'elementary')!.id,
        type: (await su.query(`select id from public.course_types where school_id = $1 and code = 'grade_core'`, [demoId])).rows[0].id as string,
        kor: (await su.query(`select id from public.subjects where school_id = $1 and code = 'E-KOR'`, [demoId])).rows[0].id as string,
      };
    });
    const m1 = await gradeId(demoId, 'm1');
    await expect(as((db) => cs.createOffering(db, demoId, { termId: term2, subjectId: kor, typeId: type, levelId: elem, gradeLevelId: m1, credits: 0, section: 'x1' })))
      .rejects.toThrow('학년');
    // 다른 학교(A)의 학년
    await asUser(A.userId, async (db) => gs.applyGradeScheme(db, A.schoolId, { scheme: 'kr', levels: ['elementary'], base_version: (await f.schoolProfile(db, A.schoolId))?.version ?? 0 }));
    const aE1 = await gradeId(A.schoolId, 'e1');
    await expect(as((db) => cs.createOffering(db, demoId, { termId: term2, subjectId: kor, typeId: type, levelId: elem, gradeLevelId: aE1, credits: 0, section: 'x2' })))
      .rejects.toThrow('학년');
    // 학교 A 관리자는 시연 학교에 수업을 만들 수 없다
    await expect(asUser(A.userId, (db) => cs.createOffering(db, demoId, { termId: term2, subjectId: kor, typeId: type, levelId: elem, credits: 0, section: 'x3' })))
      .rejects.toMatchObject({ code: '42501' });
    // 이미 있는 수업의 학년은 바꿀 수 없다(개설 행 가드)
    await expect(su.query(`update public.course_offerings set grade_level_id = $1 where school_id = $2 and grade_level_id is not null`, [m1, demoId])).rejects.toThrow();
  });
});
