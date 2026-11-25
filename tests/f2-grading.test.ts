/** 57차 ADR 0025 F2 — 평가·마감: 척도 경계값(KR·US), 가중 원점수, 마감 판 통계, 409·요청 키·갈라짐 방지, 마감 후 쓰기 거부, 정정 판, 표기 판, 서술 한도, 학교 간 거부 */
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
  teacherA = await account('f2-lead@school-a.test', A, 'teacher');
  otherTeacherA = await account('f2-other@school-a.test', A, 'teacher');
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
  ({ id: krScale } = await asUser(A.userId, (db) => g.saveScalePreset(db, A.schoolId, 'kr_achievement')));
  ({ id: usScale } = await asUser(A.userId, (db) => g.saveScalePreset(db, A.schoolId, 'us_letter')));
});
afterAll(async () => { await su.end(); await getPool().end(); });

describe('척도·정책 판', () => {
  it('정책은 판으로 쌓고 낡은 판은 409, 척도 띠의 경계값(이상 포함)', async () => {
    await asUser(A.userId, (db) => g.saveGradingPolicy(db, A.schoolId, { score_digits: 2, final_digits: 0, stats: { sd: 'population', digits: 1 }, narrative_limits: { subject_detail: 20 } },
      { why: '원점수 소수 2자리, 학생부는 반올림 정수, 모표준편차(포털 0348 교훈)', base_version: 0 }));
    await expect(asUser(A.userId, (db) => g.saveGradingPolicy(db, A.schoolId, {}, { base_version: 0 }))).rejects.toThrow('새 판');
    const { rows } = await su.query(`select app.band_for(bands, 90) ->> 'code' as a, app.band_for(bands, 89.99) ->> 'code' as b, app.band_for(bands, 39.99) ->> 'code' as i
                                     from public.scale_versions where scale_id = $1`, [krScale]);
    expect(rows[0]).toEqual({ a: 'A', b: 'B', i: 'I' });
    await expect(asUser(A.userId, (db) => g.saveScale(db, A.schoolId, { code: 'kr_achievement', kind: 'letter', bands: g.SCALE_PRESETS.kr_achievement.bands, base_version: 0 })))
      .rejects.toThrow('새 판');
  });
});

describe('평가 항목·결과', () => {
  it('담당 교사·관리자만 항목과 결과를 쓴다. 다른 교사·다른 학교는 거부, 범위 밖 점수 거부', async () => {
    const mid = await asUser(teacherA, (db) => g.addAssessment(db, A.schoolId, offering, { code: 'mid', title: { ko: '중간' }, weight: 40, maxScore: 100 }));
    const fin = await asUser(teacherA, (db) => g.addAssessment(db, A.schoolId, offering, { code: 'final', title: { ko: '기말' }, weight: 40, maxScore: 100 }));
    const proj = await asUser(teacherA, (db) => g.addAssessment(db, A.schoolId, offering, { code: 'proj', title: { ko: '프로젝트' }, kind: 'project', weight: 20, maxScore: 50 }));
    await expect(asUser(otherTeacherA, (db) => g.addAssessment(db, A.schoolId, offering, { code: 'x', title: { ko: 'x' }, weight: 1, maxScore: 10 }))).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(B.userId, (db) => g.recordResult(db, A.schoolId, mid, students[0], { score: 50 }))).rejects.toThrow('찾을 수 없습니다'); // B에게는 항목 자체가 안 보임
    await expect(asUser(teacherA, (db) => g.recordResult(db, A.schoolId, mid, students[0], { score: 101 }))).rejects.toThrow('범위');
    // 학생 0: 89.5(→ 최종 90 → A, US A), 학생 1: 79.99…(→ 80 → B), 학생 2: 40 경계(E), 학생 3: 프로젝트 빠짐(미완료)
    const scores: [string, number | null, number | null, number | null][] = [
      [students[0], 89, 90, 44.75], [students[1], 80, 79.99, 40], [students[2], 40, 40, 20], [students[3], 95, 95, null],
    ];
    await asUser(teacherA, async (db) => {
      for (const [p, m, f, pr] of scores) {
        if (m != null) await g.recordResult(db, A.schoolId, mid, p, { score: m });
        if (f != null) await g.recordResult(db, A.schoolId, fin, p, { score: f });
        if (pr != null) await g.recordResult(db, A.schoolId, proj, p, { score: pr });
      }
      await g.recordResult(db, A.schoolId, mid, students[2], { score: 40, comment: '재채점 확인' }); // 같은 값 다시: 앞 결과를 가리키는 새 사건
    });
    const cur = await asUser(teacherA, (db) => g.currentResults(db, A.schoolId, offering));
    const s2mid = cur.find((r) => r.person_id === students[2] && r.assessment_code === 'mid')!;
    expect(s2mid.corrects_id).not.toBeNull();
    expect(cur.filter((r) => r.assessment_code === 'mid')).toHaveLength(4);
    // 결과 사건은 고칠 수 없다
    await expect(su.query(`update public.assessment_results set score = 0 where assessment_id = $1`, [mid])).rejects.toThrow('바꿀 수 없는');
  });
});

describe('수업 마감 판', () => {
  it('가중 원점수·최종 점수·등급·이수·학점·통계를 얼린다(철회·미완료는 통계 밖)', async () => {
    const c = await asUser(A.userId, (db) => g.closeOffering(db, A.schoolId, offering, { base_version: 0, requestKey: 'close-math-2026-1', scaleId: krScale }));
    expect(c).toMatchObject({ version: 1, repeated: false });
    const closure = await asUser(A.userId, (db) => g.offeringClosure(db, A.schoolId, offering));
    const by = Object.fromEntries(closure!.results.map((r) => [r.person_id, r]));
    // 학생 0: (89×.4 + 90×.4 + 44.75/50×100×.2) = 35.6 + 36 + 17.9 = 89.5 → 최종 90 → A
    expect(by[students[0]]).toMatchObject({ raw_score: 89.5, final_score: 90, level_code: 'A', attempt_status: 'completed', credits_earned: 4, in_stats: true });
    // 학생 1: 32 + 31.996 + 16 = 79.996 → 원점수 80.00(소수 2자리) → 최종 80 → B
    expect(by[students[1]]).toMatchObject({ raw_score: 80, final_score: 80, level_code: 'B' });
    // 학생 2: 16 + 16 + 8 = 40 → E(40 이상), 이수
    expect(by[students[2]]).toMatchObject({ final_score: 40, level_code: 'E', attempt_status: 'completed' });
    expect(by[students[3]]).toMatchObject({ raw_score: null, attempt_status: 'incomplete', credits_earned: 0, in_stats: false });
    expect(by[students[4]]).toMatchObject({ attempt_status: 'withdrawn', credits_attempted: 0, in_stats: false });
    // 통계: 90, 80, 40 → 평균 70.0, 모표준편차 21.6
    expect(closure!.stats).toEqual({ n: 3, mean: 70, sd: 21.6 });
    expect(closure!.policy_version).toBe(1);
  });

  it('같은 요청 키는 같은 판, 낡은 base_version은 409, 자식 행·판은 고치거나 더할 수 없다', async () => {
    const again = await asUser(A.userId, (db) => g.closeOffering(db, A.schoolId, offering, { base_version: 0, requestKey: 'close-math-2026-1', scaleId: krScale }));
    expect(again).toMatchObject({ version: 1, repeated: true });
    await expect(asUser(A.userId, (db) => g.closeOffering(db, A.schoolId, offering, { base_version: 0, requestKey: 'close-math-2026-1b', scaleId: krScale }))).rejects.toThrow('새 마감 판');
    await expect(asUser(teacherA, (db) => g.closeOffering(db, A.schoolId, offering, { base_version: 1, requestKey: 'teacher-close-1', reason: 'x' }))).rejects.toMatchObject({ code: '42501' });
    const closure = await asUser(A.userId, (db) => g.offeringClosure(db, A.schoolId, offering));
    await expect(su.query(`update public.closure_results set final_score = 100 where closure_id = $1`, [closure!.id])).rejects.toThrow('바꿀 수 없는');
    await expect(su.query(`insert into public.closure_results(school_id, closure_id, person_id, attempt_status, credits_attempted, credits_earned, in_stats)
                           values ($1, $2, $3, 'completed', 4, 4, true)`, [A.schoolId, closure!.id, students[3]])).rejects.toThrow('더하지 않습니다');
  });

  it('마감 뒤: 교사는 결과를 못 쓰고, 관리자는 사유와 함께 정정 → 정정 판(이전 판을 가리킴, 갈라짐 없음)', async () => {
    const proj = (await asUser(A.userId, (db) => db.query(`select id from public.assessments where offering_id = $1 and code = 'proj'`, [offering]))).rows[0].id;
    await expect(asUser(teacherA, (db) => g.recordResult(db, A.schoolId, proj, students[3], { score: 40 }))).rejects.toThrow('사유와 함께');
    await expect(asUser(A.userId, (db) => g.recordResult(db, A.schoolId, proj, students[3], { score: 40 }))).rejects.toThrow('사유와 함께');
    await asUser(A.userId, (db) => g.recordResult(db, A.schoolId, proj, students[3], { score: 40, reason: '제출물 누락 확인 — 학업성적관리위원회 심의' }));
    await expect(asUser(A.userId, (db) => g.closeOffering(db, A.schoolId, offering, { base_version: 1, requestKey: 'close-math-2026-1-c1' }))).rejects.toThrow('사유');
    const c2 = await asUser(A.userId, (db) => g.closeOffering(db, A.schoolId, offering,
      { base_version: 1, requestKey: 'close-math-2026-1-c1', reason: '학생 4 프로젝트 점수 정정', scaleId: krScale }));
    expect(c2.version).toBe(2);
    const v2 = await asUser(A.userId, (db) => g.offeringClosure(db, A.schoolId, offering));
    const v1 = await asUser(A.userId, (db) => g.offeringClosure(db, A.schoolId, offering, 1));
    expect(v2!.previous_id).toBe(v1!.id);
    // 학생 4: 38 + 38 + 16 = 92 → A, 통계 n 4
    expect(v2!.results.find((r) => r.person_id === students[3])).toMatchObject({ final_score: 92, level_code: 'A', attempt_status: 'completed' });
    expect(v2!.stats.n).toBe(4);
    expect(v1!.results.find((r) => r.person_id === students[3])).toMatchObject({ attempt_status: 'incomplete' }); // 옛 판은 그대로
    // 갈라짐 방지: 같은 이전 판(1)에서 또 정정 판을 만들 수 없다
    await expect(su.query(`insert into public.offering_closures(school_id, offering_id, version, previous_id, reason, request_key, policy, credits, pass_fail, closed_by)
      values ($1, $2, 3, $3, 'fork', 'fork-attempt-1', '{}', 4, false, $4)`, [A.schoolId, offering, v1!.id, A.userId])).rejects.toThrow();
  });

  it('같은 원점수를 미국 척도로 마감하면 글자 성적만 바뀐다(척도는 판)', async () => {
    const c3 = await asUser(A.userId, (db) => g.closeOffering(db, A.schoolId, offering,
      { base_version: 2, requestKey: 'close-math-2026-1-us', reason: '미국식 성적증명서용 척도 적용 시험', scaleId: usScale }));
    const v3 = await asUser(A.userId, (db) => g.offeringClosure(db, A.schoolId, offering, c3.version));
    expect(v3!.results.find((r) => r.person_id === students[2])).toMatchObject({ final_score: 40, level_code: 'F', attempt_status: 'failed', credits_earned: 0 });
    expect(v3!.scale_version).toBe(1);
  });
});

describe('표기 판·서술·재수강', () => {
  it('과목 표기는 용도별 판, 학교 간 거부', async () => {
    await asUser(A.userId, (db) => g.setSubjectLabel(db, A.schoolId, subject, { purpose: 'all', label: { ko: '수학', en: 'Mathematics' }, base_version: 0 }));
    await asUser(A.userId, (db) => g.setSubjectLabel(db, A.schoolId, subject, { purpose: 'transcript', label: { en: 'Algebra II' }, why: '대학 제출용 표기', base_version: 0 }));
    await expect(asUser(A.userId, (db) => g.setSubjectLabel(db, A.schoolId, subject, { purpose: 'transcript', label: { en: 'x' }, base_version: 0 }))).rejects.toThrow('새 판');
    expect((await asUser(A.userId, (db) => g.subjectLabel(db, A.schoolId, subject, 'transcript'))).label).toEqual({ en: 'Algebra II' });
    expect((await asUser(A.userId, (db) => g.subjectLabel(db, A.schoolId, subject, 'record'))).label).toEqual({ ko: '수학', en: 'Mathematics' });
    await expect(asUser(B.userId, (db) => g.setSubjectLabel(db, A.schoolId, subject, { label: { en: 'x' }, base_version: 1 }))).rejects.toMatchObject({ code: '42501' });
  });

  it('서술은 글자 수 한도(정책 판)를 따르고, 마감한 수업의 서술은 관리자가 사유와 함께', async () => {
    await expect(asUser(teacherA, (db) => g.recordNarrative(db, A.schoolId, { personId: students[0], offeringId: offering, academicYearId: year,
      kind: 'subject_detail', authorRole: 'subject_teacher', body: '가'.repeat(25), reason: 'x' }))).rejects.toThrow();
    await asUser(A.userId, (db) => g.recordNarrative(db, A.schoolId, { personId: students[0], offeringId: offering, academicYearId: year,
      kind: 'subject_detail', authorRole: 'subject_teacher', body: '함수의 뜻을 설명함', reason: '마감 후 기재 보완' }));
    await asUser(A.userId, (db) => g.recordNarrative(db, A.schoolId, { personId: students[0], academicYearId: year, kind: 'behavior', authorRole: 'homeroom', body: '성실함' }));
    await expect(asUser(B.userId, (db) => g.recordNarrative(db, A.schoolId, { personId: students[0], academicYearId: year, kind: 'behavior', authorRole: 'homeroom', body: 'x' })))
      .rejects.toMatchObject({ code: '42501' });
  });

  it('재수강은 같은 과목의 개설끼리만 잇는다', async () => {
    await expect(asUser(A.userId, (db) => g.linkRetake(db, A.schoolId, students[2], offering, offering))).rejects.toThrow();
  });
});
