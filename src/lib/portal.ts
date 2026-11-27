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

// ── 63차 ADR 0030: 열람·수정 요청 · 이의 의견서 ─────────────
export type RequestKind = 'inspect' | 'amend';
export type RequestStatus = 'received' | 'in_review' | 'granted' | 'amended' | 'denied' | 'not_applicable' | 'hearing_offered' | 'closed';
// 상태 이름은 화면 사전의 req.status.<상태>(ADR 0037)
export const REQUEST_DONE: RequestStatus[] = ['granted', 'amended', 'not_applicable', 'closed'];
export type PortalRequest = { id: string; kind: RequestKind; target_kind: string; body: string; due_on: string; created_at: string; status: RequestStatus;
  events: { status: RequestStatus; note: string | null; at: string }[]; annotation: { body: string; at: string } | null };

export async function portalRequest(db: Db, i: { personId: unknown; kind: unknown; targetKind?: unknown; targetId?: unknown; body: unknown }) {
  if (i.kind !== 'inspect' && i.kind !== 'amend') throw new ValidationError('요청 종류는 열람·수정입니다.');
  const { rows: [r] } = await db.query('select app.portal_request($1) as v', [JSON.stringify({
    person_id: uuid(i.personId, '학생'), kind: i.kind, target_kind: typeof i.targetKind === 'string' ? i.targetKind : 'other',
    target_id: typeof i.targetId === 'string' && isUuid(i.targetId) ? i.targetId : null, body: typeof i.body === 'string' ? i.body.slice(0, 2000) : '',
  })]);
  return r.v as string;
}
export async function portalAnnotate(db: Db, requestId: unknown, body: unknown) {
  const { rows: [r] } = await db.query('select app.portal_annotate($1) as v', [JSON.stringify({ request_id: uuid(requestId, '요청'), body: typeof body === 'string' ? body.slice(0, 2000) : '' })]);
  return r.v as string;
}
export async function portalRequests(db: Db, personId: unknown): Promise<PortalRequest[]> {
  return (await db.query('select app.portal_requests_v1($1) as v', [uuid(personId, '학생')])).rows[0].v as PortalRequest[];
}

// 학교(관리자)
export type SchoolRequest = PortalRequest & { person_id: string; name: string | null; requester_relation: 'self' | 'child' };
export async function listRecordRequests(db: Db, schoolId: string): Promise<SchoolRequest[]> {
  return (await db.query<SchoolRequest>(
    `select q.id, q.kind, q.target_kind, q.body, q.due_on::text, q.created_at, q.person_id, q.requester_relation,
            (select n.name from public.person_names n where n.person_id = q.person_id order by n.version desc limit 1) as name,
            (select e.status from public.record_request_events e where e.request_id = q.id order by e.decided_at desc, e.id desc limit 1) as status,
            (select jsonb_agg(jsonb_build_object('status', e.status, 'note', e.note, 'at', e.decided_at) order by e.decided_at, e.id) from public.record_request_events e where e.request_id = q.id) as events,
            (select jsonb_build_object('body', a.body, 'at', a.written_at) from public.record_annotations a where a.request_id = q.id) as annotation
       from public.record_requests q where q.school_id = $1 order by q.created_at desc`, [schoolId])).rows;
}
export async function decideRecordRequest(db: Db, schoolId: string, i: { requestId: unknown; status: unknown; note?: unknown; fromStatus?: unknown; correctionRef?: unknown }) {
  const { rows: [r] } = await db.query('select app.decide_record_request($1, $2) as v', [schoolId, JSON.stringify({
    request_id: uuid(i.requestId, '요청'), status: i.status, note: typeof i.note === 'string' ? i.note.slice(0, 2000) : null,
    from_status: typeof i.fromStatus === 'string' ? i.fromStatus : null,
    correction_ref: typeof i.correctionRef === 'string' && isUuid(i.correctionRef) ? i.correctionRef : null,
  })]);
  return r.v as RequestStatus;
}

// ── 63차 ADR 0028: 보존 규칙 판 · 파기(가림 판) ─────────────
export async function saveRetentionRule(db: Db, schoolId: string, i: { yearsAfterExit: number | null; why?: string; base_version: number }) {
  const { rows: [r] } = await db.query('select app.save_retention_rule($1, $2) as v', [schoolId, JSON.stringify({ years_after_exit: i.yearsAfterExit, why: i.why ?? null, base_version: i.base_version })]);
  return r.v as number;
}
export async function retentionRule(db: Db, schoolId: string) {
  return (await db.query<{ version: number; years_after_exit: number | null; why: string | null }>(
    'select version, years_after_exit, why from public.retention_rules where school_id = $1 order by version desc limit 1', [schoolId])).rows[0] ?? null;
}
export type RedactionPreview = { ok: boolean; why: string | null; rule_version: number | null; exit_on: string | null; counts: Record<string, number>; kept: string[] };
export async function redactionPreview(db: Db, schoolId: string, personId: unknown): Promise<RedactionPreview> {
  return (await db.query('select app.redaction_preview($1, $2) as v', [schoolId, uuid(personId, '사람')])).rows[0].v as RedactionPreview;
}
export async function redactPerson(db: Db, schoolId: string, i: { personId: unknown; reason: unknown; expectedCounts?: Record<string, number> }) {
  const { rows: [r] } = await db.query('select app.redact_person($1, $2) as v', [schoolId, JSON.stringify({
    person_id: uuid(i.personId, '사람'), reason: typeof i.reason === 'string' ? i.reason.slice(0, 500) : '', ...(i.expectedCounts ? { expected_counts: i.expectedCounts } : {}),
  })]);
  return r.v as { event: string; counts: Record<string, number> };
}
