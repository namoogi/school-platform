import type { Db } from './db';
import { isUuid } from './services';

/** 75차: 기록 화면이 읽는 것(학생별 발행본·공개 기록·외부 결과·자격, 학교 소개서). 모두 asUser + RLS. 발행본 내용은 저장한 스냅샷 그대로 */
export type DocRow = { id: string; format: string; lang: string; blind: boolean; title: string | null; issues: { level: string; where: string; message: string }[]; content_sha256: string; published_at: string; disclosures: number };
export async function documentsOf(db: Db, schoolId: string, personId: string | null): Promise<DocRow[]> {
  if (personId !== null && !isUuid(personId)) return [];
  return (await db.query<DocRow>(
    `select d.id, d.format, d.lang, d.blind, d.content ->> 'title' as title, d.issues, d.content_sha256, d.published_at::text,
            (select count(*)::int from public.disclosures x where x.document_id = d.id) as disclosures
       from public.record_documents d
      where d.school_id = $1 and (case when $2::uuid is null then d.person_id is null else d.person_id = $2::uuid end)
      order by d.published_at desc limit 50`, [schoolId, personId])).rows;
}
export async function disclosuresOf(db: Db, schoolId: string, documentId: string) {
  if (!isUuid(documentId)) return [];
  return (await db.query<{ id: string; recipient: string; purpose: string; basis: string | null; disclosed_at: string }>(
    `select id, recipient, purpose, basis, disclosed_at::text from public.disclosures where school_id = $1 and document_id = $2 order by disclosed_at desc`, [schoolId, documentId])).rows;
}
export async function externalResultsOf(db: Db, schoolId: string, personId: string) {
  if (!isUuid(personId)) return [];
  return (await db.query<{ id: string; issuer_code: string; exam_code: string; title: Record<string, string>; sat_on: string; result: { grade?: string; score?: number }; corrected: boolean }>(
    `select r.id, r.issuer_code, r.exam_code, r.title, r.sat_on::text, r.result,
            exists (select 1 from public.external_results c where c.corrects_id = r.id) as corrected
       from public.external_results r where r.school_id = $1 and r.person_id = $2 order by r.sat_on desc, r.recorded_at desc`, [schoolId, personId])).rows;
}
export async function qualificationsOf(db: Db, schoolId: string, personId: string) {
  if (!isUuid(personId)) return [];
  return (await db.query<{ id: string; kind_code: string; title: Record<string, string>; awarded_on: string; evidence: Record<string, unknown>; corrected: boolean }>(
    `select q.id, q.kind_code, q.title, q.awarded_on::text, q.evidence,
            exists (select 1 from public.qualifications c where c.corrects_id = q.id) as corrected
       from public.qualifications q where q.school_id = $1 and q.person_id = $2 order by q.awarded_on desc`, [schoolId, personId])).rows;
}
