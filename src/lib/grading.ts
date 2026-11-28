import type { Db } from './db';
import { isUuid, NotFoundError, ValidationError } from './services';
import { evaluate, type CalcSpec } from './calc/expr';

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
  kr_elective: {
    kind: 'letter', why: '한국 고등 선택과목·중학교 A–E(90/80/70/60, 60 미만 E — 40 기준 없음) — 2026 기재요령 별표 9. 공통과목은 kr_achievement(40 미만 I)',
    bands: [
      { code: 'A', label: { ko: 'A', en: 'A' }, min: 90 }, { code: 'B', label: { ko: 'B', en: 'B' }, min: 80 },
      { code: 'C', label: { ko: 'C', en: 'C' }, min: 70 }, { code: 'D', label: { ko: 'D', en: 'D' }, min: 60 },
      { code: 'E', label: { ko: 'E', en: 'E' }, min: 0 },
    ],
  },
  kr_arts_pe: {
    kind: 'letter', why: '한국 체육·예술 A·B·C(80/60, 60 미만 C) — 2026 기재요령 별표 9. 과학탐구실험은 kr_science_lab(40 미만 I)',
    bands: [
      { code: 'A', label: { ko: 'A', en: 'A' }, min: 80 }, { code: 'B', label: { ko: 'B', en: 'B' }, min: 60 },
      { code: 'C', label: { ko: 'C', en: 'C' }, min: 0 },
    ],
  },
  kr_science_lab: {
    kind: 'letter', why: '한국 고등 과학탐구실험 A·B·C(80/60/40), 40 미만 미이수 I(최소 성취수준 보장지도 이수 시 C) — 2026 기재요령 별표 9',
    bands: [
      { code: 'A', label: { ko: 'A', en: 'A' }, min: 80 }, { code: 'B', label: { ko: 'B', en: 'B' }, min: 60 },
      { code: 'C', label: { ko: 'C', en: 'C' }, min: 40 }, { code: 'I', label: { ko: '미이수', en: 'Incomplete' }, min: 0, earns_credit: false },
    ],
  },
  us_plus_minus: {
    kind: 'letter', why: '미국 ± 글자 성적과 4.0 평점(A- 3.7·B+ 3.3 …, College Board BigFuture 표). 분할점·A+ 평점은 학교마다 다름',
    bands: ([['A+', 97, 4], ['A', 93, 4], ['A-', 90, 3.7], ['B+', 87, 3.3], ['B', 83, 3], ['B-', 80, 2.7], ['C+', 77, 2.3], ['C', 73, 2], ['C-', 70, 1.7], ['D+', 67, 1.3], ['D', 63, 1], ['D-', 60, 0.7]] as const)
      .map(([code, min, points]) => ({ code, label: { en: code, ko: code }, min, points } as Band))
      .concat([{ code: 'F', label: { en: 'F', ko: 'F' }, min: 0, points: 0, earns_credit: false }]),
  },
  pass_fail: {
    kind: 'pass_fail', why: 'P/F — 통과 기준은 학교가 정함(기본 60)',
    bands: [{ code: 'P', label: { en: 'Pass', ko: '통과' }, min: 60 }, { code: 'F', label: { en: 'Fail', ko: '미통과' }, min: 0, earns_credit: false }],
  },
};

const uuid = (v: unknown, what: string) => {
  if (typeof v !== 'string' || !isUuid(v)) throw new NotFoundError('err.whatNotFound', { what });
  return v;
};
const optUuid = (v: unknown, what: string) => (v == null || v === '' ? null : uuid(v, what));
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const ltext = (v: unknown, what: string): LText => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ValidationError('err.whatLabelRequired', { what });
  const out: LText = {};
  for (const [k, s] of Object.entries(v)) if (/^[a-z]{2}$/.test(k) && typeof s === 'string' && s.trim()) out[k] = s.trim().slice(0, 200);
  if (!Object.keys(out).length) throw new ValidationError('err.whatLabelRequired', { what });
  return out;
};
const base = (v: unknown) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new ValidationError('err.baseVersion');
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
export const SCALE_KINDS = ['letter', 'level', 'pass_fail', 'percent', 'points'] as const;
/** 128차: 척도 띠 검사(화면·AI 초안 공통). 코드 겹침·숫자 아닌 하한/평점을 DB 전에 막는다. 표기가 없으면 코드를 표기로 쓴다 */
const BAND_KEYS = ['code', 'label', 'min', 'points', 'earns_credit'];
export function checkBands(raw: unknown, opts: { floor?: boolean } = {}): Band[] {
  // 띠 30개는 DB 칸 제한과 같게
  if (!Array.isArray(raw) || !raw.length || raw.length > 30) throw new ValidationError('err.grade.bands');
  const seen = new Set<string>();
  const num = (v: unknown, code: string) => {
    if (v == null || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n)) throw new ValidationError('err.grade.bandNumber', { code });
    return n;
  };
  const out = raw.map((b) => {
    const code = str(b?.code).trim();
    if (!code) throw new ValidationError('err.grade.bands');
    if (seen.has(code)) throw new ValidationError('err.grade.bandDup', { code });
    seen.add(code);
    // 띠 칸은 정해진 이름만. 오타(earn_credit)가 버려져 이수로 굳지 않게(Codex #228)
    for (const k of Object.keys(b ?? {})) if (!BAND_KEYS.includes(k)) throw new ValidationError('err.grade.bandField', { code, key: k, keys: BAND_KEYS.join(', ') });
    const label = b?.label == null ? { ko: code, en: code } : ltext(b.label, '척도 띠');
    // 이수 여부는 참·거짓만. 글자 "false" 를 참으로 바꿔 이수로 굳히지 않는다(Codex #228)
    if (b?.earns_credit != null && typeof b.earns_credit !== 'boolean') throw new ValidationError('err.grade.bandCredit', { code });
    return { code, label, min: num(b?.min, code), points: num(b?.points, code), earns_credit: b?.earns_credit !== false };
  });
  // floor(화면·API 쓰기 길): 점수 구간이 있으면 0점까지 덮어야 한다. 템플릿 적용은 관제가 낸 판을 그대로 옮기므로 여기서 막지 않는다. 바닥 구간이 없으면 그 아래 점수는 등급 없이 마감되어(app.band_for → null) 잘못 이수로 굳는다(Codex #228)
  // 같은 하한이 둘이면 마감 때 어느 띠를 고를지 정해지지 않는다(app.band_for 는 하한 순으로 하나만, Codex #228)
  const mins = out.filter((b) => b.min != null).map((b) => b.min as number);
  const dup = mins.find((m, i) => mins.indexOf(m) !== i);
  if (dup != null) throw new ValidationError('err.grade.bandDupMin', { min: dup });
  // 하한이 모두 비어도 같은 문제다(모든 점수가 등급 없이 이수, Codex #228 재검토)
  if (opts.floor && !out.some((b) => b.min != null && b.min <= 0)) throw new ValidationError('err.grade.bandFloor');
  return out;
}
export function saveScale(db: Db, schoolId: string, input: { code?: unknown; kind?: unknown; bands?: unknown; why?: unknown; base_version?: unknown }, opts: { floor?: boolean } = {}) {
  const bands = checkBands(input.bands, opts);
  return saveScaleChecked(db, schoolId, input, bands);
}
async function saveScaleChecked(db: Db, schoolId: string, input: { code?: unknown; kind?: unknown; why?: unknown; base_version?: unknown }, bands: Band[]) {
  // 있는 척도의 종류는 바꾸지 않는다(DB는 처음 만들 때만 종류를 쓴다, Codex #228)
  const { rows: [had] } = await db.query<{ kind: string }>('select kind from public.scales where school_id = $1 and code = $2', [schoolId, str(input.code)]);
  if (had && had.kind !== str(input.kind)) throw new ValidationError('err.grade.scaleKindChange', { code: str(input.code), kind: had.kind });
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
  attendance?: { day_absent_ratio?: number; chronic_ratio?: number; min_attendance_ratio?: number };
  requests?: { due_days?: number };
};
/**
 * 128차: 성적 정책 전체 검사(화면 'JSON으로 고치기'·AI 초안). 플랫폼이 읽는 칸만 받는다 — 모르는 칸은 아무 데서도 쓰이지 않아 조용히 무시되므로 막는다.
 * 읽는 곳: 마감(score_digits·final_digits·stats·narrative_limits), 발행(gpa·rank), 출결 요약(attendance), 열람 요청 기한(requests)
 */
export const POLICY_KEYS = ['score_digits', 'final_digits', 'stats', 'narrative_limits', 'gpa', 'rank', 'attendance', 'requests'] as const;
/** 묶음 안쪽에서 읽는 칸(narrative_limits 는 서술 종류가 학교마다 달라 열어 둔다) */
const POLICY_INNER: Record<string, string[]> = {
  stats: ['sd', 'digits'], gpa: ['enabled', 'level_bonus'], rank: ['enabled'],
  attendance: ['day_absent_ratio', 'chronic_ratio', 'min_attendance_ratio'], requests: ['due_days'],
};
export function checkGradingPolicy(raw: unknown): GradingPolicy {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ValidationError('err.grade.policyObject');
  const p = raw as Record<string, unknown>;
  const bad = (key: string) => { throw new ValidationError('err.grade.policyField', { key }); };
  const isObj = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
  const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
  const ratio = (v: unknown) => typeof v === 'number' && v >= 0 && v <= 1;
  for (const k of Object.keys(p)) if (!(POLICY_KEYS as readonly string[]).includes(k)) throw new ValidationError('err.grade.policyUnknown', { key: k, keys: POLICY_KEYS.join(', ') });
  // 모양이 정해진 묶음은 안쪽 칸도 본다. 오타(min_attendence_ratio)가 값만 맞으면 저장되고 계산에서 조용히 무시된다(Codex #228)
  for (const [k, inner] of Object.entries(POLICY_INNER)) {
    if (!isObj(p[k])) continue;
    for (const x of Object.keys(p[k] as object)) if (!inner.includes(x)) throw new ValidationError('err.grade.policyUnknown', { key: `${k}.${x}`, keys: inner.map((i) => `${k}.${i}`).join(', ') });
  }
  for (const k of ['score_digits', 'final_digits']) if (k in p && !int(p[k], 0, 4)) bad(k);
  if ('stats' in p) {
    const st = p.stats as Record<string, unknown>;
    if (!isObj(st) || ('sd' in st && st.sd !== 'population' && st.sd !== 'sample') || ('digits' in st && !int(st.digits, 0, 4))) bad('stats');
  }
  if ('narrative_limits' in p) {
    const n = p.narrative_limits as Record<string, unknown>;
    if (!isObj(n) || Object.values(n).some((x) => !int(x, 1, 100000))) bad('narrative_limits');
  }
  if ('gpa' in p) {
    const g = p.gpa as Record<string, unknown>;
    if (!isObj(g) || ('enabled' in g && typeof g.enabled !== 'boolean')
      || ('level_bonus' in g && (!isObj(g.level_bonus) || Object.values(g.level_bonus as object).some((x) => typeof x !== 'number')))) bad('gpa');
  }
  if ('rank' in p && (!isObj(p.rank) || ('enabled' in (p.rank as object) && typeof (p.rank as Record<string, unknown>).enabled !== 'boolean'))) bad('rank');
  if ('attendance' in p) {
    const a = p.attendance as Record<string, unknown>;
    if (!isObj(a) || Object.values(a).some((x) => !ratio(x))) bad('attendance');
  }
  if ('requests' in p) {
    const r = p.requests as Record<string, unknown>;
    if (!isObj(r) || ('due_days' in r && !int(r.due_days, 1, 365))) bad('requests');
  }
  return p as GradingPolicy;
}
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
  if (score !== null && !Number.isFinite(score)) throw new ValidationError('err.grade.score');
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
/**
 * ADR 0042 마감 연결: calcCode 를 주면 그 계산식 판(최신 판)으로 학생마다 계산해 마감에 넘긴다.
 * 입력은 DB 가 원장에서 조립한 것(app.offering_calc_inputs)을 그대로 쓰고, 마감 함수가 같은 입력을 다시 조립해 대조한다.
 */
export async function closeOffering(db: Db, schoolId: string, offeringId: unknown, input: { base_version?: unknown; reason?: unknown; requestKey?: unknown; scaleId?: unknown; calcCode?: unknown }) {
  const rk = str(input.requestKey);
  if (!/^[A-Za-z0-9_.:-]{8,80}$/.test(rk)) throw new ValidationError('err.grade.requestKey');
  const off = uuid(offeringId, '개설');
  const calc = input.calcCode ? await calcForClosure(db, schoolId, off, str(input.calcCode)) : undefined;
  return one<{ id: string; version: number; repeated: boolean; calc: boolean }>(db, 'select app.close_offering($1, $2, $3) as v', [schoolId, off,
    JSON.stringify({ base_version: base(input.base_version), reason: str(input.reason), request_key: rk, scale_id: optUuid(input.scaleId, '척도'), calc })]);
}

export type CalcInputs = Record<string, Record<string, unknown>>;
/** 수강생마다 계산 입력(DB 가 원장에서 조립) */
export async function offeringCalcInputs(db: Db, schoolId: string, offeringId: unknown): Promise<CalcInputs> {
  return one<CalcInputs>(db, 'select app.offering_calc_inputs($1, $2) as v', [schoolId, uuid(offeringId, '개설')]);
}

/** 마감에 넘길 계산 결과: { code, version, results: { 사람 id: { input, score, level, passed } } } */
export async function calcForClosure(db: Db, schoolId: string, offeringId: string, code: string) {
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(code)) throw new ValidationError('err.grade.calcCode');
  const { rows: [rule] } = await db.query<{ version: number; spec: CalcSpec }>(
    'select version, spec from public.calc_rules where school_id = $1 and code = $2 order by version desc limit 1', [schoolId, code]);
  if (!rule) throw new NotFoundError('err.grade.calcNotFound');
  const inputs = await offeringCalcInputs(db, schoolId, offeringId);
  const results: Record<string, { input: unknown; score: number | null; level: string | null; passed: boolean | null }> = {};
  for (const [personId, inp] of Object.entries(inputs)) results[personId] = { input: inp, ...evaluate(rule.spec, inp) };
  return { code, version: rule.version, results };
}

/** 보충 이수 기록(보장지도 achievement · 추가학습 attendance). 담당 교사·학교 관리자 */
export async function recordRemediation(db: Db, schoolId: string, input: { offeringId?: unknown; personId?: unknown; kind?: unknown; completed?: unknown; note?: unknown }) {
  if (input.kind !== 'achievement' && input.kind !== 'attendance') throw new ValidationError('err.grade.remediationKind');
  return one<string>(db, 'select app.record_remediation($1, $2) as v', [schoolId, JSON.stringify({
    offering_id: uuid(input.offeringId, '개설'), person_id: uuid(input.personId, '사람'), kind: input.kind,
    completed: input.completed === true || input.completed === 'true' || input.completed === 'on', note: str(input.note).slice(0, 500) || null,
  })]);
}
export type ClosureResult = {
  person_id: string; raw_score: number | null; final_score: number | null; level_code: string | null;
  attempt_status: 'completed' | 'failed' | 'incomplete' | 'withdrawn'; credits_attempted: number; credits_earned: number; in_stats: boolean;
};
export type Closure = {
  id: string; version: number; previous_id: string | null; reason: string | null; policy_version: number | null; scale_id: string | null;
  scale_version: number | null; credits: number; pass_fail: boolean; closed_at: string; calc_code: string | null; calc_version: number | null;
  results: ClosureResult[]; stats: { n: number; mean: number | null; sd: number | null };
};
export type CurrentResult = { assessment_id: string; assessment_code: string; person_id: string; score: number | null; level_code: string | null; comment: string | null; corrects_id: string | null; recorded_at: string };
export async function offeringClosure(db: Db, schoolId: string, offeringId: unknown, version?: number): Promise<Closure | null> {
  const { rows: [c] } = await db.query(
    `select id, version, previous_id, reason, policy_version, scale_id, scale_version, credits::float, pass_fail, closed_at, calc_code, calc_version
       from public.offering_closures where school_id = $1 and offering_id = $2 and ($3::int is null or version = $3)
      order by version desc limit 1`, [schoolId, uuid(offeringId, '개설'), version ?? null]);
  if (!c) return null;
  const { rows: results } = await db.query<ClosureResult>(
    `select person_id, raw_score::float, final_score::float, level_code, attempt_status, credits_attempted::float, credits_earned::float, in_stats
       from public.closure_results where closure_id = $1 order by person_id`, [c.id]);
  const { rows: [stats] } = await db.query('select n, mean::float, sd::float from public.closure_stats where closure_id = $1', [c.id]);
  return { ...c, results, stats };
}
