import type { Db } from './db';
import { isUuid, NotFoundError, ValidationError } from './services';

/**
 * 62차 ADR 0029 — 학생·보호자 열람 계정과 열람 계약(app.portal_record_v1).
 * 열람 계정은 구성원(memberships)과 따로다. 학생·보호자 화면은 표를 직접 읽지 않고 계약 함수만 부른다.
 */
export type PortalKind = 'student' | 'guardian';
export type PortalAccountRow = { id: string; kind: PortalKind; person_id: string; name: string | null; email: string; claimed: boolean;
  under_consent_age: boolean; consent_basis: string | null; starts_on: string; ends_on: string | null };
export type PortalPerson = { school_id: string; school: string; person_id: string; relation: 'self' | 'child'; name: string | null };
type LText = Record<string, string>;
export type PortalRecord = {
  contract: 'portal-record/1'; relation: 'self' | 'child'; school: string; student: { name: string; name_latin: string | null } | null;
  record_years: { version: number; closed_at: string; reason: string | null; year: { label: string; starts_on: string };
    courses: { subject_code: string; subject_name: string; term: string; credits: number; labels: Record<string, LText>;
      result: { level_code: string | null; attempt_status: string; credits_earned: number; raw_score: number | null } }[];
    narratives: { kind: string; body: string; offering_id: string | null }[];
    attendance: { enrolled_days: number; absent_days: number; absent_by_reason: Record<string, number> } | null;
    evidence: { title: string }[] }[];
  documents: { id: string; format: string; lang: string; published_at: string }[];
  attendance_current: ({ year: string; enrolled_days: number; absent_days: number; absent_by_reason: Record<string, number> }) | null;
  school_records: { record_type: string; title: LText; recorded_at: string; state: string | null; fields: { key: string; label: LText; value: unknown }[] }[];
};

const uuid = (v: unknown, what: string) => {
  if (typeof v !== 'string' || !isUuid(v)) throw new NotFoundError(`${what}을(를) 찾을 수 없습니다.`);
  return v;
};

// ── 관리자 ──────────────────────────────────────────────
export async function addPortalAccount(db: Db, schoolId: string, i: { kind: unknown; personId: unknown; email: unknown; underConsentAge?: unknown; consentBasis?: unknown; consentNote?: unknown }) {
  if (i.kind !== 'student' && i.kind !== 'guardian') throw new ValidationError('열람 계정 종류는 학생·보호자입니다.');
  const { rows: [r] } = await db.query('select app.add_portal_account($1, $2) as v', [schoolId, JSON.stringify({
    kind: i.kind, person_id: uuid(i.personId, '사람'), email: typeof i.email === 'string' ? i.email : '',
    under_consent_age: i.underConsentAge === true, consent_basis: typeof i.consentBasis === 'string' ? i.consentBasis : null,
    consent_note: typeof i.consentNote === 'string' ? i.consentNote.slice(0, 500) : null,
  })]);
  return r.v as string;
}
export async function endPortalAccount(db: Db, schoolId: string, id: unknown, reason?: unknown) {
  await db.query('select app.end_portal_account($1, $2, $3)', [schoolId, uuid(id, '열람 계정'), typeof reason === 'string' ? reason.slice(0, 500) : null]);
}
export async function listPortalAccounts(db: Db, schoolId: string): Promise<PortalAccountRow[]> {
  return (await db.query<PortalAccountRow>(
    `select a.id, a.kind, a.person_id, a.email, a.user_id is not null as claimed, a.under_consent_age, a.consent_basis,
            to_char(a.starts_on, 'YYYY-MM-DD') as starts_on, to_char(a.ends_on, 'YYYY-MM-DD') as ends_on,
            (select n.name from public.person_names n where n.person_id = a.person_id order by n.version desc limit 1) as name
       from public.portal_accounts a where a.school_id = $1 order by a.ends_on nulls first, a.created_at desc`, [schoolId])).rows;
}

// ── 학생·보호자 ──────────────────────────────────────────
export async function portalPeople(db: Db): Promise<PortalPerson[]> {
  return (await db.query('select app.portal_people() as v')).rows[0].v as PortalPerson[];
}
export async function portalRecord(db: Db, personId: unknown): Promise<PortalRecord> {
  return (await db.query('select app.portal_record_v1($1) as v', [uuid(personId, '학생')])).rows[0].v as PortalRecord;
}
export async function portalDocument(db: Db, id: unknown) {
  return (await db.query('select app.portal_document_v1($1) as v', [uuid(id, '발행본')])).rows[0].v as
    { id: string; format: string; lang: string; content: Record<string, unknown>; published_at: string; sha256: string };
}
