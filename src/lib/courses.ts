import type { Db } from './db';
import { isUuid, NotFoundError, ValidationError } from './services';

/**
 * ADR 0004 단계 2: 과목·갈래 규칙 판·개설·담당·수강.
 * 쓰기는 모두 DB 명령 함수(app.*, 소유자 app_writer)를 부른다. 권한(관리자·담당)·생성 계기·편집 충돌은 DB가 판정한다.
 * schoolId 는 호출하는 쪽이 로그인 소속에서 정한 값만 넘긴다.
 */

export type CreationTrigger = 'term_start' | 'application_close' | 'approval';
export type Offering = {
  id: string; term_id: string; subject_id: string; subject_name: string; course_type_id: string; course_type_name: string;
  rule_id: string; rule_version: number; creation_trigger: CreationTrigger; school_level_id: string; section: string;
  credits: string; pass_fail: boolean; capacity: number | null; status: 'planned' | 'open' | 'active' | 'closed' | 'cancelled';
  revision: number; enrolled: number;
};
export type EnrollmentEntry = { person_id: string; name: string; status: string; source: string; pass_fail_choice: boolean | null };

function id(value: unknown, what: string): string {
  if (typeof value !== 'string' || !isUuid(value)) throw new NotFoundError(`${what}을(를) 찾을 수 없습니다.`);
  return value;
}
function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function revision(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new ValidationError('화면의 수업 판(revision)이 없습니다. 새로 고친 뒤 다시 해 주세요.');
  return n;
}
async function one<T = unknown>(db: Db, sql: string, params: unknown[]): Promise<T> {
  const { rows: [r] } = await db.query(sql, params);
  return r?.v as T;
}

export function addSubject(db: Db, schoolId: string, input: { code?: unknown; name?: unknown; levelId?: unknown }) {
  return one<string>(db, 'select app.add_subject($1, $2, $3, $4) as v',
    [schoolId, text(input.code), text(input.name), input.levelId == null ? null : id(input.levelId, '학교급')]);
}

export function addCourseType(db: Db, schoolId: string, input: { code?: unknown; name?: unknown }) {
  return one<string>(db, 'select app.add_course_type($1, $2, $3) as v', [schoolId, text(input.code), text(input.name)]);
}

/** 갈래 규칙의 새 판. 반환: 판 번호 */
export function setCourseTypeRule(db: Db, schoolId: string, typeId: unknown,
  input: { trigger?: unknown; publishable?: unknown; passFailAllowed?: unknown; note?: unknown }) {
  return one<number>(db, 'select app.set_course_type_rule($1, $2, $3, $4, $5, $6) as v',
    [schoolId, id(typeId, '갈래'), text(input.trigger), input.publishable === true, input.passFailAllowed === true,
      typeof input.note === 'string' && input.note.trim() ? input.note : null]);
}

export function createOffering(db: Db, schoolId: string, input: {
  termId?: unknown; subjectId?: unknown; typeId?: unknown; levelId?: unknown; credits?: unknown; passFail?: unknown;
  section?: unknown; capacity?: unknown;
}) {
  const credits = Number(input.credits);
  if (!Number.isFinite(credits)) throw new ValidationError('학점을 숫자로 넣어 주세요.');
  const capacity = input.capacity == null || input.capacity === '' ? null : Number(input.capacity);
  if (capacity !== null && !Number.isInteger(capacity)) throw new ValidationError('정원은 정수입니다.');
  return one<string>(db, 'select app.create_offering($1, $2, $3, $4, $5, $6, $7, $8, $9) as v',
    [schoolId, id(input.termId, '학기'), id(input.subjectId, '과목'), id(input.typeId, '갈래'), id(input.levelId, '학교급'),
      credits, input.passFail === true, text(input.section), capacity]);
}

export async function assignStaff(db: Db, schoolId: string, offeringId: unknown, personId: unknown, role: unknown) {
  await db.query('select app.assign_offering_staff($1, $2, $3, $4)', [schoolId, id(offeringId, '개설'), id(personId, '사람'), text(role)]);
}

export async function removeStaff(db: Db, schoolId: string, offeringId: unknown, personId: unknown) {
  await db.query('select app.remove_offering_staff($1, $2, $3)', [schoolId, id(offeringId, '개설'), id(personId, '사람')]);
}

/** 신청. 반환: 새 revision */
export function apply(db: Db, schoolId: string, offeringId: unknown, personId: unknown, expectedRevision: unknown) {
  return one<number>(db, 'select app.apply_offering($1, $2, $3, $4) as v',
    [schoolId, id(offeringId, '개설'), id(personId, '사람'), revision(expectedRevision)]);
}

/** 신청 마감. 반환: 확정 인원 */
export function closeApplications(db: Db, schoolId: string, offeringId: unknown, expectedRevision: unknown) {
  return one<number>(db, 'select app.close_applications($1, $2, $3) as v', [schoolId, id(offeringId, '개설'), revision(expectedRevision)]);
}

export async function approve(db: Db, schoolId: string, offeringId: unknown, expectedRevision: unknown) {
  await db.query('select app.approve_offering($1, $2, $3)', [schoolId, id(offeringId, '개설'), revision(expectedRevision)]);
}

/** 학기 시작: 학기 시작 계기(필수) 개설 활성화 + 자동 수강. 반환: 활성화한 개설 수 */
export function startTerm(db: Db, schoolId: string, termId: unknown) {
  return one<number>(db, 'select app.start_term($1, $2) as v', [schoolId, id(termId, '학기')]);
}

/** 담당·보조·관리자가 수강 상태를 바꾼다. 반환: 새 revision */
export function setEnrollment(db: Db, schoolId: string, offeringId: unknown, personId: unknown,
  status: unknown, expectedRevision: unknown, passFailChoice?: boolean | null) {
  return one<number>(db, 'select app.set_offering_enrollment($1, $2, $3, $4, $5, $6) as v',
    [schoolId, id(offeringId, '개설'), id(personId, '사람'), text(status), revision(expectedRevision), passFailChoice ?? null]);
}

/** 학기의 개설 목록. 학교급은 필수 인자(ADR 0004 P4) */
export async function offeringsOfTerm(db: Db, schoolId: string, termId: unknown, levelId: unknown): Promise<Offering[]> {
  const { rows } = await db.query<Offering>(
    `select c.id, c.term_id, c.subject_id, s.name as subject_name, c.course_type_id, t.name as course_type_name,
            c.rule_id, r.version as rule_version, r.creation_trigger, c.school_level_id, c.section, c.credits::text as credits,
            c.pass_fail, c.capacity, c.status, c.revision,
            (select count(*)::int from public.offering_enrollments e where e.offering_id = c.id and e.school_id = c.school_id and e.status = 'enrolled') as enrolled
       from public.course_offerings c
       join public.subjects s on s.id = c.subject_id and s.school_id = c.school_id
       join public.course_types t on t.id = c.course_type_id and t.school_id = c.school_id
       join public.course_type_rules r on r.id = c.rule_id and r.school_id = c.school_id
      where c.school_id = $1 and c.term_id = $2 and c.school_level_id = $3
      order by s.name, c.section, c.id`, [schoolId, id(termId, '학기'), id(levelId, '학교급')]);
  return rows;
}

export async function offering(db: Db, schoolId: string, offeringId: unknown) {
  const { rows } = await db.query<{ id: string; status: string; revision: number }>(
    'select id, status, revision from public.course_offerings where school_id = $1 and id = $2', [schoolId, id(offeringId, '개설')]);
  if (!rows[0]) throw new NotFoundError('개설을 찾을 수 없습니다.');
  return rows[0];
}

export async function roster(db: Db, schoolId: string, offeringId: unknown): Promise<EnrollmentEntry[]> {
  const { rows } = await db.query<EnrollmentEntry>(
    `select e.person_id, n.name, e.status, e.source, e.pass_fail_choice
       from public.offering_enrollments e
       join public.person_current_names n on n.person_id = e.person_id and n.school_id = e.school_id
      where e.school_id = $1 and e.offering_id = $2 order by n.name, e.person_id`, [schoolId, id(offeringId, '개설')]);
  return rows;
}
