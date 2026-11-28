import type { Db } from './db';
import { latestPeriodRule } from './academics';
import { applyTemplate, type AcademicTemplate, type ApplyResult } from './academic-templates';
import { listGradeLevels, schoolProfile } from './foundation';
import { presetLevels, type GradeScheme } from './grade-schemes';
import { listSchoolLevels } from './people';
import { ValidationError } from './services';

/**
 * 125차 ADR 0043 3단계 — 템플릿 새 판 제안(ADR 0027 기본판 제안과 같은 뜻).
 * 열린 제안은 저장하지 않고 계산한다: 학교가 쓰는 템플릿의 최신 판이 학교 판보다 높으면 '지금 판 → 최신 판'.
 * 참은 학교 관할 판(template_key·template_version) 하나이고, 학교의 결정(수락·보류·거절)만 기록으로 쌓는다.
 * 수락은 기존 적용 길(applyTemplate)로 새 판을 적용한 뒤 같은 트랜잭션에서 기록한다. 같은 템플릿의 판을 옮기는 길은 이것 하나다.
 */
export type OfferStatus = 'offered' | 'held' | 'declined';
export type TemplateDecision = { id: string; template_key: string; from_version: number; to_version: number; decision: 'accepted' | 'held' | 'declined'; note: string | null; decided_at: string };

export type TemplatePlan = {
  add: { levels: string[]; grades: number; periods: string[]; scales: string[] };
  keep: { scheme: GradeScheme | null; periods: boolean; scales: string[]; hidden: boolean };
};

export type OpenOffer = {
  key: string; from: number; to: number; status: OfferStatus; note: string | null;
  title: Record<string, string>; why: string | null; plan: TemplatePlan;
};

/** 지금 열린 제안(없으면 null). 상태는 그 판에 대한 마지막 결정(보류·거절), 없으면 '제안 중' */
export async function openTemplateOffer(db: Db, schoolId: string): Promise<OpenOffer | null> {
  const p = await schoolProfile(db, schoolId);
  if (!p?.template_key || p.template_version == null) return null;
  const { rows: [t] } = await db.query<{ version: number; title: Record<string, string> }>(
    'select version, title from app.academic_templates() where key = $1', [p.template_key]);
  if (!t || t.version <= p.template_version) return null;
  // 그 판에 대한 마지막 결정(수락 포함). 마지막이 수락인데 지금 판이 다시 낮으면(다른 템플릿을 거쳐 돌아옴) 새로 열린 제안이다(Codex 199번 PR 검토)
  const { rows: [last] } = await db.query<{ decision: OfferStatus | 'accepted'; note: string | null }>(
    `select decision, note from public.academic_template_decisions
      where school_id = $1 and template_key = $2 and to_version = $3 order by decided_at desc limit 1`,
    [schoolId, p.template_key, t.version]);
  const fresh = !last || last.decision === 'accepted';
  const { rows: [w] } = await db.query<{ why: string | null }>('select why from app.academic_template($1, $2)', [p.template_key, t.version]);
  return {
    key: p.template_key, from: p.template_version, to: t.version, status: fresh ? 'offered' : last.decision as OfferStatus, note: fresh ? null : last.note,
    title: t.title, why: w?.why ?? null, plan: await planTemplate(db, schoolId, p.template_key, t.version),
  };
}

/** 지금 쓰는 템플릿에 대한 결정 기록(새것 먼저) */
export async function templateDecisions(db: Db, schoolId: string): Promise<TemplateDecision[]> {
  const p = await schoolProfile(db, schoolId);
  if (!p?.template_key) return [];
  return (await db.query<TemplateDecision>(
    `select id, template_key, from_version, to_version, decision, note, decided_at::text from public.academic_template_decisions
      where school_id = $1 and template_key = $2 order by decided_at desc, to_version desc`, [schoolId, p.template_key])).rows;
}

/**
 * 그 판을 지금 적용하면 무엇이 더해지고 무엇이 학교 값으로 남는지(쓰지 않음). applyTemplate과 같은 규칙:
 * 학년 체계는 학교 것을 지키고, 학기 구조는 없을 때만, 척도는 없는 코드만, 숨길 구획은 학교가 정했으면 그대로.
 */
export async function planTemplate(db: Db, schoolId: string, key: string, version: number): Promise<TemplatePlan> {
  const t = (await db.query<AcademicTemplate>('select * from app.academic_template($1, $2)', [key, version])).rows[0];
  if (!t) throw new ValidationError('err.template.unknown');
  const m = t.manifest;
  const cur = await schoolProfile(db, schoolId);
  const keepScheme = (cur?.grade_scheme ?? null) as GradeScheme | null;
  const scheme = keepScheme ?? m.grade_scheme;
  const levels = await listSchoolLevels(db, schoolId);
  const grades = await listGradeLevels(db, schoolId);
  const addLevels: string[] = []; let addGrades = 0;
  for (const pl of presetLevels(scheme)) {
    if (!m.levels.includes(pl.key)) continue;
    if (!levels.some((l) => l.code === pl.key)) addLevels.push(pl.key);
    addGrades += pl.grades.filter((g) => !grades.some((x) => x.ordinal === g.ordinal)).length;
  }
  const rule = await latestPeriodRule(db, schoolId);
  const { rows } = await db.query<{ code: string }>('select code from public.scales where school_id = $1', [schoolId]);
  const have = new Set(rows.map((r) => r.code));
  return {
    add: { levels: addLevels, grades: addGrades, periods: rule ? [] : m.periods.map((p) => p.label), scales: m.scales.filter((s) => !have.has(s.code)).map((s) => s.code) },
    keep: { scheme: keepScheme && keepScheme !== m.grade_scheme ? keepScheme : null, periods: !!rule, scales: m.scales.filter((s) => have.has(s.code)).map((s) => s.code), hidden: cur?.hidden_sections != null },
  };
}

/**
 * 학교 관리자가 지금 열린 제안을 결정한다. to_version = 화면이 본 새 판(그 사이 더 새 판이 나왔으면 409).
 * 수락: 그 판을 적용(base_version = 지금 학교 관할 판, 지침 10) → 기록. 보류·거절: 기록만(학교 사본은 그대로).
 */
export async function decideTemplateOffer(db: Db, schoolId: string, input: { to_version?: unknown; decision?: unknown; note?: unknown; base_version?: unknown }, locale = 'ko') {
  const decision = String(input.decision ?? '');
  if (!['accepted', 'declined', 'held'].includes(decision)) throw new ValidationError('err.base.decision');
  const to = Number(input.to_version);
  if (!Number.isInteger(to) || to < 2) throw new ValidationError('err.template.version');
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 500) : null;
  // 문구는 DB 함수와 같은 글이라 db.* 이름표로 요청한 사람 언어가 된다(409)
  const conflict = (m: string) => Object.assign(new Error(m), { code: 'P0409' });
  // 모든 결정은 화면이 본 학교 관할 판(base_version)에 묶는다(지침 10). 그 사이 다른 관리자가 템플릿을 바꿨으면 다른 제안에 결정이 남지 않게 거부(Codex 199번 PR 검토)
  const base = Number(input.base_version);
  if (input.base_version == null || input.base_version === '' || !Number.isInteger(base) || base < 0) throw new ValidationError('err.baseVersion');
  const prof = await schoolProfile(db, schoolId);
  if ((prof?.version ?? 0) !== base) throw conflict('그 사이 새 판이 생겼습니다. 최신 판을 다시 읽어 고쳐 주세요.');
  const offer = await openTemplateOffer(db, schoolId);
  if (!offer) throw conflict('학교가 이미 그 판 이상을 써서 지난 제안입니다.');
  if (offer.to !== to) throw conflict('그 사이 새 판이 생겼습니다. 최신 판을 다시 읽어 고쳐 주세요.');
  let applied: ApplyResult | null = null;
  if (decision === 'accepted') applied = await applyTemplate(db, schoolId, { key: offer.key, version: offer.to, base_version: input.base_version }, locale, { viaOffer: true });
  const { rows: [r] } = await db.query('select app.record_template_decision($1, $2, $3, $4, $5) as v',
    [schoolId, offer.key, offer.to, decision, note]);
  return { id: r.v as string, decision, to_version: offer.to, applied };
}

/** 관제: 템플릿 새 판을 낸다(전체 관리자, base_version 필수). 그 템플릿을 쓰는 학교 화면에 제안이 보인다 */
export async function publishAcademicTemplate(db: Db, input: { key?: unknown; title?: unknown; summary?: unknown; manifest?: unknown; why?: unknown; base_version?: unknown; sort_order?: unknown }) {
  const base = Number(input.base_version);
  if (input.base_version == null || input.base_version === '' || !Number.isInteger(base) || base < 0) throw new ValidationError('err.baseVersion');
  if (!input.manifest || typeof input.manifest !== 'object' || Array.isArray(input.manifest)) throw new ValidationError('err.base.content');
  const { rows: [r] } = await db.query('select app.publish_academic_template($1) as v', [JSON.stringify({
    key: String(input.key ?? ''), title: input.title, summary: input.summary ?? {}, manifest: input.manifest,
    why: typeof input.why === 'string' ? input.why : '', base_version: base, ...(input.sort_order != null ? { sort_order: Number(input.sort_order) } : {}),
  })]);
  return r.v as number;
}
