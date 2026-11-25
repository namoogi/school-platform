import { createHash } from 'node:crypto';
import type { Db } from './db';
import { isUuid, NotFoundError, ValidationError } from './services';

/**
 * 60차 ADR 0025 F4 — 학년도 기록 마감 판 · 출력 프로필 · 기록 발행본 · 공개 기록.
 * 렌더러는 마감 판 스냅샷만 읽는다(현재 원장을 다시 읽지 않음, 지침 5). 변환에서 빠지거나 바뀌는 것은 issues 로 남긴다(지침 6).
 * 기준 서식: kr_alt_record(한국 대안학교 자체 학생부), us_transcript(미국 성적증명서 + 설명표), us_school_profile(학교 소개서).
 */
export type Format = 'kr_alt_record' | 'us_transcript' | 'us_school_profile';
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
};
export type Issue = { level: 'info' | 'question'; where: string; message: string };
export type RecordClosure = { id: string; version: number; previous_id: string | null; reason: string | null; academic_year_id: string; snapshot: Snapshot; closed_at: string };

const uuid = (v: unknown, what: string) => {
  if (typeof v !== 'string' || !isUuid(v)) throw new NotFoundError(`${what}을(를) 찾을 수 없습니다.`);
  return v;
};
const rk = (v: unknown) => {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_.:-]{8,80}$/.test(v)) throw new ValidationError('요청 키(requestKey)가 필요합니다.');
  return v;
};
const num = (v: unknown) => (v == null ? null : Number(v));

// ── 학년도 기록 마감 판 ──────────────────────────────────
export async function closeRecordYear(db: Db, schoolId: string, personId: unknown, yearId: unknown, input: { base_version?: unknown; reason?: unknown; requestKey?: unknown }) {
  const base = Number(input.base_version);
  if (!Number.isInteger(base) || base < 0) throw new ValidationError('base_version(보고 고친 판)이 필요합니다.');
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
export async function saveOutputProfile(db: Db, schoolId: string, input: { format: Format; code: string; settings: Record<string, unknown>; why?: string; base_version: number }) {
  const { rows: [r] } = await db.query('select app.save_output_profile($1, $2) as v', [schoolId, JSON.stringify(input)]);
  return r.v as { id: string; version: number };
}
async function profileSettings(db: Db, schoolId: string, code: string | undefined) {
  if (!code) return { id: null, version: null, settings: {} as Record<string, unknown> };
  const { rows: [p] } = await db.query(
    `select p.id, v.version, v.settings from public.output_profiles p join public.output_profile_versions v on v.profile_id = p.id
      where p.school_id = $1 and p.code = $2 order by v.version desc limit 1`, [schoolId, code]);
  if (!p) throw new NotFoundError('출력 프로필을 찾을 수 없습니다.');
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

// ── 발행 ─────────────────────────────────────────────────
export async function publishRecordDocument(db: Db, schoolId: string, input: { format: Format; personId?: string; lang?: string; blind?: boolean; profileCode?: string }) {
  const prof = await profileSettings(db, schoolId, input.profileCode);
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
    secrets = [sch.name];
  } else {
    const closures = await recordClosures(db, schoolId, uuid(input.personId, '학생'));
    if (!closures.length) throw new ValidationError('학년도 기록 마감 판이 없습니다. 먼저 마감해 주세요.');
    closureIds = closures.map((c) => c.id);
    const snaps = closures.map((c) => c.snapshot);
    out = input.format === 'us_transcript' ? renderUsTranscript(snaps, prof.settings) : renderKrAltRecord(snaps, prof.settings);
    // 63차 ADR 0030: 거부된 수정 요청에 붙은 이의 의견서는 원 기록을 바꾸지 않고 발행본에 함께 싣는다
    const { rows: notes } = await db.query(
      `select a.body, a.written_at, q.body as request from public.record_annotations a join public.record_requests q on q.id = a.request_id
        where a.school_id = $1 and a.person_id = $2 order by a.written_at`, [schoolId, input.personId]);
    if (notes.length) out.content.annotations = notes.map((n) => ({ statement: n.body, about: n.request, written_at: n.written_at }));
    const st = snaps[0].student;
    secrets = [st?.name ?? '', st?.name_latin ?? '', snaps[0].school.name, ...Object.values(snaps[0].school.codes ?? {})];
  }
  if (input.blind) out.content = blind(out.content, secrets, out.issues);
  const { rows: [r] } = await db.query('select app.publish_record_document($1, $2) as v', [schoolId, JSON.stringify({
    format: input.format, person_id: input.personId ?? null, closure_ids: closureIds, lang: input.lang ?? (input.format === 'kr_alt_record' ? 'ko' : 'en'),
    blind: input.blind === true, content: out.content, issues: out.issues, profile_id: prof.id, profile_version: prof.version,
  })]);
  return { id: r.v as string, issues: out.issues, content: out.content };
}
export async function recordDocument(db: Db, schoolId: string, id: unknown) {
  const { rows: [d] } = await db.query(
    `select id, format, person_id, lang, blind, content, issues, content_sha256, published_at,
            (select coalesce(array_agg(closure_id), '{}') from public.record_document_sources s where s.document_id = d.id) as closure_ids
       from public.record_documents d where d.school_id = $1 and d.id = $2`, [schoolId, uuid(id, '발행본')]);
  if (!d) throw new NotFoundError('발행본을 찾을 수 없습니다.');
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
