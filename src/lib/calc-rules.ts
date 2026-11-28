import type { Db } from './db';
import { safeId, ValidationError } from './services';
import { checkSpec, evaluate, sanitizeInput, type CalcOutput, type CalcSpec } from './calc/expr';

/** ADR 0040: 학교 계산식 판 읽기·저장·미리 계산 */
export type CalcRule = { code: string; version: number; title: Record<string, string>; spec: CalcSpec; why: string | null; created_at: string };

/** 이름마다 최신 판 */
export async function listCalcRules(db: Db, schoolId: string): Promise<CalcRule[]> {
  const { rows } = await db.query(
    `select distinct on (code) code, version, title, spec, why, created_at from public.calc_rules
      where school_id = $1 order by code, version desc`, [schoolId]);
  return rows as CalcRule[];
}

export async function calcRuleHistory(db: Db, schoolId: string, code: string): Promise<CalcRule[]> {
  const { rows } = await db.query(
    `select code, version, title, spec, why, created_at from public.calc_rules where school_id = $1 and code = $2 order by version desc limit 50`, [schoolId, code]);
  return rows as CalcRule[];
}

export async function saveCalcRule(db: Db, schoolId: string, input: Record<string, unknown>) {
  const issues = checkSpec(input.spec);
  // 문제 목록은 미리 계산(preview)이 돌려준다. 오류에는 개수와 첫 자리만(ADR 0039: 이름표 + 값)
  if (issues.length) throw new ValidationError('err.calcSpecInvalid', { count: issues.length, path: safeId(issues[0].path || '-') });
  // 이름은 언어 칸(두 글자) → 글자만 남긴다. 글자가 아닌 값이 저장되면 목록 화면이 깨진다(Codex #228)
  const raw = input.title && typeof input.title === 'object' && !Array.isArray(input.title) ? input.title as Record<string, unknown> : {};
  const clean = Object.fromEntries(Object.entries(raw).filter(([k, v]) => /^[a-z]{2}$/.test(k) && typeof v === 'string' && v.trim()).map(([k, v]) => [k, (v as string).trim().slice(0, 200)]));
  const title = Object.keys(clean).length ? clean : undefined;
  const { rows: [r] } = await db.query('select app.save_calc_rule($1, $2) as v', [schoolId, JSON.stringify({
    code: input.code, title, spec: input.spec, why: typeof input.why === 'string' ? input.why : null, base_version: Number(input.base_version ?? 0),
  })]);
  return { version: r.v as number };
}

/** 저장하지 않고 견본 입력으로 계산해 보기(학생 자료 없이 합성 입력) */
export function previewCalc(spec: unknown, samples: unknown): { issues: ReturnType<typeof checkSpec>; results: (CalcOutput & { label: string })[] } {
  const issues = checkSpec(spec);
  if (issues.length) return { issues, results: [] };
  const list = Array.isArray(samples) ? samples.slice(0, 50) : [];
  return {
    issues,
    results: list.map((s, i) => {
      const o = (s && typeof s === 'object' && !Array.isArray(s) ? s : {}) as { label?: unknown };
      // 견본 모양이 틀려도(예: items: null) 500 이 아니라 '자료 없음'으로 계산한다(sanitizeInput)
      return { label: typeof o.label === 'string' ? o.label.slice(0, 40) : `#${i + 1}`, ...evaluate(spec as CalcSpec, sanitizeInput(o)) };
    }),
  };
}

/**
 * 131차: 계산식 편집 화면이 저장 전에 돌리는 경계값 견본(학생 자료 없음).
 * 89.5 = A/B(90) 반올림 경계, 59.5 = 이수(60) 반올림 경계, 39.5 = 미이수(40) 반올림 경계. 평가 항목 하나(total, 만점 100)·출석 100%
 */
export const BOUNDARY_SCORES = [89.5, 59.5, 39.5] as const;
export const boundarySamples = (label: (score: number) => string) => BOUNDARY_SCORES.map((score) => ({
  label: label(score), items: { total: { score, max: 100, weight: 100 } }, attendance: { rate: 1 }, credits: 1,
}));
