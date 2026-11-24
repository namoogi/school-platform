/** ADR 0004 단계 2: 수업·수강·갈래 규칙 판·명령 경계
 *  통과 조건: 필수과목 포함 모든 갈래의 생성 계기, 담당자 권한, 동시 편집 충돌 (+ 두 학교 양방향 거부·학교 간 FK) */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool, INSPECTOR_ID } = await import('@/lib/db');
const pp = await import('@/lib/people');
const cs = await import('@/lib/courses');

type S = { schoolId: string; userId: string };
let A: S;
let B: S;
let su: pg.Client;

const periods = (labels: string[]) => ({ periods: labels.map((l, i) => ({ id: `p${i + 1}`, label: l, assessments: [] })) });

async function addAccount(email: string, schoolId: string, role: 'admin' | 'teacher') {
  const { rows: [u] } = await su.query(`insert into private.app_users(email, display_name) values ($1, $2) returning id`, [email, email.split('@')[0]]);
  await su.query('insert into public.memberships(user_id, school_id, role) values ($1, $2, $3)', [u.id, schoolId, role]);
  return u.id as string;
}
async function addRule(s: S, value: unknown) {
  const { rows: [r] } = await su.query(
    `insert into public.school_rules(school_id, topic, version, value, decision, evidence, confirmed_by)
     values ($1, 'period_structure', 1, $2, 'accepted', '[]', $3) returning id`, [s.schoolId, JSON.stringify(value), s.userId]);
  return r.id as string;
}

/** 학교 하나의 합성 자료: 학교급 2개, 학년도·학기, 학생 4명(중등 3·고등 1), 갈래 3종(필수·선택·창의), 과목 3개 */
async function setupSchool(s: S, labels: string[]) {
  const rule = await addRule(s, periods(labels));
  return asUser(s.userId, async (db) => {
    const middle = await pp.addSchoolLevel(db, s.schoolId, { code: 'middle', name: '중등' });
    const high = await pp.addSchoolLevel(db, s.schoolId, { code: 'high', name: '고등' });
    const year = await pp.addAcademicYear(db, s.schoolId, { label: '2026', startsOn: '2026-03-01', endsOn: '2027-03-01' });
    await pp.createTermsFromRule(db, s.schoolId, year, rule);
    const [t1] = await pp.listTerms(db, s.schoolId, year);
    await pp.setTermDates(db, s.schoolId, t1.id, '2026-03-02', '2026-07-20');
    const students: string[] = [];
    for (const n of ['학생 가', '학생 나', '학생 다']) {
      const p = await pp.addPerson(db, s.schoolId, { name: n });
      await pp.enroll(db, s.schoolId, { personId: p, levelId: middle, startsOn: '2026-03-02' });
      students.push(p);
    }
    const highStudent = await pp.addPerson(db, s.schoolId, { name: '학생 라(고등)' });
    await pp.enroll(db, s.schoolId, { personId: highStudent, levelId: high, startsOn: '2026-03-02' });
    const required = await cs.addCourseType(db, s.schoolId, { code: 'required', name: '필수' });
    const elective = await cs.addCourseType(db, s.schoolId, { code: 'elective', name: '선택' });
    const creative = await cs.addCourseType(db, s.schoolId, { code: 'creative', name: '창의' });
    await cs.setCourseTypeRule(db, s.schoolId, required, { trigger: 'term_start', publishable: false, passFailAllowed: false });
    await cs.setCourseTypeRule(db, s.schoolId, elective, { trigger: 'application_close', publishable: true, passFailAllowed: true });
    await cs.setCourseTypeRule(db, s.schoolId, creative, { trigger: 'approval', publishable: true, passFailAllowed: true });
    const kor = await cs.addSubject(db, s.schoolId, { code: 'KOR', name: '국어', levelId: middle });
    const art = await cs.addSubject(db, s.schoolId, { code: 'ART', name: '미술' });
    const prj = await cs.addSubject(db, s.schoolId, { code: 'PRJ', name: '프로젝트' });
    return { middle, high, year, term: t1.id, students, highStudent, types: { required, elective, creative }, subjects: { kor, art, prj } };
  });
}
type Setup = Awaited<ReturnType<typeof setupSchool>>;
let a: Setup;
let b: Setup;
let teacherLead: string; // 계정
let teacherOther: string; // 계정
let leadPerson: string;
let otherPerson: string;
let requiredA: string;
let electiveA: string;
let creativeA: string;

const rev = async (s: S, offeringId: string) => (await asUser(s.userId, (db) => cs.offering(db, s.schoolId, offeringId))).revision;

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  a = await setupSchool(A, ['1학기', '2학기']);
  b = await setupSchool(B, ['Term 1', 'Term 2', 'Term 3']);
  teacherLead = await addAccount('lead@school-a.test', A.schoolId, 'teacher');
  teacherOther = await addAccount('other@school-a.test', A.schoolId, 'teacher');
  ({ leadPerson, otherPerson } = await asUser(A.userId, async (db) => {
    const lp = await pp.addPerson(db, A.schoolId, { name: '담당 교사' });
    const op = await pp.addPerson(db, A.schoolId, { name: '다른 교사' });
    await pp.linkAccount(db, A.schoolId, lp, teacherLead);
    await pp.linkAccount(db, A.schoolId, op, teacherOther);
    return { leadPerson: lp, otherPerson: op };
  }));
});
afterAll(async () => {
  await su.end();
  await getPool().end();
});

describe('쓰기 경계', () => {
  it('명령 함수는 app_writer 소유이고, 잠금 도우미는 요청 역할이 직접 부를 수 없다', async () => {
    const { rows } = await su.query(
      `select p.proname, pg_get_userbyid(p.proowner) as owner, p.prosecdef,
              has_function_privilege('anon', p.oid, 'execute') as anon_exec
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'app' and p.proname = any($1)`,
      [['add_subject', 'add_course_type', 'set_course_type_rule', 'create_offering', 'assign_offering_staff', 'remove_offering_staff',
        'apply_offering', 'close_applications', 'approve_offering', 'start_term', 'set_offering_enrollment']]);
    expect(rows).toHaveLength(11);
    for (const f of rows) expect(f).toMatchObject({ owner: 'app_writer', prosecdef: true, anon_exec: false });
    const { rows: [l] } = await su.query(
      `select has_function_privilege('authenticated', 'app.lock_offering_for_change(uuid, uuid, integer)', 'execute') as auth,
              has_function_privilege('app_writer', 'app.lock_offering_for_change(uuid, uuid, integer)', 'execute') as writer`);
    expect(l).toEqual({ auth: false, writer: true });
  });

  it('요청 역할은 새 표에 직접 쓸 수 없다', async () => {
    for (const sql of [
      `insert into public.course_types(school_id, code, name) values ('${A.schoolId}', 'x', 'x')`,
      `update public.course_offerings set status = 'active'`,
      `update public.offering_enrollments set status = 'enrolled'`,
      `delete from public.offering_staff`,
    ]) await expect(asUser(A.userId, (db) => db.query(sql))).rejects.toMatchObject({ code: '42501' });
  });
});

describe('갈래별 생성 계기 (필수과목 포함)', () => {
  it('필수(학기 시작): 신청 없이 학기 시작 명령으로 활성화되고, 그 학교급 학생 전원이 자동 수강한다', async () => {
    requiredA = await asUser(A.userId, (db) => cs.createOffering(db, A.schoolId, { termId: a.term, subjectId: a.subjects.kor, typeId: a.types.required, levelId: a.middle, credits: 3 }));
    expect((await asUser(A.userId, (db) => cs.offering(db, A.schoolId, requiredA))).status).toBe('planned');
    // 다른 계기의 명령은 거부
    await expect(asUser(A.userId, async (db) => cs.approve(db, A.schoolId, requiredA, 1))).rejects.toMatchObject({ code: 'P0001' });
    await expect(asUser(A.userId, async (db) => cs.closeApplications(db, A.schoolId, requiredA, 1))).rejects.toMatchObject({ code: 'P0001' });
    expect(await asUser(A.userId, (db) => cs.startTerm(db, A.schoolId, a.term))).toBe(1);
    const roster = await asUser(A.userId, (db) => cs.roster(db, A.schoolId, requiredA));
    expect(roster.map((r) => [r.person_id, r.status, r.source]).sort()).toEqual(a.students.map((p) => [p, 'enrolled', 'required']).sort());
    expect(roster.some((r) => r.person_id === a.highStudent)).toBe(false);
    // 다시 불러도 중복되지 않는다
    expect(await asUser(A.userId, (db) => cs.startTerm(db, A.schoolId, a.term))).toBe(0);
    expect((await asUser(A.userId, (db) => cs.roster(db, A.schoolId, requiredA))).length).toBe(3);
  });

  it('필수 갈래는 P/F를 허용하지 않는다(규칙 판)', async () => {
    await expect(asUser(A.userId, (db) => cs.createOffering(db, A.schoolId, { termId: a.term, subjectId: a.subjects.kor, typeId: a.types.required, levelId: a.middle, credits: 3, passFail: true, section: 'B' })))
      .rejects.toMatchObject({ code: '22023' });
  });

  it('선택(신청 마감): 만들면 신청을 받고, 마감하면 신청 순서대로 정원까지 확정·나머지 반려', async () => {
    electiveA = await asUser(A.userId, (db) => cs.createOffering(db, A.schoolId, { termId: a.term, subjectId: a.subjects.art, typeId: a.types.elective, levelId: a.middle, credits: 2, passFail: true, capacity: 2 }));
    let r = await rev(A, electiveA);
    for (const p of a.students) r = await asUser(A.userId, (db) => cs.apply(db, A.schoolId, electiveA, p, r));
    // 다른 학교급 학생은 신청할 수 없다
    await expect(asUser(A.userId, (db) => cs.apply(db, A.schoolId, electiveA, a.highStudent, r))).rejects.toMatchObject({ code: '22023' });
    await expect(asUser(A.userId, (db) => cs.approve(db, A.schoolId, electiveA, r))).rejects.toMatchObject({ code: 'P0001' });
    expect(await asUser(A.userId, (db) => cs.closeApplications(db, A.schoolId, electiveA, r))).toBe(2);
    const roster = await asUser(A.userId, (db) => cs.roster(db, A.schoolId, electiveA));
    const byPerson = Object.fromEntries(roster.map((x) => [x.person_id, x.status]));
    expect([byPerson[a.students[0]], byPerson[a.students[1]], byPerson[a.students[2]]]).toEqual(['enrolled', 'enrolled', 'rejected']);
    expect((await asUser(A.userId, (db) => cs.offering(db, A.schoolId, electiveA))).status).toBe('active');
  });

  it('창의(승인): 승인 명령으로만 활성화되고, 학기 시작 명령은 건드리지 않는다', async () => {
    creativeA = await asUser(A.userId, (db) => cs.createOffering(db, A.schoolId, { termId: a.term, subjectId: a.subjects.prj, typeId: a.types.creative, levelId: a.middle, credits: 1 }));
    expect(await asUser(A.userId, (db) => cs.startTerm(db, A.schoolId, a.term))).toBe(0);
    expect((await asUser(A.userId, (db) => cs.offering(db, A.schoolId, creativeA))).status).toBe('planned');
    await asUser(A.userId, (db) => cs.approve(db, A.schoolId, creativeA, 1));
    expect((await asUser(A.userId, (db) => cs.offering(db, A.schoolId, creativeA))).status).toBe('active');
  });

  it('규칙이 새 판으로 바뀌어도 기존 개설은 만들 때의 판을 따르고, 새 개설만 새 판을 쓴다', async () => {
    expect(await asUser(A.userId, (db) => cs.setCourseTypeRule(db, A.schoolId, a.types.elective, { trigger: 'approval', publishable: false, passFailAllowed: false, note: '2학기부터 승인제(합성 예시)' }))).toBe(2);
    const list = await asUser(A.userId, (db) => cs.offeringsOfTerm(db, A.schoolId, a.term, a.middle));
    expect(list.find((o) => o.id === electiveA)).toMatchObject({ rule_version: 1, creation_trigger: 'application_close', status: 'active' });
    const next = await asUser(A.userId, (db) => cs.createOffering(db, A.schoolId, { termId: a.term, subjectId: a.subjects.art, typeId: a.types.elective, levelId: a.middle, credits: 2, section: '2반' }));
    const after = await asUser(A.userId, (db) => cs.offeringsOfTerm(db, A.schoolId, a.term, a.middle));
    expect(after.find((o) => o.id === next)).toMatchObject({ rule_version: 2, creation_trigger: 'approval', status: 'planned' });
    // 규칙 판은 표 소유자도 고칠 수 없다
    await expect(su.query(`update public.course_type_rules set creation_trigger = 'term_start' where course_type_id = $1`, [a.types.elective]))
      .rejects.toMatchObject({ code: 'P0001' });
    // 개설의 고정된 규칙 판도 바꿀 수 없다
    await expect(su.query('update public.course_offerings set rule_id = rule_id where id = $1 and false', [electiveA])).resolves.toBeTruthy();
    const { rows: [v2] } = await su.query('select id from public.course_type_rules where course_type_id = $1 and version = 2', [a.types.elective]);
    await expect(su.query('update public.course_offerings set rule_id = $1 where id = $2', [v2.id, electiveA])).rejects.toMatchObject({ code: 'P0001' });
  });
});

describe('담당자 권한', () => {
  it('담당(lead)은 자기 수업의 수강을 바꾸고, 다른 교사·외부 강사·다른 수업은 거부', async () => {
    await asUser(A.userId, async (db) => {
      await cs.assignStaff(db, A.schoolId, requiredA, leadPerson, 'lead');
      await cs.assignStaff(db, A.schoolId, electiveA, otherPerson, 'external');
    });
    // 담당 하나만
    await expect(asUser(A.userId, (db) => cs.assignStaff(db, A.schoolId, requiredA, otherPerson, 'lead'))).rejects.toMatchObject({ code: 'P0001' });
    let r = await rev(A, requiredA);
    r = await asUser(teacherLead, (db) => cs.setEnrollment(db, A.schoolId, requiredA, a.students[2], 'withdrawn', r));
    expect((await asUser(teacherLead, (db) => cs.roster(db, A.schoolId, requiredA))).find((x) => x.person_id === a.students[2])?.status).toBe('withdrawn');
    // 배정이 없는 교사
    await expect(asUser(teacherOther, (db) => cs.setEnrollment(db, A.schoolId, requiredA, a.students[2], 'enrolled', r))).rejects.toMatchObject({ code: '42501' });
    // 외부 강사는 수강을 바꾸지 않는다
    const re = await rev(A, electiveA);
    await expect(asUser(teacherOther, (db) => cs.setEnrollment(db, A.schoolId, electiveA, a.students[2], 'enrolled', re))).rejects.toMatchObject({ code: '42501' });
    // 담당이어도 다른 수업은 거부
    await expect(asUser(teacherLead, (db) => cs.setEnrollment(db, A.schoolId, electiveA, a.students[2], 'enrolled', re))).rejects.toMatchObject({ code: '42501' });
    // 담당도 개설·마감·승인은 못 한다(관리자 전용)
    await expect(asUser(teacherLead, (db) => cs.startTerm(db, A.schoolId, a.term))).rejects.toMatchObject({ code: '42501' });
    // 담당에서 빠지면 다음 요청부터 거부
    await asUser(A.userId, (db) => cs.removeStaff(db, A.schoolId, requiredA, leadPerson));
    await expect(asUser(teacherLead, (db) => cs.setEnrollment(db, A.schoolId, requiredA, a.students[2], 'enrolled', r))).rejects.toMatchObject({ code: '42501' });
  });

  it('P/F 선택은 P/F 수업에서만', async () => {
    const r = await rev(A, requiredA);
    await expect(asUser(A.userId, (db) => cs.setEnrollment(db, A.schoolId, requiredA, a.students[0], 'enrolled', r, true))).rejects.toMatchObject({ code: '22023' });
    const re = await rev(A, electiveA);
    await asUser(A.userId, (db) => cs.setEnrollment(db, A.schoolId, electiveA, a.students[0], 'enrolled', re, true));
    expect((await asUser(A.userId, (db) => cs.roster(db, A.schoolId, electiveA))).find((x) => x.person_id === a.students[0])?.pass_fail_choice).toBe(true);
  });
});

describe('동시 편집 충돌', () => {
  it('화면이 본 판(revision)이 오래되면 409로 거부하고 아무것도 바꾸지 않는다', async () => {
    const r = await rev(A, requiredA);
    await asUser(A.userId, (db) => cs.setEnrollment(db, A.schoolId, requiredA, a.students[2], 'enrolled', r));
    await expect(asUser(A.userId, (db) => cs.setEnrollment(db, A.schoolId, requiredA, a.students[2], 'withdrawn', r))).rejects.toMatchObject({ code: 'P0001' });
    expect((await asUser(A.userId, (db) => cs.roster(db, A.schoolId, requiredA))).find((x) => x.person_id === a.students[2])?.status).toBe('enrolled');
  });

  it('같은 판으로 동시에 저장하면 하나만 성공한다(개설 행 잠금)', async () => {
    const r = await rev(A, requiredA);
    const results = await Promise.allSettled([
      asUser(A.userId, (db) => cs.setEnrollment(db, A.schoolId, requiredA, a.students[0], 'withdrawn', r)),
      asUser(A.userId, (db) => cs.setEnrollment(db, A.schoolId, requiredA, a.students[1], 'withdrawn', r)),
    ]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((x) => x.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ code: 'P0001' });
    expect(await rev(A, requiredA)).toBe(r + 1);
    const withdrawn = (await asUser(A.userId, (db) => cs.roster(db, A.schoolId, requiredA))).filter((x) => x.status === 'withdrawn');
    expect(withdrawn).toHaveLength(1);
  });
});

describe('두 학교 양방향 거부', () => {
  it('다른 학교의 개설·수강·규칙은 읽히지 않는다 (A↔B)', async () => {
    const bRequired = await asUser(B.userId, (db) => cs.createOffering(db, B.schoolId, { termId: b.term, subjectId: b.subjects.kor, typeId: b.types.required, levelId: b.middle, credits: 3 }));
    await asUser(B.userId, (db) => cs.startTerm(db, B.schoolId, b.term));
    for (const [me, other, ot] of [[A, B, b], [B, A, a]] as const) {
      const seen = await asUser(me.userId, async (db) => ({
        offerings: (await cs.offeringsOfTerm(db, other.schoolId, ot.term, ot.middle)).length,
        raw: (await db.query(`select (select count(*) from public.course_offerings where school_id = $1)
            + (select count(*) from public.offering_enrollments where school_id = $1)
            + (select count(*) from public.course_type_rules where school_id = $1)
            + (select count(*) from public.subjects where school_id = $1) as n`, [other.schoolId])).rows[0].n,
      }));
      expect(seen).toEqual({ offerings: 0, raw: '0' });
    }
    expect(bRequired).toBeTruthy();
  });

  it('다른 학교에 쓰거나 다른 학교의 학기·과목·사람을 가리킬 수 없다 (A↔B)', async () => {
    for (const [me, my, ot, other] of [[A, a, b, B], [B, b, a, A]] as const) {
      await expect(asUser(me.userId, (db) => cs.addCourseType(db, other.schoolId, { code: 'evil', name: '침입' }))).rejects.toMatchObject({ code: '42501' });
      // 다른 학교의 학기·과목으로 개설
      await expect(asUser(me.userId, (db) => cs.createOffering(db, me.schoolId, { termId: ot.term, subjectId: my.subjects.art, typeId: my.types.creative, levelId: my.middle, credits: 1, section: 'x' })))
        .rejects.toMatchObject({ code: 'P0002' });
      await expect(asUser(me.userId, (db) => cs.createOffering(db, me.schoolId, { termId: my.term, subjectId: ot.subjects.art, typeId: my.types.creative, levelId: my.middle, credits: 1, section: 'y' })))
        .rejects.toMatchObject({ code: 'P0002' });
      // 다른 학교의 갈래 → 규칙 판을 찾지 못함
      await expect(asUser(me.userId, (db) => cs.createOffering(db, me.schoolId, { termId: my.term, subjectId: my.subjects.art, typeId: ot.types.creative, levelId: my.middle, credits: 1, section: 'z' })))
        .rejects.toMatchObject({ code: 'P0002' });
    }
    // 다른 학교의 개설은 수강을 바꿀 수 없다(관리자도)
    await expect(asUser(B.userId, (db) => cs.setEnrollment(db, A.schoolId, requiredA, a.students[0], 'withdrawn', 1))).rejects.toMatchObject({ code: '42501' });
    // 자기 학교 개설에 다른 학교 사람을 넣을 수 없다(복합 FK)
    const r = await rev(A, creativeA);
    await expect(asUser(A.userId, (db) => cs.setEnrollment(db, A.schoolId, creativeA, b.students[0], 'withdrawn', r))).rejects.toMatchObject({ code: 'P0002' });
    await expect(asUser(A.userId, (db) => cs.assignStaff(db, A.schoolId, creativeA, b.students[0], 'assistant'))).rejects.toMatchObject({ code: 'P0002' });
  });
});

describe('관제 세션 계정(전체 관리자, ADR 0024)', () => {
  it('개설을 읽는다', async () => {
    expect((await asUser(INSPECTOR_ID, (db) => cs.offeringsOfTerm(db, A.schoolId, a.term, a.middle))).length).toBeGreaterThan(0);
  });
});
