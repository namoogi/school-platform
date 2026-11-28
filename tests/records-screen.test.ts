/** 75차 — 기록 화면: 성적 마감 → 학년도 기록 마감 판 → 발행(학생부·성적증명서) → 목록·공개 기록 → 외부 결과·자격·지정일 보고. 학교 간 분리 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const pp = await import('@/lib/people');
const ac = await import('@/lib/academics');
const cs = await import('@/lib/courses');
const gr = await import('@/lib/grading');
const gb = await import('@/lib/gradebook');
const rc = await import('@/lib/records');
const ql = await import('@/lib/qualifications');
const rb = await import('@/lib/recordbook');

type S = { schoolId: string; userId: string };
let A: S; let B: S;

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
});
afterAll(async () => { await getPool().end(); });

describe('기록 화면', () => {
  it('마감 판 → 발행 → 목록·공개 기록, 외부 결과·자격·지정일 보고', async () => {
    const x = await asUser(A.userId, async (db) => {
      await ac.definePeriodRule(db, A.schoolId, { periods: [{ id: 's1', label: '봄' }], rationale: '기록 화면 시험', base_version: (await ac.latestPeriodRule(db, A.schoolId))?.version ?? 0 });
      const rule = (await ac.latestPeriodRule(db, A.schoolId))!;
      const y = await pp.addAcademicYear(db, A.schoolId, { label: 'RC2025', startsOn: '2025-03-01', endsOn: '2026-03-01' });
      await pp.createTermsFromRule(db, A.schoolId, y, rule.id);
      const [term] = await pp.listTerms(db, A.schoolId, y);
      await pp.setTermDates(db, A.schoolId, term.id, '2025-03-02', '2025-08-31');
      const lv = await pp.addSchoolLevel(db, A.schoolId, { code: 'rc_mid', name: '기록중등' });
      const st = await pp.addPerson(db, A.schoolId, { name: '기록 학생' });
      await pp.enroll(db, A.schoolId, { personId: st, levelId: lv, startsOn: '2025-03-01' });
      const sub = await cs.addSubject(db, A.schoolId, { code: 'RCHIS', name: '기록역사' });
      await gr.setSubjectLabel(db, A.schoolId, sub, { purpose: 'transcript', label: { en: 'World History' }, base_version: 0 });
      const ty = await cs.addCourseType(db, A.schoolId, { code: 'rc_req', name: '기록필수' });
      await cs.setCourseTypeRule(db, A.schoolId, ty, { trigger: 'term_start' });
      const off = await cs.createOffering(db, A.schoolId, { termId: term.id, subjectId: sub, typeId: ty, levelId: lv, credits: 2 });
      await cs.startTerm(db, A.schoolId, term.id);
      const a = await gr.addAssessment(db, A.schoolId, off, { code: 'fin', title: { ko: '기말' }, axis: 'course', weight: 1, maxScore: 100 });
      await gr.recordResult(db, A.schoolId, a, st, { score: 93 });
      const ctx = (await gb.offeringContext(db, A.schoolId, off))!;
      await gr.recordNarrative(db, A.schoolId, { personId: st, offeringId: off, academicYearId: ctx.academic_year_id, termId: ctx.term_id, kind: 'subject_detail', authorRole: 'teacher', body: '사료를 비교해 근거를 세움.' });
      const scale = (await gb.listScales(db, A.schoolId)).find((s) => s.code === 'us_letter') ?? await gr.saveScalePreset(db, A.schoolId, 'us_letter');
      await gr.closeOffering(db, A.schoolId, off, { base_version: 0, requestKey: 'rc-close-0001', scaleId: scale.id });
      const c1 = await rc.closeRecordYear(db, A.schoolId, st, y, { base_version: 0, requestKey: 'rc-year-0001' });
      const kr = await rc.publishRecordDocument(db, A.schoolId, { format: 'kr_alt_record', personId: st });
      const us = await rc.publishRecordDocument(db, A.schoolId, { format: 'us_transcript', personId: st });
      await rc.recordDisclosure(db, A.schoolId, { documentId: us.id, recipient: '입학처', purpose: 'admission' });
      await ql.addExternalResult(db, A.schoolId, { personId: st, issuer: 'college_board', exam: 'AP-WH', title: { en: 'AP World History' }, satOn: '2025-05-10', result: { grade: '5' } });
      await ql.awardQualification(db, A.schoolId, { personId: st, kind: 'course_cert', title: { ko: '역사 이수' }, awardedOn: '2025-09-01', requirements: { min_credits: 2 } });
      const cr = await ql.closeCountReport(db, A.schoolId, { code: 'enrollment_count', asOf: '2025-04-01', base_version: 0, requestKey: 'rc-count-0001' });
      return { st, y, c1, kr, us, cr, docs: await rb.documentsOf(db, A.schoolId, st), disc: await rb.disclosuresOf(db, A.schoolId, us.id),
        ext: await rb.externalResultsOf(db, A.schoolId, st), quals: await rb.qualificationsOf(db, A.schoolId, st), closures: await rc.recordClosures(db, A.schoolId, st) };
    });
    expect(x.c1.version).toBe(1);
    expect(x.closures[0].snapshot.courses[0].result).toMatchObject({ final_score: 93, level_code: 'A', attempt_status: 'completed' });
    // 학생부 세특은 성적 화면의 subject_detail 서술이 그대로 실린다
    const krCourse = (x.kr.content.years as { courses: { detail: string | null }[] }[])[0].courses[0];
    expect(krCourse.detail).toBe('사료를 비교해 근거를 세움.');
    expect((x.us.content.years as { courses: { course: string; grade: string }[] }[])[0].courses[0]).toMatchObject({ course: 'World History', grade: 'A' });
    expect(x.docs.map((d) => d.format).sort()).toEqual(['kr_alt_record', 'us_transcript']);
    expect(x.docs.find((d) => d.id === x.us.id)).toMatchObject({ disclosures: 1, title: 'Official Transcript' });
    expect(x.disc).toMatchObject([{ recipient: '입학처', purpose: 'admission' }]);
    expect(x.ext).toMatchObject([{ exam_code: 'AP-WH', result: { grade: '5' }, corrected: false }]);
    expect(x.quals).toMatchObject([{ kind_code: 'course_cert', corrected: false }]);
    expect(x.cr.version).toBe(1);
    // 같은 학년도 다시 마감: 낡은 판이면 409, 사유와 최신 판이면 2판
    await expect(asUser(A.userId, (db) => rc.closeRecordYear(db, A.schoolId, x.st, x.y, { base_version: 0, requestKey: 'rc-year-0002', reason: '다시' }))).rejects.toThrow();
    expect((await asUser(A.userId, (db) => rc.closeRecordYear(db, A.schoolId, x.st, x.y, { base_version: 1, requestKey: 'rc-year-0003', reason: '외부 결과 반영' }))).version).toBe(2);
    // 발행본은 그대로(스냅샷) — 해시 확인
    expect(await asUser(A.userId, (db) => rc.verifyRecordDocument(db, A.schoolId, x.kr.id))).toBe(true);

    // 다른 학교: 발행본·공개 기록·외부 결과·자격이 보이지 않고, 쓰기 거부
    const b = await asUser(B.userId, async (db) => ({
      docs: await rb.documentsOf(db, A.schoolId, x.st), disc: await rb.disclosuresOf(db, A.schoolId, x.us.id),
      ext: await rb.externalResultsOf(db, A.schoolId, x.st), quals: await rb.qualificationsOf(db, A.schoolId, x.st), schoolDocs: await rb.documentsOf(db, B.schoolId, null),
    }));
    expect(b).toEqual({ docs: [], disc: [], ext: [], quals: [], schoolDocs: [] });
    await expect(asUser(B.userId, (db) => rc.closeRecordYear(db, A.schoolId, x.st, x.y, { base_version: 2, requestKey: 'rc-year-0009', reason: 'x' }))).rejects.toThrow();
    await expect(asUser(B.userId, (db) => rc.recordDisclosure(db, A.schoolId, { documentId: x.us.id, recipient: 'x', purpose: 'other' }))).rejects.toThrow();
    await expect(asUser(B.userId, (db) => rc.recordDocument(db, B.schoolId, x.kr.id))).rejects.toThrow('발행본');
  });
});
