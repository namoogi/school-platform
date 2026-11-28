import { createHash } from 'node:crypto';
import type { Db } from './db';
import { hiddenSections } from './sections';
import { isUuid, NotFoundError, safeId, ValidationError } from './services';

/**
 * 60차 ADR 0025 F4 — 학년도 기록 마감 판 · 출력 프로필 · 기록 발행본 · 공개 기록.
 * 렌더러는 마감 판 스냅샷만 읽는다(현재 원장을 다시 읽지 않음, 지침 5). 변환에서 빠지거나 바뀌는 것은 issues 로 남긴다(지침 6).
 * 기준 서식: kr_alt_record(한국 대안학교 자체 학생부), us_transcript(미국 성적증명서 + 설명표), us_school_profile(학교 소개서).
 */
export type Format = 'kr_alt_record' | 'us_transcript' | 'us_school_profile' | 'th_por_por_1' | 'en_record';
type LText = Record<string, string>;
export type Snapshot = {
  student: { person_id: string; name: string; name_latin: string | null } | null;
  school: { name: string; slug: string; profile: { country: string | null; sector: string | null; accreditation: string | null } | null; codes: Record<string, string> };
  year: { id: string; label: string; starts_on: string; ends_on: string };
  enrollments: { level: string; level_name: string; status: string; starts_on: string; ends_on: string | null }[];
  courses: {
    offering_id: string; subject_code: string; subject_name: string; term: string; credits: number; pass_fail: boolean; labels: Record<string, LText>;
    result: { raw_score: number | null; final_score: number | null; level_code: string | null; attempt_status: string; credits_attempted: number; credits_earned: number; points: number | null };
    stats: { n: number; mean: number | null; sd: number | null } | null;
  }[];
  narratives: { kind: string; author_role: string; offering_id: string | null; body: string }[];
  attendance: { enrolled_days: number; absent_days: number; counts: Record<string, number>; absent_by_reason: Record<string, number>; attendance_rate: number | null };
  evidence: { title: string; link: string | null }[];
  /** 64차: 외부 결과·자격(그 학년도 안). 63차 이전 판에는 없다 */
  external_results?: { issuer: string; exam: string; title: LText; sat_on: string; result: { grade?: string; score?: number; components?: Record<string, unknown> } }[];
  qualifications?: { kind: string; title: LText; awarded_on: string; issuer: string }[];
};
export type Issue = { level: 'info' | 'question'; where: string; message: string };
export type RecordClosure = { id: string; version: number; previous_id: string | null; reason: string | null; academic_year_id: string; snapshot: Snapshot; closed_at: string };

const uuid = (v: unknown, what: string) => {
  if (typeof v !== 'string' || !isUuid(v)) throw new NotFoundError('err.whatNotFound', { what });
  return v;
};
const rk = (v: unknown) => {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_.:-]{8,80}$/.test(v)) throw new ValidationError('err.grade.requestKey');
  return v;
};
const num = (v: unknown) => (v == null ? null : Number(v));

// ── 학년도 기록 마감 판 ──────────────────────────────────
export async function closeRecordYear(db: Db, schoolId: string, personId: unknown, yearId: unknown, input: { base_version?: unknown; reason?: unknown; requestKey?: unknown }) {
  const base = Number(input.base_version);
  if (!Number.isInteger(base) || base < 0) throw new ValidationError('err.baseVersion');
  const { rows: [r] } = await db.query('select app.close_record_year($1, $2, $3, $4) as v', [schoolId, uuid(personId, '학생'), uuid(yearId, '학년도'),
    JSON.stringify({ base_version: base, reason: typeof input.reason === 'string' ? input.reason : '', request_key: rk(input.requestKey) })]);
  return r.v as { id: string; version: number; repeated: boolean };
}
export async function recordClosures(db: Db, schoolId: string, personId: unknown): Promise<RecordClosure[]> {
  return (await db.query<RecordClosure>(
    `select distinct on (academic_year_id) id, version, previous_id, reason, academic_year_id, snapshot, closed_at
       from public.record_closures where school_id = $1 and person_id = $2 order by academic_year_id, version desc`, [schoolId, uuid(personId, '학생')])).rows
    .sort((a, b) => a.snapshot.year.starts_on.localeCompare(b.snapshot.year.starts_on));
}

// ── 출력 프로필 ──────────────────────────────────────────
/**
 * 130차: 서식별 설정 칸 검사. 렌더러가 읽는 칸만, 그 모양대로 받는다(Codex #228: {bands:[null]} 이 저장되면 발행 때 서버 오류).
 * 모르는 서식은 여기서 보지 않고 DB가 거부한다.
 */
const text = (v: unknown) => typeof v === 'string' && v.length <= 2000;
const PROFILE_FIELDS: Partial<Record<Format, Record<string, (v: unknown) => boolean>>> = {
  kr_alt_record: {
    // 렌더러가 읽는 칸(subject_detail 세특)만. 오타 칸이면 한도가 조용히 안 걸린다(Codex #228)
    char_limits: (v) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.entries(v).every(([k, n]) => k === 'subject_detail' && Number.isInteger(n) && (n as number) > 0 && (n as number) <= 100000),
    note: text,
  },
  us_transcript: { gpa_scale: text },
  us_school_profile: { description: text, gpa_policy: text, scale_code: (v) => typeof v === 'string' && /^[a-z][a-z0-9_]{1,40}$/.test(v) },
  th_por_por_1: {
    bands: (v) => Array.isArray(v) && v.length > 0 && v.length <= 20
      && v.every((b) => {
        // 태국 등급은 0~4(0.5 단위 8단계). 범위 밖이면 GPAX가 부풀려진다(Codex #228)
        const { min, grade } = (b ?? {}) as { min?: unknown; grade?: unknown };
        return typeof min === 'number' && Number.isFinite(min) && typeof grade === 'number' && grade >= 0 && grade <= 4 && Number.isInteger(grade * 2);
      }),
    note: text,
  },
  en_record: { note: text },
};
export function checkProfileSettings(format: Format, settings: unknown): Record<string, unknown> {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new ValidationError('err.rec.profileSettings');
  const fields = PROFILE_FIELDS[format];
  if (!fields) return settings as Record<string, unknown>;
  for (const [k, v] of Object.entries(settings)) {
    if (!fields[k]) throw new ValidationError('err.rec.profileUnknown', { key: safeId(k), keys: Object.keys(fields).join(', ') });
    if (!fields[k](v)) throw new ValidationError('err.rec.profileField', { key: safeId(k) });
  }
  return settings as Record<string, unknown>;
}
export async function saveOutputProfile(db: Db, schoolId: string, input: { format: Format; code: string; settings: Record<string, unknown>; why?: string; base_version: number }) {
  checkProfileSettings(input.format, input.settings);
  // 있는 프로필의 서식은 바꾸지 않는다(DB는 처음 만들 때만 서식을 쓰므로 다른 서식 설정이 조용히 붙는다, Codex #228)
  const { rows: [had] } = await db.query<{ format: string }>('select format from public.output_profiles where school_id = $1 and code = $2', [schoolId, input.code]);
  if (had && had.format !== input.format) throw new ValidationError('err.rec.profileFormat', { code: safeId(input.code) });
  // 학교 소개서가 가리키는 척도는 이 학교에 있어야 한다(오타면 발행본 등급표가 빈다)
  if (typeof input.settings.scale_code === 'string') {
    const { rowCount } = await db.query('select 1 from public.scales where school_id = $1 and code = $2', [schoolId, input.settings.scale_code]);
    if (!rowCount) throw new ValidationError('err.rec.profileScale', { code: safeId(input.settings.scale_code) });
  }
  const { rows: [r] } = await db.query('select app.save_output_profile($1, $2) as v', [schoolId, JSON.stringify(input)]);
  return r.v as { id: string; version: number };
}
/** 130차: 출력 프로필마다 최신 판(관리 화면·AI 지시문 요약이 같이 쓴다) */
export type OutputProfileRow = { id: string; code: string; format: Format; version: number; settings: Record<string, unknown>; why: string | null; created_at: string };
export async function listOutputProfiles(db: Db, schoolId: string): Promise<OutputProfileRow[]> {
  return (await db.query<OutputProfileRow>(
    `select distinct on (p.code) p.id, p.code, p.format, v.version, v.settings, v.why, v.created_at from public.output_profiles p
       join public.output_profile_versions v on v.profile_id = p.id
      where p.school_id = $1 order by p.code, v.version desc`, [schoolId])).rows;
}
async function profileSettings(db: Db, schoolId: string, code: string | undefined, format?: Format) {
  if (!code) return { id: null, version: null, settings: {} as Record<string, unknown> };
  const { rows: [p] } = await db.query(
    `select p.id, p.format, v.version, v.settings from public.output_profiles p join public.output_profile_versions v on v.profile_id = p.id
      where p.school_id = $1 and p.code = $2 order by v.version desc limit 1`, [schoolId, code]);
  if (!p) throw new NotFoundError('err.rec.profileNotFound');
  // 서식마다 설정 칸이 달라 다른 서식의 프로필로 그리지 않는다(130차: 발행 양식에서 프로필을 고르게 되면서)
  if (format && p.format !== format) throw new ValidationError('err.rec.profileFormat', { code: safeId(code) });
  return p as { id: string; version: number; settings: Record<string, unknown> };
}

// ── 렌더러 (스냅샷만 읽음) ────────────────────────────────
const pick = (t: LText | undefined, lang: string) => (t ? t[lang] ?? null : null);

/** 한국 대안학교 자체 학생부: 인적·학적, 출결, 교과학습발달상황(원점수·평균(표준편차)·성취도(수강자수)), 세특, 행특, 활동 증거 */
export function renderKrAltRecord(snaps: Snapshot[], settings: Record<string, unknown> = {}) {
  const issues: Issue[] = [];
  const limits = (settings.char_limits ?? {}) as Record<string, number>;
  const years = snaps.map((s) => {
    const detail = (offering: string) => s.narratives.find((n) => n.kind === 'subject_detail' && n.offering_id === offering)?.body ?? null;
    const courses = s.courses.map((c) => {
      const label = pick(c.labels.record, 'ko') ?? pick(c.labels.all, 'ko');
      if (!label) issues.push({ level: 'info', where: `${s.year.label} ${c.subject_code}`, message: '학생부용 과목 표기가 없어 과목명을 씁니다.' });
      const d = detail(c.offering_id);
      if (d && limits.subject_detail && d.length > limits.subject_detail) issues.push({ level: 'question', where: `${s.year.label} ${c.subject_code} 세특`, message: `글자 수 ${d.length}자가 한도 ${limits.subject_detail}자를 넘습니다.` });
      if (c.result.attempt_status === 'incomplete') issues.push({ level: 'question', where: `${s.year.label} ${c.subject_code}`, message: '마감 판에 미완료로 남아 있습니다. 성적을 확인해 주세요.' });
      return {
        subject: label ?? c.subject_name, term: c.term, credits: c.credits,
        raw_score: c.pass_fail ? null : num(c.result.raw_score) == null ? null : Math.round(Number(c.result.raw_score)),
        mean_sd: c.pass_fail || !c.stats || c.stats.mean == null ? null : `${Number(c.stats.mean).toFixed(1)}(${Number(c.stats.sd ?? 0).toFixed(1)})`,
        achievement: c.result.level_code ? (c.stats && !c.pass_fail ? `${c.result.level_code}(${c.stats.n})` : c.result.level_code) : null,
        status: c.result.attempt_status, detail: d,
      };
    });
    return {
      year: s.year.label, enrollments: s.enrollments.map((e) => ({ level: e.level_name, status: e.status, starts_on: e.starts_on, ends_on: e.ends_on })),
      attendance: { enrolled_days: Number(s.attendance.enrolled_days), absent_by_reason: s.attendance.absent_by_reason, counts: s.attendance.counts },
      courses, behavior: s.narratives.find((n) => n.kind === 'behavior')?.body ?? null,
      evidence: s.evidence.map((e) => e.title),
    };
  });
  const first = snaps[0];
  return {
    content: { format: 'kr_alt_record', title: '학교생활기록부(학교 자체 기록)', school: first?.school.name ?? null, student: first?.student?.name ?? null, years,
      note: (settings.note as string) ?? '이 기록은 학교가 자체로 작성한 학습 기록이며 국가 학교생활기록부(NEIS)가 아닙니다.' },
    issues,
  };
}

/** 미국 성적증명서: 학기별 과목·글자 성적·시도/취득 학점, 학년·누적 GPA(비가중, 척도 점수), 설명표(Key) */
export function renderUsTranscript(snaps: Snapshot[], settings: Record<string, unknown> = {}) {
  const issues: Issue[] = [];
  let cumPts = 0; let cumCr = 0; let cumEarned = 0;
  const legend = new Map<string, number | null>();
  const years = snaps.map((s) => {
    let pts = 0; let cr = 0;
    const courses = s.courses.map((c) => {
      const title = pick(c.labels.transcript, 'en') ?? pick(c.labels.all, 'en');
      if (!title) issues.push({ level: 'question', where: `${s.year.label} ${c.subject_code}`, message: 'No English course title (transcript or all label). The internal subject name is used — please add a transcript label.' });
      const r = c.result;
      const grade = r.attempt_status === 'withdrawn' ? 'W' : r.attempt_status === 'incomplete' ? 'I' : c.pass_fail ? (r.attempt_status === 'completed' ? 'P' : 'F') : r.level_code;
      if (r.attempt_status === 'incomplete') issues.push({ level: 'question', where: `${s.year.label} ${c.subject_code}`, message: 'Incomplete (I) on the closing record.' });
      if (grade && !c.pass_fail && r.points != null) legend.set(grade, Number(r.points));
      if (!c.pass_fail && r.level_code && r.points == null && (r.attempt_status === 'completed' || r.attempt_status === 'failed')) {
        issues.push({ level: 'question', where: `${s.year.label} ${c.subject_code}`, message: `Grade ${r.level_code} has no GPA points on its closing scale, so it is left out of GPA. Close the course on a scale with points or confirm.` });
      }
      const inGpa = !c.pass_fail && r.points != null && (r.attempt_status === 'completed' || r.attempt_status === 'failed');
      if (inGpa) { pts += Number(r.points) * Number(r.credits_attempted); cr += Number(r.credits_attempted); }
      cumEarned += Number(r.credits_earned);
      return { term: c.term, course: title ?? c.subject_name, grade, credits_attempted: Number(r.credits_attempted), credits_earned: Number(r.credits_earned) };
    });
    cumPts += pts; cumCr += cr;
    return { year: s.year.label, courses, gpa: cr ? Math.round((pts / cr) * 100) / 100 : null };
  });
  const first = snaps[0];
  return {
    content: {
      format: 'us_transcript', title: 'Official Transcript', school: first ? { name: first.school.name, ceeb: first.school.codes?.us_ceeb ?? null, accreditation: first.school.profile?.accreditation ?? null } : null,
      student: first?.student ? { name: first.student.name_latin ?? first.student.name } : null, years,
      cumulative: { gpa: cumCr ? Math.round((cumPts / cumCr) * 100) / 100 : null, credits_earned: cumEarned, gpa_scale: (settings.gpa_scale as string) ?? '4.0 unweighted' },
      key: [...[...legend.entries()].sort((a, b) => Number(b[1]) - Number(a[1])).map(([g, p]) => ({ grade: g, points: p })),
            { grade: 'P', points: null, note: 'Pass (not in GPA)' }, { grade: 'W', points: null, note: 'Withdrawn' }, { grade: 'I', points: null, note: 'Incomplete' }],
    },
    issues,
  };
}

/** 학교 소개서(School Profile): 학교 정보·인가·CEEB, 성적 척도·GPA 방식, 재학생 수, 학교 소개 글(프로필 설정) */
export function renderUsSchoolProfile(input: { school: Snapshot['school']; students: number; scale: { code: string; min: number | null; points?: number | null }[] }, settings: Record<string, unknown> = {}) {
  const issues: Issue[] = [];
  if (!input.school.codes?.us_ceeb) issues.push({ level: 'question', where: 'school', message: 'No CEEB code recorded (external identifier us_ceeb).' });
  if (!settings.description) issues.push({ level: 'info', where: 'profile', message: 'No school description in the output profile settings.' });
  return {
    content: {
      format: 'us_school_profile', title: 'School Profile', school: { name: input.school.name, ceeb: input.school.codes?.us_ceeb ?? null, country: input.school.profile?.country ?? null,
        sector: input.school.profile?.sector ?? null, accreditation: input.school.profile?.accreditation ?? null },
      description: (settings.description as string) ?? null, enrollment: input.students,
      grading_scale: input.scale.map((b) => ({ grade: b.code, min_percent: b.min, points: b.points ?? null })),
      gpa_policy: (settings.gpa_policy as string) ?? 'Unweighted 4.0; pass/fail and withdrawn courses are not in GPA. Class rank is not reported.',
    },
    issues,
  };
}

/** 64차 응용 출력 — 태국 ปพ.1(ระเบียนแสดงผลการเรียน) 학교 사본: 0–4 8단계, 학습 영역·과목·หน่วยกิต, GPAX.
 * ปพ.1은 교육부 지정 인쇄 양식이라 이것은 학교 내부 사본·인쇄용 자료다. 점수 → 등급 띠는 학교마다 조금씩 달라 출력 프로필 판(settings.bands)으로 정한다 */
export const TH_BANDS_DEFAULT = [{ min: 80, grade: 4 }, { min: 75, grade: 3.5 }, { min: 70, grade: 3 }, { min: 65, grade: 2.5 }, { min: 60, grade: 2 }, { min: 55, grade: 1.5 }, { min: 50, grade: 1 }, { min: 0, grade: 0 }];
export function renderThPorPor1(snaps: Snapshot[], settings: Record<string, unknown> = {}) {
  const issues: Issue[] = [];
  // 첫 일치로 고르므로 하한이 높은 띠부터(학교가 오름차순으로 넣어도 0 띠가 먼저 걸리지 않게, Codex #228)
  const bands = [...((Array.isArray(settings.bands) ? settings.bands : TH_BANDS_DEFAULT) as { min: number; grade: number }[])].sort((a, b) => b.min - a.min);
  if (!Array.isArray(settings.bands)) issues.push({ level: 'info', where: 'bands', message: '학교 평가 규정(ระเบียบการวัดและประเมินผล)의 점수 띠를 출력 프로필에 넣지 않아 흔한 기본 띠(80/75/70/65/60/55/50)를 썼습니다. 학교 규정과 같은지 확인해 주세요.' });
  let pts = 0; let cr = 0;
  const years = snaps.map((s) => ({
    year: s.year.label,
    courses: s.courses.map((c) => {
      const name = pick(c.labels.record, 'th') ?? pick(c.labels.all, 'th');
      if (!name) issues.push({ level: 'question', where: `${s.year.label} ${c.subject_code}`, message: '태국어 과목명(th 표기)이 없어 과목 코드를 씁니다.' });
      const r = c.result;
      let grade: string;
      if (r.attempt_status === 'incomplete') { grade = 'ร'; issues.push({ level: 'question', where: `${s.year.label} ${c.subject_code}`, message: 'ร(판정 보류)로 남아 있습니다.' }); }
      else if (r.attempt_status === 'withdrawn') grade = '-';
      else if (c.pass_fail) grade = r.attempt_status === 'completed' ? 'ผ' : 'มผ';
      else if (r.final_score == null) { grade = '-'; issues.push({ level: 'question', where: `${s.year.label} ${c.subject_code}`, message: '최종 점수가 없어 태국 등급으로 바꾸지 못했습니다.' }); }
      else {
        const g = bands.find((b) => Number(r.final_score) >= b.min)?.grade ?? 0;
        grade = g.toFixed(1).replace(/\.0$/, '');
        if (r.attempt_status === 'completed' || r.attempt_status === 'failed') { pts += g * Number(c.credits); cr += Number(c.credits); }
      }
      return { code: c.subject_code, subject: name ?? c.subject_code, term: c.term, credits: Number(c.credits), grade };
    }),
  }));
  const first = snaps[0];
  return {
    content: { format: 'th_por_por_1', title: 'ระเบียนแสดงผลการเรียน (สำเนาของโรงเรียน)', school: first?.school.name ?? null,
      student: first?.student ? (first.student.name_latin ? `${first.student.name} (${first.student.name_latin})` : first.student.name) : null,
      years, gpax: cr ? Math.floor((pts / cr) * 100) / 100 : null, credits: cr,
      note: (settings.note as string) ?? '학교 내부 사본·인쇄용 자료입니다. 공식 ปพ.1은 교육부 지정 양식으로 발급합니다.' },
    issues,
  };
}

/** 64차 응용 출력 — 영어권 학업 기록(Academic Record): 학년도별 과목·백분율·등급·학점, 외부 시험 결과(GCSE·A level·IB·AP 등, 기관 발급), 자격. GPA 없음(설정 gpa: true면 표시) */
export function renderEnRecord(snaps: Snapshot[], settings: Record<string, unknown> = {}) {
  const issues: Issue[] = [];
  const years = snaps.map((s) => ({
    year: s.year.label,
    courses: s.courses.map((c) => {
      const title = pick(c.labels.transcript, 'en') ?? pick(c.labels.all, 'en');
      if (!title) issues.push({ level: 'question', where: `${s.year.label} ${c.subject_code}`, message: 'No English course title. The internal subject name is used.' });
      const r = c.result;
      return { course: title ?? c.subject_name, term: c.term, percent: c.pass_fail || r.final_score == null ? null : Number(r.final_score),
        grade: r.attempt_status === 'withdrawn' ? 'W' : r.attempt_status === 'incomplete' ? 'I' : c.pass_fail ? (r.attempt_status === 'completed' ? 'P' : 'F') : r.level_code,
        credits: Number(r.credits_earned) };
    }),
    external: (s.external_results ?? []).map((x) => ({ awarding_body: x.issuer, exam: x.exam, title: pick(x.title, 'en') ?? x.exam, date: x.sat_on,
      result: x.result.grade ?? (x.result.score != null ? String(x.result.score) : null) })),
    qualifications: (s.qualifications ?? []).map((q) => ({ title: pick(q.title, 'en') ?? q.kind, awarded_on: q.awarded_on, issuer: q.issuer })),
  }));
  if (snaps.some((s) => s.external_results === undefined)) issues.push({ level: 'info', where: 'external', message: 'Some record years were closed before external results were recorded (round 64). Re-close the year to include them.' });
  const first = snaps[0];
  return {
    content: { format: 'en_record', title: 'Academic Record', school: first?.school.name ?? null, student: first?.student ? first.student.name_latin ?? first.student.name : null,
      years, note: (settings.note as string) ?? 'External examination results are issued by the awarding bodies and recorded here as reported. This record is issued by the school.' },
    issues,
  };
}

/** 블라인드: 학생 이름·학교 이름·학교 코드를 내용 전체에서 가린다(서술 안의 이름까지). 가린 곳은 issues 에 남긴다 */
export function blind(content: Record<string, unknown>, secrets: string[], issues: Issue[]) {
  let text = JSON.stringify(content);
  for (const sec of secrets.filter((x) => x && x.length >= 2)) {
    const esc = JSON.stringify(sec).slice(1, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const before = text;
    text = text.replace(new RegExp(esc, 'g'), '○○');
    if (before !== text) issues.push({ level: 'info', where: 'blind', message: '가린 항목이 있습니다.' });
  }
  return JSON.parse(text) as Record<string, unknown>;
}

/** 학교가 숨긴 구획을 발행본 내용에서 뺀다. 지금 발행본에 실리는 것은 평점(GPA·GPAX)뿐이다 */
export function hideInDocument(format: Format, out: { content: Record<string, unknown>; issues: Issue[] }, hidden: Set<string>) {
  if (!hidden.has('gpa')) return out;
  const c = structuredClone(out.content) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (Array.isArray(c.years)) for (const y of c.years) if (y && typeof y === 'object') delete y.gpa;
  if (c.cumulative && typeof c.cumulative === 'object') { delete c.cumulative.gpa; delete c.cumulative.gpa_scale; }
  for (const list of [c.key, c.grading_scale]) if (Array.isArray(list)) for (const k of list) if (k && typeof k === 'object') delete k.points;
  if ('gpax' in c) delete c.gpax;
  if (format === 'us_school_profile') c.gpa_policy = 'GPA is not reported by this school.';
  // GPA 점수가 없는 등급 질문은 GPA를 싣지 않으면 뜻이 없다
  const issues = out.issues.filter((i) => !/GPA points/.test(i.message));
  issues.push({ level: 'info', where: format, message: 'GPA is hidden by school setting (hidden sections).' });
  return { content: c, issues };
}

// ── 발행 ─────────────────────────────────────────────────
export async function publishRecordDocument(db: Db, schoolId: string, input: { format: Format; personId?: string; lang?: string; blind?: boolean; profileCode?: string }) {
  const prof = await profileSettings(db, schoolId, input.profileCode || undefined, input.format);
  let closureIds: string[] = [];
  let out: { content: Record<string, unknown>; issues: Issue[] };
  let secrets: string[] = [];
  if (input.format === 'us_school_profile') {
    const { rows: [s] } = await db.query(`select app.school_report_v1($1) as r`, [schoolId]);
    const { rows: [sch] } = await db.query(
      `select s.name, s.slug,
              (select jsonb_build_object('country', p.country, 'sector', p.sector, 'accreditation', p.accreditation) from public.school_profiles p where p.school_id = s.id order by p.version desc limit 1) as profile,
              (select coalesce(jsonb_object_agg(x.system, x.value), '{}') from public.external_identifiers x where x.school_id = s.id and x.target_kind = 'school' and x.status <> 'superseded') as codes
         from public.schools s where s.id = $1`, [schoolId]);
    const { rows: [sc] } = await db.query(
      `select sv.bands from public.scales s join public.scale_versions sv on sv.scale_id = s.id where s.school_id = $1 and s.code = $2 order by sv.version desc limit 1`,
      [schoolId, (prof.settings.scale_code as string) ?? 'us_letter']);
    out = renderUsSchoolProfile({ school: sch, students: Number(s.r.counts.students_enrolled), scale: (sc?.bands ?? []) }, prof.settings);
    if (!sc) out.issues.push({ level: 'question', where: 'grading_scale', message: `School scale "${(prof.settings.scale_code as string) ?? 'us_letter'}" was not found, so the grading scale is empty.` });
    secrets = [sch.name];
  } else {
    const closures = await recordClosures(db, schoolId, uuid(input.personId, '학생'));
    if (!closures.length) throw new ValidationError('err.rec.noClose');
    closureIds = closures.map((c) => c.id);
    const snaps = closures.map((c) => c.snapshot);
    out = input.format === 'us_transcript' ? renderUsTranscript(snaps, prof.settings)
      : input.format === 'th_por_por_1' ? renderThPorPor1(snaps, prof.settings)
      : input.format === 'en_record' ? renderEnRecord(snaps, prof.settings)
      : renderKrAltRecord(snaps, prof.settings);
    // 63차 ADR 0030: 거부된 수정 요청에 붙은 이의 의견서는 원 기록을 바꾸지 않고 발행본에 함께 싣는다
    const { rows: notes } = await db.query(
      `select a.body, a.written_at, q.body as request from public.record_annotations a join public.record_requests q on q.id = a.request_id
        where a.school_id = $1 and a.person_id = $2 order by a.written_at`, [schoolId, input.personId]);
    if (notes.length) out.content.annotations = notes.map((n) => ({ statement: n.body, about: n.request, written_at: n.written_at }));
    const st = snaps[0].student;
    secrets = [st?.name ?? '', st?.name_latin ?? '', snaps[0].school.name, ...Object.values(snaps[0].school.codes ?? {})];
  }
  // 118차: 학교가 평점(GPA)을 숨기면 발행본에 GPA 칸을 싣지 않는다(스냅샷은 그대로, 그리는 쪽에서만 뺌)
  out = hideInDocument(input.format, out, await hiddenSections(db, schoolId));
  if (input.blind) out.content = blind(out.content, secrets, out.issues);
  const { rows: [r] } = await db.query('select app.publish_record_document($1, $2) as v', [schoolId, JSON.stringify({
    format: input.format, person_id: input.personId ?? null, closure_ids: closureIds, lang: input.lang ?? (input.format === 'kr_alt_record' ? 'ko' : input.format === 'th_por_por_1' ? 'th' : 'en'),
    blind: input.blind === true, content: out.content, issues: out.issues, profile_id: prof.id, profile_version: prof.version,
  })]);
  return { id: r.v as string, issues: out.issues, content: out.content };
}
export async function recordDocument(db: Db, schoolId: string, id: unknown) {
  const { rows: [d] } = await db.query(
    `select id, format, person_id, lang, blind, content, issues, content_sha256, published_at,
            (select coalesce(array_agg(closure_id), '{}') from public.record_document_sources s where s.document_id = d.id) as closure_ids
       from public.record_documents d where d.school_id = $1 and d.id = $2`, [schoolId, uuid(id, '발행본')]);
  if (!d) throw new NotFoundError('err.rec.docNotFound');
  return d;
}
/** 내용 무결성: 저장한 해시와 다시 계산한 해시가 같은지(DB가 jsonb 문자열로 계산한 값과 비교) */
export async function verifyRecordDocument(db: Db, schoolId: string, id: unknown) {
  const { rows: [r] } = await db.query(
    `select content_sha256 = encode(sha256(convert_to(content::text, 'UTF8')), 'hex') as ok from public.record_documents where school_id = $1 and id = $2`, [schoolId, uuid(id, '발행본')]);
  return r?.ok === true;
}
export async function recordDisclosure(db: Db, schoolId: string, input: { documentId: string; recipient: string; purpose: string; basis?: string }) {
  const { rows: [r] } = await db.query('select app.record_disclosure($1, $2) as v', [schoolId, JSON.stringify({
    document_id: uuid(input.documentId, '발행본'), recipient: input.recipient, purpose: input.purpose, basis: input.basis ?? null,
  })]);
  return r.v as string;
}
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
