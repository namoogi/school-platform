import type { Db } from './db';
import { latestPeriodRule } from './academics';
import { applyTemplate, type AcademicTemplate, type ApplyResult } from './academic-templates';
import { listGradeLevels, schoolProfile } from './foundation';
import { presetLevels, type GradeScheme } from './grade-schemes';
import { listSchoolLevels } from './people';
import { isUuid, NotFoundError, ValidationError } from './services';

/**
 * 121차 ADR 0043 3단계 — 템플릿 새 판 제안(ADR 0027 기본판 제안과 같은 모양).
 * 관제가 템플릿 새 판을 내면 그 템플릿을 쓰는 학교마다 제안이 생긴다(DB 함수). 학교는 미리 보기를 보고 수락·보류·거절한다.
 * 수락은 기존 적용 길(applyTemplate)로 새 판을 적용한 뒤 같은 트랜잭션에서 기록한다. 갱신하는 길은 이것 하나다.
 */
export type TemplateOffer = { id: string; template_key: string; from_version: number; to_version: number; status: 'offered' | 'accepted' | 'declined' | 'held'; note: string | null; created_at: string; decided_at: string | null };

/** 지금 쓰는 템플릿의 제안(열린 것 먼저, 높은 판 먼저). 다른 템플릿으로 바꾼 뒤 남은 옛 제안은 보이지 않는다 */
export async function templateOffers(db: Db, schoolId: string): Promise<TemplateOffer[]> {
  const p = await schoolProfile(db, schoolId);
  if (!p?.template_key) return [];
  return (await db.query<TemplateOffer>(
    `select id, template_key, from_version, to_version, status, note, created_at::text, decided_at::text from public.academic_template_offers
      where school_id = $1 and template_key = $2 order by (status in ('offered', 'held')) desc, to_version desc`, [schoolId, p.template_key])).rows;
}

export type TemplatePlan = {
  add: { levels: string[]; grades: number; periods: string[]; scales: string[] };
  keep: { scheme: GradeScheme | null; periods: boolean; scales: string[]; hidden: boolean };
};

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
  const hiddenDecided = cur?.hidden_sections != null;
  return {
    add: { levels: addLevels, grades: addGrades, periods: rule ? [] : m.periods.map((p) => p.label), scales: m.scales.filter((s) => !have.has(s.code)).map((s) => s.code) },
    keep: { scheme: keepScheme && keepScheme !== m.grade_scheme ? keepScheme : null, periods: !!rule, scales: m.scales.filter((s) => have.has(s.code)).map((s) => s.code), hidden: hiddenDecided },
  };
}

/**
 * 학교 관리자가 제안을 결정한다. 수락: 그 판을 적용(base_version = 지금 학교 관할 판, 지침 10) → DB에 수락 기록.
 * DB 함수는 적용되지 않은 판의 수락을 막는다. 거절·보류는 기록만 한다(학교 사본은 그대로).
 */
export async function decideTemplateOffer(db: Db, schoolId: string, input: { offerId?: unknown; decision?: unknown; note?: unknown; base_version?: unknown }, locale = 'ko') {
  if (typeof input.offerId !== 'string' || !isUuid(input.offerId)) throw new NotFoundError('err.tplOffer.notFound');
  const decision = String(input.decision ?? '');
  if (!['accepted', 'declined', 'held'].includes(decision)) throw new ValidationError('err.base.decision');
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 500) : null;
  const { rows: [o] } = await db.query<TemplateOffer>('select * from public.academic_template_offers where id = $1 and school_id = $2', [input.offerId, schoolId]);
  if (!o) throw new NotFoundError('err.tplOffer.notFound');
  let applied: ApplyResult | null = null;
  if (decision === 'accepted') applied = await applyTemplate(db, schoolId, { key: o.template_key, version: o.to_version, base_version: input.base_version }, locale);
  const { rows: [r] } = await db.query('select app.decide_template_offer($1, $2, $3, $4) as v', [schoolId, o.id, decision, note]);
  return { ...(r.v as { status: string; to_version: number }), applied };
}

/** 관제: 템플릿 새 판을 낸다(전체 관리자, base_version 필수). 그 템플릿을 쓰는 학교에 제안이 생긴다 */
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

export type OfferView = TemplateOffer & { title: Record<string, string>; why: string | null; plan: TemplatePlan | null };

/** 화면용: 제안마다 새 판 제목·바뀐 이유, 열린 제안에는 미리 보기(더해지는 것 / 학교 값 유지)까지 */
export async function templateOfferViews(db: Db, schoolId: string): Promise<OfferView[]> {
  const out: OfferView[] = [];
  for (const o of await templateOffers(db, schoolId)) {
    const t = (await db.query<{ title: Record<string, string>; why: string | null }>('select title, why from app.academic_template($1, $2)', [o.template_key, o.to_version])).rows[0];
    const open = o.status !== 'accepted';
    out.push({ ...o, title: t?.title ?? { ko: o.template_key }, why: t?.why ?? null, plan: open && t ? await planTemplate(db, schoolId, o.template_key, o.to_version) : null });
  }
  return out;
}
