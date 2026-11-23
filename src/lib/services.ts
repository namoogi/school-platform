import crypto from 'node:crypto';
import type { Db } from './db';
import { readFile } from './readers';
import {
  ANALYZER, analyzePeriods, canonical, validatePeriodValue, ValidationError,
  type Evidence, type Issue, type PeriodValue,
} from './analyze';

export { ValidationError };
export class NotFoundError extends Error {}

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 20;

// ── 조회 타입 ─────────────────────────────────────────────
export type School = {
  id: string; slug: string; name: string; locale: string; status: 'trial' | 'active' | 'suspended';
  /** 이 학교에서의 역할. 전체 관리자가 소속 없이 들어온 경우 null */
  role: 'admin' | 'teacher' | null;
  isPlatformAdmin: boolean;
  /** 학교 관리자 권한(확정·발행·설정). 전체 관리자 포함 */
  isAdmin: boolean;
  modules: string[];
  seats: number | null;
};
export type Me = { id: string; email: string; display_name: string; is_platform_admin: boolean };
export type SourceFile = {
  id: string; kind: 'file' | 'sheet'; name: string; mime_type: string | null; size_bytes: number | null;
  sha256: string | null; sheet_url: string | null; status: 'parsed' | 'registered' | 'pending_reader';
  status_note: string | null; reader: string | null; needs_review: boolean; created_at: string; row_count: number;
};
export type Question = {
  id: string; status: string; prompt: string; proposal: PeriodValue; evidence: Evidence[]; issues: Issue[];
  analyzer: string; differs_from_rule_id: string | null; created_at: string;
};
export type Rule = {
  id: string; version: number; value: PeriodValue; decision: 'accepted' | 'edited'; rationale: string | null;
  evidence: Evidence[]; question_id: string | null; confirmed_at: string;
};
export type Template = {
  id: string; version: number; title: string; period_heading: string; assessment_heading: string;
  footer_note: string; created_at: string;
};
export type Snapshot = {
  format: 'period-report@1';
  school: { name: string; locale: string };
  academic_year: number;
  student: { label: string };
  template: Omit<Template, 'id' | 'created_at'> & { id: string };
  rule: { id: string; version: number; value: PeriodValue; decision: string; rationale: string | null; confirmed_at: string };
  sources: { id: string; name: string; sha256: string | null }[];
  revision: { number: number; of: string | null };
};
export type PublishedDocument = {
  id: string; rule_id: string; template_id: string; revision_of: string | null; revision_number: number;
  snapshot: Snapshot; snapshot_sha256: string; published_at: string; superseded_by: string | null;
};

// ── 학교 ─────────────────────────────────────────────────
export class NoSchoolError extends Error {}

export async function me(db: Db): Promise<Me> {
  const { rows } = await db.query<Me>('select * from app.me()');
  if (!rows[0]) throw new NotFoundError('계정을 찾을 수 없습니다.');
  return rows[0];
}

/**
 * 지금 작업 중인 학교. preferredId(전환한 학교)가 있으면 그 학교를, 없으면 첫 소속 학교를 쓴다.
 * RLS 때문에 소속 학교(전체 관리자는 모든 학교)만 보인다.
 */
export async function currentSchool(db: Db, preferredId?: string | null): Promise<School> {
  const account = await me(db);
  const cols = `s.id, s.slug, s.name, s.locale, s.status,
    (select m.role from public.memberships m where m.user_id = app.uid() and m.school_id = s.id) as role,
    l.modules, l.seats`;
  const join = `left join lateral (select x.modules, x.seats from public.school_licenses x
    where x.school_id = s.id order by x.version desc limit 1) l on true`;
  let row: Record<string, unknown> | undefined;
  if (preferredId && isUuid(preferredId)) {
    row = (await db.query(`select ${cols} from public.schools s ${join} where s.id = $1`, [preferredId])).rows[0];
  }
  if (!row) {
    row = (await db.query(
      `select ${cols} from public.memberships m join public.schools s on s.id = m.school_id ${join}
       where m.user_id = app.uid() order by s.slug limit 1`)).rows[0];
  }
  if (!row) {
    if (account.is_platform_admin) throw new NoSchoolError('작업할 학교를 고르세요.');
    throw new NotFoundError('소속 학교가 없습니다.');
  }
  if (row.status === 'suspended' && !account.is_platform_admin) {
    throw new ValidationError('이용이 중지된 학교입니다. 전체 관리자에게 문의하세요.');
  }
  const role = (row.role as School['role']) ?? null;
  return {
    id: row.id as string, slug: row.slug as string, name: row.name as string, locale: row.locale as string,
    status: row.status as School['status'], role, isPlatformAdmin: account.is_platform_admin,
    isAdmin: account.is_platform_admin || role === 'admin',
    modules: (row.modules as string[] | null) ?? [], seats: (row.seats as number | null) ?? null,
  };
}

/** 학사 흐름 단계 표시용: 자료가 있는지, 확정 규칙이 있는지, 발행본이 있는지 */
export async function flowProgress(db: Db, schoolId: string) {
  const { rows: [r] } = await db.query(
    `select exists(select 1 from public.source_files where school_id = $1 and archived_at is null and status = 'parsed') as sources,
            exists(select 1 from public.school_rules where school_id = $1) as rule,
            exists(select 1 from public.published_documents where school_id = $1) as docs`, [schoolId]);
  const done: string[] = [];
  if (r.sources) done.push('intake');
  if (r.rule) done.push('review');
  if (r.docs) done.push('documents');
  return done;
}

/** 학교 전환기용: 볼 수 있는 학교(소속 학교, 전체 관리자는 모든 학교) */
export async function accessibleSchools(db: Db) {
  const { rows } = await db.query<{ id: string; name: string; status: string }>(
    'select id, name, status from public.schools order by name');
  return rows;
}

export function hasModule(school: School, key: 'intake' | 'records') {
  return school.modules.includes(key);
}

// ── 자료 ─────────────────────────────────────────────────
export async function listSources(db: Db, schoolId: string): Promise<SourceFile[]> {
  const { rows } = await db.query<SourceFile>(
    `select f.id, f.kind, f.name, f.mime_type, f.size_bytes, f.sha256, f.sheet_url, f.status, f.status_note,
            f.reader, f.needs_review, f.created_at,
            (select count(*)::int from public.source_rows r where r.file_id = f.id) as row_count
     from public.source_files f where f.school_id = $1 and f.archived_at is null order by f.created_at, f.id`,
    [schoolId]);
  return rows;
}

export async function getSource(db: Db, schoolId: string, id: string) {
  if (!isUuid(id)) throw new NotFoundError('자료를 찾을 수 없습니다.');
  const { rows } = await db.query(
    `select id, kind, name, status, sha256, sheet_url, content, created_at, archived_at
     from public.source_files where id = $1 and school_id = $2`, [id, schoolId]);
  if (!rows[0]) throw new NotFoundError('자료를 찾을 수 없습니다.');
  const { rows: srcRows } = await db.query(
    'select table_key, row_number, location, data from public.source_rows where file_id = $1 order by table_key, row_number', [id]);
  return { ...rows[0], rows: srcRows };
}

export type IncomingFile = { name: string; type: string; bytes: Buffer };

/** 여러 파일을 한 번에 받는다. 이미 등록된 자료는 그대로 두고 목록에 더한다. */
export async function addFiles(db: Db, schoolId: string, files: IncomingFile[]) {
  if (!files.length) throw new ValidationError('추가할 파일이 없습니다.');
  if (files.length > MAX_FILES_PER_UPLOAD) throw new ValidationError(`한 번에 ${MAX_FILES_PER_UPLOAD}개까지 올릴 수 있습니다.`);
  const added: { id: string; name: string; status: string }[] = [];
  for (const f of files) {
    const name = sanitizeName(f.name);
    if (f.bytes.length > MAX_FILE_BYTES) throw new ValidationError(`${name}: 파일별 최대 2MB입니다.`);
    const sha256 = crypto.createHash('sha256').update(f.bytes).digest('hex');
    const result = await readFile(name, f.bytes);
    const isText = result?.ok && result.reader === 'text@1';
    if (!result || !result.ok) {
      // 판독기가 없거나 읽지 못한 파일: 원본만 보관하고 읽기 대기로 표시
      const note = result ? result.note : '이 형식은 아직 읽을 수 없습니다. 파일만 보관했습니다. (CSV·TSV·TXT·XLSX·DOCX·PDF 지원)';
      const { rows: [row] } = await db.query(
        `insert into public.source_files(school_id, kind, name, mime_type, size_bytes, sha256, original, reader, status, status_note)
         values ($1,'file',$2,$3,$4,$5,$6,$7,'pending_reader',$8) returning id`,
        [schoolId, name, f.type || null, f.bytes.length, sha256, f.bytes, result?.reader ?? null, note]);
      added.push({ id: row.id, name, status: 'pending_reader' });
      continue;
    }
    const { rows: [row] } = await db.query(
      `insert into public.source_files(school_id, kind, name, mime_type, size_bytes, sha256, content, original, reader, needs_review, status, status_note)
       values ($1,'file',$2,$3,$4,$5,$6,$7,$8,$9,'parsed',$10) returning id`,
      [schoolId, name, f.type || null, f.bytes.length, sha256, isText ? result.text : null, isText ? null : f.bytes,
        result.reader, result.needsReview, result.note]);
    for (const t of result.tables) {
      for (const r of t.rows) {
        await db.query(
          'insert into public.source_rows(school_id, file_id, table_key, row_number, location, data) values ($1,$2,$3,$4,$5,$6)',
          [schoolId, row.id, t.key, r.rowNumber, r.location, JSON.stringify(r.data)]);
      }
    }
    added.push({ id: row.id, name, status: 'parsed' });
  }
  const analysis = await reanalyze(db, schoolId);
  return { added, analysis };
}

/** 시트 주소 등록. 주소만 등록한 상태와 내용을 읽은 상태를 구분한다. */
export async function addSheetUrls(db: Db, schoolId: string, urls: string[]) {
  const clean = urls.map((u) => String(u ?? '').trim()).filter(Boolean);
  if (!clean.length) throw new ValidationError('시트 주소를 입력해 주세요.');
  if (clean.length > 10) throw new ValidationError('한 번에 10개까지 등록할 수 있습니다.');
  const added: { id: string; name: string; status: string }[] = [];
  for (const u of clean) {
    let parsed: URL;
    try { parsed = new URL(u); } catch { throw new ValidationError(`주소 형식이 아닙니다: ${u}`); }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'docs.google.com' || !parsed.pathname.startsWith('/spreadsheets/')) {
      throw new ValidationError(`Google Sheets 주소만 등록할 수 있습니다: ${u}`);
    }
    const docId = parsed.pathname.split('/')[3] ?? '시트';
    const { rows: [row] } = await db.query(
      `insert into public.source_files(school_id, kind, name, sheet_url, status, status_note)
       values ($1,'sheet',$2,$3,'registered',$4) returning id`,
      [schoolId, `Google Sheets · ${docId.slice(0, 10)}…`, parsed.toString(),
        '주소만 등록했습니다. 시트 읽기 권한이 연결되지 않아 내용은 읽지 않았습니다. 같은 내용을 CSV로 첨부하면 분석에 쓰입니다.']);
    added.push({ id: row.id, name: u, status: 'registered' });
  }
  return { added };
}

/** 목록에서 빼되 원문은 남긴다. (발행본 근거 보존) */
export async function archiveSource(db: Db, schoolId: string, id: string) {
  if (!isUuid(id)) throw new NotFoundError('자료를 찾을 수 없습니다.');
  const { rowCount } = await db.query(
    'update public.source_files set archived_at = now() where id = $1 and school_id = $2 and archived_at is null',
    [id, schoolId]);
  if (!rowCount) throw new NotFoundError('자료를 찾을 수 없습니다.');
  return reanalyze(db, schoolId);
}

// ── 분석과 질문 ───────────────────────────────────────────
/**
 * 현재 자료로 다시 분석한다.
 * - 확정 규칙은 절대 바꾸지 않는다. 다른 결과가 나오면 '확정값과 다름' 질문을 연다.
 * - 같은 자료 조합이면 기존 질문을 유지한다.
 */
export async function reanalyze(db: Db, schoolId: string) {
  const { rows: files } = await db.query(
    `select id, name, sha256 from public.source_files
     where school_id = $1 and status = 'parsed' and archived_at is null order by created_at, id`, [schoolId]);
  // 파일 안의 표(시트·문서 표·PDF 표)마다 따로 분석한다.
  const sources = [];
  for (const f of files) {
    const { rows } = await db.query(
      'select table_key, row_number, location, data from public.source_rows where file_id = $1 order by table_key, row_number', [f.id]);
    const byTable = new Map<string, typeof rows>();
    for (const r of rows) byTable.set(r.table_key, [...(byTable.get(r.table_key) ?? []), r]);
    for (const tableRows of byTable.values()) sources.push({ ...f, rows: tableRows });
  }
  const analysis = analyzePeriods(sources);
  const open = await openQuestion(db, schoolId);
  if (!analysis) return { state: 'no_relevant_sources' as const };
  if (open && (await fingerprintOf(db, open.id)) === analysis.fingerprint) return { state: 'unchanged' as const, questionId: open.id };

  const rule = await latestRule(db, schoolId);
  const sameAsRule = rule && canonical(rule.value) === canonical(analysis.proposal);
  // 결과가 확정값과 같아도 자료끼리 충돌하면(같은 기간의 다른 이름, 없는 기간 참조) 관리자에게 묻는다.
  const conflicts = analysis.issues.some((i) => i.kind === 'conflicting_label' || i.kind === 'unknown_parent');
  if (open) await db.query(`update public.rule_questions set status = 'superseded', answered_at = now() where id = $1`, [open.id]);
  if (sameAsRule && !conflicts) return { state: 'matches_confirmed_rule' as const, ruleId: rule!.id };

  const { rows: [q] } = await db.query(
    `insert into public.rule_questions(school_id, topic, status, prompt, proposal, evidence, issues, analyzer, source_fingerprint, differs_from_rule_id)
     values ($1,'period_structure','open',$2,$3,$4,$5,$6,$7,$8) returning id`,
    [schoolId,
      rule && !sameAsRule ? `확정한 규칙 ${rule.version}판과 새 자료의 분석 결과가 다릅니다. ` + analysis.prompt
      : rule ? `새 자료가 확정한 규칙 ${rule.version}판과 충돌하는 내용을 담고 있습니다. ` + analysis.prompt
      : analysis.prompt,
      JSON.stringify(analysis.proposal), JSON.stringify(analysis.evidence), JSON.stringify(analysis.issues),
      ANALYZER, analysis.fingerprint, rule?.id ?? null]);
  return { state: 'question_opened' as const, questionId: q.id };
}

async function fingerprintOf(db: Db, questionId: string) {
  const { rows } = await db.query('select source_fingerprint from public.rule_questions where id = $1', [questionId]);
  return rows[0]?.source_fingerprint as string | undefined;
}

export async function openQuestion(db: Db, schoolId: string): Promise<Question | null> {
  const { rows } = await db.query<Question>(
    `select id, status, prompt, proposal, evidence, issues, analyzer, differs_from_rule_id, created_at
     from public.rule_questions where school_id = $1 and topic = 'period_structure' and status = 'open'`, [schoolId]);
  return rows[0] ?? null;
}

/** 관리자 확인 작업함용: 이 학교의 모든 확인 질문(최근 순). 상태는 open · answered · superseded */
export async function listQuestions(db: Db, schoolId: string): Promise<(Question & { answered_at: string | null })[]> {
  const { rows } = await db.query<Question & { answered_at: string | null }>(
    `select id, status, prompt, proposal, evidence, issues, analyzer, differs_from_rule_id, created_at, answered_at
     from public.rule_questions where school_id = $1 and topic = 'period_structure'
     order by created_at desc, id limit 200`, [schoolId]);
  return rows;
}

export async function latestRule(db: Db, schoolId: string): Promise<Rule | null> {
  const { rows } = await db.query<Rule>(
    `select id, version, value, decision, rationale, evidence, question_id, confirmed_at from public.school_rules
     where school_id = $1 and topic = 'period_structure' order by version desc limit 1`, [schoolId]);
  return rows[0] ?? null;
}

export async function listRules(db: Db, schoolId: string): Promise<Rule[]> {
  const { rows } = await db.query<Rule>(
    `select id, version, value, decision, rationale, evidence, question_id, confirmed_at from public.school_rules
     where school_id = $1 and topic = 'period_structure' order by version desc`, [schoolId]);
  return rows;
}

/**
 * 관리자 답변을 새 규칙 버전으로 저장한다.
 * decision=accepted 이면 분석 후보를 그대로, edited 이면 관리자가 고친 값과 근거(필수)를 저장한다.
 */
export async function answerQuestion(
  db: Db, schoolId: string, questionId: string,
  input: { decision: 'accepted' | 'edited'; value?: unknown; rationale?: string },
) {
  if (!isUuid(questionId)) throw new NotFoundError('질문을 찾을 수 없습니다.');
  const { rows } = await db.query<Question>(
    `select id, status, proposal, evidence, issues from public.rule_questions where id = $1 and school_id = $2 for update`,
    [questionId, schoolId]);
  const q = rows[0];
  if (!q) throw new NotFoundError('질문을 찾을 수 없습니다.');
  if (q.status !== 'open') throw new ValidationError('이미 처리됐거나 새 자료로 대체된 질문입니다. 화면을 새로 고쳐 주세요.');
  let value: PeriodValue;
  const rationale = (input.rationale ?? '').trim();
  if (input.decision === 'accepted') value = validatePeriodValue(q.proposal);
  else if (input.decision === 'edited') {
    value = validatePeriodValue(input.value);
    if (!rationale) throw new ValidationError('수정한 이유(근거)를 적어 주세요.');
    if (rationale.length > 1000) throw new ValidationError('근거는 1000자 이내로 적어 주세요.');
  } else throw new ValidationError('처리 방식을 선택해 주세요.');

  // 확정 근거: 추정에 쓴 행 + 관리자가 판단한 충돌 행(예: 같은 기간의 다른 이름)
  const evidence: Evidence[] = [
    ...q.evidence,
    ...q.issues.filter((i) => i.evidence).map((i) => ({ ...i.evidence!, claim: `확인한 충돌: ${i.message}` })),
  ];
  const { rows: [{ next }] } = await db.query(
    `select coalesce(max(version), 0) + 1 as next from public.school_rules where school_id = $1 and topic = 'period_structure'`,
    [schoolId]);
  const { rows: [rule] } = await db.query(
    `insert into public.school_rules(school_id, topic, version, value, decision, rationale, evidence, question_id)
     values ($1,'period_structure',$2,$3,$4,$5,$6,$7) returning id, version`,
    [schoolId, next, JSON.stringify(value), input.decision, rationale || null, JSON.stringify(evidence), questionId]);
  await db.query(`update public.rule_questions set status = 'answered', answered_at = now() where id = $1`, [questionId]);
  return rule as { id: string; version: number };
}

// ── 양식 ─────────────────────────────────────────────────
export async function latestTemplate(db: Db, schoolId: string): Promise<Template | null> {
  const { rows } = await db.query<Template>(
    `select id, version, title, period_heading, assessment_heading, footer_note, created_at
     from public.document_templates where school_id = $1 order by version desc limit 1`, [schoolId]);
  return rows[0] ?? null;
}

export async function createTemplateVersion(
  db: Db, schoolId: string,
  input: { title?: string; period_heading?: string; assessment_heading?: string; footer_note?: string },
) {
  const fields = ['title', 'period_heading', 'assessment_heading', 'footer_note'] as const;
  const values: Record<string, string> = {};
  for (const k of fields) {
    const v = String(input[k] ?? '').trim();
    if (!v) throw new ValidationError('양식의 모든 칸을 채워 주세요.');
    if (v.length > 120) throw new ValidationError('양식 문구는 120자 이내로 적어 주세요.');
    values[k] = v;
  }
  const { rows: [{ next }] } = await db.query(
    'select coalesce(max(version), 0) + 1 as next from public.document_templates where school_id = $1', [schoolId]);
  const { rows: [t] } = await db.query(
    `insert into public.document_templates(school_id, version, title, period_heading, assessment_heading, footer_note)
     values ($1,$2,$3,$4,$5,$6) returning id, version`,
    [schoolId, next, values.title, values.period_heading, values.assessment_heading, values.footer_note]);
  return t as { id: string; version: number };
}

// ── 발행 ─────────────────────────────────────────────────
export async function buildSnapshot(
  db: Db, school: School, rule: Rule, template: Template, revision: { number: number; of: string | null },
): Promise<Snapshot> {
  const fileIds = [...new Set(rule.evidence.map((e) => e.file_id))];
  const { rows: sources } = fileIds.length
    ? await db.query('select id, name, sha256 from public.source_files where id = any($1) and school_id = $2 order by created_at', [fileIds, school.id])
    : { rows: [] };
  return {
    format: 'period-report@1',
    school: { name: school.name, locale: school.locale },
    academic_year: 2026,
    student: { label: school.locale === 'ko' ? '예시 학생 01' : 'Example Student 01' },
    template: {
      id: template.id, version: template.version, title: template.title, period_heading: template.period_heading,
      assessment_heading: template.assessment_heading, footer_note: template.footer_note,
    },
    rule: {
      id: rule.id, version: rule.version, value: rule.value, decision: rule.decision,
      rationale: rule.rationale, confirmed_at: new Date(rule.confirmed_at).toISOString(),
    },
    sources,
    revision,
  };
}

/** 확정 규칙과 현재 양식으로 문서 한 장을 발행한다. revisionOf가 있으면 앞선 발행본의 수정본으로 연결한다. */
export async function publishDocument(db: Db, school: School, input: { revisionOf?: string | null } = {}) {
  const rule = await latestRule(db, school.id);
  if (!rule) throw new ValidationError('확정한 학기 규칙이 없습니다. 먼저 관리자 확인을 마쳐 주세요.');
  const template = await latestTemplate(db, school.id);
  if (!template) throw new ValidationError('문서 양식이 없습니다.');
  let revision = { number: 1, of: null as string | null };
  if (input.revisionOf) {
    if (!isUuid(input.revisionOf)) throw new NotFoundError('수정할 발행본을 찾을 수 없습니다.');
    const { rows } = await db.query(
      `select d.id, d.revision_number, exists(select 1 from public.published_documents n where n.revision_of = d.id) as has_next
       from public.published_documents d where d.id = $1 and d.school_id = $2`, [input.revisionOf, school.id]);
    if (!rows[0]) throw new NotFoundError('수정할 발행본을 찾을 수 없습니다.');
    if (rows[0].has_next) throw new ValidationError('이미 수정본이 있는 발행본입니다. 가장 최근 수정본에서 다시 발행해 주세요.');
    revision = { number: rows[0].revision_number + 1, of: rows[0].id };
  }
  const snapshot = await buildSnapshot(db, school, rule, template, revision);
  const json = JSON.stringify(snapshot);
  const sha = snapshotHash(snapshot);
  const { rows: [doc] } = await db.query(
    `insert into public.published_documents(school_id, rule_id, template_id, revision_of, revision_number, snapshot, snapshot_sha256)
     values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [school.id, rule.id, template.id, revision.of, revision.number, json, sha]);
  return doc as { id: string };
}

export async function listDocuments(db: Db, schoolId: string): Promise<PublishedDocument[]> {
  const { rows } = await db.query<PublishedDocument>(
    `select d.id, d.rule_id, d.template_id, d.revision_of, d.revision_number, d.snapshot, d.snapshot_sha256, d.published_at,
            (select n.id from public.published_documents n where n.revision_of = d.id) as superseded_by
     from public.published_documents d where d.school_id = $1 order by d.published_at desc`, [schoolId]);
  return rows;
}

export async function getDocument(db: Db, schoolId: string, id: string): Promise<PublishedDocument> {
  if (!isUuid(id)) throw new NotFoundError('문서를 찾을 수 없습니다.');
  const { rows } = await db.query<PublishedDocument>(
    `select d.id, d.rule_id, d.template_id, d.revision_of, d.revision_number, d.snapshot, d.snapshot_sha256, d.published_at,
            (select n.id from public.published_documents n where n.revision_of = d.id) as superseded_by
     from public.published_documents d where d.id = $1 and d.school_id = $2`, [id, schoolId]);
  if (!rows[0]) throw new NotFoundError('문서를 찾을 수 없습니다.');
  return rows[0];
}

/** 키 순서와 무관한 해시. (jsonb는 키 순서를 바꾸므로 정렬한 표현으로 계산한다) */
export function snapshotHash(value: unknown) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).sort().filter((k) => o[k] !== undefined)
    .map((k) => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}';
}

/** 저장된 스냅샷이 발행 당시 해시와 같은지 확인한다. */
export function verifySnapshot(doc: Pick<PublishedDocument, 'snapshot' | 'snapshot_sha256'>) {
  return snapshotHash(doc.snapshot) === doc.snapshot_sha256;
}

// ── 유틸 ─────────────────────────────────────────────────
export function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function sanitizeName(name: string) {
  const base = String(name || '이름 없는 파일').split(/[\\/]/).pop()!.replace(/[\u0000-\u001f]/g, '').trim();
  return base.slice(0, 160) || '이름 없는 파일';
}
