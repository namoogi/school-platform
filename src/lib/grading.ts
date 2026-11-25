import type { Db } from './db';
import { isUuid, NotFoundError, ValidationError } from './services';

/**
 * 57차 ADR 0025 F2 — 평가·마감(한국 + 미국 기준).
 * 결과·서술은 사건으로 추가만(정정은 앞 사건을 가리키는 새 사건), 마감 판이 그때 값과 적용 판(정책·척도)을 얼린다.
 * 쓰기는 모두 DB 명령 함수(app.*, 소유자 app_writer). schoolId 는 로그인 소속에서 정한 값만.
 */

export type LText = Record<string, string>;
export type Band = { code: string; label: LText; min: number | null; points?: number | null; earns_credit?: boolean };

/** 척도 미리 만들어 둔 것(학교가 그대로 쓰거나 고쳐 새 판으로) */
export const SCALE_PRESETS: Record<string, { kind: 'letter' | 'level' | 'pass_fail'; bands: Band[]; why: string }> = {
  kr_achievement: {
    kind: 'letter', why: '성취평가제 A–E(성취율 90/80/70/60/40), 40% 미만 미이수 — 학교생활기록부 기재요령',
    bands: [
      { code: 'A', label: { ko: 'A', en: 'A' }, min: 90 }, { code: 'B', label: { ko: 'B', en: 'B' }, min: 80 },
      { code: 'C', label: { ko: 'C', en: 'C' }, min: 70 }, { code: 'D', label: { ko: 'D', en: 'D' }, min: 60 },
      { code: 'E', label: { ko: 'E', en: 'E' }, min: 40 }, { code: 'I', label: { ko: '미이수', en: 'Incomplete' }, min: 0, earns_credit: false },
    ],
  },
  us_letter: {
    kind: 'letter', why: '미국 일반 글자 성적 A–F와 4.0 GPA 점수(분할점은 학교마다 다름)',
    bands: [
      { code: 'A', label: { en: 'A', ko: 'A' }, min: 90, points: 4 }, { code: 'B', label: { en: 'B', ko: 'B' }, min: 80, points: 3 },
      { code: 'C', label: { en: 'C', ko: 'C' }, min: 70, points: 2 }, { code: 'D', label: { en: 'D', ko: 'D' }, min: 60, points: 1 },
      { code: 'F', label: { en: 'F', ko: 'F' }, min: 0, points: 0, earns_credit: false },
    ],
  },
  pass_fail: {
    kind: 'pass_fail', why: 'P/F — 통과 기준은 학교가 정함(기본 60)',
    bands: [{ code: 'P', label: { en: 'Pass', ko: '통과' }, min: 60 }, { code: 'F', label: { en: 'Fail', ko: '미통과' }, min: 0, earns_credit: false }],
  },
};

const uuid = (v: unknown, what: string) => {
  if (typeof v !== 'string' || !isUuid(v)) throw new NotFoundError(`${what}을(를) 찾을 수 없습니다.`);
  return v;
};
const optUuid = (v: unknown, what: string) => (v == null || v === '' ? null : uuid(v, what));
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const ltext = (v: unknown, what: string): LText => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ValidationError(`${what} 표기가 필요합니다.`);
  const out: LText = {};
  for (const [k, s] of Object.entries(v)) if (/^[a-z]{2}$/.test(k) && typeof s === 'string' && s.trim()) out[k] = s.trim().slice(0, 200);
  if (!Object.keys(out).length) throw new ValidationError(`${what} 표기가 필요합니다.`);
  return out;
};
const base = (v: unknown) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new ValidationError('base_version(보고 고친 판)이 필요합니다.');
  return n;
};
async function one<T>(db: Db, sql: string, params: unknown[]): Promise<T> {
  const { rows: [r] } = await db.query(sql, params);
  return r?.v as T;
}

// ── 과목 표기 판 ─────────────────────────────────────────
export function setSubjectLabel(db: Db, schoolId: string, subjectId: unknown, input: { purpose?: unknown; label?: unknown; why?: unknown; base_version?: unknown }) {
  return one<number>(db, 'select app.set_subject_label($1, $2, $3) as v', [schoolId, uuid(subjectId, '과목'), JSON.stringify({
    purpose: str(input.purpose) || 'all', label: ltext(input.label, '과목'), why: str(input.why), base_version: base(input.base_version),
  })]);
}
/** 용도별 최신 표기(용도 표기가 없으면 'all') */
export async function subjectLabel(db: Db, schoolId: string, subjectId: unknown, purpose: 'record' | 'transcript' | 'report_card' | 'all' = 'all') {
  const { rows: [r] } = await db.query(
    `select purpose, version, label from public.subject_labels where school_id = $1 and subject_id = $2 and purpose in ($3, 'all')
      order by (purpose = $3) desc, version desc limit 1`, [schoolId, uuid(subjectId, '과목'), purpose]);
  return r ?? null;
}

// ── 척도·정책 ────────────────────────────────────────────
export function saveScale(db: Db, schoolId: string, input: { code?: unknown; kind?: unknown; bands?: unknown; why?: unknown; base_version?: unknown }) {
  if (!Array.isArray(input.bands) || !input.bands.length) throw new ValidationError('척도 띠가 필요합니다.');
  const bands = (input.bands as Band[]).map((b) => ({
    code: str(b?.code), label: ltext(b?.label, '척도 띠'), min: b?.min == null ? null : Number(b.min),
    points: b?.points == null ? null : Number(b.points), earns_credit: b?.earns_credit !== false,
  }));
  return one<{ id: string; version: number }>(db, 'select app.save_scale($1, $2) as v',
    [schoolId, JSON.stringify({ code: str(input.code), kind: str(input.kind), bands, why: str(input.why), base_version: base(input.base_version ?? 0) })]);
}
export function saveScalePreset(db: Db, schoolId: string, preset: keyof typeof SCALE_PRESETS, code = preset as string) {
  const p = SCALE_PRESETS[preset];
  return saveScale(db, schoolId, { code, kind: p.kind, bands: p.bands, why: p.why, base_version: 0 });
}
export type GradingPolicy = {
  score_digits?: number; final_digits?: number;
  stats?: { sd?: 'population' | 'sample'; digits?: number };
  narrative_limits?: Record<string, number>;
  gpa?: { enabled?: boolean; level_bonus?: Record<string, number> };
  rank?: { enabled?: boolean };
};
export function saveGradingPolicy(db: Db, schoolId: string, policy: GradingPolicy, input: { why?: unknown; base_version?: unknown }) {
  return one<number>(db, 'select app.save_grading_policy($1, $2) as v',
    [schoolId, JSON.stringify({ policy, why: str(input.why), base_version: base(input.base_version) })]);
}

// ── 역량 틀 ──────────────────────────────────────────────
export function addCompetencyFramework(db: Db, schoolId: string, input: { code?: unknown; title?: unknown; source?: unknown }) {
  return one<string>(db, 'select app.add_competency_framework($1, $2) as v',
    [schoolId, JSON.stringify({ code: str(input.code), title: ltext(input.title, '역량 틀'), source: str(input.source) })]);
}
export function addCompetencyItem(db: Db, schoolId: string, frameworkId: unknown, input: { code?: unknown; statement?: unknown; parentId?: unknown; sortOrder?: unknown }) {
  return one<string>(db, 'select app.add_competency_item($1, $2, $3) as v', [schoolId, uuid(frameworkId, '역량 틀'), JSON.stringify({
    code: str(input.code), statement: ltext(input.statement, '역량'), parent_id: optUuid(input.parentId, '상위 역량'), sort_order: Number(input.sortOrder) || 0,
  })]);
}

// ── 평가 항목·결과·서술 ──────────────────────────────────
export function addAssessment(db: Db, schoolId: string, offeringId: unknown, input: Record<string, unknown>) {
  return one<string>(db, 'select app.add_assessment($1, $2, $3) as v', [schoolId, uuid(offeringId, '개설'), JSON.stringify({
    code: str(input.code), title: ltext(input.title, '평가 항목'), kind: str(input.kind), axis: str(input.axis),
    weight: input.weight == null ? 0 : Number(input.weight), max_score: input.maxScore == null ? null : Number(input.maxScore),
    grading_period_id: optUuid(input.gradingPeriodId, '성적 기간'), competency_item_id: optUuid(input.competencyItemId, '역량'),
    scale_id: optUuid(input.scaleId, '척도'),
  })]);
}
export async function archiveAssessment(db: Db, schoolId: string, assessmentId: unknown) {
  await db.query('select app.archive_assessment($1, $2)', [schoolId, uuid(assessmentId, '평가 항목')]);
}
export function recordResult(db: Db, schoolId: string, assessmentId: unknown, personId: unknown, input: { score?: unknown; level?: unknown; comment?: unknown; reason?: unknown }) {
  const score = input.score == null || input.score === '' ? null : Number(input.score);
  if (score !== null && !Number.isFinite(score)) throw new ValidationError('점수는 숫자입니다.');
  return one<string>(db, 'select app.record_result($1, $2, $3, $4) as v', [schoolId, uuid(assessmentId, '평가 항목'), uuid(personId, '사람'),
    JSON.stringify({ score, level_code: str(input.level), comment: str(input.comment), reason: str(input.reason) })]);
}
export function recordNarrative(db: Db, schoolId: string, input: Record<string, unknown>) {
  return one<string>(db, 'select app.record_narrative($1, $2) as v', [schoolId, JSON.stringify({
    person_id: uuid(input.personId, '사람'), offering_id: optUuid(input.offeringId, '개설'), academic_year_id: uuid(input.academicYearId, '학년도'),
    term_id: optUuid(input.termId, '학기'), kind: str(input.kind), author_role: str(input.authorRole), body: str(input.body), reason: str(input.reason),
  })]);
}
export async function currentResults(db: Db, schoolId: string, offeringId: unknown): Promise<CurrentResult[]> {
  return (await db.query<CurrentResult>(
    `select r.assessment_id, a.code as assessment_code, r.person_id, r.score::float, r.level_code, r.comment, r.corrects_id, r.recorded_at
       from public.current_assessment_results r join public.assessments a on a.id = r.assessment_id
      where r.school_id = $1 and a.offering_id = $2 order by a.code, r.person_id`, [schoolId, uuid(offeringId, '개설')])).rows;
}
export async function linkRetake(db: Db, schoolId: string, personId: unknown, offeringId: unknown, priorOfferingId: unknown) {
  await db.query('select app.link_retake($1, $2, $3, $4)', [schoolId, uuid(personId, '사람'), uuid(offeringId, '개설'), uuid(priorOfferingId, '이전 개설')]);
}

// ── 수업 마감 판 · 정정 판 ───────────────────────────────
export function closeOffering(db: Db, schoolId: string, offeringId: unknown, input: { base_version?: unknown; reason?: unknown; requestKey?: unknown; scaleId?: unknown }) {
  const rk = str(input.requestKey);
  if (!/^[A-Za-z0-9_.:-]{8,80}$/.test(rk)) throw new ValidationError('요청 키(requestKey)가 필요합니다.');
  return one<{ id: string; version: number; repeated: boolean }>(db, 'select app.close_offering($1, $2, $3) as v', [schoolId, uuid(offeringId, '개설'),
    JSON.stringify({ base_version: base(input.base_version), reason: str(input.reason), request_key: rk, scale_id: optUuid(input.scaleId, '척도') })]);
}
export type ClosureResult = {
  person_id: string; raw_score: number | null; final_score: number | null; level_code: string | null;
  attempt_status: 'completed' | 'failed' | 'incomplete' | 'withdrawn'; credits_attempted: number; credits_earned: number; in_stats: boolean;
};
export type Closure = {
  id: string; version: number; previous_id: string | null; reason: string | null; policy_version: number | null; scale_id: string | null;
  scale_version: number | null; credits: number; pass_fail: boolean; closed_at: string;
  results: ClosureResult[]; stats: { n: number; mean: number | null; sd: number | null };
};
export type CurrentResult = { assessment_id: string; assessment_code: string; person_id: string; score: number | null; level_code: string | null; comment: string | null; corrects_id: string | null; recorded_at: string };
export async function offeringClosure(db: Db, schoolId: string, offeringId: unknown, version?: number): Promise<Closure | null> {
  const { rows: [c] } = await db.query(
    `select id, version, previous_id, reason, policy_version, scale_id, scale_version, credits::float, pass_fail, closed_at
       from public.offering_closures where school_id = $1 and offering_id = $2 and ($3::int is null or version = $3)
      order by version desc limit 1`, [schoolId, uuid(offeringId, '개설'), version ?? null]);
  if (!c) return null;
  const { rows: results } = await db.query<ClosureResult>(
    `select person_id, raw_score::float, final_score::float, level_code, attempt_status, credits_attempted::float, credits_earned::float, in_stats
       from public.closure_results where closure_id = $1 order by person_id`, [c.id]);
  const { rows: [stats] } = await db.query('select n, mean::float, sd::float from public.closure_stats where closure_id = $1', [c.id]);
  return { ...c, results, stats };
}
