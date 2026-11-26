/** 73차 — 성적 화면: 평가 항목 → 점수 → 서술 → 마감 판(척도 등급·미완료) → 마감 뒤 정정 규칙. 담당 아닌 교사·다른 학교 분리 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const pp = await import('@/lib/people');
const ac = await import('@/lib/academics');
const cs = await import('@/lib/courses');
const gr = await import('@/lib/grading');
const gb = await import('@/lib/gradebook');

type S = { schoolId: string; userId: string };
let A: S; let B: S; let su: pg.Client; let teacher: string;

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  const { rows: [t] } = await su.query(`insert into private.app_users(email, display_name) values ('gb-teacher@school-a.test', 'x') returning id`);
  await su.query(`insert into public.memberships(user_id, school_id, role) values ($1, $2, 'teacher')`, [t.id, A.schoolId]);
  teacher = t.id;
});
afterAll(async () => { await su.end(); await getPool().end(); });

describe('성적 화면', () => {
  it('항목·점수·서술 → 마감 판, 마감 뒤에는 관리자가 사유와 함께만 정정', async () => {
    const x = await asUser(A.userId, async (db) => {
      await ac.definePeriodRule(db, A.schoolId, { periods: [{ id: 's1', label: '봄' }], rationale: '성적 화면 시험', base_version: (await ac.latestPeriodRule(db, A.schoolId))?.version ?? 0 });
      const rule = (await ac.latestPeriodRule(db, A.schoolId))!;
      const y = await pp.addAcademicYear(db, A.schoolId, { label: 'GB2029', startsOn: '2029-03-01', endsOn: '2030-03-01' });
      await pp.createTermsFromRule(db, A.schoolId, y, rule.id);
      const [term] = await pp.listTerms(db, A.schoolId, y);
      await pp.setTermDates(db, A.schoolId, term.id, '2029-03-02', '2029-08-31');
      const lv = await pp.addSchoolLevel(db, A.schoolId, { code: 'gb_mid', name: '성적중등' });
      const s1 = await pp.addPerson(db, A.schoolId, { name: '성적 학생 1' });
      const s2 = await pp.addPerson(db, A.schoolId, { name: '성적 학생 2' });
      for (const p of [s1, s2]) await pp.enroll(db, A.schoolId, { personId: p, levelId: lv, startsOn: '2029-03-01' });
      const sub = await cs.addSubject(db, A.schoolId, { code: 'GBSCI', name: '성적과학' });
      const ty = await cs.addCourseType(db, A.schoolId, { code: 'gb_req', name: '성적필수' });
      await cs.setCourseTypeRule(db, A.schoolId, ty, { trigger: 'term_start' });
      const off = await cs.createOffering(db, A.schoolId, { termId: term.id, subjectId: sub, typeId: ty, levelId: lv, credits: 3 });
      await cs.startTerm(db, A.schoolId, term.id);
      const scale = (await gb.listScales(db, A.schoolId)).find((v) => v.code === 'kr_achievement') ?? await gr.saveScalePreset(db, A.schoolId, 'kr_achievement');
      const mid = await gr.addAssessment(db, A.schoolId, off, { code: 'mid', title: { ko: '중간' }, kind: 'exam', axis: 'course', weight: 40, maxScore: 100 });
      const fin = await gr.addAssessment(db, A.schoolId, off, { code: 'fin', title: { ko: '기말' }, kind: 'exam', axis: 'course', weight: 60, maxScore: 50 });
      await gr.recordResult(db, A.schoolId, mid, s1, { score: 80 });
      await gr.recordResult(db, A.schoolId, fin, s1, { score: 45 });
      await gr.recordResult(db, A.schoolId, mid, s2, { score: 70 });
      const ctx = (await gb.offeringContext(db, A.schoolId, off))!;
      await gr.recordNarrative(db, A.schoolId, { personId: s1, offeringId: off, academicYearId: ctx.academic_year_id, termId: ctx.term_id, kind: 'subject_detail', authorRole: 'teacher', body: '첫 서술' });
      await gr.recordNarrative(db, A.schoolId, { personId: s1, offeringId: off, academicYearId: ctx.academic_year_id, termId: ctx.term_id, kind: 'subject_detail', authorRole: 'teacher', body: '고친 서술' });
      return { off, mid, s1, s2, scale, ctx, list: await gb.assessmentsOf(db, A.schoolId, off), notes: await gb.narrativesOf(db, A.schoolId, off), scales: await gb.listScales(db, A.schoolId) };
    });
    expect(x.ctx).toMatchObject({ subject_name: '성적과학', year_label: 'GB2029', closed: false, can_grade: true, credits: 3 });
    expect(x.list.map((a) => [a.code, a.weight, a.max_score]).sort()).toEqual([['fin', 60, 50], ['mid', 40, 100]]);
    expect(x.notes).toMatchObject([{ person_id: x.s1, kind: 'subject_detail', body: '고친 서술' }]);
    expect(x.scales.find((s) => s.code === 'kr_achievement')).toMatchObject({ kind: 'letter' });

    // 담당이 아닌 교사: 입력 권한 없음
    expect((await asUser(teacher, (db) => gb.offeringContext(db, A.schoolId, x.off)))!.can_grade).toBe(false);
    await expect(asUser(teacher, (db) => gr.recordResult(db, A.schoolId, x.mid, x.s2, { score: 90 }))).rejects.toThrow('담당 교사');

    const c = await asUser(A.userId, async (db) => {
      const r = await gr.closeOffering(db, A.schoolId, x.off, { base_version: 0, requestKey: 'gb-close-0001', scaleId: x.scale.id });
      return { r, closure: (await gr.offeringClosure(db, A.schoolId, x.off))!, ctx: (await gb.offeringContext(db, A.schoolId, x.off))! };
    });
    expect(c.r.version).toBe(1);
    expect(c.ctx.closed).toBe(true);
    const by = Object.fromEntries(c.closure.results.map((r) => [r.person_id, r]));
    expect(by[x.s1]).toMatchObject({ raw_score: 86, final_score: 86, level_code: 'B', attempt_status: 'completed', credits_earned: 3 });
    expect(by[x.s2]).toMatchObject({ raw_score: null, attempt_status: 'incomplete', credits_earned: 0 });
    expect(c.closure.stats.n).toBe(1);

    // 마감 뒤: 사유 없으면 거부, 사유와 함께면 새 사건. 정정 마감은 사유와 최신 판이 필요
    await expect(asUser(A.userId, (db) => gr.recordResult(db, A.schoolId, x.mid, x.s2, { score: 75 }))).rejects.toThrow('사유');
    await asUser(A.userId, (db) => gr.recordResult(db, A.schoolId, x.mid, x.s2, { score: 75, reason: '채점 오류 정정' }));
    await expect(asUser(A.userId, (db) => gr.closeOffering(db, A.schoolId, x.off, { base_version: 1, requestKey: 'gb-close-0002' }))).rejects.toThrow('사유');
    await expect(asUser(A.userId, (db) => gr.closeOffering(db, A.schoolId, x.off, { base_version: 0, requestKey: 'gb-close-0003', reason: 'x' }))).rejects.toThrow('새 마감 판');
    expect((await asUser(A.userId, (db) => gr.closeOffering(db, A.schoolId, x.off, { base_version: 1, requestKey: 'gb-close-0004', reason: '정정' }))).version).toBe(2);

    // 다른 학교: 수업·항목·척도가 보이지 않고, 쓰기도 거부
    const b = await asUser(B.userId, async (db) => ({
      ctx: await gb.offeringContext(db, B.schoolId, x.off), cross: await gb.offeringContext(db, A.schoolId, x.off),
      list: await gb.assessmentsOf(db, A.schoolId, x.off), notes: await gb.narrativesOf(db, A.schoolId, x.off), scales: await gb.listScales(db, B.schoolId),
    }));
    expect(b.ctx).toBeNull(); expect(b.cross).toBeNull(); expect(b.list).toEqual([]); expect(b.notes).toEqual([]);
    expect(b.scales.some((s) => s.id === x.scale.id)).toBe(false);
    await expect(asUser(B.userId, (db) => gr.recordResult(db, A.schoolId, x.mid, x.s1, { score: 1 }))).rejects.toThrow();
    await expect(asUser(B.userId, (db) => gr.addAssessment(db, A.schoolId, x.off, { code: 'hack', title: { ko: 'x' }, axis: 'course', weight: 1, maxScore: 10 }))).rejects.toThrow();
  });
});
