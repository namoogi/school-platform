import type { Db } from './db';
import { isUuid, NotFoundError, ValidationError } from './services';
import type { SchoolReport } from './usage';

/**
 * 58차 ADR 0027 — 관제 기본판 · 학교 복제 · 보고 계약.
 * 관제(전체 관리자)는 기본판을 판으로 내고, 학교는 생성 때 복제한 사본을 가진다. 갱신은 '제안'으로 가고 학교가 수락한다.
 * 관제가 학교에서 모으는 것은 보고 계약(app.school_report_v1)뿐이다.
 */
export type BaselineManifest = {
  code_lists?: { list_key: string; code: string; label: Record<string, string>; sort_order?: number; attrs?: Record<string, unknown>; maps_to?: Record<string, unknown>; why?: string }[];
  scales?: { code: string; kind: string; bands: unknown[]; why?: string }[];
  grading_policy?: { policy: Record<string, unknown>; why?: string };
};
export type BaselineOffer = { id: string; from_version: number; to_version: number; status: string; items: { add: unknown[]; conflicts: unknown[] }; note: string | null; created_at: string };

export async function latestBaseline(db: Db) {
  const { rows: [b] } = await db.query<{ version: number; title: string; manifest: BaselineManifest; why: string | null }>(
    'select version, title, manifest, why from public.baselines order by version desc limit 1');
  return b ?? null;
}
export async function publishBaseline(db: Db, input: { title?: unknown; manifest?: unknown; why?: unknown; base_version?: unknown }) {
  const base = Number(input.base_version);
  if (!Number.isInteger(base) || base < 0) throw new ValidationError('base_version(보고 고친 기본판)이 필요합니다.');
  if (!input.manifest || typeof input.manifest !== 'object') throw new ValidationError('기본판 내용이 필요합니다.');
  const { rows: [r] } = await db.query('select app.publish_baseline($1) as v',
    [JSON.stringify({ title: typeof input.title === 'string' ? input.title : '', manifest: input.manifest, why: typeof input.why === 'string' ? input.why : '', base_version: base })]);
  return r.v as number;
}
export async function schoolBaseline(db: Db, schoolId: string) {
  const { rows: [b] } = await db.query<{ version: number; instantiated_at: string; updated_at: string }>(
    'select version, instantiated_at, updated_at from public.school_baselines where school_id = $1', [schoolId]);
  return b ?? null;
}
export async function baselineOffers(db: Db, schoolId: string): Promise<BaselineOffer[]> {
  return (await db.query<BaselineOffer>(
    'select id, from_version, to_version, status, items, note, created_at from public.baseline_offers where school_id = $1 order by to_version desc', [schoolId])).rows;
}
export async function decideBaselineOffer(db: Db, schoolId: string, offerId: unknown, decision: 'accepted' | 'declined' | 'held', note?: string) {
  if (typeof offerId !== 'string' || !isUuid(offerId)) throw new NotFoundError('기본판 제안을 찾을 수 없습니다.');
  const { rows: [r] } = await db.query('select app.decide_baseline_offer($1, $2, $3, $4) as v', [schoolId, offerId, decision, note ?? null]);
  return r.v as { status: string; applied: number };
}
export async function schoolReport(db: Db, schoolId: string): Promise<SchoolReport> {
  const { rows: [r] } = await db.query('select app.school_report_v1($1) as v', [schoolId]);
  return r.v;
}
export async function collectSchoolReports(db: Db) {
  const { rows: [r] } = await db.query('select app.collect_school_reports() as v');
  return r.v as number;
}
