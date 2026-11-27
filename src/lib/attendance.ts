import type { Db } from './db';
import { isUuid, NotFoundError, ValidationError } from './services';

/**
 * 59차 ADR 0025 F3 — 출결 사건 원장 · 증거물 · 확인(서명).
 * 출결은 사건으로 추가만(정정 = 앞 사건을 가리키는 새 사건). 코드는 학교 사본(attendance_kind × attendance_reason).
 * 하루 환산·요약 기준은 성적 정책 판 policy.attendance { day_absent_ratio, chronic_ratio, min_attendance_ratio }.
 */
const uuid = (v: unknown, what: string) => {
  if (typeof v !== 'string' || !isUuid(v)) throw new NotFoundError('err.whatNotFound', { what });
  return v;
};
const optUuid = (v: unknown, what: string) => (v == null || v === '' ? null : uuid(v, what));
const day = (v: unknown, what: string) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ValidationError('err.whatDate', { what });
  return v;
};
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export type AttendanceInput = {
  personId: string; day: string; scope?: 'day' | 'session' | 'period'; session?: 'am' | 'pm'; period?: number; offeringId?: string;
  kind: string; reason?: string; minutes?: number; note?: string; correctionReason?: string;
};
export async function recordAttendance(db: Db, schoolId: string, i: AttendanceInput) {
  const scope = i.scope ?? 'day';
  if (!['day', 'session', 'period'].includes(scope)) throw new ValidationError('err.att.scope');
  const { rows: [r] } = await db.query('select app.record_attendance($1, $2) as v', [schoolId, JSON.stringify({
    person_id: uuid(i.personId, '사람'), day: day(i.day, '날짜'), scope, session_code: scope === 'session' ? str(i.session) : null,
    period: scope === 'period' ? Number(i.period) : null, offering_id: optUuid(i.offeringId, '수업'), kind_code: str(i.kind),
    reason_code: str(i.reason), minutes: i.minutes ?? null, note: str(i.note), reason: str(i.correctionReason),
  })]);
  return r.v as string;
}
export type AttendanceDay = { day: string; status: string; reason: string | null; absent_value: number };
export async function attendanceDays(db: Db, schoolId: string, personId: unknown, from: unknown, to: unknown): Promise<AttendanceDay[]> {
  const { rows: [r] } = await db.query('select app.attendance_days($1, $2, $3, $4) as v', [schoolId, uuid(personId, '사람'), day(from, '시작'), day(to, '끝')]);
  return (r.v as AttendanceDay[]).map((x) => ({ ...x, absent_value: Number(x.absent_value) }));
}
export type AttendanceSummary = {
  enrolled_days: number; absent_days: number; counts: Record<string, number>; absent_by_reason: Record<string, number>;
  attendance_rate: number | null; chronic_absence: boolean; meets_min_attendance: boolean; thresholds: { chronic_ratio: number; min_attendance_ratio: number };
};
export async function attendanceSummary(db: Db, schoolId: string, personId: unknown, from: unknown, to: unknown): Promise<AttendanceSummary> {
  const { rows: [r] } = await db.query('select app.attendance_summary($1, $2, $3, $4) as v', [schoolId, uuid(personId, '사람'), day(from, '시작'), day(to, '끝')]);
  const v = r.v;
  return { ...v, enrolled_days: Number(v.enrolled_days), absent_days: Number(v.absent_days), attendance_rate: v.attendance_rate == null ? null : Number(v.attendance_rate) };
}

export async function addEvidence(db: Db, schoolId: string, i: { personId: string; title: string; body?: string; link?: string; offeringId?: string; assessmentId?: string; competencyItemId?: string; supersedesId?: string }) {
  const { rows: [r] } = await db.query('select app.add_evidence($1, $2) as v', [schoolId, JSON.stringify({
    person_id: uuid(i.personId, '사람'), title: str(i.title), body: str(i.body) || null, link: str(i.link) || null, offering_id: optUuid(i.offeringId, '수업'),
    assessment_id: optUuid(i.assessmentId, '평가 항목'), competency_item_id: optUuid(i.competencyItemId, '역량'), supersedes_id: optUuid(i.supersedesId, '앞 증거물'),
  })]);
  return r.v as string;
}
export async function attest(db: Db, schoolId: string, i: { kind: 'closure' | 'narrative' | 'evidence' | 'proposal'; subjectId: string; role: string; decision?: 'confirmed' | 'rejected'; note?: string }) {
  const { rows: [r] } = await db.query('select app.attest($1, $2) as v', [schoolId, JSON.stringify({
    subject_kind: i.kind, subject_id: uuid(i.subjectId, '대상'), role_code: str(i.role), decision: i.decision ?? 'confirmed', note: str(i.note),
  })]);
  return r.v as string;
}
export async function attestationsOf(db: Db, schoolId: string, kind: string, subjectId: unknown) {
  return (await db.query('select role_code, decision, note, attested_by, attested_at from public.attestations where school_id = $1 and subject_kind = $2 and subject_id = $3 order by attested_at',
    [schoolId, kind, uuid(subjectId, '대상')])).rows;
}
