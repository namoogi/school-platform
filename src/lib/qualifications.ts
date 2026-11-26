import type { Db } from './db';
import { isUuid, NotFoundError, ValidationError } from './services';

/**
 * 64차 ADR 0025 F6-3 — 자격 층·외부 결과, 지정일 보고 스냅샷.
 * 외부 결과는 학교 밖 기관이 낸 값이라 고치지 않고, 정정은 앞 결과를 가리키는 새 결과(사유 필수).
 */
type LText = Record<string, string>;
const uuid = (v: unknown, what: string) => {
  if (typeof v !== 'string' || !isUuid(v)) throw new NotFoundError(`${what}을(를) 찾을 수 없습니다.`);
  return v;
};

export async function addExternalResult(db: Db, schoolId: string, i: { personId: unknown; issuer: string; exam: string; title?: LText; satOn: string;
  result: { grade?: string; score?: number; components?: Record<string, unknown> }; source?: string; correctsId?: string; reason?: string }) {
  if (!i.result || (i.result.grade == null && i.result.score == null)) throw new ValidationError('등급이나 점수가 필요합니다.');
  const { rows: [r] } = await db.query('select app.add_external_result($1, $2) as v', [schoolId, JSON.stringify({
    person_id: uuid(i.personId, '학생'), issuer_code: i.issuer, exam_code: i.exam, title: i.title ?? {}, sat_on: i.satOn, result: i.result,
    source: i.source ?? null, corrects_id: i.correctsId ?? null, reason: i.reason ?? null,
  })]);
  return r.v as string;
}
export async function awardQualification(db: Db, schoolId: string, i: { personId: unknown; kind: string; title: LText; issuer?: string; awardedOn?: string;
  requirements?: { min_credits?: number }; correctsId?: string; reason?: string }) {
  const { rows: [r] } = await db.query('select app.award_qualification($1, $2) as v', [schoolId, JSON.stringify({
    person_id: uuid(i.personId, '학생'), kind_code: i.kind, title: i.title, issuer_code: i.issuer ?? 'school', awarded_on: i.awardedOn ?? null,
    requirements: i.requirements ?? {}, corrects_id: i.correctsId ?? null, reason: i.reason ?? null,
  })]);
  return r.v as string;
}

export type CountReport = { id: string; code: string; as_of: string; version: number; previous_id: string | null; reason: string | null; snapshot: Record<string, unknown>; closed_at: string };
export async function closeCountReport(db: Db, schoolId: string, i: { code: string; asOf: string; base_version: number; reason?: string; requestKey: string }) {
  const { rows: [r] } = await db.query('select app.close_count_report($1, $2) as v', [schoolId, JSON.stringify({
    code: i.code, as_of: i.asOf, base_version: i.base_version, reason: i.reason ?? null, request_key: i.requestKey,
  })]);
  return r.v as { id: string; version: number; repeated: boolean };
}
export async function countReports(db: Db, schoolId: string, code?: string): Promise<CountReport[]> {
  return (await db.query<CountReport>(
    `select id, code, to_char(as_of, 'YYYY-MM-DD') as as_of, version, previous_id, reason, snapshot, closed_at
       from public.count_reports where school_id = $1 and ($2::text is null or code = $2) order by code, version desc`, [schoolId, code ?? null])).rows;
}
