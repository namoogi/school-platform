/** ADR 0042 마감 연결: 계산식 판으로 마감, DB 가 원장에서 입력을 다시 조립해 대조, 보충 이수 사건, 학교 간 거부 양방향 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const pp = await import('@/lib/people');
const cs = await import('@/lib/courses');
const g = await import('@/lib/grading');
const cr = await import('@/lib/calc-rules');
const { PRESETS, evaluate } = await import('@/lib/calc/expr');

type S = { schoolId: string; userId: string };
let A: S; let B: S;
let su: pg.Client;
let teacherA: string; let otherTeacherA: string;
let offering: string; let exam: string; let task: string;
const st: string[] = [];

async function account(email: string, s: S, role: 'admin' | 'teacher') {
  const { rows: [u] } = await su.query(`insert into private.app_users(email, display_name) values ($1, $1) returning id`, [email]);
  await su.query('insert into public.memberships(user_id, school_id, role) values ($1, $2, $3)', [u.id, s.schoolId, role]);
  return u.id as string;
}
const period = (person: string, day: string, kind: string) => su.query(
  `insert into public.attendance_events(school_id, person_id, day, scope, period, offering_id, kind_code, recorded_by) values ($1, $2, $3, 'period', 1, $4, $5, $6)`,
  [A.schoolId, person, day, offering, kind, A.userId]);

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  teacherA = await account('calc-lead@school-a.test', A, 'teacher');
  otherTeacherA = await account('calc-other@school-a.test', A, 'teacher');
  const { rows: [rule] } = await su.query(
    `insert into public.school_rules(school_id, topic, version, value, decision, evidence, confirmed_by)
     values ($1, 'period_structure', 1, '{"periods":[{"id":"s1","label":"1학기","assessments":[]}]}', 'accepted', '[]', $2) returning id`,
    [A.schoolId, A.userId]);
  const setup = await asUser(A.userId, async (db) => {
    const level = await pp.addSchoolLevel(db, A.schoolId, { code: 'high', name: '고등' });
    const y = await pp.addAcademicYear(db, A.schoolId, { label: '2026', startsOn: '2026-03-01', endsOn: '2027-03-01' });
    await pp.createTermsFromRule(db, A.schoolId, y, rule.id);
    const terms = await pp.listTerms(db, A.schoolId, y);
    const type = await cs.addCourseType(db, A.schoolId, { code: 'common', name: '공통' });
    await cs.setCourseTypeRule(db, A.schoolId, type, { trigger: 'term_start', publishable: false, passFailAllowed: false });
    const subj = await cs.addSubject(db, A.schoolId, { code: 'KOR1', name: '공통국어1', levelId: level });
    const off = await cs.createOffering(db, A.schoolId, { termId: terms[0]?.id, subjectId: subj, typeId: type, levelId: level, credits: 4 });
    const lead = await pp.addPerson(db, A.schoolId, { name: '마감 연결 담당 교사' });
    await pp.linkAccount(db, A.schoolId, lead, teacherA);
    await cs.assignStaff(db, A.schoolId, off, lead, 'lead');
    const ids: string[] = [];
    for (let i = 1; i <= 4; i++) ids.push(await pp.addPerson(db, A.schoolId, { name: `가명 학생 ${i}` }));
    const ex = await g.addAssessment(db, A.schoolId, off, { code: 'exam', title: { ko: '정기시험' }, kind: 'exam', axis: 'course', weight: 60, maxScore: 100 });
    const tk = await g.addAssessment(db, A.schoolId, off, { code: 'task', title: { ko: '수행평가' }, kind: 'task', axis: 'course', weight: 40, maxScore: 100 });
    return { off, ids, ex, tk };
  });
  offering = setup.off; exam = setup.ex; task = setup.tk; st.push(...setup.ids);
  // 합성 수강: 4번째 학생은 철회
  for (const [i, p] of st.entries()) {
    await su.query(`insert into public.offering_enrollments(school_id, offering_id, person_id, status, source, created_by, updated_by)
                    values ($1, $2, $3, $4, 'staff', $5, $5)`, [A.schoolId, offering, p, i === 3 ? 'withdrawn' : 'enrolled', A.userId]);
  }
  await asUser(teacherA, async (db) => {
    // 1번 95점(A), 2번 39점(40% 미도달), 3번 수행평가 없음
    for (const [p, e, t] of [[st[0], 95, 95], [st[1], 39, 39], [st[2], 80, null]] as const) {
      await g.recordResult(db, A.schoolId, exam, p, { score: e });
      if (t != null) await g.recordResult(db, A.schoolId, task, p, { score: t });
    }
  });
  // 과목 출석: 1번 3/3, 2번 2/3(정확히 2/3 은 이수), 3번 기록 없음
  for (const d of ['2026-03-02', '2026-03-03', '2026-03-04']) await period(st[0], d, 'present');
  await period(st[1], '2026-03-02', 'present'); await period(st[1], '2026-03-03', 'present'); await period(st[1], '2026-03-04', 'absent');
  await asUser(A.userId, (db) => cr.saveCalcRule(db, A.schoolId, { code: 'kr_common', title: { ko: '공통과목' }, spec: PRESETS.kr_high_common.spec, base_version: 0 }));
}, 60_000);
afterAll(async () => { await su.end(); await getPool().end(); });

describe('계산 입력 조립', () => {
  it('수강 중인 학생만, 평가 항목·과목 출석률·P/F·학점. 담당 교사는 보고 다른 교사는 못 본다', async () => {
    const inputs = await asUser(teacherA, (db) => g.offeringCalcInputs(db, A.schoolId, offering));
    expect(Object.keys(inputs).sort()).toEqual([st[0], st[1], st[2]].sort());
    expect(inputs[st[0]]).toMatchObject({ items: { exam: { score: 95, max: 100, weight: 60 }, task: { score: 95 } }, attendance: { rate: 1 }, course: { pass_fail: false }, credits: 4, support: {} });
    expect((inputs[st[1]].attendance as { rate: number }).rate).toBeCloseTo(2 / 3, 5);
    expect(inputs[st[2]]).toMatchObject({ items: { task: { score: null } }, attendance: { rate: null } });
    await expect(asUser(otherTeacherA, (db) => g.offeringCalcInputs(db, A.schoolId, offering))).rejects.toThrow('맡은 교사');
  });
  it('학교 간 거부 양방향: B 관리자는 A 수업을 못 보고, A 관리자는 B 이름으로 못 본다', async () => {
    await expect(asUser(B.userId, (db) => g.offeringCalcInputs(db, A.schoolId, offering))).rejects.toThrow();
    await expect(asUser(B.userId, (db) => g.offeringCalcInputs(db, B.schoolId, offering))).rejects.toThrow();
    await expect(asUser(A.userId, (db) => g.offeringCalcInputs(db, B.schoolId, offering))).rejects.toThrow();
  });
});

describe('보충 이수 사건', () => {
  it('담당 교사가 기록, 최근 사건이 현재 값. 다른 교사·수강하지 않는 학생·다른 학교는 거부', async () => {
    await asUser(teacherA, (db) => g.recordRemediation(db, A.schoolId, { offeringId: offering, personId: st[1], kind: 'achievement', completed: false }));
    await asUser(teacherA, (db) => g.recordRemediation(db, A.schoolId, { offeringId: offering, personId: st[1], kind: 'achievement', completed: true, note: '보장지도 6차시' }));
    const inputs = await asUser(teacherA, (db) => g.offeringCalcInputs(db, A.schoolId, offering));
    expect(inputs[st[1]].support).toEqual({ achievement: true });
    await expect(asUser(otherTeacherA, (db) => g.recordRemediation(db, A.schoolId, { offeringId: offering, personId: st[1], kind: 'achievement', completed: true }))).rejects.toThrow('맡은 교사');
    await expect(asUser(teacherA, (db) => g.recordRemediation(db, A.schoolId, { offeringId: offering, personId: st[3], kind: 'attendance', completed: true }))).rejects.toThrow('수강 중인 학생');
    await expect(asUser(B.userId, (db) => g.recordRemediation(db, B.schoolId, { offeringId: offering, personId: st[1], kind: 'achievement', completed: true }))).rejects.toThrow();
    await expect(asUser(teacherA, (db) => g.recordRemediation(db, A.schoolId, { offeringId: offering, personId: st[1], kind: 'other', completed: true }))).rejects.toThrow();
    const { rows } = await su.query('select count(*)::int as n from public.remediation_events where offering_id = $1', [offering]);
    expect(rows[0].n).toBe(2);
  });
});

describe('계산식으로 마감', () => {
  it('앱이 바꾼 입력·없는 학생·틀린 등급은 DB 가 거부한다', async () => {
    const calc = await asUser(A.userId, (db) => g.calcForClosure(db, A.schoolId, offering, 'kr_common'));
    const close = (c: unknown, rk: string) => asUser(A.userId, (db) => db.query('select app.close_offering($1, $2, $3)', [A.schoolId, offering,
      JSON.stringify({ base_version: 0, request_key: rk, calc: c })]));
    const tampered = structuredClone(calc);
    (tampered.results[st[1]].input as { items: { exam: { score: number } } }).items.exam.score = 90;
    await expect(close(tampered, 'calc-tamper-1')).rejects.toMatchObject({ code: 'P0409' });
    const missing = structuredClone(calc); delete missing.results[st[2]];
    await expect(close(missing, 'calc-missing-1')).rejects.toMatchObject({ code: 'P0409' });
    const extra = structuredClone(calc); extra.results[st[3]] = { ...calc.results[st[0]] };
    await expect(close(extra, 'calc-extra-1')).rejects.toThrow('수강 중이 아닌');
    const badLevel = structuredClone(calc); badLevel.results[st[0]].level = '<script>';
    await expect(close(badLevel, 'calc-badlevel-1')).rejects.toThrow('등급');
    await expect(close({ ...calc, version: 99 }, 'calc-nover-1')).rejects.toThrow('계산식 판을 찾을 수 없습니다');
  });

  it('보장지도를 마친 40% 미도달 학생은 E·이수, 출석 자료가 없는 학생은 미완료. 식·입력·결과가 마감 판에 얼고 다시 계산하면 같다', async () => {
    const r = await asUser(A.userId, (db) => g.closeOffering(db, A.schoolId, offering, { base_version: 0, requestKey: 'calc-close-0001', calcCode: 'kr_common' }));
    expect(r).toMatchObject({ version: 1, calc: true });
    const c = await asUser(A.userId, (db) => g.offeringClosure(db, A.schoolId, offering));
    expect(c).toMatchObject({ calc_code: 'kr_common', calc_version: 1 });
    const by = Object.fromEntries(c!.results.map((x) => [x.person_id, x]));
    expect(by[st[0]]).toMatchObject({ final_score: 95, level_code: 'A', attempt_status: 'completed', credits_earned: 4, in_stats: true });
    expect(by[st[1]]).toMatchObject({ final_score: 39, level_code: 'E', attempt_status: 'completed', credits_earned: 4 });
    // 수행평가가 비면 한국식 합계(정규화 없음)는 그만큼 낮아진다(48 → E). 과목 출석 기록이 없어 이수 여부는 자료 없음 → 미완료
    expect(by[st[2]]).toMatchObject({ final_score: 48, level_code: 'E', attempt_status: 'incomplete', credits_earned: 0, in_stats: false });
    expect(by[st[3]]).toMatchObject({ attempt_status: 'withdrawn', credits_attempted: 0 });
    // 재현: 얼린 식 + 얼린 입력 → 같은 결과
    const { rows: [cl] } = await su.query('select id, calc_spec from public.offering_closures where offering_id = $1 and version = 1', [offering]);
    const { rows } = await su.query('select person_id, calc_input, final_score::float, level_code from public.closure_results where closure_id = $1 and calc_input is not null', [cl.id]);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      const out = evaluate(cl.calc_spec, row.calc_input);
      expect([out.score, out.level]).toEqual([row.final_score, row.level_code]);
    }
    const { rows: [stats] } = await su.query('select n, mean::float from public.closure_stats where closure_id = $1', [cl.id]);
    expect(stats).toEqual({ n: 2, mean: 67 });
  });

  it('계산한 뒤 점수가 바뀌면 그 계산 결과로는 마감하지 못한다(정정 판도 같음)', async () => {
    const calc = await asUser(A.userId, (db) => g.calcForClosure(db, A.schoolId, offering, 'kr_common'));
    await asUser(A.userId, (db) => g.recordResult(db, A.schoolId, task, st[2], { score: 70, reason: '수행평가 늦게 제출' }));
    await expect(asUser(A.userId, (db) => db.query('select app.close_offering($1, $2, $3)', [A.schoolId, offering,
      JSON.stringify({ base_version: 1, reason: '수행평가 반영', request_key: 'calc-stale-0001', calc })]))).rejects.toMatchObject({ code: 'P0409' });
    const r = await asUser(A.userId, (db) => g.closeOffering(db, A.schoolId, offering, { base_version: 1, reason: '수행평가 반영', requestKey: 'calc-close-0002', calcCode: 'kr_common' }));
    expect(r.version).toBe(2);
    const c = await asUser(A.userId, (db) => g.offeringClosure(db, A.schoolId, offering));
    // 과목 출석 기록이 없으면 이수 여부는 자료 없음 → 미완료(통과로 접지 않음)
    expect(c!.results.find((x) => x.person_id === st[2])).toMatchObject({ final_score: 76, level_code: 'C', attempt_status: 'incomplete', credits_earned: 0 });
  });

  it('없는 계산식 이름은 거부, 계산식 없이 마감하면 이전 동작(척도)', async () => {
    await expect(asUser(A.userId, (db) => g.closeOffering(db, A.schoolId, offering, { base_version: 2, reason: 'x', requestKey: 'calc-none-0001', calcCode: 'nope_rule' }))).rejects.toThrow();
    await asUser(A.userId, (db) => g.closeOffering(db, A.schoolId, offering, { base_version: 2, reason: '척도로 다시', requestKey: 'calc-plain-0001' }));
    const c = await asUser(A.userId, (db) => g.offeringClosure(db, A.schoolId, offering));
    expect(c).toMatchObject({ version: 3, calc_code: null, calc_version: null });
  });

  it('이수 판정 칸이 없는 식(중학교)은 점수·등급이 있으면 이수, 소수 셋째 자리 이하 점수는 거부(Codex #169)', async () => {
    await asUser(A.userId, (db) => cr.saveCalcRule(db, A.schoolId, { code: 'kr_mid', spec: PRESETS.kr_middle.spec, base_version: 0 }));
    const r = await asUser(A.userId, (db) => g.closeOffering(db, A.schoolId, offering, { base_version: 3, reason: '중학교 식', requestKey: 'calc-mid-0001', calcCode: 'kr_mid' }));
    expect(r.version).toBe(4);
    const c = await asUser(A.userId, (db) => g.offeringClosure(db, A.schoolId, offering));
    const by = Object.fromEntries(c!.results.map((x) => [x.person_id, x]));
    expect(by[st[0]]).toMatchObject({ level_code: 'A', attempt_status: 'completed', credits_earned: 4, in_stats: true });
    expect(by[st[2]]).toMatchObject({ final_score: 76, level_code: 'C', attempt_status: 'completed' });
    expect(c!.stats.n).toBe(3);
    await asUser(A.userId, (db) => cr.saveCalcRule(db, A.schoolId, { code: 'third', spec: { outputs: { score: { op: '/', args: [1, 3] } } }, base_version: 0 }));
    await expect(asUser(A.userId, (db) => g.closeOffering(db, A.schoolId, offering, { base_version: 4, reason: 'x', requestKey: 'calc-third-0001', calcCode: 'third' }))).rejects.toThrow('소수 둘째 자리');
  });
});
