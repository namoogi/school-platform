import type { Db } from './db';
import { isUuid, NotFoundError, ValidationError } from './services';

/**
 * 56차 ADR 0025 F1 — 학사 토대(한국 + 미국 기준).
 * 쓰기는 모두 DB 명령 함수(app.*, 소유자 app_writer). 요청 역할은 표에 직접 쓸 수 없다.
 * schoolId 는 호출하는 쪽이 로그인 소속에서 정한 값만 넘긴다(클라이언트 값 금지).
 */

export type LText = Record<string, string>;
export type GradeLevel = { id: string; code: string; label: LText; ordinal: number; school_level_id: string | null; sort_order: number };
export type TermNode = {
  id: string; parent_id: string | null; academic_year_id: string; kind: string; period_key: string; label: string; sequence: number;
  credit_bearing: boolean; starts_on: string | null; ends_on: string | null; entry_opens_on: string | null; entry_closes_on: string | null;
};
export type Code = {
  id: string; school_id: string | null; list_key: string; code: string; label: LText; sort_order: number; attrs: Record<string, unknown>;
  maps_to: Record<string, unknown>; effective_from: string | null; effective_to: string | null; prior_code_id: string | null; why: string | null;
};
export type ProposalVersion = {
  version: number; title: string; purpose: string; plan: string; mentor_person_id: string | null; term_id: string | null; status: string; note: string | null;
};

const uuid = (v: unknown, what: string) => {
  if (typeof v !== 'string' || !isUuid(v)) throw new NotFoundError('err.whatNotFound', { what });
  return v;
};
const optUuid = (v: unknown, what: string) => (v == null || v === '' ? null : uuid(v, what));
const day = (v: unknown, what: string) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ValidationError('err.whatDate', { what });
  return v;
};
const optDay = (v: unknown, what: string) => (v == null || v === '' ? null : day(v, what));
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const ltext = (v: unknown, what: string): LText => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ValidationError('err.whatLabelRequired', { what });
  const out: LText = {};
  for (const [k, s] of Object.entries(v)) if (/^[a-z]{2}$/.test(k) && typeof s === 'string' && s.trim()) out[k] = s.trim().slice(0, 120);
  if (!Object.keys(out).length) throw new ValidationError('err.whatLabelRequired', { what });
  return out;
};
const plainObj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
async function one<T>(db: Db, sql: string, params: unknown[]): Promise<T> {
  const { rows: [r] } = await db.query(sql, params);
  return r?.v as T;
}

// ── 학교 관할·인가 ───────────────────────────────────────
export function setSchoolProfile(db: Db, schoolId: string, input: Record<string, unknown>) {
  return one<number>(db, 'select app.set_school_profile($1, $2) as v', [schoolId, JSON.stringify({
    country: str(input.country), sector: str(input.sector), accreditation: str(input.accreditation),
    external_codes: plainObj(input.external_codes), why: str(input.why),
    ...(input.grade_scheme !== undefined ? { grade_scheme: str(input.grade_scheme) } : {}),
    ...(input.base_version != null ? { base_version: Number(input.base_version) } : {}),
  })]);
}
export async function schoolProfile(db: Db, schoolId: string) {
  const { rows: [r] } = await db.query('select * from public.school_profiles where school_id = $1 order by version desc limit 1', [schoolId]);
  return r ?? null;
}

// ── 학년 ─────────────────────────────────────────────────
export function addGradeLevel(db: Db, schoolId: string, input: { levelId?: unknown; code?: unknown; label?: unknown; ordinal?: unknown; sortOrder?: unknown }) {
  const ord = Number(input.ordinal);
  if (!Number.isInteger(ord)) throw new ValidationError('err.found.ordinal');
  return one<string>(db, 'select app.add_grade_level($1, $2, $3, $4, $5, $6) as v',
    [schoolId, optUuid(input.levelId, '학교급'), str(input.code), JSON.stringify(ltext(input.label, '학년')), ord,
     Number.isInteger(input.sortOrder) ? input.sortOrder : null]);
}
export async function listGradeLevels(db: Db, schoolId: string): Promise<GradeLevel[]> {
  return (await db.query<GradeLevel>(
    'select id, code, label, ordinal, school_level_id, sort_order from public.grade_levels where school_id = $1 order by sort_order, ordinal', [schoolId])).rows;
}

// ── 학기 나무 ────────────────────────────────────────────
export const TERM_KINDS = ['semester', 'trimester', 'quarter', 'term', 'grading_period', 'session'] as const;
export function addSubTerm(db: Db, schoolId: string, parentId: unknown, input: { kind?: unknown; key?: unknown; label?: unknown; startsOn?: unknown; endsOn?: unknown; creditBearing?: unknown }) {
  return one<string>(db, 'select app.add_sub_term($1, $2, $3, $4, $5, $6, $7, $8) as v',
    [schoolId, uuid(parentId, '상위 학기'), str(input.kind), str(input.key), str(input.label),
     day(input.startsOn, '시작 날짜'), day(input.endsOn, '끝 날짜'), input.creditBearing === true]);
}
export async function setTermEntryWindow(db: Db, schoolId: string, termId: unknown, opens: unknown, closes: unknown) {
  await db.query('select app.set_term_entry_window($1, $2, $3, $4)', [schoolId, uuid(termId, '학기'), optDay(opens, '입력 시작'), optDay(closes, '입력 끝')]);
}
export async function termTree(db: Db, schoolId: string, yearId: unknown): Promise<TermNode[]> {
  return (await db.query<TermNode>(
    `select t.id, t.parent_id, t.academic_year_id, t.kind, t.period_key, t.label, t.sequence, t.credit_bearing, t.starts_on::text, t.ends_on::text,
            t.entry_opens_on::text, t.entry_closes_on::text
       from public.terms t left join public.terms p on p.id = t.parent_id
      where t.school_id = $1 and t.academic_year_id = $2
      order by coalesce(p.sequence, t.sequence), t.parent_id is not null, t.sequence`, [schoolId, uuid(yearId, '학년도')])).rows;
}

// ── 수업일 달력 ──────────────────────────────────────────
export type CalendarDayInput = { day: string; kind?: 'instructional' | 'holiday' | 'non_instructional' | 'event'; half_day?: boolean; label?: string };
export function setCalendarDays(db: Db, schoolId: string, yearId: unknown, days: unknown) {
  if (!Array.isArray(days)) throw new ValidationError('err.found.daysArray');
  const list = days.map((d: CalendarDayInput) => ({ day: day(d?.day, '날짜'), kind: d?.kind ?? 'instructional', half_day: d?.half_day === true, label: d?.label ?? null }));
  return one<number>(db, 'select app.set_calendar_days($1, $2, $3) as v', [schoolId, uuid(yearId, '학년도'), JSON.stringify(list)]);
}
/** 수업일 수(반일은 0.5) — 만성 결석·출석 2/3·ADA 분모 */
export async function instructionalDays(db: Db, schoolId: string, from: unknown, to: unknown) {
  const { rows: [r] } = await db.query<{ n: string }>(
    `select coalesce(sum(case when half_day then 0.5 else 1 end), 0) as n from public.calendar_days
      where school_id = $1 and kind = 'instructional' and day >= $2 and day < $3`, [schoolId, day(from, '시작'), day(to, '끝')]);
  return Number(r.n);
}

// ── 코드 목록 (E1) ───────────────────────────────────────
/** 학교가 가진 코드(학교 생성 때 기본판에서 복제한 사본 + 학교가 더한 값). 기준일에 유효한 것만 — ADR 0027 */
export async function codes(db: Db, schoolId: string, listKey: string, on?: string): Promise<Code[]> {
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(listKey)) throw new ValidationError('err.found.listKey');
  const at = on ? day(on, '기준일') : null;
  return (await db.query<Code>(
    `select distinct on (code) id, school_id, list_key, code, label, sort_order, attrs, maps_to, effective_from::text, effective_to::text, prior_code_id, why
       from public.code_lists
      where list_key = $2 and school_id = $1
        and (effective_from is null or effective_from <= coalesce($3::date, current_date))
        and (effective_to is null or effective_to > coalesce($3::date, current_date))
      order by code, effective_from desc nulls last`, [schoolId, listKey, at])).rows
    .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code));
}
export function addCode(db: Db, schoolId: string, input: Record<string, unknown>) {
  return one<string>(db, 'select app.add_code($1, $2) as v', [schoolId, JSON.stringify({
    list_key: str(input.listKey ?? input.list_key), code: str(input.code), label: ltext(input.label, '코드'),
    sort_order: Number.isInteger(input.sortOrder) ? input.sortOrder : 0, attrs: plainObj(input.attrs), maps_to: plainObj(input.mapsTo ?? input.maps_to),
    effective_from: optDay(input.effectiveFrom, '시작일'), prior_code_id: optUuid(input.priorCodeId, '이전 코드'), why: str(input.why),
  })]);
}

// ── 외부 식별자 ──────────────────────────────────────────
export function addExternalIdentifier(db: Db, schoolId: string, input: Record<string, unknown>) {
  const kind = input.targetKind === 'school' ? 'school' : 'person';
  return one<string>(db, 'select app.add_external_identifier($1, $2) as v', [schoolId, JSON.stringify({
    target_kind: kind, person_id: kind === 'person' ? uuid(input.personId, '사람') : null, system: str(input.system), value: str(input.value),
    status: str(input.status), scope: str(input.scope), valid_from: optDay(input.validFrom, '시작일'), valid_to: optDay(input.validTo, '끝일'),
  })]);
}
export async function supersedeExternalIdentifier(db: Db, schoolId: string, id: unknown, endOn?: unknown) {
  await db.query('select app.supersede_external_identifier($1, $2, $3)', [schoolId, uuid(id, '외부 식별자'), optDay(endOn, '끝일')]);
}
export async function externalIdentifiers(db: Db, schoolId: string, personId?: unknown) {
  return (await db.query(
    `select id, target_kind, person_id, system, value, status, scope, valid_from::text, valid_to::text from public.external_identifiers
      where school_id = $1 and ($2::uuid is null or person_id = $2) order by system, created_at`, [schoolId, optUuid(personId, '사람')])).rows;
}

// ── 가족·보호자 ──────────────────────────────────────────
export function addFamily(db: Db, schoolId: string, label: unknown) {
  return one<string>(db, 'select app.add_family($1, $2) as v', [schoolId, str(label)]);
}
export function linkGuardian(db: Db, schoolId: string, input: Record<string, unknown>) {
  return one<string>(db, 'select app.link_guardian($1, $2) as v', [schoolId, JSON.stringify({
    family_id: optUuid(input.familyId, '가족'), guardian_person_id: uuid(input.guardianPersonId, '보호자'), student_person_id: uuid(input.studentPersonId, '학생'),
    relation_code: str(input.relationCode), legal_guardian: input.legalGuardian !== false, contact_allowed: input.contactAllowed !== false,
    restriction_note: str(input.restrictionNote), starts_on: optDay(input.startsOn, '시작일'),
  })]);
}
export async function endGuardianLink(db: Db, schoolId: string, id: unknown, endOn?: unknown) {
  await db.query('select app.end_guardian_link($1, $2, $3)', [schoolId, uuid(id, '연결'), optDay(endOn, '끝일')]);
}
export async function guardiansOf(db: Db, schoolId: string, studentId: unknown) {
  return (await db.query(
    `select g.id, g.guardian_person_id, n.name as guardian_name, g.relation_code, g.legal_guardian, g.contact_allowed, g.family_id, g.starts_on::text, g.ends_on::text
       from public.guardian_links g left join public.person_current_names n on n.person_id = g.guardian_person_id
      where g.school_id = $1 and g.student_person_id = $2 order by g.starts_on`, [schoolId, uuid(studentId, '학생')])).rows;
}

// ── 교직원 배정 ──────────────────────────────────────────
export function assignStaff(db: Db, schoolId: string, input: Record<string, unknown>) {
  return one<string>(db, 'select app.assign_staff($1, $2) as v', [schoolId, JSON.stringify({
    person_id: uuid(input.personId, '사람'), role_code: str(input.roleCode), school_level_id: optUuid(input.levelId, '학교급'),
    starts_on: optDay(input.startsOn, '시작일'), note: str(input.note),
  })]);
}
export async function endStaffAssignment(db: Db, schoolId: string, id: unknown, endOn?: unknown) {
  await db.query('select app.end_staff_assignment($1, $2, $3)', [schoolId, uuid(id, '배정'), optDay(endOn, '끝일')]);
}

// ── 디렉터리 공개 거부 ───────────────────────────────────
export function setDirectoryOptout(db: Db, schoolId: string, personId: unknown, scope?: unknown, reason?: unknown) {
  return one<string>(db, 'select app.set_directory_optout($1, $2, $3, $4) as v', [schoolId, uuid(personId, '사람'), str(scope), str(reason)]);
}
export async function endDirectoryOptout(db: Db, schoolId: string, id: unknown) {
  await db.query('select app.end_directory_optout($1, $2)', [schoolId, uuid(id, '공개 거부')]);
}
export async function directoryAllowed(db: Db, schoolId: string, personId: unknown, what: 'all' | 'photo' | 'name' | 'contact' = 'all') {
  return one<boolean>(db, 'select app.directory_allowed($1, $2, $3) as v', [schoolId, uuid(personId, '사람'), what]);
}

// ── 학생 수업 제안 ───────────────────────────────────────
function proposalBody(input: Record<string, unknown>) {
  return {
    title: str(input.title), purpose: str(input.purpose), plan: str(input.plan), status: str(input.status), note: str(input.note),
    mentor_person_id: optUuid(input.mentorPersonId, '멘토'), term_id: optUuid(input.termId, '학기'),
  };
}
export function proposeCourse(db: Db, schoolId: string, input: Record<string, unknown>) {
  return one<string>(db, 'select app.propose_course($1, $2) as v',
    [schoolId, JSON.stringify({ ...proposalBody(input), proposer_person_id: uuid(input.proposerPersonId, '제안한 사람') })]);
}
export function saveCourseProposal(db: Db, schoolId: string, proposalId: unknown, input: Record<string, unknown>) {
  const base = Number(input.base_version ?? input.baseVersion);
  if (!Number.isInteger(base) || base < 1) throw new ValidationError('err.baseVersion');
  return one<number>(db, 'select app.save_course_proposal($1, $2, $3) as v',
    [schoolId, uuid(proposalId, '수업 제안'), JSON.stringify({ ...proposalBody(input), base_version: base })]);
}
export async function courseProposal(db: Db, schoolId: string, proposalId: unknown) {
  const id = uuid(proposalId, '수업 제안');
  const { rows: [p] } = await db.query('select id, proposer_person_id, created_at from public.course_proposals where id = $1 and school_id = $2', [id, schoolId]);
  if (!p) throw new NotFoundError('err.found.proposalNotFound');
  const { rows: versions } = await db.query<ProposalVersion>(
    'select version, title, purpose, plan, mentor_person_id, term_id, status, note from public.course_proposal_versions where proposal_id = $1 order by version desc', [id]);
  return { ...p, latest: versions[0], versions };
}
export async function linkProposalOffering(db: Db, schoolId: string, proposalId: unknown, offeringId: unknown) {
  await db.query('select app.link_proposal_offering($1, $2, $3)', [schoolId, uuid(proposalId, '수업 제안'), uuid(offeringId, '개설')]);
}
export async function setOfferingOrigin(db: Db, schoolId: string, offeringId: unknown, origin: 'project' | 'internship' | 'external') {
  await db.query('select app.set_offering_origin($1, $2, $3)', [schoolId, uuid(offeringId, '개설'), origin]);
}
