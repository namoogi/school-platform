/** 56차 ADR 0025 F1 — 학사 토대(한국 + 미국 기준): 학기제 4종, 학년 서수, 수업일, 코드 목록, 외부 식별자, 보호자, 교직원, 공개 거부, 수업 제안. 학교 간 거부 양방향 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const pp = await import('@/lib/people');
const cs = await import('@/lib/courses');
const f = await import('@/lib/foundation');

type S = { schoolId: string; userId: string };
let A: S;
let B: S;
let su: pg.Client;
let teacherA: string;
const periods = (labels: string[]) => ({ periods: labels.map((l, i) => ({ id: `p${i + 1}`, label: l, assessments: [] })) });

async function addRule(s: S, value: unknown) {
  const { rows: [r] } = await su.query(
    `insert into public.school_rules(school_id, topic, version, value, decision, evidence, confirmed_by)
     values ($1, 'period_structure', (select coalesce(max(version), 0) + 1 from public.school_rules where school_id = $1 and topic = 'period_structure'),
             $2, 'accepted', '[]', $3) returning id`, [s.schoolId, JSON.stringify(value), s.userId]);
  return r.id as string;
}
async function year(s: S, label: string, starts: string, ends: string, rule: string) {
  return asUser(s.userId, async (db) => {
    const y = await pp.addAcademicYear(db, s.schoolId, { label, startsOn: starts, endsOn: ends });
    await pp.createTermsFromRule(db, s.schoolId, y, rule);
    const terms = await pp.listTerms(db, s.schoolId, y);
    return { y, terms };
  });
}
const person = (s: S, name: string) => asUser(s.userId, (db) => pp.addPerson(db, s.schoolId, { name }));

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  const { rows: [u] } = await su.query(`insert into private.app_users(email, display_name) values ('f1-teacher@school-a.test', 'f1') returning id`);
  await su.query(`insert into public.memberships(user_id, school_id, role) values ($1, $2, 'teacher')`, [u.id, A.schoolId]);
  teacherA = u.id;
});
afterAll(async () => { await su.end(); await getPool().end(); });

describe('학교 관할·인가 판', () => {
  it('판으로 쌓이고, 보고 고친 판이 낡으면 409', async () => {
    await asUser(A.userId, async (db) => {
      expect(await f.setSchoolProfile(db, A.schoolId, { country: 'kr', sector: 'alternative', why: '미인가 대안학교' })).toBe(1);
      expect(await f.setSchoolProfile(db, A.schoolId, { country: 'KR', sector: 'alternative', accreditation: '대안교육기관 등록', base_version: 1 })).toBe(2);
    });
    await expect(asUser(A.userId, (db) => f.setSchoolProfile(db, A.schoolId, { country: 'US', base_version: 1 }))).rejects.toThrow('새 판');
    expect((await asUser(A.userId, (db) => f.schoolProfile(db, A.schoolId))).country).toBe('KR');
  });
});

describe('학년 코드 + 정규 서수 (한국·미국)', () => {
  it('한국 고1 = 10, 미국 Grade 10 = 10, 유치원 K = 0', async () => {
    await asUser(A.userId, async (db) => {
      await f.addGradeLevel(db, A.schoolId, { code: 'h1', label: { ko: '고1', en: 'Grade 10' }, ordinal: 10 });
      await f.addGradeLevel(db, A.schoolId, { code: 'm1', label: { ko: '중1', en: 'Grade 7' }, ordinal: 7 });
    });
    await expect(asUser(A.userId, (db) => f.addGradeLevel(db, A.schoolId, { code: 'h1', label: { ko: '중복' }, ordinal: 10 }))).rejects.toThrow('이미');
    await asUser(B.userId, async (db) => {
      await f.addGradeLevel(db, B.schoolId, { code: 'k', label: { en: 'Kindergarten', th: 'อนุบาล' }, ordinal: 0 });
      await f.addGradeLevel(db, B.schoolId, { code: 'g10', label: { en: 'Grade 10' }, ordinal: 10 });
    });
    const a = await asUser(A.userId, (db) => f.listGradeLevels(db, A.schoolId));
    expect(a.map((g) => [g.code, g.ordinal])).toEqual([['m1', 7], ['h1', 10]]);
    expect(await asUser(A.userId, (db) => f.listGradeLevels(db, B.schoolId))).toEqual([]); // B 것은 안 보임
  });
});

describe('학기 나무: 학기제 4종', () => {
  it('한국 2학기 / 미국 2학기 + 성적 기간(분기) / 3학기 / 4분기 — 하위 마디는 부모 기간 안, 부모마다 순서', async () => {
    // 한국: 2학기
    const kr = await year(A, '2026', '2026-03-01', '2027-03-01', await addRule(A, periods(['1학기', '2학기'])));
    expect(kr.terms.map((t) => t.label)).toEqual(['1학기', '2학기']);
    // 미국: 학점 학기 2개 + 각 학기 아래 성적 기간(분기) 2개
    const us = await year(A, '2026-27', '2027-08-15', '2028-06-15', await addRule(A, periods(['Fall Semester', 'Spring Semester'])));
    await asUser(A.userId, async (db) => {
      await pp.setTermDates(db, A.schoolId, us.terms[0].id, '2027-08-20', '2028-01-10');
      await pp.setTermDates(db, A.schoolId, us.terms[1].id, '2028-01-11', '2028-06-10');
      await f.addSubTerm(db, A.schoolId, us.terms[0].id, { kind: 'grading_period', key: 'Q1', label: 'Quarter 1', startsOn: '2027-08-20', endsOn: '2027-10-20' });
      await f.addSubTerm(db, A.schoolId, us.terms[0].id, { kind: 'grading_period', key: 'Q2', label: 'Quarter 2', startsOn: '2027-10-21', endsOn: '2028-01-10' });
      await f.addSubTerm(db, A.schoolId, us.terms[1].id, { kind: 'grading_period', key: 'Q3', label: 'Quarter 3', startsOn: '2028-01-11', endsOn: '2028-03-20' });
    });
    await expect(asUser(A.userId, (db) => f.addSubTerm(db, A.schoolId, us.terms[1].id, { kind: 'grading_period', key: 'Q9', label: '밖', startsOn: '2028-05-01', endsOn: '2028-07-01' })))
      .rejects.toThrow('상위 학기 기간 안');
    await asUser(A.userId, async (db) => {
      await f.setTermEntryWindow(db, A.schoolId, us.terms[0].id, '2028-01-05', '2028-01-20');
      const tree = await f.termTree(db, A.schoolId, us.y);
      const q = tree.filter((t) => t.kind === 'grading_period');
      expect(q.map((t) => [t.period_key, t.sequence, t.credit_bearing])).toEqual([['Q1', 1, false], ['Q2', 2, false], ['Q3', 1, false]]);
      expect(tree.filter((t) => !t.parent_id).every((t) => t.credit_bearing)).toBe(true);
      expect(tree.find((t) => t.id === us.terms[0].id)?.entry_closes_on).toBe('2028-01-20');
    });
    // 3학기(B) / 4분기(B)
    const tri = await year(B, '2026', '2026-05-01', '2027-04-01', await addRule(B, periods(['Term 1', 'Term 2', 'Term 3'])));
    const quarters = await year(B, '2027', '2027-05-01', '2028-04-01', await addRule(B, periods(['Q1', 'Q2', 'Q3', 'Q4'])));
    expect(tri.terms).toHaveLength(3);
    expect(quarters.terms).toHaveLength(4);
    // 학교 간: B는 A 학기 아래 마디를 만들 수 없다(관리자 아님 → 42501), A도 B에
    await expect(asUser(B.userId, (db) => f.addSubTerm(db, A.schoolId, us.terms[0].id, { kind: 'grading_period', key: 'X', label: 'X', startsOn: '2027-08-20', endsOn: '2027-09-01' })))
      .rejects.toMatchObject({ code: '42501' });
    await expect(asUser(A.userId, (db) => f.addSubTerm(db, A.schoolId, tri.terms[0].id, { kind: 'grading_period', key: 'X', label: 'X', startsOn: '2026-05-02', endsOn: '2026-06-01' })))
      .rejects.toThrow('찾을 수 없습니다');
  });
});

describe('수업일 달력', () => {
  it('수업일 수(반일 0.5)를 세고, 학년도 밖 날짜는 거부', async () => {
    const y = await asUser(A.userId, async (db) => (await pp.listAcademicYears(db, A.schoolId)).find((x) => x.label === '2026')!.id);
    await asUser(A.userId, async (db) => {
      await f.setCalendarDays(db, A.schoolId, y, [
        { day: '2026-03-02' }, { day: '2026-03-03' }, { day: '2026-03-04', half_day: true }, { day: '2026-03-05', kind: 'holiday', label: '휴일' },
      ]);
      expect(await f.instructionalDays(db, A.schoolId, '2026-03-01', '2026-03-31')).toBe(2.5);
      await f.setCalendarDays(db, A.schoolId, y, [{ day: '2026-03-04' }]); // 반일 → 온종일로 고침
      expect(await f.instructionalDays(db, A.schoolId, '2026-03-01', '2026-03-31')).toBe(3);
    });
    await expect(asUser(A.userId, (db) => f.setCalendarDays(db, A.schoolId, y, [{ day: '2028-01-01' }]))).rejects.toThrow('학년도 밖');
    expect(await asUser(B.userId, (db) => f.instructionalDays(db, A.schoolId, '2026-03-01', '2026-03-31'))).toBe(0); // B에게 A 달력은 안 보임
  });
});

describe('코드 목록 (E1)', () => {
  it('플랫폼 기본(한·미 출결 코드)은 모두에게, 학교 값은 그 학교에만 — 같은 코드면 학교 값이 이긴다', async () => {
    const base = await asUser(B.userId, (db) => f.codes(db, B.schoolId, 'attendance_kind'));
    expect(base.map((c) => c.code)).toEqual(['absent', 'tardy', 'early_leave', 'class_absent']);
    expect(base[0].maps_to).toMatchObject({ kr_record: '결석', us_nces: 'absence' });
    await asUser(A.userId, (db) => f.addCode(db, A.schoolId, { listKey: 'attendance_reason', code: 'field_trip', label: { ko: '체험학습', en: 'Field trip' },
      attrs: { excused: true, counts_present: true }, why: '학교장 허가 체험학습은 출석 인정' }));
    expect((await asUser(A.userId, (db) => f.codes(db, A.schoolId, 'attendance_reason'))).map((c) => c.code)).toContain('field_trip');
    expect((await asUser(B.userId, (db) => f.codes(db, B.schoolId, 'attendance_reason'))).map((c) => c.code)).not.toContain('field_trip');
    // 다른 학교 이름으로 넣기 거부(양방향)
    await expect(asUser(B.userId, (db) => f.addCode(db, A.schoolId, { listKey: 'relation', code: 'x', label: { en: 'x' } }))).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(A.userId, (db) => f.addCode(db, B.schoolId, { listKey: 'relation', code: 'x', label: { en: 'x' } }))).rejects.toMatchObject({ code: '42501' });
  });

  it('코드를 바꾸면 새 행 + 이전 행 닫기(이전 코드 연결), 이미 닫힌 코드는 409', async () => {
    const old = await asUser(A.userId, (db) => f.addCode(db, A.schoolId, { listKey: 'relation', code: 'aunt', label: { ko: '이모' }, effectiveFrom: '2026-01-01' }));
    const next = await asUser(A.userId, (db) => f.addCode(db, A.schoolId, { listKey: 'relation', code: 'aunt', label: { ko: '이모·고모' }, priorCodeId: old, effectiveFrom: '2026-06-01' }));
    const before = await asUser(A.userId, (db) => f.codes(db, A.schoolId, 'relation', '2026-03-01'));
    const after = await asUser(A.userId, (db) => f.codes(db, A.schoolId, 'relation', '2026-07-01'));
    expect(before.find((c) => c.code === 'aunt')?.label).toEqual({ ko: '이모' });
    expect(after.find((c) => c.code === 'aunt')).toMatchObject({ id: next, prior_code_id: old });
    await expect(asUser(A.userId, (db) => f.addCode(db, A.schoolId, { listKey: 'relation', code: 'aunt', label: { ko: 'x' }, priorCodeId: old, effectiveFrom: '2026-08-01' })))
      .rejects.toThrow('닫힌');
    // 플랫폼 기본값은 학교가 고칠 수 없다(직접 UPDATE 권한 없음)
    await expect(asUser(A.userId, (db) => db.query(`update public.code_lists set effective_to = current_date where school_id is null`))).rejects.toThrow();
  });
});

describe('외부 식별자', () => {
  it('학교 관리자만 보고 쓴다. 국가 신분 번호는 거부, 같은 체계·번호는 하나', async () => {
    const p = await person(A, 'F1 학생 하나');
    await asUser(A.userId, async (db) => {
      await f.addExternalIdentifier(db, A.schoolId, { personId: p, system: 'school_student', value: '2026-001' });
      await f.addExternalIdentifier(db, A.schoolId, { targetKind: 'school', system: 'us_ceeb', value: '123456' });
    });
    await expect(asUser(A.userId, (db) => f.addExternalIdentifier(db, A.schoolId, { personId: p, system: 'kr_rrn', value: '000000' }))).rejects.toThrow('국가 신분 번호');
    await expect(asUser(A.userId, (db) => f.addExternalIdentifier(db, A.schoolId, { personId: p, system: 'school_student', value: '2026-001' }))).rejects.toThrow('이미');
    expect(await asUser(A.userId, (db) => f.externalIdentifiers(db, A.schoolId, p))).toHaveLength(1);
    expect(await asUser(teacherA, (db) => f.externalIdentifiers(db, A.schoolId))).toEqual([]); // 교사는 못 봄
    expect(await asUser(B.userId, (db) => f.externalIdentifiers(db, A.schoolId))).toEqual([]);
    // 다른 학교 사람에 붙이기 거부
    const pb = await person(B, 'F1 B 학생');
    await expect(asUser(A.userId, (db) => f.addExternalIdentifier(db, A.schoolId, { personId: pb, system: 'school_student', value: 'b-1' }))).rejects.toThrow('찾을 수 없습니다');
  });
});

describe('가족·보호자 · 교직원 · 공개 거부', () => {
  it('보호자 관계는 학교 관리자만 보고, 다른 학교 사람과는 이을 수 없다', async () => {
    const s = await person(A, 'F1 학생 둘'); const g = await person(A, 'F1 보호자');
    await asUser(A.userId, async (db) => {
      const fam = await f.addFamily(db, A.schoolId, 'F1 가족');
      await f.linkGuardian(db, A.schoolId, { familyId: fam, guardianPersonId: g, studentPersonId: s, relationCode: 'mother' });
    });
    await expect(asUser(A.userId, (db) => f.linkGuardian(db, A.schoolId, { guardianPersonId: g, studentPersonId: s, relationCode: 'mother' }))).rejects.toThrow('이미 연결');
    expect(await asUser(A.userId, (db) => f.guardiansOf(db, A.schoolId, s))).toMatchObject([{ guardian_person_id: g, relation_code: 'mother', guardian_name: 'F1 보호자' }]);
    expect(await asUser(teacherA, (db) => f.guardiansOf(db, A.schoolId, s))).toEqual([]);
    expect(await asUser(B.userId, (db) => f.guardiansOf(db, A.schoolId, s))).toEqual([]);
    const gb = await person(B, 'F1 B 보호자');
    await expect(asUser(A.userId, (db) => f.linkGuardian(db, A.schoolId, { guardianPersonId: gb, studentPersonId: s, relationCode: 'father' }))).rejects.toThrow('찾을 수 없습니다');
  });

  it('교직원 배정과 디렉터리 공개 거부(누리집·에이전트 공개가 검사)', async () => {
    const t = await person(A, 'F1 상담교사'); const s = await person(A, 'F1 학생 셋');
    await asUser(A.userId, async (db) => {
      const a = await f.assignStaff(db, A.schoolId, { personId: t, roleCode: 'counselor', startsOn: '2026-03-01' });
      await f.endStaffAssignment(db, A.schoolId, a, '2026-09-01');
      expect(await f.directoryAllowed(db, A.schoolId, s, 'photo')).toBe(true);
      const o = await f.setDirectoryOptout(db, A.schoolId, s, 'photo', '보호자 요청');
      expect(await f.directoryAllowed(db, A.schoolId, s, 'photo')).toBe(false);
      expect(await f.directoryAllowed(db, A.schoolId, s, 'name')).toBe(true);
      return o;
    }).then(async (o) => {
      await expect(asUser(A.userId, (db) => f.setDirectoryOptout(db, A.schoolId, s, 'photo', null))).rejects.toThrow('이미');
      await asUser(A.userId, (db) => f.endDirectoryOptout(db, A.schoolId, o));
    });
    expect(await asUser(B.userId, (db) => f.directoryAllowed(db, A.schoolId, s, 'photo'))).toBe(false); // B는 A 사람에 대해 '허용'을 얻지 못함
  });
});

describe('학생 수업 제안 → 승인 → 개설 기원', () => {
  it('교사가 제안을 쓰고, 판이 낡으면 409, 승인은 관리자만, 승인된 제안만 개설과 한 번 잇는다', async () => {
    const student = await person(A, 'F1 제안 학생');
    const proposal = await asUser(teacherA, (db) => f.proposeCourse(db, A.schoolId, { proposerPersonId: student, title: '우리 동네 지도 만들기', purpose: '지역 조사' }));
    await asUser(teacherA, (db) => f.saveCourseProposal(db, A.schoolId, proposal, { title: '우리 동네 지도 만들기', purpose: '지역 조사·발표', status: 'submitted', base_version: 1 }));
    await expect(asUser(teacherA, (db) => f.saveCourseProposal(db, A.schoolId, proposal, { title: 'x', status: 'draft', base_version: 1 }))).rejects.toThrow('새 판');
    await expect(asUser(teacherA, (db) => f.saveCourseProposal(db, A.schoolId, proposal, { title: '우리 동네 지도 만들기', status: 'approved', base_version: 2 })))
      .rejects.toMatchObject({ code: '42501' });
    await asUser(A.userId, (db) => f.saveCourseProposal(db, A.schoolId, proposal, { title: '우리 동네 지도 만들기', status: 'approved', note: '멘토 배정 후 개설', base_version: 2 }));
    await expect(asUser(A.userId, (db) => f.saveCourseProposal(db, A.schoolId, proposal, { title: 'x', status: 'draft', base_version: 3 }))).rejects.toThrow('승인된 제안');
    const p = await asUser(A.userId, (db) => f.courseProposal(db, A.schoolId, proposal));
    expect(p.latest).toMatchObject({ version: 3, status: 'approved' });
    expect(p.versions).toHaveLength(3);
    // 개설 만들기(합성)
    const offering = await asUser(A.userId, async (db) => {
      const level = await pp.addSchoolLevel(db, A.schoolId, { code: 'f1lvl', name: 'F1 학교급' });
      const type = await cs.addCourseType(db, A.schoolId, { code: 'f1creative', name: '창의' });
      await cs.setCourseTypeRule(db, A.schoolId, type, { trigger: 'approval', publishable: true, passFailAllowed: true });
      const subject = await cs.addSubject(db, A.schoolId, { code: 'F1MAP', name: '동네 지도' });
      const y = (await pp.listAcademicYears(db, A.schoolId)).find((x) => x.label === '2026')!.id;
      const term = (await pp.listTerms(db, A.schoolId, y))[0].id;
      return cs.createOffering(db, A.schoolId, { termId: term, subjectId: subject, typeId: type, levelId: level, credits: 1 });
    });
    await expect(asUser(B.userId, (db) => f.linkProposalOffering(db, A.schoolId, proposal, offering))).rejects.toMatchObject({ code: '42501' });
    await asUser(A.userId, (db) => f.linkProposalOffering(db, A.schoolId, proposal, offering));
    const { rows: [o] } = await su.query('select origin, proposal_id from public.course_offerings where id = $1', [offering]);
    expect(o).toEqual({ origin: 'student_proposal', proposal_id: proposal });
    // 기원은 한 번만
    await expect(asUser(A.userId, (db) => f.setOfferingOrigin(db, A.schoolId, offering, 'project'))).rejects.toThrow('한 번만');
    // B는 A의 제안을 읽을 수 없다
    await expect(asUser(B.userId, (db) => f.courseProposal(db, A.schoolId, proposal))).rejects.toThrow('찾을 수 없습니다');
  });
});

describe('직접 쓰기 금지', () => {
  it('요청 역할은 새 표에 직접 INSERT할 수 없다(명령 함수로만)', async () => {
    await expect(asUser(A.userId, (db) => db.query(`insert into public.grade_levels(school_id, code, label, ordinal) values ($1, 'zz', '{"ko":"x"}', 1)`, [A.schoolId])))
      .rejects.toThrow();
    await expect(asUser(A.userId, (db) => db.query(`insert into public.code_lists(school_id, list_key, code, label) values ($1, 'relation', 'zz', '{"ko":"x"}')`, [A.schoolId])))
      .rejects.toThrow();
  });
});
