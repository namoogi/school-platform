/** 63차 ADR 0030·0028 — 열람·수정 요청(기한·결정 상태·409), 이의 의견서(거부 뒤 한 번, 발행본에 실림), 보존 규칙 판·파기 미리보기·가림 판(열린 요청이면 막음, 같은 트랜잭션만), 학교 간 거부 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const pp = await import('@/lib/people');
const g = await import('@/lib/grading');
const rec = await import('@/lib/records');
const po = await import('@/lib/portal');

type S = { schoolId: string; userId: string };
let A: S; let B: S;
let su: pg.Client;
let alum: string; let current: string; let stuUser: string; let teacher: string;
let amendReq: string; let inspectReq: string;

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  const { rows: [u] } = await su.query(`insert into private.app_users(email, display_name) values ('f6r-alum@family.test', 'x') returning id`);
  stuUser = u.id;
  const { rows: [t] } = await su.query(`insert into private.app_users(email, display_name) values ('f6r-teacher@school-a.test', 'x') returning id`);
  await su.query(`insert into public.memberships(user_id, school_id, role) values ($1, $2, 'teacher')`, [t.id, A.schoolId]);
  teacher = t.id;
  ({ alum, current } = await asUser(A.userId, async (db) => {
    const level = await pp.addSchoolLevel(db, A.schoolId, { code: 'f6r', name: '고등' });
    const y = await pp.addAcademicYear(db, A.schoolId, { label: '2020', startsOn: '2020-03-01', endsOn: '2021-03-01' });
    const al = await pp.addPerson(db, A.schoolId, { name: '졸업한 학생' });
    const cu = await pp.addPerson(db, A.schoolId, { name: '재학 중 학생' });
    const e = await pp.enroll(db, A.schoolId, { personId: al, levelId: level, startsOn: '2020-03-02' });
    await pp.endEnrollment(db, A.schoolId, e, { endsOn: '2021-02-28', status: 'graduated' });
    await pp.enroll(db, A.schoolId, { personId: cu, levelId: level, startsOn: '2020-03-02' });
    await g.recordNarrative(db, A.schoolId, { personId: al, academicYearId: y, kind: 'behavior', authorRole: 'homeroom', body: '졸업한 학생의 행동 특성 서술' });
    await rec.closeRecordYear(db, A.schoolId, al, y, { base_version: 0, requestKey: 'f6r-close-al-1' });
    await po.addPortalAccount(db, A.schoolId, { kind: 'student', personId: al, email: 'f6r-alum@family.test' });
    return { alum: al, current: cu };
  }));
});
afterAll(async () => { await su.end(); await getPool().end(); });

describe('열람·수정 요청', () => {
  it('학생은 자기 기록에만 요청을 내고, 기한은 기본 45일', async () => {
    amendReq = await asUser(stuUser, (db) => po.portalRequest(db, { personId: alum, kind: 'amend', targetKind: 'record_year', body: '행동 특성 서술의 사실이 다릅니다.' }));
    inspectReq = await asUser(stuUser, (db) => po.portalRequest(db, { personId: alum, kind: 'inspect', body: '2020학년도 출결 원부를 보고 싶습니다.' }));
    await expect(asUser(stuUser, (db) => po.portalRequest(db, { personId: current, kind: 'amend', body: 'x' }))).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(stuUser, (db) => po.portalRequest(db, { personId: alum, kind: 'amend', body: '   ' }))).rejects.toThrow('형식');
    const mine = await asUser(stuUser, (db) => po.portalRequests(db, alum));
    expect(mine.map((r) => r.status)).toEqual(['received', 'received']);
    const due = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
    expect(mine[0].due_on).toBe(due);
  });

  it('관리자 결정: 거부는 이유, 409, 교사·다른 학교 거부, 거부 뒤에는 청문·수정·끝냄만', async () => {
    await expect(asUser(A.userId, (db) => po.decideRecordRequest(db, A.schoolId, { requestId: amendReq, status: 'denied' }))).rejects.toThrow('이유');
    await expect(asUser(teacher, (db) => po.decideRecordRequest(db, A.schoolId, { requestId: amendReq, status: 'in_review' }))).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(B.userId, (db) => po.decideRecordRequest(db, A.schoolId, { requestId: amendReq, status: 'in_review' }))).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(B.userId, (db) => po.decideRecordRequest(db, B.schoolId, { requestId: amendReq, status: 'in_review' }))).rejects.toThrow('찾을 수 없습니다');
    await asUser(A.userId, (db) => po.decideRecordRequest(db, A.schoolId, { requestId: amendReq, status: 'in_review', fromStatus: 'received' }));
    await expect(asUser(A.userId, (db) => po.decideRecordRequest(db, A.schoolId, { requestId: amendReq, status: 'denied', note: 'x', fromStatus: 'received' }))).rejects.toThrow('바뀌었습니다');
    await asUser(A.userId, (db) => po.decideRecordRequest(db, A.schoolId, { requestId: amendReq, status: 'denied', note: '담임·위원회 확인 결과 기록이 정확합니다.' }));
    await expect(asUser(A.userId, (db) => po.decideRecordRequest(db, A.schoolId, { requestId: amendReq, status: 'granted' }))).rejects.toThrow('청문');
    await expect(asUser(A.userId, (db) => po.decideRecordRequest(db, A.schoolId, { requestId: amendReq, status: 'amended' }))).rejects.toThrow('정정 판');
    expect((await asUser(B.userId, (db) => db.query('select 1 from public.record_requests'))).rows).toEqual([]);
  });

  it('이의 의견서: 거부된 수정 요청에만 한 번, 원 기록은 그대로, 이후 발행본에 함께 실린다', async () => {
    await expect(asUser(stuUser, (db) => po.portalAnnotate(db, inspectReq, 'x'))).rejects.toThrow('거부된 수정 요청');
    await asUser(stuUser, (db) => po.portalAnnotate(db, amendReq, '저는 그 기간 봉사 활동으로 결석했고, 서술이 그 사정을 빠뜨렸습니다.'));
    await expect(asUser(stuUser, (db) => po.portalAnnotate(db, amendReq, '또'))).rejects.toThrow('이미');
    const [mine] = (await asUser(stuUser, (db) => po.portalRequests(db, alum))).filter((r) => r.id === amendReq);
    expect(mine).toMatchObject({ status: 'denied', annotation: { body: expect.stringContaining('봉사 활동') } });
    const doc = await asUser(A.userId, (db) => rec.publishRecordDocument(db, A.schoolId, { format: 'kr_alt_record', personId: alum }));
    expect((doc.content.annotations as { statement: string }[])[0].statement).toContain('봉사 활동');
    const [closure] = await asUser(A.userId, (db) => rec.recordClosures(db, A.schoolId, alum));
    expect(closure.snapshot.narratives[0].body).toBe('졸업한 학생의 행동 특성 서술');
    await asUser(A.userId, (db) => po.decideRecordRequest(db, A.schoolId, { requestId: amendReq, status: 'closed', note: '의견서 첨부로 끝냄' }));
    await expect(asUser(A.userId, (db) => po.decideRecordRequest(db, A.schoolId, { requestId: amendReq, status: 'hearing_offered' }))).rejects.toThrow('끝난 요청');
  });
});

describe('보존 규칙·파기(가림 판)', () => {
  it('규칙이 없거나, 재학 중이거나, 열린 요청이 있으면 파기 불가', async () => {
    expect(await asUser(A.userId, (db) => po.redactionPreview(db, A.schoolId, alum))).toMatchObject({ ok: false, why: expect.stringContaining('규칙') });
    expect(await asUser(A.userId, (db) => po.saveRetentionRule(db, A.schoolId, { yearsAfterExit: 3, why: '졸업 후 3년(합성 예시)', base_version: 0 }))).toBe(1);
    await expect(asUser(A.userId, (db) => po.saveRetentionRule(db, A.schoolId, { yearsAfterExit: 5, base_version: 0 }))).rejects.toThrow('새 판');
    expect(await asUser(A.userId, (db) => po.redactionPreview(db, A.schoolId, current))).toMatchObject({ ok: false, why: expect.stringContaining('재적') });
    expect(await asUser(A.userId, (db) => po.redactionPreview(db, A.schoolId, alum))).toMatchObject({ ok: false, why: expect.stringContaining('요청') });
    await expect(asUser(A.userId, (db) => po.redactPerson(db, A.schoolId, { personId: alum, reason: '보존 기간 지남' }))).rejects.toThrow('요청');
    await asUser(A.userId, (db) => po.decideRecordRequest(db, A.schoolId, { requestId: inspectReq, status: 'granted', note: '2026-11 열람' }));
    await expect(asUser(B.userId, (db) => po.redactionPreview(db, A.schoolId, alum))).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(teacher, (db) => po.redactPerson(db, A.schoolId, { personId: alum, reason: 'x' }))).rejects.toMatchObject({ code: '42501' });
  });

  it('파기는 사건 + 서술 가림. 이름·학적·학점·성적 수치는 남고, 다른 트랜잭션에서 흉내 낸 가림은 거부', async () => {
    const pv = await asUser(A.userId, (db) => po.redactionPreview(db, A.schoolId, alum));
    expect(pv).toMatchObject({ ok: true, exit_on: '2021-02-28', rule_version: 1 });
    expect(pv.counts).toMatchObject({ narratives: 1, record_closures: 1, record_documents: 1 });
    await expect(asUser(A.userId, (db) => po.redactPerson(db, A.schoolId, { personId: alum, reason: '보존 기간 지남', expectedCounts: { ...pv.counts, narratives: 0 } }))).rejects.toThrow('다시 미리');
    const res = await asUser(A.userId, (db) => po.redactPerson(db, A.schoolId, { personId: alum, reason: '보존 기간(졸업 후 3년) 지남', expectedCounts: pv.counts }));
    expect(res.event).toMatch(/^[0-9a-f-]{36}$/);
    const { rows: [n] } = await su.query(`select body from public.narratives where person_id = $1`, [alum]);
    expect(n.body).toBe('[파기됨]');
    const [closure] = await asUser(A.userId, (db) => rec.recordClosures(db, A.schoolId, alum));
    expect(closure.snapshot.narratives).toEqual([]);
    expect(closure.snapshot.student?.name).toBe('졸업한 학생');
    expect(closure.snapshot.enrollments).toHaveLength(1);
    const { rows: [d] } = await su.query(`select content from public.record_documents where person_id = $1`, [alum]);
    expect(JSON.stringify(d.content)).not.toContain('행동 특성 서술');
    expect(JSON.stringify(d.content)).not.toContain('봉사 활동으로'); // 의견서 진술·요청 내용도 서술이라 함께 가린다
    expect((await su.query(`select body from public.record_annotations where person_id = $1`, [alum])).rows[0].body).toBe('[파기됨]');
    expect(d.content.redacted.event).toBe(res.event);
    // 흉내: 다른 트랜잭션에서 같은 사건 id를 설정해도 가림 허락이 나지 않는다
    await su.query('begin');
    await su.query(`select set_config('app.redaction', $1, true)`, [res.event]);
    await expect(su.query(`update public.narratives set body = 'x' where person_id = $1`, [alum])).rejects.toThrow('바꿀 수 없는');
    await su.query('rollback');
    await expect(su.query(`delete from public.narratives where person_id = $1`, [alum])).rejects.toThrow('삭제하지');
    // 한 번 파기한 뒤 다시 파기해도 사건만 늘지 행은 그대로
    expect((await su.query(`select count(*)::int as n from public.destruction_events where person_id = $1`, [alum])).rows[0].n).toBe(1);
  });
});
