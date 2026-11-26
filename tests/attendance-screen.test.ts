/** 74차 — 출결 화면: 달력 → 하루 출결부(교사도 입력) → 정정은 새 사건 → 수업일 아닌 날 거부 → 요약. 학교 간 분리 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const pp = await import('@/lib/people');
const fd = await import('@/lib/foundation');
const at = await import('@/lib/attendance');
const rg = await import('@/lib/register');

type S = { schoolId: string; userId: string };
let A: S; let B: S; let su: pg.Client; let teacher: string;

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  const { rows: [t] } = await su.query(`insert into private.app_users(email, display_name) values ('at-teacher@school-a.test', 'x') returning id`);
  await su.query(`insert into public.memberships(user_id, school_id, role) values ($1, $2, 'teacher')`, [t.id, A.schoolId]);
  teacher = t.id;
});
afterAll(async () => { await su.end(); await getPool().end(); });

describe('출결 화면', () => {
  it('출결부·정정·달력·요약을 그 학교 것만', async () => {
    const x = await asUser(A.userId, async (db) => {
      const y = await pp.addAcademicYear(db, A.schoolId, { label: 'AT2029', startsOn: '2029-03-01', endsOn: '2030-03-01' });
      const lv = await pp.addSchoolLevel(db, A.schoolId, { code: 'at_mid', name: '출결중등' });
      const s1 = await pp.addPerson(db, A.schoolId, { name: '출결 학생 1' });
      const s2 = await pp.addPerson(db, A.schoolId, { name: '출결 학생 2' });
      for (const p of [s1, s2]) await pp.enroll(db, A.schoolId, { personId: p, levelId: lv, startsOn: '2029-03-02' });
      await fd.setCalendarDays(db, A.schoolId, y, [
        { day: '2029-03-05', kind: 'instructional' }, { day: '2029-03-06', kind: 'instructional' }, { day: '2029-03-07', kind: 'holiday', label: '시험 휴일' },
      ]);
      return { y, lv, s1, s2, year: await rg.yearOfDay(db, A.schoolId, '2029-03-05'), month: await rg.calendarMonth(db, A.schoolId, '2029-03'), before: await rg.levelRegister(db, A.schoolId, lv, '2029-03-05') };
    });
    expect(x.year).toMatchObject({ id: x.y, label: 'AT2029' });
    expect(x.month.map((m) => [m.day, m.kind])).toEqual([['2029-03-05', 'instructional'], ['2029-03-06', 'instructional'], ['2029-03-07', 'holiday']]);
    expect(x.before.map((r) => [r.name, r.kind_code])).toEqual([['출결 학생 1', null], ['출결 학생 2', null]]);

    // 교사(구성원)가 입력, 관리자가 정정 → 최신 사건이 보이고 앞 사건을 가리킨다
    await asUser(teacher, async (db) => {
      await at.recordAttendance(db, A.schoolId, { personId: x.s1, day: '2029-03-05', kind: 'present' });
      await at.recordAttendance(db, A.schoolId, { personId: x.s2, day: '2029-03-05', kind: 'absent', reason: 'illness', note: '열' });
      await at.recordAttendance(db, A.schoolId, { personId: x.s2, day: '2029-03-06', kind: 'absent', reason: 'unexcused' });
    });
    await asUser(A.userId, (db) => at.recordAttendance(db, A.schoolId, { personId: x.s1, day: '2029-03-05', kind: 'tardy', reason: 'other', correctionReason: '지각으로 정정' }));
    const reg = await asUser(A.userId, (db) => rg.levelRegister(db, A.schoolId, x.lv, '2029-03-05'));
    expect(reg.map((r) => [r.name, r.kind_code, r.reason_code])).toEqual([['출결 학생 1', 'tardy', 'other'], ['출결 학생 2', 'absent', 'illness']]);
    const { rows: ev } = await su.query(`select kind_code, corrects_id is not null as corr from public.attendance_events where person_id = $1 order by recorded_at`, [x.s1]);
    expect(ev).toEqual([{ kind_code: 'present', corr: false }, { kind_code: 'tardy', corr: true }]);

    // 휴일·학교에 없는 코드는 거부
    await expect(asUser(A.userId, (db) => at.recordAttendance(db, A.schoolId, { personId: x.s1, day: '2029-03-07', kind: 'present' }))).rejects.toThrow('수업일이 아닌');
    await expect(asUser(A.userId, (db) => at.recordAttendance(db, A.schoolId, { personId: x.s1, day: '2029-03-06', kind: 'nap' }))).rejects.toThrow('출결 종류');

    // 요약: 수업일 2일 중 s2 결석 2 → 만성 결석·출석 기준 미달
    const sum = await asUser(A.userId, (db) => at.attendanceSummary(db, A.schoolId, x.s2, '2029-03-01', '2029-03-08'));
    expect(sum).toMatchObject({ enrolled_days: 2, absent_days: 2, chronic_absence: true, meets_min_attendance: false });

    // 다른 학교: 출결부·달력·학년도가 보이지 않고, 쓰기도 거부
    const b = await asUser(B.userId, async (db) => ({
      reg: await rg.levelRegister(db, A.schoolId, x.lv, '2029-03-05'), month: await rg.calendarMonth(db, A.schoolId, '2029-03'), year: await rg.yearOfDay(db, A.schoolId, '2029-03-05'),
    }));
    expect(b).toEqual({ reg: [], month: [], year: null });
    await expect(asUser(B.userId, (db) => at.recordAttendance(db, A.schoolId, { personId: x.s1, day: '2029-03-06', kind: 'present' }))).rejects.toThrow();
    await expect(asUser(B.userId, (db) => fd.setCalendarDays(db, A.schoolId, x.y, [{ day: '2029-03-08' }]))).rejects.toThrow();
    // 교사는 달력을 못 바꾼다(관리자만)
    await expect(asUser(teacher, (db) => fd.setCalendarDays(db, A.schoolId, x.y, [{ day: '2029-03-08' }]))).rejects.toThrow('관리자');
  });
});
