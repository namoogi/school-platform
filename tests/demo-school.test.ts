/** 109차 ADR 0043 — 학년 체계(한국식·미국식·커스텀) + 시연용 가상 학교 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const gs = await import('@/lib/grade-schemes');
const demo = await import('@/lib/demo-school');
const pp = await import('@/lib/people');

type S = { schoolId: string; userId: string };
let A: S; let B: S;
let su: pg.Client;
let platformId: string;

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  platformId = (await su.query(`select id from private.app_users where email = 'platform@example.test'`)).rows[0].id;
}, 120_000);
afterAll(async () => { await su.end(); await getPool().end(); });

describe('학년 체계', () => {
  it('표기는 서수에서: 한국식 초1·중1·고3, 미국식 K·Grade 9, 커스텀은 학교가 적은 표기', () => {
    const g = (ordinal: number, label: Record<string, string> = { ko: '씨앗반' }) => ({ ordinal, label });
    expect(gs.gradeLabel(g(1), 'kr', 'ko')).toBe('초1');
    expect(gs.gradeLabel(g(7), 'kr', 'ko')).toBe('중1');
    expect(gs.gradeLabel(g(12), 'kr', 'en')).toBe('High 3');
    expect(gs.gradeLabel(g(0), 'us', 'en')).toBe('K');
    expect(gs.gradeLabel(g(9), 'us', 'en')).toBe('Grade 9');
    expect(gs.gradeLabel(g(1), 'custom', 'ko')).toBe('씨앗반');
    // 체계에 없는 서수(PK)는 학교 표기
    expect(gs.gradeLabel(g(-1, { ko: '유아' }), 'kr', 'ko')).toBe('유아');
  });

  it('미국식으로 학교급 3개·학년 13개, 다시 불러도 빠진 것만(중복 없음), 체계는 판으로 쌓임', async () => {
    const r1 = await asUser(B.userId, (db) => gs.applyGradeScheme(db, B.schoolId, { scheme: 'us', levels: ['elementary', 'middle', 'high'] }, 'en'));
    expect(r1).toMatchObject({ scheme: 'us', levels: 3, grades: 13 });
    const r2 = await asUser(B.userId, (db) => gs.applyGradeScheme(db, B.schoolId, { scheme: 'us', levels: ['elementary', 'middle', 'high'] }, 'en'));
    expect(r2).toMatchObject({ levels: 0, grades: 0, version: r1.version + 1 });
    const v = await asUser(B.userId, (db) => gs.schemeView(db, B.schoolId, 'en'));
    expect(v.scheme).toBe('us');
    expect(v.levels.map((l) => [l.code, l.grades.map((x) => x.label).join(',')])).toEqual([
      ['elementary', 'K,Grade 1,Grade 2,Grade 3,Grade 4,Grade 5'], ['middle', 'Grade 6,Grade 7,Grade 8'], ['high', 'Grade 9,Grade 10,Grade 11,Grade 12'],
    ]);
  });

  it('커스텀은 학년 표기를 학교가 정하고, 고른 학교급만 만든다', async () => {
    const r = await asUser(A.userId, (db) => gs.applyGradeScheme(db, A.schoolId, { scheme: 'custom', levels: ['middle'], labels: { m1: '씨앗반', m2: '새싹반' } }));
    expect(r).toMatchObject({ levels: 1, grades: 3 });
    const v = await asUser(A.userId, (db) => gs.schemeView(db, A.schoolId, 'ko'));
    expect(v.levels.find((l) => l.code === 'middle')!.grades.map((x) => x.label)).toEqual(['씨앗반', '새싹반', '중3']);
  });

  it('체계를 바꿔도 학년 행이 늘지 않고(서수가 정체), 커스텀 표기는 기존 학년에도 판으로 붙는다', async () => {
    const count = async () => Number((await su.query(`select count(*) n from public.grade_levels where school_id = $1`, [B.schoolId])).rows[0].n);
    const before = await count();
    // 미국식으로 만든 학교를 한국식으로: K~12 그대로, 새 학년 없음
    expect(await asUser(B.userId, (db) => gs.applyGradeScheme(db, B.schoolId, { scheme: 'kr', levels: ['elementary', 'middle', 'high'] }, 'en'))).toMatchObject({ grades: 0 });
    expect(await count()).toBe(before);
    let v = await asUser(B.userId, (db) => gs.schemeView(db, B.schoolId, 'ko'));
    expect(v.levels.find((l) => l.code === 'high')!.grades.map((x) => x.label)).toEqual(['중3', '고1', '고2', '고3']);
    // 커스텀으로: 이미 있는 학년(고1 = 서수 10)에도 표기가 붙는다
    expect(await asUser(B.userId, (db) => gs.applyGradeScheme(db, B.schoolId, { scheme: 'custom', levels: ['high'], labels: { h1: '열매반' } }, 'en'))).toMatchObject({ grades: 0 });
    expect(await count()).toBe(before);
    v = await asUser(B.userId, (db) => gs.schemeView(db, B.schoolId, 'ko'));
    expect(v.levels.find((l) => l.code === 'high')!.grades.map((x) => x.label)).toContain('열매반');
    // 관할만 고친 판도 표기를 잇는다
    await asUser(B.userId, (db) => db.query(`select app.set_school_profile($1, '{"country":"TH"}')`, [B.schoolId]));
    v = await asUser(B.userId, (db) => gs.schemeView(db, B.schoolId, 'ko'));
    expect(v.scheme).toBe('custom');
    expect(v.levels.find((l) => l.code === 'high')!.grades.map((x) => x.label)).toContain('열매반');
    await expect(asUser(B.userId, (db) => db.query(`select app.set_school_profile($1, '{"grade_labels":{"x":"y"}}')`, [B.schoolId]))).rejects.toThrow('학년 표기');
  });

  it('잘못된 체계·학교급은 거부, 학교 관리자가 아니면 DB가 거부, 다른 학교 학년으로 반을 못 만든다', async () => {
    await expect(asUser(A.userId, (db) => gs.applyGradeScheme(db, A.schoolId, { scheme: 'uk', levels: ['high'] }))).rejects.toThrow();
    await expect(asUser(A.userId, (db) => gs.applyGradeScheme(db, A.schoolId, { scheme: 'kr', levels: [] }))).rejects.toThrow();
    await expect(asUser(A.userId, (db) => db.query(`select app.set_school_profile($1, '{"grade_scheme":"uk"}')`, [A.schoolId]))).rejects.toThrow('학년 체계');
    await expect(asUser(B.userId, (db) => gs.applyGradeScheme(db, A.schoolId, { scheme: 'kr', levels: ['high'] }))).rejects.toMatchObject({ code: '42501' });
    const bGrade = (await su.query(`select id from public.grade_levels where school_id = $1 limit 1`, [B.schoolId])).rows[0].id;
    const aYear = await asUser(A.userId, (db) => pp.addAcademicYear(db, A.schoolId, { label: 'gs-2030', startsOn: '2030-03-01', endsOn: '2031-03-01' }));
    await expect(asUser(A.userId, (db) => pp.addGradeHomeroom(db, A.schoolId, { yearId: aYear, gradeLevelId: bGrade, name: '1반' }))).rejects.toThrow('학년');
    await expect(su.query(`update public.school_profiles set grade_scheme = 'kr'`)).rejects.toThrow();
  });
});

describe('시연용 가상 학교', () => {
  it('전체 관리자만 만든다', async () => {
    await expect(asUser(A.userId, (db) => demo.buildDemoSchool(db))).rejects.toThrow();
  });

  it('초1~고3 가명 학생, 반·수업·평가·출결·마감·발행까지 채우고, 다시 불러도 한 번만 만든다', async () => {
    const r = await asUser(platformId, (db) => demo.buildDemoSchool(db));
    expect(r).toMatchObject({ created: true, students: 12 * demo.PER_GRADE, offerings: 36, documents: 1 });
    const again = await asUser(platformId, (db) => demo.buildDemoSchool(db));
    expect(again).toMatchObject({ created: false, schoolId: r.schoolId });
    const q = async (sql: string) => Number((await su.query(sql, [r.schoolId])).rows[0].n);
    // 이름은 모두 '가상 ' 으로 시작(누가 봐도 가짜)
    expect(await q(`select count(*) n from public.person_current_names where school_id = $1 and name not like '가상 %'`)).toBe(0);
    expect(await q(`select count(distinct h.grade_level_id) n from public.homerooms h where h.school_id = $1`)).toBe(12);
    expect(await q(`select count(*) n from public.homeroom_assignments where school_id = $1`)).toBe(12 * demo.PER_GRADE);
    expect(await q(`select count(*) n from public.offering_closures where school_id = $1`)).toBe(36);
    expect(await q(`select count(*) n from public.attendance_events where school_id = $1`)).toBeGreaterThan(0);
    expect(await q(`select count(*) n from public.record_closures where school_id = $1`)).toBe(demo.PER_GRADE);
    expect(await q(`select count(*) n from public.record_documents where school_id = $1`)).toBe(1);
    // 초1 수업에는 초1 학생만
    const { rows: [mix] } = await su.query(
      `select count(*) n from public.offering_enrollments e join public.course_offerings o on o.id = e.offering_id
         join public.homeroom_assignments ha on ha.person_id = e.person_id join public.homerooms h on h.id = ha.homeroom_id
         join public.grade_levels gl on gl.id = h.grade_level_id
        where e.school_id = $1 and o.section <> (case gl.code when 'e1' then '초1' else o.section end) and gl.code = 'e1'`, [r.schoolId]);
    expect(Number(mix.n)).toBe(0);
    const v = await asUser(platformId, (db) => gs.schemeView(db, r.schoolId, 'ko'));
    expect(v.scheme).toBe('kr');
    expect(v.levels.flatMap((l) => l.grades.map((x) => x.label))).toEqual(['초1', '초2', '초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3']);
  }, 120_000);
});
