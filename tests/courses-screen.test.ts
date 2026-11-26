/** 72차 — 수업 화면이 읽는 것(과목·갈래 최신 규칙·학기·담당·수강 후보·표기 판). 학교 간 분리 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const pp = await import('@/lib/people');
const ac = await import('@/lib/academics');
const cs = await import('@/lib/courses');
const gr = await import('@/lib/grading');

type S = { schoolId: string; userId: string };
let A: S; let B: S;

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
});
afterAll(async () => { await getPool().end(); });

describe('수업 화면 읽기', () => {
  it('과목·갈래 규칙·개설·담당·수강 후보·표기를 그 학교 것만 읽는다', async () => {
    const x = await asUser(A.userId, async (db) => {
      const { version } = await ac.definePeriodRule(db, A.schoolId, { periods: [{ id: 's1', label: '봄' }], rationale: '수업 화면 시험', base_version: (await ac.latestPeriodRule(db, A.schoolId))?.version ?? 0 });
      const rule = (await ac.latestPeriodRule(db, A.schoolId))!;
      expect(rule.version).toBe(version);
      const y = await pp.addAcademicYear(db, A.schoolId, { label: 'CS2029', startsOn: '2029-03-01', endsOn: '2030-03-01' });
      await pp.createTermsFromRule(db, A.schoolId, y, rule.id);
      const [term] = await pp.listTerms(db, A.schoolId, y);
      await pp.setTermDates(db, A.schoolId, term.id, '2029-03-02', '2029-08-31');
      const lv = await pp.addSchoolLevel(db, A.schoolId, { code: 'cs_mid', name: '수업중등' });
      const st = await pp.addPerson(db, A.schoolId, { name: '수업 학생' });
      const tc = await pp.addPerson(db, A.schoolId, { name: '수업 교사' });
      await pp.enroll(db, A.schoolId, { personId: st, levelId: lv, startsOn: '2029-03-01' });
      const sub = await cs.addSubject(db, A.schoolId, { code: 'CSMATH', name: '수업수학', levelId: lv });
      const ty = await cs.addCourseType(db, A.schoolId, { code: 'cs_req', name: '수업필수' });
      await cs.setCourseTypeRule(db, A.schoolId, ty, { trigger: 'term_start', passFailAllowed: true });
      const off = await cs.createOffering(db, A.schoolId, { termId: term.id, subjectId: sub, typeId: ty, levelId: lv, credits: 2 });
      await cs.assignStaff(db, A.schoolId, off, tc, 'lead');
      await gr.setSubjectLabel(db, A.schoolId, sub, { purpose: 'transcript', label: { ko: '수학', en: 'Mathematics' }, base_version: 0 });
      return {
        term, lv, sub, ty, off, st, tc,
        terms: await ac.allTerms(db, A.schoolId), subjects: await ac.listSubjects(db, A.schoolId), types: await ac.listCourseTypes(db, A.schoolId),
        staff: await ac.offeringStaff(db, A.schoolId, off), cand: await ac.levelStudentsOn(db, A.schoolId, lv, '2029-03-02'),
        before: await ac.levelStudentsOn(db, A.schoolId, lv, '2029-02-01'), labels: await ac.subjectLabels(db, A.schoolId),
      };
    });
    expect(x.terms.find((t) => t.id === x.term.id)).toMatchObject({ year: 'CS2029', label: '봄', starts_on: '2029-03-02' });
    expect(x.subjects.find((s) => s.id === x.sub)).toMatchObject({ code: 'CSMATH', level_name: '수업중등' });
    expect(x.types.find((t) => t.id === x.ty)).toMatchObject({ rule_version: 1, creation_trigger: 'term_start', pass_fail_allowed: true });
    expect(x.staff).toEqual([{ person_id: x.tc, name: '수업 교사', role: 'lead' }]);
    expect(x.cand).toEqual([{ id: x.st, name: '수업 학생' }]);
    expect(x.before).toEqual([]);
    expect(x.labels[x.sub].transcript).toMatchObject({ version: 1, label: { en: 'Mathematics' } });

    // 학기 시작 → 자동 수강 → 명단
    const r = await asUser(A.userId, async (db) => {
      await cs.startTerm(db, A.schoolId, x.term.id);
      return { roster: await cs.roster(db, A.schoolId, x.off), list: await cs.offeringsOfTerm(db, A.schoolId, x.term.id, x.lv) };
    });
    expect(r.list).toMatchObject([{ id: x.off, status: 'active', enrolled: 1 }]);
    expect(r.roster).toMatchObject([{ person_id: x.st, status: 'enrolled' }]);

    // 다른 학교: 아무것도 보이지 않고, 남의 개설을 읽지 못함
    const b = await asUser(B.userId, async (db) => ({
      subjects: await ac.listSubjects(db, B.schoolId), types: await ac.listCourseTypes(db, B.schoolId), terms: await ac.allTerms(db, B.schoolId),
      staff: await ac.offeringStaff(db, B.schoolId, x.off), cand: await ac.levelStudentsOn(db, B.schoolId, x.lv, '2029-03-02'), labels: await ac.subjectLabels(db, B.schoolId),
      crossStaff: await ac.offeringStaff(db, A.schoolId, x.off),
    }));
    expect(b.subjects.some((s) => s.id === x.sub)).toBe(false);
    expect(b.types.some((t) => t.id === x.ty)).toBe(false);
    expect(b.terms.some((t) => t.id === x.term.id)).toBe(false);
    expect(b.staff).toEqual([]); expect(b.cand).toEqual([]); expect(b.labels[x.sub]).toBeUndefined();
    expect(b.crossStaff).toEqual([]); // 학교 ID를 바꿔 보내도 RLS 가 막는다
    // 다른 학교가 A의 과목 표기를 쓰려 하면 거부
    await expect(asUser(B.userId, (db) => gr.setSubjectLabel(db, A.schoolId, x.sub, { purpose: 'all', label: { ko: '침범' }, base_version: 0 }))).rejects.toThrow();
    // 표기 판 충돌: 낡은 판으로 저장하면 409
    await expect(asUser(A.userId, (db) => gr.setSubjectLabel(db, A.schoolId, x.sub, { purpose: 'transcript', label: { en: 'Math' }, base_version: 0 }))).rejects.toThrow('새 판');
  });
});
