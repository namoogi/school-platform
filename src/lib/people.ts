import type { Db } from './db';
import { isUuid, NotFoundError, ValidationError } from './services';

/**
 * ADR 0004 단계 1: 사람·계정 연결·학사 차원.
 * 쓰기는 모두 DB 명령 함수(app.*, 소유자 app_writer)를 부른다. 요청 역할은 표에 직접 쓸 수 없다.
 * schoolId 는 호출하는 쪽이 로그인 소속에서 정한 값만 넘긴다(클라이언트 값 금지).
 */

export type SchoolLevel = { id: string; code: string; name: string; sort_order: number };
export type AcademicYear = { id: string; label: string; starts_on: string; ends_on: string };
export type Term = {
  id: string; academic_year_id: string; rule_id: string; rule_version: number; period_key: string; label: string;
  sequence: number; starts_on: string | null; ends_on: string | null;
};
export type PersonRow = { id: string; name: string; name_latin: string | null; name_version: number; accounts: number };
export type NameEntry = { version: number; name: string; name_latin: string | null; reason: string | null; recorded_at: string };
export type EnrollmentRow = {
  id: string; person_id: string; name: string; cohort_id: string | null; status: string; starts_on: string; ends_on: string | null;
};

function id(value: unknown, what: string): string {
  if (typeof value !== 'string' || !isUuid(value)) throw new NotFoundError('err.whatNotFound', { what });
  return value;
}
function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function optText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}
function date(value: unknown, what: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ValidationError('err.whatDate', { what });
  return value;
}
function grade(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 12) throw new ValidationError('err.people.grade');
  return n;
}
async function call<T = unknown>(db: Db, sql: string, params: unknown[]): Promise<T> {
  const { rows: [r] } = await db.query(sql, params);
  return r?.v as T;
}

// ── 학사 차원 ────────────────────────────────────────────
export function addSchoolLevel(db: Db, schoolId: string, input: { code?: unknown; name?: unknown; sortOrder?: unknown }) {
  return call<string>(db, 'select app.add_school_level($1, $2, $3, $4) as v',
    [schoolId, text(input.code), text(input.name), Number.isInteger(input.sortOrder) ? input.sortOrder : 0]);
}

export function addAcademicYear(db: Db, schoolId: string, input: { label?: unknown; startsOn?: unknown; endsOn?: unknown }) {
  return call<string>(db, 'select app.add_academic_year($1, $2, $3, $4) as v',
    [schoolId, text(input.label), date(input.startsOn, '시작 날짜'), date(input.endsOn, '끝 날짜')]);
}

/** 확정 규칙 판에서 학년도의 학기를 만든다. 같은 판이면 0, 다른 판으로 이미 만들었으면 거부(409). */
export function createTermsFromRule(db: Db, schoolId: string, yearId: unknown, ruleId: unknown) {
  return call<number>(db, 'select app.create_terms_from_rule($1, $2, $3) as v',
    [schoolId, id(yearId, '학년도'), id(ruleId, '확정 규칙')]);
}

export async function setTermDates(db: Db, schoolId: string, termId: unknown, startsOn: unknown, endsOn: unknown) {
  await db.query('select app.set_term_dates($1, $2, $3, $4)',
    [schoolId, id(termId, '학기'), date(startsOn, '시작 날짜'), date(endsOn, '끝 날짜')]);
}

export function addCohort(db: Db, schoolId: string, input: { levelId?: unknown; entryYearId?: unknown; label?: unknown }) {
  return call<string>(db, 'select app.add_cohort($1, $2, $3, $4) as v',
    [schoolId, id(input.levelId, '학교급'), id(input.entryYearId, '학년도'), text(input.label)]);
}

export function addHomeroom(db: Db, schoolId: string, input: { yearId?: unknown; levelId?: unknown; grade?: unknown; name?: unknown }) {
  return call<string>(db, 'select app.add_homeroom($1, $2, $3, $4, $5) as v',
    [schoolId, id(input.yearId, '학년도'), id(input.levelId, '학교급'), grade(input.grade), text(input.name)]);
}

export async function listSchoolLevels(db: Db, schoolId: string): Promise<SchoolLevel[]> {
  const { rows } = await db.query<SchoolLevel>(
    'select id, code, name, sort_order from public.school_levels where school_id = $1 order by sort_order, code', [schoolId]);
  return rows;
}

export async function listAcademicYears(db: Db, schoolId: string): Promise<AcademicYear[]> {
  const { rows } = await db.query<AcademicYear>(
    `select id, label, to_char(starts_on, 'YYYY-MM-DD') as starts_on, to_char(ends_on, 'YYYY-MM-DD') as ends_on
     from public.academic_years where school_id = $1 order by starts_on`, [schoolId]);
  return rows;
}

export async function listTerms(db: Db, schoolId: string, yearId: unknown): Promise<Term[]> {
  const { rows } = await db.query<Term>(
    `select t.id, t.academic_year_id, t.rule_id, r.version as rule_version, t.period_key, t.label, t.sequence,
            to_char(t.starts_on, 'YYYY-MM-DD') as starts_on, to_char(t.ends_on, 'YYYY-MM-DD') as ends_on
     from public.terms t join public.school_rules r on r.id = t.rule_id and r.school_id = t.school_id
     where t.school_id = $1 and t.academic_year_id = $2 order by t.sequence`, [schoolId, id(yearId, '학년도')]);
  return rows;
}

// ── 사람 ─────────────────────────────────────────────────
export function addPerson(db: Db, schoolId: string, input: { name?: unknown; nameLatin?: unknown }) {
  return call<string>(db, 'select app.add_person($1, $2, $3) as v', [schoolId, text(input.name), optText(input.nameLatin)]);
}

export function renamePerson(db: Db, schoolId: string, personId: unknown, input: { name?: unknown; nameLatin?: unknown; reason?: unknown }) {
  return call<number>(db, 'select app.rename_person($1, $2, $3, $4, $5) as v',
    [schoolId, id(personId, '사람'), text(input.name), optText(input.nameLatin), text(input.reason)]);
}

/** 사람 목록(현재 이름). 이름은 표시용이며 같은 이름이 여럿일 수 있다 — 항상 id로 구분한다. */
export async function listPeople(db: Db, schoolId: string): Promise<PersonRow[]> {
  const { rows } = await db.query<PersonRow>(
    `select p.id, n.name, n.name_latin, n.version as name_version,
            (select count(*)::int from public.person_accounts a where a.school_id = p.school_id and a.person_id = p.id) as accounts
     from public.people p join public.person_current_names n on n.person_id = p.id and n.school_id = p.school_id
     where p.school_id = $1 order by n.name, p.created_at, p.id`, [schoolId]);
  return rows;
}

export async function nameHistory(db: Db, schoolId: string, personId: unknown): Promise<NameEntry[]> {
  const { rows } = await db.query<NameEntry>(
    `select version, name, name_latin, reason, recorded_at from public.person_names
     where school_id = $1 and person_id = $2 order by version`, [schoolId, id(personId, '사람')]);
  return rows;
}

// ── 계정 연결 ────────────────────────────────────────────
export async function linkAccount(db: Db, schoolId: string, personId: unknown, userId: unknown) {
  await db.query('select app.link_account($1, $2, $3)', [schoolId, id(personId, '사람'), id(userId, '계정')]);
}

export async function unlinkAccount(db: Db, schoolId: string, userId: unknown, reason: unknown) {
  await db.query('select app.unlink_account($1, $2, $3)', [schoolId, id(userId, '계정'), text(reason)]);
}

/** 로그인 계정이 이 학교에서 연결된 사람 (없으면 null) */
export async function personOfAccount(db: Db, schoolId: string, userId: string): Promise<string | null> {
  const { rows } = await db.query('select person_id from public.person_accounts where school_id = $1 and user_id = $2', [schoolId, userId]);
  return rows[0]?.person_id ?? null;
}

// ── 학적·반 배정 ─────────────────────────────────────────
export function enroll(db: Db, schoolId: string, input: { personId?: unknown; levelId?: unknown; cohortId?: unknown; startsOn?: unknown; note?: unknown }) {
  return call<string>(db, 'select app.enroll_person($1, $2, $3, $4, $5, $6) as v',
    [schoolId, id(input.personId, '사람'), id(input.levelId, '학교급'),
      input.cohortId == null ? null : id(input.cohortId, '기수'), date(input.startsOn, '시작 날짜'), optText(input.note)]);
}

export async function endEnrollment(db: Db, schoolId: string, enrollmentId: unknown, input: { endsOn?: unknown; status?: unknown; note?: unknown }) {
  await db.query('select app.end_enrollment($1, $2, $3, $4, $5)',
    [schoolId, id(enrollmentId, '학적'), date(input.endsOn, '끝 날짜'), text(input.status), optText(input.note)]);
}

export function assignHomeroom(db: Db, schoolId: string, input: { personId?: unknown; homeroomId?: unknown; startsOn?: unknown }) {
  return call<string>(db, 'select app.assign_homeroom($1, $2, $3, $4) as v',
    [schoolId, id(input.personId, '사람'), id(input.homeroomId, '반'), date(input.startsOn, '시작 날짜')]);
}

export async function endHomeroomAssignment(db: Db, schoolId: string, assignmentId: unknown, endsOn: unknown) {
  await db.query('select app.end_homeroom_assignment($1, $2, $3)', [schoolId, id(assignmentId, '반 배정'), date(endsOn, '끝 날짜')]);
}

/**
 * 특정 날짜의 학적 명단. 학교급은 필수 인자다(ADR 0004 P4: 중·고 범위를 섞지 않는다).
 */
export async function enrollmentsOn(db: Db, schoolId: string, levelId: unknown, on: unknown): Promise<EnrollmentRow[]> {
  const { rows } = await db.query<EnrollmentRow>(
    `select e.id, e.person_id, n.name, e.cohort_id, e.status,
            to_char(e.starts_on, 'YYYY-MM-DD') as starts_on, to_char(e.ends_on, 'YYYY-MM-DD') as ends_on
     from public.enrollments_school e
     join public.person_current_names n on n.person_id = e.person_id and n.school_id = e.school_id
     where e.school_id = $1 and e.school_level_id = $2 and daterange(e.starts_on, e.ends_on, '[)') @> $3::date
     order by n.name, e.person_id`, [schoolId, id(levelId, '학교급'), date(on, '날짜')]);
  return rows;
}
