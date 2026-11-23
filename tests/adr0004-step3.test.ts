/** ADR 0004 단계 3: 평가 초안·마감 판·정정 사슬
 *  통과 조건: 모집단·통계의 동시 확정, 중복 요청·부분 실패·정정 보존 (+ 봉인, 담당자 권한, 두 학교 양방향) */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool, INSPECTOR_ID } = await import('@/lib/db');
const pp = await import('@/lib/people');
const cs = await import('@/lib/courses');
const gr = await import('@/lib/grading');

type S = { schoolId: string; userId: string };
let A: S;
let B: S;
let su: pg.Client;
let teacherLead: string;
let teacherOther: string;

async function addAccount(email: string, schoolId: string, role: 'admin' | 'teacher') {
  const { rows: [u] } = await su.query(`insert into private.app_users(email, display_name) values ($1, $2) returning id`, [email, email.split('@')[0]]);
  await su.query('insert into public.memberships(user_id, school_id, role) values ($1, $2, $3)', [u.id, schoolId, role]);
  return u.id as string;
}

/** 합성 학교: 중등 학생 3명, 필수(학기 시작)·창의(승인, P/F 허용) 갈래, 과목 3개 */
async function setupSchool(s: S) {
  const { rows: [rule] } = await su.query(
    `insert into public.school_rules(school_id, topic, version, value, decision, evidence, confirmed_by)
     values ($1, 'period_structure', 1, $2, 'accepted', '[]', $3) returning id`,
    [s.schoolId, JSON.stringify({ periods: [{ id: 'p1', label: '1학기', assessments: [] }] }), s.userId]);
  return asUser(s.userId, async (db) => {
    const middle = await pp.addSchoolLevel(db, s.schoolId, { code: 'middle', name: '중등' });
    const year = await pp.addAcademicYear(db, s.schoolId, { label: '2026', startsOn: '2026-03-01', endsOn: '2027-03-01' });
    await pp.createTermsFromRule(db, s.schoolId, year, rule.id);
    const [term] = await pp.listTerms(db, s.schoolId, year);
    await pp.setTermDates(db, s.schoolId, term.id, '2026-03-02', '2026-07-20');
    const students: string[] = [];
    for (const n of ['학생 가', '학생 나', '학생 다']) {
      const p = await pp.addPerson(db, s.schoolId, { name: n });
      await pp.enroll(db, s.schoolId, { personId: p, levelId: middle, startsOn: '2026-03-02' });
      students.push(p);
    }
    const required = await cs.addCourseType(db, s.schoolId, { code: 'required', name: '필수' });
    const creative = await cs.addCourseType(db, s.schoolId, { code: 'creative', name: '창의' });
    await cs.setCourseTypeRule(db, s.schoolId, required, { trigger: 'term_start', publishable: false, passFailAllowed: false });
    await cs.setCourseTypeRule(db, s.schoolId, creative, { trigger: 'approval', publishable: true, passFailAllowed: true });
    const subjects = {
      kor: await cs.addSubject(db, s.schoolId, { code: 'KOR', name: '국어' }),
      sci: await cs.addSubject(db, s.schoolId, { code: 'SCI', name: '과학' }),
      prj: await cs.addSubject(db, s.schoolId, { code: 'PRJ', name: '프로젝트' }),
    };
    const kor = await cs.createOffering(db, s.schoolId, { termId: term.id, subjectId: subjects.kor, typeId: required, levelId: middle, credits: 3 });
    const sci = await cs.createOffering(db, s.schoolId, { termId: term.id, subjectId: subjects.sci, typeId: required, levelId: middle, credits: 3 });
    const prj = await cs.createOffering(db, s.schoolId, { termId: term.id, subjectId: subjects.prj, typeId: creative, levelId: middle, credits: 1, passFail: true });
    await cs.startTerm(db, s.schoolId, term.id);
    await cs.approve(db, s.schoolId, prj, 1);
    let r = (await cs.offering(db, s.schoolId, prj)).revision;
    for (const p of students) r = await cs.setEnrollment(db, s.schoolId, prj, p, 'enrolled', r);
    return { students, kor, sci, prj };
  });
}
type Setup = Awaited<ReturnType<typeof setupSchool>>;
let a: Setup;
let b: Setup;
let korExam1: string;
let korExam2: string;
let closureV1: string;

const rev = async (s: S, offeringId: string) => (await asUser(s.userId, (db) => cs.offering(db, s.schoolId, offeringId))).revision;
const key = (k: string) => `req_${k}_${Math.random().toString(36).slice(2, 10)}`;

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  a = await setupSchool(A);
  b = await setupSchool(B);
  teacherLead = await addAccount('lead3@school-a.test', A.schoolId, 'teacher');
  teacherOther = await addAccount('other3@school-a.test', A.schoolId, 'teacher');
  await asUser(A.userId, async (db) => {
    const lp = await pp.addPerson(db, A.schoolId, { name: '국어 담당' });
    const op = await pp.addPerson(db, A.schoolId, { name: '다른 교사' });
    await pp.linkAccount(db, A.schoolId, lp, teacherLead);
    await pp.linkAccount(db, A.schoolId, op, teacherOther);
    await cs.assignStaff(db, A.schoolId, a.kor, lp, 'lead');
  });
});
afterAll(async () => {
  await su.end();
  await getPool().end();
});

describe('쓰기 경계', () => {
  it('명령 함수는 app_writer 소유이고, 요청 역할은 초안·판 표에 직접 쓸 수 없다', async () => {
    const { rows } = await su.query(
      `select p.proname, pg_get_userbyid(p.proowner) as owner, p.prosecdef, has_function_privilege('anon', p.oid, 'execute') as anon_exec
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'app' and p.proname = any($1)`,
      [['add_assessment', 'record_result', 'set_population_exclusion', 'close_offering', 'reopen_for_correction']]);
    expect(rows).toHaveLength(5);
    for (const f of rows) expect(f).toMatchObject({ owner: 'app_writer', prosecdef: true, anon_exec: false });
    for (const sql of [
      `insert into public.offering_closures(school_id, offering_id, version, request_key, base_revision, member_count, n) values ('${A.schoolId}', '${a.kor}', 1, 'req_direct_x', 1, 0, 0)`,
      `update public.assessment_results set score = 100`,
      `delete from public.population_exclusions`,
    ]) await expect(asUser(A.userId, (db) => db.query(sql))).rejects.toMatchObject({ code: '42501' });
  });
});

describe('초안과 첫 마감: 모집단·성적·통계를 한 번에 확정', () => {
  it('담당 교사는 점수를 기록하지만 마감은 못 하고, 다른 교사는 기록도 못 한다', async () => {
    let r = await rev(A, a.kor);
    korExam1 = await asUser(teacherLead, (db) => gr.addAssessment(db, A.schoolId, a.kor, { name: '중간 평가', maxScore: 100, weight: 1 }, r));
    r = await rev(A, a.kor);
    korExam2 = await asUser(teacherLead, (db) => gr.addAssessment(db, A.schoolId, a.kor, { name: '기말 평가', maxScore: 50, weight: 1 }, r));
    const scores: [number, number][] = [[80, 40], [60, 25], [70, 35]];
    r = await rev(A, a.kor);
    for (const [i, [s1, s2]] of scores.entries()) {
      r = await asUser(teacherLead, (db) => gr.recordResult(db, A.schoolId, korExam1, a.students[i], { score: s1 }, r));
      r = await asUser(teacherLead, (db) => gr.recordResult(db, A.schoolId, korExam2, a.students[i], { score: s2 }, r));
    }
    await expect(asUser(teacherLead, (db) => gr.recordResult(db, A.schoolId, korExam2, a.students[0], { score: 51 }, r))).rejects.toMatchObject({ code: '22023' });
    await expect(asUser(teacherOther, (db) => gr.recordResult(db, A.schoolId, korExam1, a.students[0], { score: 1 }, r))).rejects.toMatchObject({ code: '42501' });
    r = await asUser(teacherLead, (db) => gr.setExclusion(db, A.schoolId, a.kor, a.students[2], '장기 결석으로 평가 불가(합성 예시)', r));
    await expect(asUser(teacherLead, (db) => gr.closeOffering(db, A.schoolId, a.kor, key('lead'), r))).rejects.toMatchObject({ code: '42501' });
  });

  it('마감하면 판 1에 모집단(포함·제외 사유)·총점·통계가 함께 얼고 수업은 마감 상태가 된다', async () => {
    const r = await rev(A, a.kor);
    closureV1 = await asUser(A.userId, (db) => gr.closeOffering(db, A.schoolId, a.kor, 'req_kor_first_close', r));
    const [c] = await asUser(A.userId, (db) => gr.closures(db, A.schoolId, a.kor));
    // 총점 = Σ(점수/만점×가중치)/Σ가중치×100: 가 80, 나 55, 다 70(제외). 통계는 포함 2명: 평균 67.5, 모집단 표준편차 12.5
    expect(c).toMatchObject({ id: closureV1, version: 1, previous_id: null, member_count: 3, n: 2, mean: '67.50', sd: '12.50', sealed: true });
    const members = await asUser(A.userId, (db) => gr.closureMembers(db, A.schoolId, closureV1));
    const by = Object.fromEntries(members.map((m) => [m.person_id, m]));
    expect(by[a.students[0]]).toMatchObject({ included: true, total: '80.00' });
    expect(by[a.students[1]]).toMatchObject({ included: true, total: '55.00' });
    expect(by[a.students[2]]).toMatchObject({ included: false, exclusion_reason: '장기 결석으로 평가 불가(합성 예시)', total: '70.00' });
    // 통계는 판의 자식 행과 같은 시점의 값이다
    const { rows: [chk] } = await su.query(
      `select count(*) filter (where included and total is not null)::int as n, round(avg(total) filter (where included), 2)::text as mean
         from public.closure_members where closure_id = $1`, [closureV1]);
    expect(chk).toEqual({ n: 2, mean: '67.50' });
    expect((await asUser(A.userId, (db) => cs.offering(db, A.schoolId, a.kor))).status).toBe('closed');
    // 마감 뒤에는 초안을 고칠 수 없다
    const r2 = await rev(A, a.kor);
    await expect(asUser(teacherLead, (db) => gr.recordResult(db, A.schoolId, korExam1, a.students[0], { score: 100 }, r2))).rejects.toMatchObject({ code: 'P0001' });
  });

  it('봉인한 판과 자식 행은 표 소유자도 고치거나 지우거나 더할 수 없다', async () => {
    await expect(su.query(`update public.offering_closures set mean = 99 where id = $1`, [closureV1])).rejects.toMatchObject({ code: 'P0001' });
    await expect(su.query(`delete from public.offering_closures where id = $1`, [closureV1])).rejects.toMatchObject({ code: 'P0001' });
    await expect(su.query(`update public.closure_members set total = 100 where closure_id = $1`, [closureV1])).rejects.toMatchObject({ code: 'P0001' });
    await expect(su.query(`delete from public.closure_results where closure_id = $1`, [closureV1])).rejects.toMatchObject({ code: 'P0001' });
    const p = (await su.query(`select id from public.people where school_id = $1 limit 1`, [A.schoolId])).rows[0].id;
    await expect(su.query(
      `insert into public.closure_members(closure_id, school_id, offering_id, person_id, included) values ($1, $2, $3, $4, true)`,
      [closureV1, A.schoolId, a.kor, p])).rejects.toMatchObject({ code: 'P0001' });
  });
});

describe('중복 요청', () => {
  it('같은 요청 키·같은 입력으로 다시 보내면 같은 판을 돌려주고, 같은 키에 다른 입력은 거부한다', async () => {
    const { rows: [c] } = await su.query('select base_revision from public.offering_closures where id = $1', [closureV1]);
    expect(await asUser(A.userId, (db) => gr.closeOffering(db, A.schoolId, a.kor, 'req_kor_first_close', c.base_revision))).toBe(closureV1);
    await expect(asUser(A.userId, (db) => gr.closeOffering(db, A.schoolId, a.kor, 'req_kor_first_close', c.base_revision + 1)))
      .rejects.toMatchObject({ code: 'P0001' });
    expect((await asUser(A.userId, (db) => gr.closures(db, A.schoolId, a.kor))).length).toBe(1);
  });
});

describe('부분 실패', () => {
  it('자식 행 하나가 실패하면 판·자식·수업 상태가 모두 롤백되고, 같은 요청 키로 다시 하면 된다', async () => {
    let r = await rev(A, a.prj);
    const pass = await asUser(A.userId, (db) => gr.addAssessment(db, A.schoolId, a.prj, { name: '발표', maxScore: 1 }, r));
    r = await rev(A, a.prj);
    for (const p of a.students) r = await asUser(A.userId, (db) => gr.recordResult(db, A.schoolId, pass, p, { score: 1, passed: true }, r));
    // 시험용 장애 주입: 세 번째 학생의 평가 사본을 넣을 때 실패
    await su.query(`create or replace function public._fail_once() returns trigger language plpgsql as $$
      begin if new.person_id = '${a.students[2]}' and new.offering_id = '${a.prj}' then raise exception 'injected failure'; end if; return new; end $$`);
    await su.query('create trigger _fail_once before insert on public.closure_results for each row execute function public._fail_once()');
    try {
      await expect(asUser(A.userId, (db) => gr.closeOffering(db, A.schoolId, a.prj, 'req_prj_close_1', r))).rejects.toThrow('injected failure');
    } finally {
      await su.query('drop trigger _fail_once on public.closure_results');
      await su.query('drop function public._fail_once()');
    }
    const { rows: [left] } = await su.query(
      `select (select count(*) from public.offering_closures where offering_id = $1)::int as closures,
              (select count(*) from public.closure_members where offering_id = $1)::int as members,
              (select status from public.course_offerings where id = $1) as status,
              (select revision from public.course_offerings where id = $1) as revision`, [a.prj]);
    expect(left).toEqual({ closures: 0, members: 0, status: 'active', revision: r });
    const id = await asUser(A.userId, (db) => gr.closeOffering(db, A.schoolId, a.prj, 'req_prj_close_1', r));
    const members = await asUser(A.userId, (db) => gr.closureMembers(db, A.schoolId, id));
    expect(members.map((m) => m.passed)).toEqual([true, true, true]);
  });
});

describe('동시 확정', () => {
  it('같은 판을 본 두 관리자가 동시에 마감하면 하나만 판을 만들고, 모집단과 통계가 서로 맞는다', async () => {
    let r = await rev(A, a.sci);
    const ex = await asUser(A.userId, (db) => gr.addAssessment(db, A.schoolId, a.sci, { name: '실험 보고서', maxScore: 10 }, r));
    r = await rev(A, a.sci);
    for (const [i, p] of a.students.entries()) r = await asUser(A.userId, (db) => gr.recordResult(db, A.schoolId, ex, p, { score: 6 + i }, r));
    const results = await Promise.allSettled([
      asUser(A.userId, (db) => gr.closeOffering(db, A.schoolId, a.sci, key('x'), r)),
      asUser(A.userId, (db) => gr.closeOffering(db, A.schoolId, a.sci, key('y'), r)),
    ]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect((results.find((x) => x.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: 'P0001' });
    const all = await asUser(A.userId, (db) => gr.closures(db, A.schoolId, a.sci));
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ member_count: 3, n: 3, mean: '70.00', sd: '8.16' });
  });

  it('마감과 점수 기록이 동시에 오면 둘 중 하나만 그 판으로 성공한다(같은 잠금)', async () => {
    let r = await rev(B, b.kor);
    const ex = await asUser(B.userId, (db) => gr.addAssessment(db, B.schoolId, b.kor, { name: 'Quiz', maxScore: 10 }, r));
    r = await rev(B, b.kor);
    for (const p of b.students) r = await asUser(B.userId, (db) => gr.recordResult(db, B.schoolId, ex, p, { score: 5 }, r));
    const results = await Promise.allSettled([
      asUser(B.userId, (db) => gr.closeOffering(db, B.schoolId, b.kor, key('b'), r)),
      asUser(B.userId, (db) => gr.recordResult(db, B.schoolId, ex, b.students[0], { score: 10 }, r)),
    ]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const [c] = await asUser(B.userId, (db) => gr.closures(db, B.schoolId, b.kor));
    if (results[0].status === 'fulfilled') {
      // 마감이 이겼으면 판의 평균은 기록 전 값(5점 = 50.00)
      expect(c.mean).toBe('50.00');
    } else {
      expect(c).toBeUndefined();
    }
  });
});

describe('정정 사슬', () => {
  it('정정을 열고 고친 뒤 새 판을 만들면, 이전 판은 그대로 남고 새 판이 이전 판을 가리킨다', async () => {
    let r = await rev(A, a.kor);
    r = await asUser(A.userId, (db) => gr.reopenForCorrection(db, A.schoolId, a.kor, r));
    expect((await asUser(A.userId, (db) => cs.offering(db, A.schoolId, a.kor))).status).toBe('correcting');
    r = await asUser(teacherLead, (db) => gr.recordResult(db, A.schoolId, korExam2, a.students[1], { score: 45 }, r));
    // 정정 마감에는 사유가 필요하다
    await expect(asUser(A.userId, (db) => gr.closeOffering(db, A.schoolId, a.kor, key('nr'), r))).rejects.toMatchObject({ code: '22023' });
    const v2 = await asUser(A.userId, (db) => gr.closeOffering(db, A.schoolId, a.kor, key('v2'), r, '기말 채점 오류 정정(합성 예시)'));
    const list = await asUser(A.userId, (db) => gr.closures(db, A.schoolId, a.kor));
    expect(list.map((c) => [c.version, c.previous_id])).toEqual([[2, closureV1], [1, null]]);
    expect(list[0]).toMatchObject({ correction_reason: '기말 채점 오류 정정(합성 예시)', mean: '77.50', sd: '2.50' });
    expect(list[1]).toMatchObject({ mean: '67.50', sd: '12.50' });
    const old = await asUser(A.userId, (db) => gr.closureMembers(db, A.schoolId, closureV1));
    expect(old.find((m) => m.person_id === a.students[1])?.total).toBe('55.00');
    const neu = await asUser(A.userId, (db) => gr.closureMembers(db, A.schoolId, v2));
    expect(neu.find((m) => m.person_id === a.students[1])?.total).toBe('75.00');
  });

  it('한 판에서 정정 판이 둘로 갈라질 수 없다', async () => {
    await expect(su.query(
      `insert into public.offering_closures(school_id, offering_id, version, previous_id, correction_reason, request_key, base_revision, member_count, n, approved_by)
       values ($1, $2, 3, $3, '갈래 시도', 'req_fork_attempt', 1, 0, 0, $4)`, [A.schoolId, a.kor, closureV1, A.userId]))
      .rejects.toMatchObject({ code: '23505' });
  });
});

describe('두 학교 양방향 거부', () => {
  it('다른 학교의 판·초안은 읽히지 않고 쓸 수도 없다 (A↔B)', async () => {
    for (const [me, other, ot] of [[A, B, b], [B, A, a]] as const) {
      const { rows: [seen] } = await asUser(me.userId, (db) => db.query(
        `select (select count(*) from public.offering_closures where school_id = $1)
              + (select count(*) from public.closure_members where school_id = $1)
              + (select count(*) from public.assessments where school_id = $1)
              + (select count(*) from public.assessment_results where school_id = $1) as n`, [other.schoolId]));
      expect(seen.n).toBe('0');
      await expect(asUser(me.userId, (db) => gr.closeOffering(db, other.schoolId, ot.sci, key('evil'), 1))).rejects.toMatchObject({ code: '42501' });
      await expect(asUser(me.userId, (db) => gr.reopenForCorrection(db, other.schoolId, ot.kor, 1))).rejects.toMatchObject({ code: '42501' });
    }
    // 자기 학교 이름으로 다른 학교 평가 항목에 점수를 넣을 수 없다
    await expect(asUser(B.userId, (db) => gr.recordResult(db, B.schoolId, korExam1, b.students[0], { score: 1 }, 1))).rejects.toMatchObject({ code: 'P0002' });
  });

  it('점검 계정은 판을 읽지만 마감할 수 없다', async () => {
    expect((await asUser(INSPECTOR_ID, (db) => gr.closures(db, A.schoolId, a.kor))).length).toBe(2);
    await expect(asUser(INSPECTOR_ID, (db) => gr.closeOffering(db, A.schoolId, a.sci, key('insp'), 1))).rejects.toMatchObject({ code: '25006' });
  });
});
