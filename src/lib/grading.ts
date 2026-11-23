import type { Db } from './db';
import { isUuid, NotFoundError, ValidationError } from './services';

/**
 * ADR 0004 단계 3: 평가 초안 · 수업 마감 판 · 정정 사슬.
 * 초안 쓰기는 수업 revision(base_version)을 받는다(AGENTS 10). 마감·정정 열기는 학교 관리자만.
 * 마감 판은 스냅샷이라, 발행·통계는 판을 읽는다(초안을 다시 계산하지 않는다).
 */

export type Closure = {
  id: string; offering_id: string; version: number; previous_id: string | null; correction_reason: string | null;
  member_count: number; n: number; mean: string | null; sd: string | null; approved_at: string; sealed: boolean;
};
export type ClosureMember = { person_id: string; name: string; included: boolean; exclusion_reason: string | null; total: string | null; passed: boolean | null };

function id(value: unknown, what: string): string {
  if (typeof value !== 'string' || !isUuid(value)) throw new NotFoundError(`${what}을(를) 찾을 수 없습니다.`);
  return value;
}
function revision(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new ValidationError('화면의 수업 판(revision)이 없습니다. 새로 고친 뒤 다시 해 주세요.');
  return n;
}
function num(value: unknown, what: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ValidationError(`${what}를 숫자로 넣어 주세요.`);
  return n;
}
async function one<T = unknown>(db: Db, sql: string, params: unknown[]): Promise<T> {
  const { rows: [r] } = await db.query(sql, params);
  return r?.v as T;
}

export function addAssessment(db: Db, schoolId: string, offeringId: unknown,
  input: { name?: unknown; maxScore?: unknown; weight?: unknown }, baseRevision: unknown) {
  return one<string>(db, 'select app.add_assessment($1, $2, $3, $4, $5, $6) as v',
    [schoolId, id(offeringId, '개설'), typeof input.name === 'string' ? input.name : '', num(input.maxScore, '만점'), num(input.weight ?? 1, '가중치'), revision(baseRevision)]);
}

/** 점수 기록. 반환: 새 revision */
export function recordResult(db: Db, schoolId: string, assessmentId: unknown, personId: unknown,
  input: { score?: unknown; passed?: unknown }, baseRevision: unknown) {
  return one<number>(db, 'select app.record_result($1, $2, $3, $4, $5, $6) as v',
    [schoolId, id(assessmentId, '평가 항목'), id(personId, '사람'), num(input.score, '점수'),
      typeof input.passed === 'boolean' ? input.passed : null, revision(baseRevision)]);
}

/** 모집단 제외(사유) 또는 해제(reason=null). 반환: 새 revision */
export function setExclusion(db: Db, schoolId: string, offeringId: unknown, personId: unknown, reason: string | null, baseRevision: unknown) {
  return one<number>(db, 'select app.set_population_exclusion($1, $2, $3, $4, $5) as v',
    [schoolId, id(offeringId, '개설'), id(personId, '사람'), reason, revision(baseRevision)]);
}

/** 마감(1판) 또는 정정 마감(새 판). requestKey 는 화면이 만든 고유 키 — 같은 키로 다시 보내면 같은 판을 돌려준다 */
export function closeOffering(db: Db, schoolId: string, offeringId: unknown, requestKey: unknown, baseRevision: unknown, correctionReason?: string | null) {
  if (typeof requestKey !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(requestKey)) throw new ValidationError('요청 키가 올바르지 않습니다.');
  return one<string>(db, 'select app.close_offering($1, $2, $3, $4, $5) as v',
    [schoolId, id(offeringId, '개설'), requestKey, revision(baseRevision), correctionReason ?? null]);
}

export function reopenForCorrection(db: Db, schoolId: string, offeringId: unknown, baseRevision: unknown) {
  return one<number>(db, 'select app.reopen_for_correction($1, $2, $3) as v', [schoolId, id(offeringId, '개설'), revision(baseRevision)]);
}

/** 수업의 마감 판 목록(최신 판부터) */
export async function closures(db: Db, schoolId: string, offeringId: unknown): Promise<Closure[]> {
  const { rows } = await db.query<Closure>(
    `select id, offering_id, version, previous_id, correction_reason, member_count, n, mean::text as mean, sd::text as sd, approved_at, sealed
       from public.offering_closures where school_id = $1 and offering_id = $2 order by version desc`, [schoolId, id(offeringId, '개설')]);
  return rows;
}

/** 판의 모집단·총점(스냅샷) */
export async function closureMembers(db: Db, schoolId: string, closureId: unknown): Promise<ClosureMember[]> {
  const { rows } = await db.query<ClosureMember>(
    `select m.person_id, n.name, m.included, m.exclusion_reason, m.total::text as total, m.passed
       from public.closure_members m
       join public.person_current_names n on n.person_id = m.person_id and n.school_id = m.school_id
      where m.school_id = $1 and m.closure_id = $2 order by n.name, m.person_id`, [schoolId, id(closureId, '마감 판')]);
  return rows;
}
