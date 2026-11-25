/** 60차 ADR 0025 F4 — 학년도 기록 마감 판(스냅샷·409·요청 키·갈라짐 방지·정정 판), 출력 프로필 판, 발행본(한국 자체 학생부·미국 성적증명서·학교 소개서), 블라인드, 누락 질문, 해시, 공개 기록, 학교 간 거부 */
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

type S = { schoolId: string; userId: string };
let A: S; let B: S;
let su: pg.Client;
let year: string; let stu: string; let peer: string;
let math: string; let art: string;

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  const { rows: [rule] } = await su.query(
    `insert into public.school_rules(school_id, topic, version, value, decision, evidence, confirmed_by)
     values ($1, 'period_structure', 1, '{"periods":[{"id":"s1","label":"1학기","assessments":[]},{"id":"s2","label":"2학기","assessments":[]}]}', 'accepted', '[]', $2) returning id`,
    [A.schoolId, A.userId]);
  const s = await asUser(A.userId, async (db) => {
    const level = await pp.addSchoolLevel(db, A.schoolId, { code: 'f4', name: '고등' });
    const y = await pp.addAcademicYear(db, A.schoolId, { label: '2026', startsOn: '2026-03-01', endsOn: '2027-03-01' });
    await pp.createTermsFromRule(db, A.schoolId, y, rule.id);
    const term = (await pp.listTerms(db, A.schoolId, y))[0].id;
    const type = await cs.addCourseType(db, A.schoolId, { code: 'f4req', name: '필수' });
    await cs.setCourseTypeRule(db, A.schoolId, type, { trigger: 'term_start', publishable: false, passFailAllowed: true });
    const m = await cs.addSubject(db, A.schoolId, { code: 'MATH', name: '수학', levelId: level });
    const a = await cs.addSubject(db, A.schoolId, { code: 'ART', name: '미술', levelId: level });
    const om = await cs.createOffering(db, A.schoolId, { termId: term, subjectId: m, typeId: type, levelId: level, credits: 4 });
    const oa = await cs.createOffering(db, A.schoolId, { termId: term, subjectId: a, typeId: type, levelId: level, credits: 2 });
    const st = await pp.addPerson(db, A.schoolId, { name: '한별 학생', nameLatin: 'Hanbyeol Kim' });
    const pe = await pp.addPerson(db, A.schoolId, { name: '두리 학생' });
    for (const p of [st, pe]) await pp.enroll(db, A.schoolId, { personId: p, levelId: level, startsOn: '2026-03-02' });
    await f.setCalendarDays(db, A.schoolId, y, ['02', '03', '04', '05', '06'].map((d) => ({ day: `2026-03-${d}`, kind: 'instructional' })) as CalendarDayInput[]);
    await f.addExternalIdentifier(db, A.schoolId, { targetKind: 'school', system: 'us_ceeb', value: '999001' });
    return { y, om, oa, m, a, st, pe };
  });
  year = s.y; stu = s.st; peer = s.pe; math = s.m; art = s.a;
  for (const o of [s.om, s.oa]) for (const p of [stu, peer]) {
    await su.query(`insert into public.offering_enrollments(school_id, offering_id, person_id, status, source, created_by, updated_by)
                    values ($1, $2, $3, 'enrolled', 'staff', $4, $4)`, [A.schoolId, o, p, A.userId]);
  }
  const { rows: sc } = await su.query(`select code, id from public.scales where school_id = $1`, [A.schoolId]);
  const krScale = sc.find((r) => r.code === 'kr_achievement').id;
  const usScale = sc.find((r) => r.code === 'us_letter').id;
  await asUser(A.userId, async (db) => {
    const exm = await g.addAssessment(db, A.schoolId, s.om, { code: 'exam', title: { ko: '시험' }, weight: 100, maxScore: 100 });
    const exa = await g.addAssessment(db, A.schoolId, s.oa, { code: 'work', title: { ko: '작품' }, weight: 100, maxScore: 100 });
    await g.recordResult(db, A.schoolId, exm, stu, { score: 92 });
    await g.recordResult(db, A.schoolId, exm, peer, { score: 78 });
    await g.recordResult(db, A.schoolId, exa, stu, { score: 85 });
    await g.recordResult(db, A.schoolId, exa, peer, { score: 88 });
    await g.recordNarrative(db, A.schoolId, { personId: stu, offeringId: s.om, academicYearId: year, kind: 'subject_detail', authorRole: 'subject_teacher', body: '함수 탐구' });
    await g.recordNarrative(db, A.schoolId, { personId: stu, academicYearId: year, kind: 'behavior', authorRole: 'homeroom', body: '한별 학생은 성실함' });
    // 수학은 한국 척도, 미술은 미국 척도로 마감(서식은 마감 판의 등급·점수를 그대로 쓴다)
    await g.closeOffering(db, A.schoolId, s.om, { base_version: 0, requestKey: 'f4-close-math', scaleId: krScale });
    await g.closeOffering(db, A.schoolId, s.oa, { base_version: 0, requestKey: 'f4-close-art', scaleId: usScale });
    await g.setSubjectLabel(db, A.schoolId, math, { purpose: 'transcript', label: { en: 'Algebra II' }, base_version: 0 });
    await at.recordAttendance(db, A.schoolId, { personId: stu, day: '2026-03-03', kind: 'absent', reason: 'illness' });
    await at.addEvidence(db, A.schoolId, { personId: stu, title: '마을 지도 발표', body: '마을 지도를 만들어 주민에게 발표함' });
  });
});
afterAll(async () => { await su.end(); await getPool().end(); });

describe('학년도 기록 마감 판', () => {
  it('원장에서 스냅샷을 조립해 얼리고, 같은 요청 키는 같은 판, 낡은 판은 409, 관리자만', async () => {
    const c = await asUser(A.userId, (db) => rec.closeRecordYear(db, A.schoolId, stu, year, { base_version: 0, requestKey: 'f4-rec-2026-1' }));
    expect(c).toMatchObject({ version: 1, repeated: false });
    expect(await asUser(A.userId, (db) => rec.closeRecordYear(db, A.schoolId, stu, year, { base_version: 0, requestKey: 'f4-rec-2026-1' }))).toMatchObject({ id: c.id, repeated: true });
    await expect(asUser(A.userId, (db) => rec.closeRecordYear(db, A.schoolId, stu, year, { base_version: 0, requestKey: 'f4-rec-2026-x' }))).rejects.toThrow('새 마감 판');
    await expect(asUser(A.userId, (db) => rec.closeRecordYear(db, A.schoolId, stu, year, { base_version: 1, requestKey: 'f4-rec-2026-y' }))).rejects.toThrow('사유');
    await expect(asUser(B.userId, (db) => rec.closeRecordYear(db, A.schoolId, stu, year, { base_version: 1, requestKey: 'f4-rec-b-1', reason: 'x' }))).rejects.toMatchObject({ code: '42501' });
    const [rc] = await asUser(A.userId, (db) => rec.recordClosures(db, A.schoolId, stu));
    const snap = rc.snapshot;
    expect(snap.student).toMatchObject({ name: '한별 학생', name_latin: 'Hanbyeol Kim' });
    expect(snap.school.codes).toEqual({ us_ceeb: '999001' });
    expect(snap.courses.map((x) => [x.subject_code, x.result.level_code, Number(x.result.credits_earned)])).toEqual([['ART', 'B', 2], ['MATH', 'A', 4]]);
    expect(Number(snap.courses.find((x) => x.subject_code === 'ART')!.result.points)).toBe(3);
    expect(snap.courses.find((x) => x.subject_code === 'MATH')!.stats).toMatchObject({ n: 2 });
    expect(snap.attendance).toMatchObject({ enrolled_days: 5, absent_days: 1, absent_by_reason: { illness: 1 } });
    expect(snap.narratives.map((n) => n.kind).sort()).toEqual(['behavior', 'subject_detail']);
    expect(snap.evidence.map((e) => e.title)).toEqual(['마을 지도 발표']);
    // 판은 고칠 수 없다
    await expect(su.query(`update public.record_closures set snapshot = '{}' where id = $1`, [c.id])).rejects.toThrow('바꿀 수 없는');
  });

  it('원장이 바뀌어도 판은 그대로, 정정은 사유와 함께 새 판(이전 판을 가리킴, 갈라짐 없음)', async () => {
    await asUser(A.userId, (db) => g.recordNarrative(db, A.schoolId, { personId: stu, academicYearId: year, kind: 'behavior', authorRole: 'homeroom', body: '책임감이 큼' }));
    const [v1] = await asUser(A.userId, (db) => rec.recordClosures(db, A.schoolId, stu));
    expect(v1.snapshot.narratives.find((n) => n.kind === 'behavior')!.body).toBe('한별 학생은 성실함');
    const c2 = await asUser(A.userId, (db) => rec.closeRecordYear(db, A.schoolId, stu, year, { base_version: 1, requestKey: 'f4-rec-2026-2', reason: '행동특성 보완' }));
    expect(c2.version).toBe(2);
    const [v2] = await asUser(A.userId, (db) => rec.recordClosures(db, A.schoolId, stu));
    expect(v2).toMatchObject({ version: 2, previous_id: v1.id, reason: '행동특성 보완' });
    expect(v2.snapshot.narratives.find((n) => n.kind === 'behavior')!.body).toBe('책임감이 큼');
    await expect(su.query(`insert into public.record_closures(school_id, person_id, academic_year_id, version, previous_id, reason, request_key, snapshot, closed_by)
      values ($1, $2, $3, 3, $4, 'fork', 'f4-fork-attempt', '{}', $5)`, [A.schoolId, stu, year, v1.id, A.userId])).rejects.toThrow();
  });
});

describe('발행본', () => {
  it('한국 자체 학생부: 원점수·평균(표준편차)·성취도(수강자수), 세특·행특, 출결 사유별, NEIS 아님 표기', async () => {
    const d = await asUser(A.userId, (db) => rec.publishRecordDocument(db, A.schoolId, { format: 'kr_alt_record', personId: stu }));
    const c = d.content as { years: { courses: { subject: string; raw_score: number; mean_sd: string; achievement: string; detail: string | null }[]; behavior: string; attendance: { absent_by_reason: Record<string, number> } }[]; note: string };
    const mth = c.years[0].courses.find((x) => x.subject === '수학')!;
    expect(mth).toMatchObject({ raw_score: 92, mean_sd: '85.0(7.0)', achievement: 'A(2)', detail: '함수 탐구' });
    expect(c.years[0].behavior).toBe('책임감이 큼');
    expect(c.years[0].attendance.absent_by_reason).toEqual({ illness: 1 });
    expect(c.note).toContain('NEIS');
    expect(d.issues.some((i) => i.where.includes('MATH') && i.message.includes('과목 표기'))).toBe(true);
    const doc = await asUser(A.userId, (db) => rec.recordDocument(db, A.schoolId, d.id));
    expect(doc.closure_ids).toHaveLength(1);
    expect(await asUser(A.userId, (db) => rec.verifyRecordDocument(db, A.schoolId, d.id))).toBe(true);
    await expect(su.query(`update public.record_documents set content = '{}' where id = $1`, [d.id])).rejects.toThrow('바꿀 수 없는');
    // 출처는 발행과 같은 트랜잭션에서만
    const [rc] = await asUser(A.userId, (db) => rec.recordClosures(db, A.schoolId, stu));
    await expect(su.query(`insert into public.record_document_sources(school_id, document_id, closure_id) values ($1, $2, $3)`, [A.schoolId, d.id, rc.id])).rejects.toThrow();
  });

  it('미국 성적증명서: 성적표 표기·글자 성적·학점·GPA·설명표, 영어 표기 없는 과목은 질문', async () => {
    const d = await asUser(A.userId, (db) => rec.publishRecordDocument(db, A.schoolId, { format: 'us_transcript', personId: stu }));
    const c = d.content as { student: { name: string }; school: { ceeb: string }; years: { courses: { course: string; grade: string; credits_earned: number }[]; gpa: number }[]; cumulative: { gpa: number; credits_earned: number }; key: { grade: string }[] };
    expect(c.student.name).toBe('Hanbyeol Kim');
    expect(c.school.ceeb).toBe('999001');
    expect(c.years[0].courses.map((x) => [x.course, x.grade])).toEqual([['미술', 'B'], ['Algebra II', 'A']]);
    // 미술 B(3.0) × 2 + 수학(한국 척도 A, 점수 없음 → GPA 밖) → GPA 3.0
    expect(c.cumulative).toMatchObject({ credits_earned: 6, gpa: 3 });
    expect(c.key.map((k) => k.grade)).toContain('P');
    expect(d.issues).toEqual(expect.arrayContaining([expect.objectContaining({ level: 'question', where: '2026 ART' }), expect.objectContaining({ where: '2026 MATH', message: expect.stringContaining('no GPA points') })]));
  });

  it('블라인드: 학생·학교 이름과 학교 코드가 내용 어디에도 남지 않는다(서술 안 포함)', async () => {
    await asUser(A.userId, (db) => rec.closeRecordYear(db, A.schoolId, stu, year, { base_version: 2, requestKey: 'f4-rec-2026-3', reason: '블라인드 시험용 서술 복원' }));
    await asUser(A.userId, (db) => g.recordNarrative(db, A.schoolId, { personId: stu, academicYearId: year, kind: 'behavior', authorRole: 'homeroom', body: '한별 학생은 드리미 예시학교에서 성실함' }));
    await asUser(A.userId, (db) => rec.closeRecordYear(db, A.schoolId, stu, year, { base_version: 3, requestKey: 'f4-rec-2026-4', reason: '서술 반영' }));
    const school = (await su.query('select name from public.schools where id = $1', [A.schoolId])).rows[0].name as string;
    for (const format of ['kr_alt_record', 'us_transcript'] as const) {
      const d = await asUser(A.userId, (db) => rec.publishRecordDocument(db, A.schoolId, { format, personId: stu, blind: true }));
      const json = JSON.stringify(d.content);
      for (const secret of ['한별 학생', 'Hanbyeol Kim', school, '999001']) expect(json).not.toContain(secret);
      const doc = await asUser(A.userId, (db) => rec.recordDocument(db, A.schoolId, d.id));
      expect(doc.blind).toBe(true);
    }
  });

  it('학교 소개서: 계약의 재학생 수·척도·CEEB, 소개 글은 출력 프로필 판에서', async () => {
    await asUser(A.userId, (db) => rec.saveOutputProfile(db, A.schoolId, { format: 'us_school_profile', code: 'profile_en', settings: { description: 'A project-based Christian school.' }, why: '대학 제출용', base_version: 0 }));
    await expect(asUser(A.userId, (db) => rec.saveOutputProfile(db, A.schoolId, { format: 'us_school_profile', code: 'profile_en', settings: {}, base_version: 0 }))).rejects.toThrow('새 판');
    await expect(asUser(A.userId, (db) => rec.saveOutputProfile(db, A.schoolId, { format: 'nope' as 'us_transcript', code: 'bad_one', settings: {}, base_version: 0 }))).rejects.toThrow('형식');
    const d = await asUser(A.userId, (db) => rec.publishRecordDocument(db, A.schoolId, { format: 'us_school_profile', profileCode: 'profile_en' }));
    const c = d.content as { description: string; school: { ceeb: string }; enrollment: number; grading_scale: { grade: string }[] };
    expect(c).toMatchObject({ description: 'A project-based Christian school.', school: { ceeb: '999001' } });
    expect(c.enrollment).toBeGreaterThanOrEqual(2);
    expect(c.grading_scale.map((b) => b.grade)).toContain('A');
    const doc = await asUser(A.userId, (db) => rec.recordDocument(db, A.schoolId, d.id));
    expect(doc).toMatchObject({ format: 'us_school_profile', closure_ids: [] });
  });
});

describe('공개 기록·학교 간 거부', () => {
  it('발급·제출은 받는 곳·목적·근거를 남기고, 다른 학교는 발행·조회·공개를 못 한다', async () => {
    const d = await asUser(A.userId, (db) => rec.publishRecordDocument(db, A.schoolId, { format: 'us_transcript', personId: stu }));
    const id = await asUser(A.userId, (db) => rec.recordDisclosure(db, A.schoolId, { documentId: d.id, recipient: 'Example University Admissions', purpose: 'admission', basis: '학생·보호자 요청서' }));
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(asUser(A.userId, (db) => rec.recordDisclosure(db, A.schoolId, { documentId: d.id, recipient: ' ', purpose: 'admission' }))).rejects.toThrow('형식');
    // B: A 문서 공개 기록·조회·발행 모두 거부
    await expect(asUser(B.userId, (db) => rec.recordDisclosure(db, B.schoolId, { documentId: d.id, recipient: 'x', purpose: 'admission' }))).rejects.toThrow('찾을 수 없습니다');
    await expect(asUser(B.userId, (db) => rec.recordDocument(db, B.schoolId, d.id))).rejects.toThrow('찾을 수 없습니다');
    await expect(asUser(B.userId, (db) => rec.publishRecordDocument(db, B.schoolId, { format: 'us_transcript', personId: stu }))).rejects.toThrow('마감 판이 없습니다');
    const [rc] = await asUser(A.userId, (db) => rec.recordClosures(db, A.schoolId, stu));
    await expect(asUser(B.userId, (db) => db.query(`select app.publish_record_document($1, $2)`, [B.schoolId, JSON.stringify({ format: 'us_transcript', closure_ids: [rc.id], content: {} })])))
      .rejects.toThrow('찾을 수 없습니다');
    for (const t of ['record_closures', 'record_documents', 'disclosures', 'output_profiles']) {
      expect((await asUser(B.userId, (db) => db.query(`select 1 from public.${t}`))).rows).toEqual([]);
    }
    // 같은 학교 교사도 발행은 못 한다(관리자만)
    const { rows: [u] } = await su.query(`insert into private.app_users(email, display_name) values ('f4-teacher@school-a.test', 'f4') returning id`);
    await su.query(`insert into public.memberships(user_id, school_id, role) values ($1, $2, 'teacher')`, [u.id, A.schoolId]);
    await expect(asUser(u.id, (db) => rec.publishRecordDocument(db, A.schoolId, { format: 'kr_alt_record', personId: stu }))).rejects.toMatchObject({ code: '42501' });
    void peer; void math; void art;
  });
});
