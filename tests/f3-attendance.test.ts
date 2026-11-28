/** 59차 ADR 0025 F3 — 출결 사건 원장(하루·반나절·교시), 하루 환산, 요약(재적 수업일 분모·만성 결석·출석 2/3·출석인정), 정정 사건, 증거물·확인, 학교 간 거부 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';
import type { CalendarDayInput } from '@/lib/foundation';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const pp = await import('@/lib/people');
const f = await import('@/lib/foundation');
const at = await import('@/lib/attendance');

type S = { schoolId: string; userId: string };
let A: S; let B: S;
let su: pg.Client;
let kr: string; let us: string; let year: string;

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  ({ kr, us, year } = await asUser(A.userId, async (db) => {
    const level = await pp.addSchoolLevel(db, A.schoolId, { code: 'f3', name: 'F3 학교급' });
    const y = await pp.addAcademicYear(db, A.schoolId, { label: '2026', startsOn: '2026-03-01', endsOn: '2027-03-01' });
    const k = await pp.addPerson(db, A.schoolId, { name: 'F3 한국식 학생' });
    const u = await pp.addPerson(db, A.schoolId, { name: 'F3 미국식 학생' });
    await pp.enroll(db, A.schoolId, { personId: k, levelId: level, startsOn: '2026-03-02' });
    await pp.enroll(db, A.schoolId, { personId: u, levelId: level, startsOn: '2026-03-02' });
    // 3월 2일~13일: 평일 10일 중 하루(3/6)는 휴일, 3/13은 반일 → 재적 수업일 8.5
    const days = ['02', '03', '04', '05', '06', '09', '10', '11', '12', '13'].map((d) => ({
      day: `2026-03-${d}`, kind: d === '06' ? 'holiday' : 'instructional', half_day: d === '13',
    })) as CalendarDayInput[];
    await f.setCalendarDays(db, A.schoolId, y, days);
    return { kr: k, us: u, year: y };
  }));
});
afterAll(async () => { await su.end(); await getPool().end(); });

describe('출결 기록', () => {
  it('학교 코드(사본)로만, 수업일·학적이 있는 날만, 다른 학교는 거부', async () => {
    await asUser(A.userId, (db) => at.recordAttendance(db, A.schoolId, { personId: kr, day: '2026-03-03', kind: 'absent', reason: 'illness' }));
    await expect(asUser(A.userId, (db) => at.recordAttendance(db, A.schoolId, { personId: kr, day: '2026-03-04', kind: 'nap' }))).rejects.toThrow('출결 종류');
    await expect(asUser(A.userId, (db) => at.recordAttendance(db, A.schoolId, { personId: kr, day: '2026-03-04', kind: 'absent', reason: 'party' }))).rejects.toThrow('출결 사유');
    await expect(asUser(A.userId, (db) => at.recordAttendance(db, A.schoolId, { personId: kr, day: '2026-03-06', kind: 'absent' }))).rejects.toThrow('수업일이 아닌');
    await expect(asUser(A.userId, (db) => at.recordAttendance(db, A.schoolId, { personId: kr, day: '2026-02-20', kind: 'absent' }))).rejects.toThrow('학적');
    await expect(asUser(B.userId, (db) => at.recordAttendance(db, A.schoolId, { personId: kr, day: '2026-03-04', kind: 'absent' }))).rejects.toMatchObject({ code: '42501' });
    expect(await asUser(B.userId, (db) => db.query('select * from public.attendance_events'))).toMatchObject({ rows: [] });
  });

  it('정정은 앞 사건을 가리키는 새 사건, 사건은 고칠 수 없다', async () => {
    const first = await asUser(A.userId, (db) => at.recordAttendance(db, A.schoolId, { personId: kr, day: '2026-03-04', kind: 'tardy', minutes: 10 }));
    const second = await asUser(A.userId, (db) => at.recordAttendance(db, A.schoolId, { personId: kr, day: '2026-03-04', kind: 'absent', reason: 'unexcused', correctionReason: '오후 무단 이탈 확인' }));
    const { rows: [r] } = await su.query('select corrects_id from public.attendance_events where id = $1', [second]);
    expect(r.corrects_id).toBe(first);
    await expect(su.query('update public.attendance_events set kind_code = $2 where id = $1', [first, 'present'])).rejects.toThrow('바꿀 수 없는');
  });
});

describe('하루 환산·요약', () => {
  it('한국식(하루 사건): 결석 2일(질병·미인정) + 출석인정(체험학습)은 결석에서 빠짐, 출석 2/3 판정', async () => {
    await asUser(A.userId, (db) => at.recordAttendance(db, A.schoolId, { personId: kr, day: '2026-03-05', kind: 'absent', reason: 'recognized' }));
    const s = await asUser(A.userId, (db) => at.attendanceSummary(db, A.schoolId, kr, '2026-03-01', '2026-04-01'));
    expect(s.enrolled_days).toBe(8.5);
    expect(s.absent_days).toBe(2);
    expect(s.absent_by_reason).toEqual({ illness: 1, unexcused: 1 });
    expect(s.meets_min_attendance).toBe(true);
    expect(s.chronic_absence).toBe(true); // 2 / 8.5 ≥ 10%
  });

  it('미국식(교시 사건): 결석 교시 비율 ≥ 0.5면 결석 하루, 아니면 결과(교시 결석) / 반나절 결석은 0.5', async () => {
    await asUser(A.userId, async (db) => {
      // 3/9: 6교시 중 3교시 결석 → 결석
      for (let p = 1; p <= 6; p++) await at.recordAttendance(db, A.schoolId, { personId: us, day: '2026-03-09', scope: 'period', period: p, kind: p <= 3 ? 'absent' : 'present', reason: p <= 3 ? 'unexcused' : undefined });
      // 3/10: 6교시 중 1교시 결석 → 결과
      for (let p = 1; p <= 6; p++) await at.recordAttendance(db, A.schoolId, { personId: us, day: '2026-03-10', scope: 'period', period: p, kind: p === 1 ? 'absent' : 'present', reason: p === 1 ? 'illness' : undefined });
      // 3/11: 오전 결석 → 0.5
      await at.recordAttendance(db, A.schoolId, { personId: us, day: '2026-03-11', scope: 'session', session: 'am', kind: 'absent', reason: 'illness' });
      await at.recordAttendance(db, A.schoolId, { personId: us, day: '2026-03-11', scope: 'session', session: 'pm', kind: 'present' });
    });
    const days = await asUser(A.userId, (db) => at.attendanceDays(db, A.schoolId, us, '2026-03-01', '2026-04-01'));
    expect(days.map((d) => [d.day, d.status, d.absent_value])).toEqual([
      ['2026-03-09', 'absent', 1], ['2026-03-10', 'class_absent', 0], ['2026-03-11', 'half_absent', 0.5],
    ]);
    const s = await asUser(A.userId, (db) => at.attendanceSummary(db, A.schoolId, us, '2026-03-01', '2026-04-01'));
    expect(s).toMatchObject({ absent_days: 1.5, enrolled_days: 8.5, chronic_absence: true });
    // 학교가 정책 판으로 기준을 바꾸면(교시 70% 이상만 결석) 3/9는 결과로 내려간다
    await asUser(A.userId, (db) => db.query(`select app.save_grading_policy($1, $2)`, [A.schoolId, JSON.stringify({
      policy: { score_digits: 2, final_digits: 0, stats: { sd: 'population', digits: 1 }, attendance: { day_absent_ratio: 0.7, chronic_ratio: 0.2 } },
      why: '주 규칙: 교시 70% 이상 결석만 하루 결석', base_version: 1 })]));
    const s2 = await asUser(A.userId, (db) => at.attendanceSummary(db, A.schoolId, us, '2026-03-01', '2026-04-01'));
    expect(s2).toMatchObject({ absent_days: 0.5, chronic_absence: false });
    expect(s2.thresholds.chronic_ratio).toBe(0.2);
  });

  it('출석인정은 그 날짜에 유효한 코드 판으로 본다: 옛 판(출석인정)·새 판(아님)이 같은 코드여도 새 판 기간 결석은 결석(111차)', async () => {
    // 학교가 3월 10일부터 'recognized' 를 출석인정이 아닌 것으로 바꾼다(app.add_code 로 새 판, 옛 판은 3/10에 닫힘)
    const old = (await asUser(A.userId, (db) => f.codes(db, A.schoolId, 'attendance_reason', '2026-03-05'))).find((c) => c.code === 'recognized')!;
    await asUser(A.userId, (db) => f.addCode(db, A.schoolId, { listKey: 'attendance_reason', code: 'recognized', label: { ko: '출석인정(폐지)', en: 'Recognized (retired)' },
      attrs: { excused: true, counts_present: false }, priorCodeId: old.id, effectiveFrom: '2026-03-10', why: '111차 시험: 출석인정 폐지' }));
    const { rows: versions } = await su.query(`select effective_from, effective_to, attrs from public.code_lists
      where school_id = $1 and list_key = 'attendance_reason' and code = 'recognized' order by effective_from nulls first`, [A.schoolId]);
    expect(versions.map((v) => v.attrs.counts_present)).toEqual([true, false]);
    // 3/12(새 판 기간) 같은 사유로 결석
    await asUser(A.userId, (db) => at.recordAttendance(db, A.schoolId, { personId: kr, day: '2026-03-12', kind: 'absent', reason: 'recognized' }));
    const days = await asUser(A.userId, (db) => at.attendanceDays(db, A.schoolId, kr, '2026-03-01', '2026-04-01'));
    const byDay = Object.fromEntries(days.map((d) => [d.day, d.absent_value]));
    expect(byDay['2026-03-05']).toBe(0); // 옛 판 기간: 여전히 출석인정
    expect(byDay['2026-03-12']).toBe(1); // 새 판 기간: 결석
    const s = await asUser(A.userId, (db) => at.attendanceSummary(db, A.schoolId, kr, '2026-03-01', '2026-04-01'));
    expect(s.absent_days).toBe(3);
    expect(s.absent_by_reason).toEqual({ illness: 1, unexcused: 1, recognized: 1 });
  });
});

describe('증거물·확인(서명)', () => {
  it('증거물(글·https 링크)과 역할별 확인. 위원회 확인은 관리자만, 다른 학교 대상은 못 찾음', async () => {
    const ev = await asUser(A.userId, (db) => at.addEvidence(db, A.schoolId, { personId: kr, title: '마을 지도 프로젝트 발표', link: 'https://example.org/f3-map' }));
    await expect(asUser(A.userId, (db) => at.addEvidence(db, A.schoolId, { personId: kr, title: '링크', link: 'http://insecure.example' }))).rejects.toThrow('형식');
    await asUser(A.userId, (db) => at.attest(db, A.schoolId, { kind: 'evidence', subjectId: ev, role: 'mentor', note: '발표 확인' }));
    const { rows: [t] } = await su.query(`select u.id from private.app_users u join public.memberships m on m.user_id = u.id where m.school_id = $1 and m.role = 'teacher' limit 1`, [A.schoolId]);
    if (t) await expect(asUser(t.id, (db) => at.attest(db, A.schoolId, { kind: 'evidence', subjectId: ev, role: 'committee' }))).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(B.userId, (db) => at.attest(db, B.schoolId, { kind: 'evidence', subjectId: ev, role: 'mentor' }))).rejects.toThrow('찾을 수 없습니다');
    expect(await asUser(A.userId, (db) => at.attestationsOf(db, A.schoolId, 'evidence', ev))).toMatchObject([{ role_code: 'mentor', decision: 'confirmed' }]);
  });
});
