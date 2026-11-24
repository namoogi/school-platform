/** ADR 0004 단계 1: 사람·계정 연결·학사 차원 (두 학교 양방향 거부, 학교 간 FK 거부, 동명이인·개명·다중 계정) */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool, INSPECTOR_ID } = await import('@/lib/db');
const pp = await import('@/lib/people');
const admin = await import('@/lib/admin');

type S = { schoolId: string; userId: string };
let A: S;
let B: S;
let su: pg.Client; // 표 소유자(검사·합성 자료 준비 전용)
let teacherA: string;
let secondAccountA: string;
let ruleA1: string;
let ruleA2: string;
let ruleB1: string;

const periods = (labels: string[]) => ({ periods: labels.map((l, i) => ({ id: `p${i + 1}`, label: l, assessments: [] })) });

async function addAccount(email: string, schoolId: string, role: 'admin' | 'teacher') {
  const { rows: [u] } = await su.query(
    `insert into private.app_users(email, display_name) values ($1, $2) returning id`, [email, email.split('@')[0]]);
  await su.query('insert into public.memberships(user_id, school_id, role) values ($1, $2, $3)', [u.id, schoolId, role]);
  return u.id as string;
}
async function addRule(s: S, version: number, value: unknown) {
  const { rows: [r] } = await su.query(
    `insert into public.school_rules(school_id, topic, version, value, decision, evidence, confirmed_by)
     values ($1, 'period_structure', $2, $3, 'accepted', '[]', $4) returning id`, [s.schoolId, version, JSON.stringify(value), s.userId]);
  return r.id as string;
}

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  // 합성 계정: A의 교사, A 관리자(사람 한 명이 쓰는 두 번째 계정)
  teacherA = await addAccount('teacher@school-a.test', A.schoolId, 'teacher');
  secondAccountA = await addAccount('second@school-a.test', A.schoolId, 'admin');
  ruleA1 = await addRule(A, 1, periods(['1학기', '2학기']));
  ruleA2 = await addRule(A, 2, periods(['봄', '여름', '가을']));
  ruleB1 = await addRule(B, 1, periods(['Term 1', 'Term 2', 'Term 3']));
});
afterAll(async () => {
  await su.end();
  await getPool().end();
});

/** 학교 하나에 학교급·학년도·기수·반 기본값을 만든다 */
async function setupDimensions(s: S, rule: string) {
  return asUser(s.userId, async (db) => {
    const middle = await pp.addSchoolLevel(db, s.schoolId, { code: 'middle', name: '중등', sortOrder: 1 });
    const high = await pp.addSchoolLevel(db, s.schoolId, { code: 'high', name: '고등', sortOrder: 2 });
    const year = await pp.addAcademicYear(db, s.schoolId, { label: '2026', startsOn: '2026-03-01', endsOn: '2027-03-01' });
    const terms = await pp.createTermsFromRule(db, s.schoolId, year, rule);
    const cohort = await pp.addCohort(db, s.schoolId, { levelId: middle, entryYearId: year, label: '2026 입학 중등' });
    const homeroom = await pp.addHomeroom(db, s.schoolId, { yearId: year, levelId: middle, grade: 1, name: '1반' });
    return { middle, high, year, terms, cohort, homeroom };
  });
}
let dimA: Awaited<ReturnType<typeof setupDimensions>>;
let dimB: Awaited<ReturnType<typeof setupDimensions>>;

describe('쓰기 경계: 제한 소유 역할의 명령 함수', () => {
  it('app_writer는 로그인·슈퍼유저·BYPASSRLS가 없고, 요청 역할은 그 역할을 얻을 수 없다', async () => {
    const { rows: [r] } = await su.query(
      `select rolcanlogin, rolsuper, rolbypassrls, rolcreaterole,
              pg_has_role('authenticated', 'app_writer', 'MEMBER') as auth_member,
              pg_has_role('anon', 'app_writer', 'MEMBER') as anon_member
       from pg_roles where rolname = 'app_writer'`);
    expect(r).toEqual({ rolcanlogin: false, rolsuper: false, rolbypassrls: false, rolcreaterole: false, auth_member: false, anon_member: false });
    const { rows } = await su.query(
      `select p.proname, pg_get_userbyid(p.proowner) as owner, p.prosecdef,
              has_function_privilege('anon', p.oid, 'execute') as anon_exec
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'app' and p.proname = any($1)`,
      [['add_school_level', 'add_academic_year', 'create_terms_from_rule', 'set_term_dates', 'add_cohort', 'add_homeroom',
        'add_person', 'rename_person', 'link_account', 'unlink_account', 'enroll_person', 'end_enrollment',
        'assign_homeroom', 'end_homeroom_assignment']]);
    expect(rows).toHaveLength(14);
    for (const f of rows) expect(f).toMatchObject({ owner: 'app_writer', prosecdef: true, anon_exec: false });
  });

  it('요청 역할은 새 표에 직접 쓰거나 지울 수 없다', async () => {
    for (const sql of [
      `insert into public.people(school_id) values ('${A.schoolId}')`,
      `insert into public.school_levels(school_id, code, name) values ('${A.schoolId}', 'x', 'x')`,
      `update public.person_names set name = 'x'`,
      `delete from public.person_accounts`,
      `truncate public.people cascade`,
    ]) {
      await expect(asUser(A.userId, (db) => db.query(sql))).rejects.toMatchObject({ code: '42501' });
    }
  });
});

describe('학사 차원과 확정 규칙 연결', () => {
  it('확정 규칙 판의 기간으로 학기를 만든다', async () => {
    dimA = await setupDimensions(A, ruleA1);
    dimB = await setupDimensions(B, ruleB1);
    expect(dimA.terms).toBe(2);
    expect(dimB.terms).toBe(3);
    const terms = await asUser(A.userId, (db) => pp.listTerms(db, A.schoolId, dimA.year));
    expect(terms.map((t) => [t.sequence, t.period_key, t.label, t.rule_version])).toEqual([[1, 'p1', '1학기', 1], [2, 'p2', '2학기', 1]]);
  });

  it('같은 판으로 다시 만들면 바뀌지 않고, 새 규칙 판은 기존 학기를 다시 쓰지 않는다', async () => {
    expect(await asUser(A.userId, (db) => pp.createTermsFromRule(db, A.schoolId, dimA.year, ruleA1))).toBe(0);
    await expect(asUser(A.userId, (db) => pp.createTermsFromRule(db, A.schoolId, dimA.year, ruleA2)))
      .rejects.toMatchObject({ code: 'P0001' });
    const terms = await asUser(A.userId, (db) => pp.listTerms(db, A.schoolId, dimA.year));
    expect(terms.map((t) => t.label)).toEqual(['1학기', '2학기']);
    // 표 소유자도 학기의 규칙 연결은 바꿀 수 없다(날짜만 허용)
    await expect(su.query('update public.terms set rule_id = $1 where academic_year_id = $2', [ruleA2, dimA.year]))
      .rejects.toMatchObject({ code: 'P0001' });
  });

  it('학기 날짜는 학년도 안에서만 정한다', async () => {
    const [t1] = await asUser(A.userId, (db) => pp.listTerms(db, A.schoolId, dimA.year));
    await asUser(A.userId, (db) => pp.setTermDates(db, A.schoolId, t1.id, '2026-03-02', '2026-07-20'));
    await expect(asUser(A.userId, (db) => pp.setTermDates(db, A.schoolId, t1.id, '2026-02-01', '2026-07-20')))
      .rejects.toMatchObject({ code: '22023' });
    const [after] = await asUser(A.userId, (db) => pp.listTerms(db, A.schoolId, dimA.year));
    expect([after.starts_on, after.ends_on]).toEqual(['2026-03-02', '2026-07-20']);
  });

  it('겹치는 학년도와 다른 학교급 기수 연결은 거부한다', async () => {
    await expect(asUser(A.userId, (db) => pp.addAcademicYear(db, A.schoolId, { label: '2026b', startsOn: '2026-09-01', endsOn: '2027-08-31' })))
      .rejects.toMatchObject({ code: '22023' });
    const p = await asUser(A.userId, (db) => pp.addPerson(db, A.schoolId, { name: '시험 학생' }));
    // 중등 기수를 고등 학적에 붙일 수 없다 (복합 FK: 기수·학교·학교급)
    await expect(asUser(A.userId, (db) => pp.enroll(db, A.schoolId, { personId: p, levelId: dimA.high, cohortId: dimA.cohort, startsOn: '2026-03-02' })))
      .rejects.toMatchObject({ code: 'P0002' });
  });
});

describe('관제 세션 계정(전체 관리자, ADR 0024)', () => {
  it('모든 학교를 읽는다(쓰기는 사람 전체 관리자와 같은 규칙 — round30)', async () => {
    expect((await asUser(INSPECTOR_ID, (db) => pp.listSchoolLevels(db, A.schoolId))).length).toBeGreaterThan(0);
  });
});

describe('두 학교 양방향 거부', () => {
  it('다른 학교의 사람·학사 차원은 읽히지 않는다 (A↔B)', async () => {
    await asUser(A.userId, (db) => pp.addPerson(db, A.schoolId, { name: 'A 학생' }));
    await asUser(B.userId, (db) => pp.addPerson(db, B.schoolId, { name: 'B student' }));
    for (const [me, other] of [[A, B], [B, A]] as const) {
      const seen = await asUser(me.userId, async (db) => ({
        people: (await pp.listPeople(db, other.schoolId)).length,
        levels: (await pp.listSchoolLevels(db, other.schoolId)).length,
        years: (await pp.listAcademicYears(db, other.schoolId)).length,
        raw: (await db.query(`select (select count(*) from public.people where school_id = $1)
                                 + (select count(*) from public.person_names where school_id = $1)
                                 + (select count(*) from public.terms where school_id = $1)
                                 + (select count(*) from public.homerooms where school_id = $1) as n`, [other.schoolId])).rows[0].n,
      }));
      expect(seen).toEqual({ people: 0, levels: 0, years: 0, raw: '0' });
      expect((await asUser(me.userId, (db) => pp.listPeople(db, me.schoolId))).length).toBeGreaterThan(0);
    }
  });

  it('다른 학교에는 쓸 수 없다 (A↔B)', async () => {
    for (const [me, other] of [[A, B], [B, A]] as const) {
      await expect(asUser(me.userId, (db) => pp.addPerson(db, other.schoolId, { name: '침입' }))).rejects.toMatchObject({ code: '42501' });
      await expect(asUser(me.userId, (db) => pp.addSchoolLevel(db, other.schoolId, { code: 'evil', name: '침입' }))).rejects.toMatchObject({ code: '42501' });
    }
  });

  it('자기 학교 기록이 다른 학교의 id를 가리킬 수 없다 (복합 FK, A↔B)', async () => {
    for (const [me, myDim, otherDim, otherRule] of [[A, () => dimA, () => dimB, () => ruleB1], [B, () => dimB, () => dimA, () => ruleA1]] as const) {
      const person = await asUser(me.userId, (db) => pp.addPerson(db, me.schoolId, { name: '경계 시험' }));
      // 다른 학교의 학교급으로 학적
      await expect(asUser(me.userId, (db) => pp.enroll(db, me.schoolId, { personId: person, levelId: otherDim().middle, startsOn: '2026-03-02' })))
        .rejects.toMatchObject({ code: 'P0002' });
      // 다른 학교의 학년도로 기수·반
      await expect(asUser(me.userId, (db) => pp.addCohort(db, me.schoolId, { levelId: myDim().middle, entryYearId: otherDim().year, label: 'x' })))
        .rejects.toMatchObject({ code: 'P0002' });
      await expect(asUser(me.userId, (db) => pp.addHomeroom(db, me.schoolId, { yearId: otherDim().year, levelId: myDim().middle, grade: 1, name: 'x' })))
        .rejects.toMatchObject({ code: 'P0002' });
      // 다른 학교의 확정 규칙으로 학기
      const year = await asUser(me.userId, (db) => pp.addAcademicYear(db, me.schoolId, { label: '2027', startsOn: '2027-03-01', endsOn: '2028-03-01' }));
      await expect(asUser(me.userId, (db) => pp.createTermsFromRule(db, me.schoolId, year, otherRule())))
        .rejects.toMatchObject({ code: 'P0002' });
      // 다른 학교의 반 배정
      await expect(asUser(me.userId, (db) => pp.assignHomeroom(db, me.schoolId, { personId: person, homeroomId: otherDim().homeroom, startsOn: '2026-03-02' })))
        .rejects.toMatchObject({ code: 'P0002' });
    }
    // 명령 함수를 거치지 않아도 DB가 막는다 (표 소유자로 직접 넣기)
    const pB = (await su.query('select id from public.people where school_id = $1 limit 1', [B.schoolId])).rows[0].id;
    await expect(su.query(
      `insert into public.enrollments_school(school_id, person_id, school_level_id, starts_on, created_by) values ($1, $2, $3, '2026-03-02', $4)`,
      [A.schoolId, pB, dimA.middle, A.userId])).rejects.toMatchObject({ code: '23503' });
  });

  it('교사는 자기 학교를 읽을 수 있지만 사람·학적을 만들 수 없다', async () => {
    expect((await asUser(teacherA, (db) => pp.listPeople(db, A.schoolId))).length).toBeGreaterThan(0);
    await expect(asUser(teacherA, (db) => pp.addPerson(db, A.schoolId, { name: '교사가 추가' }))).rejects.toMatchObject({ code: '42501' });
  });
});

describe('동명이인 · 개명 · 다중 계정', () => {
  let kimA: string;
  let kimB: string;
  let enrollmentA: string;

  it('같은 이름의 두 사람은 서로 다른 id로 따로 관리된다', async () => {
    ({ kimA, kimB } = await asUser(A.userId, async (db) => ({
      kimA: await pp.addPerson(db, A.schoolId, { name: '김하늘' }),
      kimB: await pp.addPerson(db, A.schoolId, { name: '김하늘' }),
    })));
    expect(kimA).not.toBe(kimB);
    enrollmentA = await asUser(A.userId, (db) => pp.enroll(db, A.schoolId, { personId: kimA, levelId: dimA.middle, cohortId: dimA.cohort, startsOn: '2026-03-02' }));
    await asUser(A.userId, (db) => pp.enroll(db, A.schoolId, { personId: kimB, levelId: dimA.high, startsOn: '2026-03-02' }));
    const middle = await asUser(A.userId, (db) => pp.enrollmentsOn(db, A.schoolId, dimA.middle, '2026-04-01'));
    const high = await asUser(A.userId, (db) => pp.enrollmentsOn(db, A.schoolId, dimA.high, '2026-04-01'));
    // 학교급 범위가 섞이지 않고, 같은 이름이라도 id로 구분된다
    expect(middle.map((e) => e.person_id)).toEqual([kimA]);
    expect(high.map((e) => e.person_id)).toEqual([kimB]);
  });

  it('개명하면 이름 이력에 새 판이 생기고, 사람 id와 학적·반 배정은 그대로다', async () => {
    const assignment = await asUser(A.userId, (db) => pp.assignHomeroom(db, A.schoolId, { personId: kimA, homeroomId: dimA.homeroom, startsOn: '2026-03-02' }));
    await expect(asUser(A.userId, (db) => pp.renamePerson(db, A.schoolId, kimA, { name: '김하람', reason: '' })))
      .rejects.toMatchObject({ code: '22023' });
    expect(await asUser(A.userId, (db) => pp.renamePerson(db, A.schoolId, kimA, { name: '김하람', nameLatin: 'Kim Haram', reason: '법원 개명 허가(합성 예시)' }))).toBe(2);
    const hist = await asUser(A.userId, (db) => pp.nameHistory(db, A.schoolId, kimA));
    expect(hist.map((h) => [h.version, h.name])).toEqual([[1, '김하늘'], [2, '김하람']]);
    const middle = await asUser(A.userId, (db) => pp.enrollmentsOn(db, A.schoolId, dimA.middle, '2026-04-01'));
    expect(middle).toMatchObject([{ id: enrollmentA, person_id: kimA, name: '김하람' }]);
    const { rows } = await su.query('select person_id from public.homeroom_assignments where id = $1', [assignment]);
    expect(rows[0].person_id).toBe(kimA);
    // 이전 이름 판은 표 소유자도 고치거나 지울 수 없다
    await expect(su.query(`update public.person_names set name = '바뀜' where person_id = $1 and version = 1`, [kimA])).rejects.toMatchObject({ code: 'P0001' });
    await expect(su.query('delete from public.person_names where person_id = $1', [kimA])).rejects.toMatchObject({ code: 'P0001' });
  });

  it('한 사람에 계정 여러 개를 잇고, 한 계정은 한 학교에서 한 사람에만 이어진다', async () => {
    await asUser(A.userId, async (db) => {
      await pp.linkAccount(db, A.schoolId, kimA, teacherA);
      await pp.linkAccount(db, A.schoolId, kimA, secondAccountA);
    });
    const people = await asUser(A.userId, (db) => pp.listPeople(db, A.schoolId));
    expect(people.find((p) => p.id === kimA)?.accounts).toBe(2);
    expect(people.find((p) => p.id === kimB)?.accounts).toBe(0);
    await expect(asUser(A.userId, (db) => pp.linkAccount(db, A.schoolId, kimB, teacherA))).rejects.toMatchObject({ code: 'P0001' });
    // 다른 학교 구성원 계정은 이을 수 없다(소속 복합 FK)
    await expect(asUser(A.userId, (db) => pp.linkAccount(db, A.schoolId, kimB, B.userId))).rejects.toMatchObject({ code: 'P0002' });
    expect(await asUser(teacherA, (db) => pp.personOfAccount(db, A.schoolId, teacherA))).toBe(kimA);
  });

  it('연결을 끊거나 소속을 빼도 사람과 학적은 남고 이력이 기록된다', async () => {
    await expect(asUser(A.userId, (db) => pp.unlinkAccount(db, A.schoolId, secondAccountA, ' '))).rejects.toMatchObject({ code: '22023' });
    await asUser(A.userId, (db) => pp.unlinkAccount(db, A.schoolId, secondAccountA, '업무 계정 정리'));
    // 소속 해제는 기존 구성원 빼기(16차)를 그대로 쓴다 → 연결이 함께 사라진다
    await asUser(A.userId, (db) => admin.removeMember(db, A.schoolId, teacherA));
    expect(await asUser(A.userId, (db) => pp.personOfAccount(db, A.schoolId, teacherA))).toBeNull();
    const { rows } = await su.query(
      `select user_id, action, reason from public.person_account_events where person_id = $1 order by id`, [kimA]);
    expect(rows).toEqual([
      { user_id: teacherA, action: 'link', reason: null },
      { user_id: secondAccountA, action: 'link', reason: null },
      { user_id: secondAccountA, action: 'unlink', reason: '업무 계정 정리' },
      { user_id: teacherA, action: 'unlink', reason: '학교 소속 해제' },
    ]);
    const middle = await asUser(A.userId, (db) => pp.enrollmentsOn(db, A.schoolId, dimA.middle, '2026-04-01'));
    expect(middle.map((e) => e.person_id)).toEqual([kimA]);
    // 연결 이력은 학교 관리자만 본다 (B 관리자는 A 이력을 못 본다)
    const seenByB = await asUser(B.userId, (db) => db.query('select count(*)::int as n from public.person_account_events'));
    expect(seenByB.rows[0].n).toBe(0);
  });
});

describe('학적과 반 배정 기간', () => {
  it('학적 기간은 겹칠 수 없고, 끝난 학적은 다시 끝낼 수 없다', async () => {
    const p = await asUser(A.userId, (db) => pp.addPerson(db, A.schoolId, { name: '전학 시험' }));
    const e = await asUser(A.userId, (db) => pp.enroll(db, A.schoolId, { personId: p, levelId: dimA.middle, startsOn: '2026-03-02' }));
    await expect(asUser(A.userId, (db) => pp.enroll(db, A.schoolId, { personId: p, levelId: dimA.high, startsOn: '2026-05-01' })))
      .rejects.toMatchObject({ code: '22023' });
    await asUser(A.userId, (db) => pp.endEnrollment(db, A.schoolId, e, { endsOn: '2026-06-30', status: 'transferred_out' }));
    await expect(asUser(A.userId, (db) => pp.endEnrollment(db, A.schoolId, e, { endsOn: '2026-07-30', status: 'withdrawn' })))
      .rejects.toMatchObject({ code: 'P0001' });
    // 전출 뒤 다시 들어오면 새 학적
    await asUser(A.userId, (db) => pp.enroll(db, A.schoolId, { personId: p, levelId: dimA.middle, startsOn: '2026-09-01' }));
    expect((await asUser(A.userId, (db) => pp.enrollmentsOn(db, A.schoolId, dimA.middle, '2026-08-01'))).some((r) => r.person_id === p)).toBe(false);
    expect((await asUser(A.userId, (db) => pp.enrollmentsOn(db, A.schoolId, dimA.middle, '2026-09-01'))).some((r) => r.person_id === p)).toBe(true);
    // 학적의 사람·학교급은 표 소유자도 바꿀 수 없다
    const other = await asUser(A.userId, (db) => pp.addPerson(db, A.schoolId, { name: '다른 사람' }));
    await expect(su.query('update public.enrollments_school set person_id = $1 where id = $2', [other, e])).rejects.toMatchObject({ code: 'P0001' });
  });

  it('반 배정은 그 학교급 학적이 있어야 하고 한 학년도에 한 반씩이다', async () => {
    const p = await asUser(A.userId, (db) => pp.addPerson(db, A.schoolId, { name: '반 시험' }));
    await expect(asUser(A.userId, (db) => pp.assignHomeroom(db, A.schoolId, { personId: p, homeroomId: dimA.homeroom, startsOn: '2026-03-02' })))
      .rejects.toMatchObject({ code: '22023' });
    await asUser(A.userId, (db) => pp.enroll(db, A.schoolId, { personId: p, levelId: dimA.middle, startsOn: '2026-03-02' }));
    const first = await asUser(A.userId, (db) => pp.assignHomeroom(db, A.schoolId, { personId: p, homeroomId: dimA.homeroom, startsOn: '2026-03-02' }));
    const room2 = await asUser(A.userId, (db) => pp.addHomeroom(db, A.schoolId, { yearId: dimA.year, levelId: dimA.middle, grade: 1, name: '2반' }));
    await expect(asUser(A.userId, (db) => pp.assignHomeroom(db, A.schoolId, { personId: p, homeroomId: room2, startsOn: '2026-05-01' })))
      .rejects.toMatchObject({ code: '22023' });
    await asUser(A.userId, (db) => pp.endHomeroomAssignment(db, A.schoolId, first, '2026-05-01'));
    await asUser(A.userId, (db) => pp.assignHomeroom(db, A.schoolId, { personId: p, homeroomId: room2, startsOn: '2026-05-01' }));
  });
});
