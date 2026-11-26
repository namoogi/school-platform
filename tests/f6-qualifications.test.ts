/** 64차 ADR 0025 F6-3 — 외부 결과(기관 발급, 고치지 않고 정정 행)·자격(학점 요건 확인·증거 얼림), 지정일 보고 스냅샷(집계만, 판·409), 응용 출력(태국 ปพ.1 학교 사본·영어권 학업 기록) */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';
import type { CalendarDayInput } from '@/lib/foundation';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const pp = await import('@/lib/people');
const cs = await import('@/lib/courses');
const g = await import('@/lib/grading');
const f = await import('@/lib/foundation');
const at = await import('@/lib/attendance');
const rec = await import('@/lib/records');
const q = await import('@/lib/qualifications');

type S = { schoolId: string; userId: string };
let A: S; let B: S;
let su: pg.Client;
let stu: string; let year: string; let teacher: string;
let gcse: string;

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  const { rows: [t] } = await su.query(`insert into private.app_users(email, display_name) values ('f6q-teacher@school-a.test', 'x') returning id`);
  await su.query(`insert into public.memberships(user_id, school_id, role) values ($1, $2, 'teacher')`, [t.id, A.schoolId]);
  teacher = t.id;
  const { rows: [rule] } = await su.query(
    `insert into public.school_rules(school_id, topic, version, value, decision, evidence, confirmed_by)
     values ($1, 'period_structure', 1, '{"periods":[{"id":"s1","label":"1학기","assessments":[]}]}', 'accepted', '[]', $2) returning id`, [A.schoolId, A.userId]);
  const s = await asUser(A.userId, async (db) => {
    const level = await pp.addSchoolLevel(db, A.schoolId, { code: 'f6q', name: '고등' });
    const y = await pp.addAcademicYear(db, A.schoolId, { label: '2026', startsOn: '2026-03-01', endsOn: '2027-03-01' });
    await pp.createTermsFromRule(db, A.schoolId, y, rule.id);
    const term = (await pp.listTerms(db, A.schoolId, y))[0].id;
    const type = await cs.addCourseType(db, A.schoolId, { code: 'f6qreq', name: '필수' });
    await cs.setCourseTypeRule(db, A.schoolId, type, { trigger: 'term_start', publishable: false, passFailAllowed: false });
    const sci = await cs.addSubject(db, A.schoolId, { code: 'SCI', name: '과학', levelId: level });
    const thai = await cs.addSubject(db, A.schoolId, { code: 'THAI', name: '태국어', levelId: level });
    const o1 = await cs.createOffering(db, A.schoolId, { termId: term, subjectId: sci, typeId: type, levelId: level, credits: 4 });
    const o2 = await cs.createOffering(db, A.schoolId, { termId: term, subjectId: thai, typeId: type, levelId: level, credits: 2 });
    const st = await pp.addPerson(db, A.schoolId, { name: '자격 학생', nameLatin: 'Somchai Lee' });
    await pp.enroll(db, A.schoolId, { personId: st, levelId: level, startsOn: '2026-03-02' });
    await f.setCalendarDays(db, A.schoolId, y, ['02', '03', '04'].map((d) => ({ day: `2026-03-${d}`, kind: 'instructional' })) as CalendarDayInput[]);
    await g.setSubjectLabel(db, A.schoolId, sci, { purpose: 'all', label: { ko: '과학', en: 'Science', th: 'วิทยาศาสตร์' }, base_version: 0 });
    return { y, o1, o2, st };
  });
  stu = s.st; year = s.y;
  for (const o of [s.o1, s.o2]) await su.query(`insert into public.offering_enrollments(school_id, offering_id, person_id, status, source, created_by, updated_by) values ($1, $2, $3, 'enrolled', 'staff', $4, $4)`, [A.schoolId, o, stu, A.userId]);
  const { rows: [sc] } = await su.query(`select id from public.scales where school_id = $1 and code = 'us_letter'`, [A.schoolId]);
  await asUser(A.userId, async (db) => {
    const a1 = await g.addAssessment(db, A.schoolId, s.o1, { code: 'x', title: { ko: '시험' }, weight: 100, maxScore: 100 });
    const a2 = await g.addAssessment(db, A.schoolId, s.o2, { code: 'x', title: { ko: '시험' }, weight: 100, maxScore: 100 });
    await g.recordResult(db, A.schoolId, a1, stu, { score: 82 });
    await g.recordResult(db, A.schoolId, a2, stu, { score: 72 });
    await g.closeOffering(db, A.schoolId, s.o1, { base_version: 0, requestKey: 'f6q-close-sci', scaleId: sc.id });
    await g.closeOffering(db, A.schoolId, s.o2, { base_version: 0, requestKey: 'f6q-close-thai', scaleId: sc.id });
    await at.recordAttendance(db, A.schoolId, { personId: stu, day: '2026-03-03', kind: 'absent', reason: 'illness' });
  });
});
afterAll(async () => { await su.end(); await getPool().end(); });

describe('외부 결과·자격', () => {
  it('외부 결과는 추가만, 정정은 사유와 함께 한 번, 관리자만, 다른 학교 거부', async () => {
    const sat = await asUser(A.userId, (db) => q.addExternalResult(db, A.schoolId, { personId: stu, issuer: 'college_board', exam: 'SAT', satOn: '2026-06-01', result: { score: 1400 } }));
    gcse = await asUser(A.userId, (db) => q.addExternalResult(db, A.schoolId, { personId: stu, issuer: 'aqa', exam: 'GCSE.COMBINED_SCIENCE', title: { en: 'GCSE Combined Science' }, satOn: '2026-08-20', result: { grade: '9-8' } }));
    await expect(asUser(A.userId, (db) => q.addExternalResult(db, A.schoolId, { personId: stu, issuer: 'college_board', exam: 'SAT', satOn: '2026-06-01', result: { score: 1450 }, correctsId: sat }))).rejects.toThrow('형식');
    await asUser(A.userId, (db) => q.addExternalResult(db, A.schoolId, { personId: stu, issuer: 'college_board', exam: 'SAT', satOn: '2026-06-01', result: { score: 1450 }, correctsId: sat, reason: '점수 통지서 재확인' }));
    await expect(asUser(A.userId, (db) => q.addExternalResult(db, A.schoolId, { personId: stu, issuer: 'college_board', exam: 'SAT', satOn: '2026-06-01', result: { score: 1500 }, correctsId: sat, reason: '또' }))).rejects.toThrow('이미 정정');
    await expect(asUser(teacher, (db) => q.addExternalResult(db, A.schoolId, { personId: stu, issuer: 'ib', exam: 'IB', satOn: '2026-06-01', result: { grade: '7' } }))).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(B.userId, (db) => q.addExternalResult(db, B.schoolId, { personId: stu, issuer: 'ib', exam: 'IB', satOn: '2026-06-01', result: { grade: '7' } }))).rejects.toThrow('찾을 수 없습니다');
    await expect(su.query(`update public.external_results set result = '{"grade":"1"}' where id = $1`, [gcse])).rejects.toThrow('바꿀 수 없는');
    expect((await asUser(B.userId, (db) => db.query('select 1 from public.external_results'))).rows).toEqual([]);
  });

  it('자격 수여는 학년도 기록 마감 판의 취득 학점이 요건 이상일 때만, 그때 합계를 증거로 얼린다', async () => {
    await expect(asUser(A.userId, (db) => q.awardQualification(db, A.schoolId, { personId: stu, kind: 'diploma', title: { en: 'Diploma' }, requirements: { min_credits: 4 } }))).rejects.toThrow('학점');
    await asUser(A.userId, (db) => rec.closeRecordYear(db, A.schoolId, stu, year, { base_version: 0, requestKey: 'f6q-rec-1' }));
    await expect(asUser(A.userId, (db) => q.awardQualification(db, A.schoolId, { personId: stu, kind: 'diploma', title: { en: 'Diploma' }, requirements: { min_credits: 100 } }))).rejects.toThrow('(6)이 요건(100)');
    const id = await asUser(A.userId, (db) => q.awardQualification(db, A.schoolId, { personId: stu, kind: 'certificate', title: { ko: '수료증', en: 'Certificate of Completion' }, awardedOn: '2026-12-01', requirements: { min_credits: 6 } }));
    const { rows: [r] } = await su.query(`select evidence from public.qualifications where id = $1`, [id]);
    expect(Number(r.evidence.credits_earned)).toBe(6);
    expect(r.evidence.record_closures).toHaveLength(1);
    // 학년도 기록 정정 판에 외부 결과(정정된 최신 값)와 자격이 실린다
    await asUser(A.userId, (db) => rec.closeRecordYear(db, A.schoolId, stu, year, { base_version: 1, requestKey: 'f6q-rec-2', reason: '외부 결과·자격 반영' }));
    const [c] = await asUser(A.userId, (db) => rec.recordClosures(db, A.schoolId, stu));
    expect(c.snapshot.external_results!.map((x) => [x.exam, x.result.grade ?? x.result.score])).toEqual([['SAT', 1450], ['GCSE.COMBINED_SCIENCE', '9-8']]);
    expect(c.snapshot.qualifications!.map((x) => x.kind)).toEqual(['certificate']);
  });
});

describe('응용 출력', () => {
  it('태국 ปพ.1 학교 사본: 8단계 등급·GPAX·태국어 과목명 질문·띠 확인 안내', async () => {
    const d = await asUser(A.userId, (db) => rec.publishRecordDocument(db, A.schoolId, { format: 'th_por_por_1', personId: stu }));
    const c = d.content as { years: { courses: { code: string; subject: string; grade: string; credits: number }[] }[]; gpax: number; note: string };
    expect(c.years[0].courses.map((x) => [x.code, x.subject, x.grade])).toEqual([['SCI', 'วิทยาศาสตร์', '4'], ['THAI', 'THAI', '3']]);
    expect(c.gpax).toBe(3.66); // (4×4 + 3×2) / 6 = 3.666… → 버림 3.66
    expect(c.note).toContain('ปพ.1');
    expect(d.issues.some((i) => i.where === 'bands')).toBe(true);
    expect(d.issues.some((i) => i.where.includes('THAI') && i.level === 'question')).toBe(true);
    expect((await asUser(A.userId, (db) => rec.recordDocument(db, A.schoolId, d.id))).lang).toBe('th');
    // 학교 규정 띠를 프로필 판에 넣으면 그 띠를 쓴다(72점: 70 이상 → 3.5 로 바꾼 학교)
    await asUser(A.userId, (db) => rec.saveOutputProfile(db, A.schoolId, { format: 'th_por_por_1', code: 'th_school', settings: { bands: [{ min: 80, grade: 4 }, { min: 70, grade: 3.5 }, { min: 0, grade: 0 }] }, base_version: 0 }));
    const d2 = await asUser(A.userId, (db) => rec.publishRecordDocument(db, A.schoolId, { format: 'th_por_por_1', personId: stu, profileCode: 'th_school' }));
    expect((d2.content as { years: { courses: { grade: string }[] }[] }).years[0].courses[1].grade).toBe('3.5');
    expect(d2.issues.some((i) => i.where === 'bands')).toBe(false);
  });

  it('영어권 학업 기록: 백분율·등급·학점, 외부 시험(기관·이중 등급), 자격', async () => {
    const d = await asUser(A.userId, (db) => rec.publishRecordDocument(db, A.schoolId, { format: 'en_record', personId: stu }));
    const c = d.content as { student: string; years: { courses: { course: string; percent: number; grade: string }[]; external: { awarding_body: string; result: string }[]; qualifications: { title: string }[] }[] };
    expect(c.student).toBe('Somchai Lee');
    expect(c.years[0].courses[0]).toMatchObject({ course: 'Science', percent: 82, grade: 'B' });
    expect(c.years[0].external).toEqual(expect.arrayContaining([expect.objectContaining({ awarding_body: 'aqa', result: '9-8' }), expect.objectContaining({ result: '1450' })]));
    expect(c.years[0].qualifications.map((x) => x.title)).toEqual(['Certificate of Completion']);
  });
});

describe('지정일 보고 스냅샷', () => {
  it('집계만 얼리고(이름 없음), 요청 키·409·정정은 사유와 같은 기준일, 미래 날짜·다른 학교 거부', async () => {
    const r1 = await asUser(A.userId, (db) => q.closeCountReport(db, A.schoolId, { code: 'kr_edu_stats_2026', asOf: '2026-04-01', base_version: 0, requestKey: 'f6q-count-1' }));
    expect(r1).toMatchObject({ version: 1, repeated: false });
    expect(await asUser(A.userId, (db) => q.closeCountReport(db, A.schoolId, { code: 'kr_edu_stats_2026', asOf: '2026-04-01', base_version: 0, requestKey: 'f6q-count-1' }))).toMatchObject({ repeated: true });
    await expect(asUser(A.userId, (db) => q.closeCountReport(db, A.schoolId, { code: 'kr_edu_stats_2026', asOf: '2026-04-01', base_version: 0, requestKey: 'f6q-count-x' }))).rejects.toThrow('새 보고 판');
    await expect(asUser(A.userId, (db) => q.closeCountReport(db, A.schoolId, { code: 'kr_edu_stats_2026', asOf: '2026-04-02', base_version: 1, requestKey: 'f6q-count-2', reason: '재적 정정' }))).rejects.toThrow('같아야');
    await expect(asUser(A.userId, (db) => q.closeCountReport(db, A.schoolId, { code: 'us_oct1', asOf: '2099-10-01', base_version: 0, requestKey: 'f6q-count-f' }))).rejects.toThrow('기준일');
    await expect(asUser(teacher, (db) => q.closeCountReport(db, A.schoolId, { code: 'us_oct1', asOf: '2026-10-01', base_version: 0, requestKey: 'f6q-count-t' }))).rejects.toMatchObject({ code: '42501' });
    const [rep] = await asUser(A.userId, (db) => q.countReports(db, A.schoolId, 'kr_edu_stats_2026'));
    const snap = rep.snapshot as { enrollment: { total: number; by_level: Record<string, number> }; attendance_ytd: { enrolled_days: number; absent_days: number } };
    expect(snap.enrollment.total).toBeGreaterThanOrEqual(1);
    expect(snap.enrollment.by_level['고등']).toBe(1);
    expect(snap.attendance_ytd).toMatchObject({ enrolled_days: 3, absent_days: 1 });
    expect(JSON.stringify(rep.snapshot)).not.toContain('자격 학생');
    expect(JSON.stringify(rep.snapshot)).not.toContain(stu);
    expect(await asUser(B.userId, (db) => q.countReports(db, B.schoolId))).toEqual([]);
    expect((await asUser(B.userId, (db) => db.query('select 1 from public.count_reports'))).rows).toEqual([]);
  });
});
