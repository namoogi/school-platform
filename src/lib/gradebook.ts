import type { Db } from './db';
import { isUuid } from './services';

/** 73차: 성적 화면이 읽는 것(척도 최신 판·성적 정책 판·평가 항목·현재 서술·수업의 학년도). 모두 asUser + RLS */
export type ScaleRow = { id: string; code: string; kind: string; version: number; bands: { code: string; label: Record<string, string>; min: number | null; points?: number | null; earns_credit?: boolean }[]; why: string | null };
export async function listScales(db: Db, schoolId: string): Promise<ScaleRow[]> {
  return (await db.query<ScaleRow>(
    `select s.id, s.code, s.kind, v.version, v.bands, v.why from public.scales s
       join lateral (select * from public.scale_versions x where x.scale_id = s.id order by x.version desc limit 1) v on true
      where s.school_id = $1 order by s.code`, [schoolId])).rows;
}
export async function latestPolicy(db: Db, schoolId: string) {
  const { rows: [r] } = await db.query<{ version: number; policy: Record<string, unknown>; why: string | null }>(
    `select version, policy, why from public.grading_policies where school_id = $1 order by version desc limit 1`, [schoolId]);
  return r ?? null;
}
export type AssessmentRow = { id: string; code: string; title: Record<string, string>; kind: string; axis: string; weight: number; max_score: number | null; scale_id: string | null };
export async function assessmentsOf(db: Db, schoolId: string, offeringId: string): Promise<AssessmentRow[]> {
  if (!isUuid(offeringId)) return [];
  return (await db.query<AssessmentRow>(
    `select id, code, title, kind, axis, weight::float, max_score::float, scale_id from public.assessments
      where school_id = $1 and offering_id = $2 and archived_at is null order by created_at, code`, [schoolId, offeringId])).rows;
}
/** 이 수업의 사람별·종류별 최신 서술(정정 사건이면 그 사건이 최신) */
export async function narrativesOf(db: Db, schoolId: string, offeringId: string) {
  if (!isUuid(offeringId)) return [];
  return (await db.query<{ id: string; person_id: string; kind: string; body: string; recorded_at: string }>(
    `select distinct on (person_id, kind) id, person_id, kind, body, recorded_at from public.narratives
      where school_id = $1 and offering_id = $2 order by person_id, kind, recorded_at desc, id`, [schoolId, offeringId])).rows;
}
/** 수업의 학년도·학기(서술 사건에 필요) */
export async function offeringContext(db: Db, schoolId: string, offeringId: string) {
  if (!isUuid(offeringId)) return null;
  const { rows: [r] } = await db.query<{ academic_year_id: string; term_id: string; term_label: string; year_label: string; closed: boolean;
    subject_name: string; section: string; status: string; credits: number; pass_fail: boolean; can_grade: boolean }>(
    `select t.academic_year_id, t.id as term_id, t.label as term_label, y.label as year_label, app.offering_closed(o.id) as closed,
            s.name as subject_name, o.section, o.status, o.credits::float, o.pass_fail,
            (app.is_school_admin(o.school_id) or app.is_offering_staff(o.id, o.school_id)) as can_grade
       from public.course_offerings o join public.terms t on t.id = o.term_id join public.academic_years y on y.id = t.academic_year_id
       join public.subjects s on s.id = o.subject_id
      where o.school_id = $1 and o.id = $2`, [schoolId, offeringId]);
  return r ?? null;
}
