import type { Db } from './db';
import { definePeriodRule, latestPeriodRule } from './academics';
import { schoolProfile } from './foundation';
import { applyGradeScheme, gradeLabel, presetLevels, type GradeScheme, type LevelKey } from './grade-schemes';
import { saveScale, saveScalePreset, SCALE_PRESETS, type Band } from './grading';
import { ValidationError } from './services';

/**
 * 113차 ADR 0043 2단계 — 학사 관리 템플릿.
 * 템플릿은 관제 영역의 판(`academic_templates`)이다. 학교는 `app.academic_templates()`로 최신 판만 본다.
 * 고르면 그 판의 내용을 학교 사본으로 만든다: 학교급·학년(학년 체계) → 학기 구조 규칙 판 → 척도.
 * 이미 학교에 있는 것은 덮어쓰지 않고 그대로 둔다(ADR 0027 '학교 값 유지'). 쓰기는 모두 기존 명령 함수로만 한다.
 * 계산식은 견본 이름만 보여 주고 복사하지 않는다(계산식 엔진·견본은 관제 몫, ADR 0040·0041). 마감 때 학교가 고른다.
 */

export type TemplateScale = { code: string; preset?: string; kind?: string; bands?: Band[]; why?: string };
export type TemplateManifest = {
  grade_scheme: GradeScheme; levels: LevelKey[]; periods: { id: string; label: string }[]; scales: TemplateScale[];
  calc_samples: string[]; attendance: 'day' | 'period' | 'day_period'; outputs: string[]; hide: string[];
};
export type AcademicTemplate = {
  key: string; version: number; sort_order: number; title: Record<string, string>; summary: Record<string, string>; manifest: TemplateManifest;
};

export async function listTemplates(db: Db): Promise<AcademicTemplate[]> {
  return (await db.query<AcademicTemplate>('select * from app.academic_templates() order by sort_order, key')).rows;
}

/** 카드·비교표에 보일 학년 미리보기(학교급마다 첫 학년~끝 학년) */
export function gradePreview(m: TemplateManifest, lang: string) {
  return presetLevels(m.grade_scheme).filter((l) => m.levels.includes(l.key))
    .map((l) => ({ level: l.key, first: gradeLabel(l.grades[0], m.grade_scheme, lang), last: gradeLabel(l.grades.at(-1)!, m.grade_scheme, lang), n: l.grades.length }));
}

export type ApplyResult = {
  key: string; version: number; profileVersion: number;
  made: { levels: number; grades: number; periods: number; scales: string[] };
  kept: { periods: boolean; scales: string[]; scheme: GradeScheme | null };
};

/**
 * 템플릿을 학교에 적용한다(학교 관리자). base_version = 지금 학교 관할 판 번호(지침 10).
 * 같은 템플릿을 다시 적용해도 빠진 것만 더한다. 다른 템플릿으로 바꾸면 새 학교급·학년·척도만 더해지고 있던 것은 그대로다.
 */
export async function applyTemplate(db: Db, schoolId: string, input: { key?: unknown; version?: unknown; base_version?: unknown }, locale = 'ko'): Promise<ApplyResult> {
  const key = String(input.key ?? '');
  // 늘 이름 댄 판 그대로 적용한다(판 번호 필수). 그 사이 새 판이 나와도 본 판이 들어가고, 보지 않은 판은 들어가지 않는다(Codex #180)
  const ver = Number(input.version);
  if (input.version == null || input.version === '' || !Number.isInteger(ver) || ver < 1) throw new ValidationError('err.template.version');
  const t = (await db.query<AcademicTemplate>('select * from app.academic_template($1, $2)', [key, ver])).rows[0];
  if (!t) throw new ValidationError('err.template.unknown');
  const m = t.manifest;
  const base = Number(input.base_version);
  if (input.base_version == null || input.base_version === '' || !Number.isInteger(base) || base < 0) throw new ValidationError('err.baseVersion');

  // 1) 학교급·학년 + 관할 판(학년 체계·템플릿 키·판을 한 판에).
  //    학교가 이미 학년 체계를 정했으면 그 체계를 지킨다(학교 값 유지, Codex #180). 처음일 때만 템플릿 체계를 쓴다
  const cur = await schoolProfile(db, schoolId);
  const keepScheme = (cur?.grade_scheme ?? null) as GradeScheme | null;
  // 118차: 숨길 구획은 학교가 아직 정하지 않았을 때(null)만 템플릿에서 복사한다.
  // 한 번 정해지면(템플릿 복사든 학교가 직접 저장이든) 다시 채우기·새 판·다른 템플릿에도 학교 값을 지킨다(Codex #191)
  const firstTemplate = cur?.hidden_sections == null;
  const scheme = await applyGradeScheme(db, schoolId, {
    scheme: keepScheme ?? m.grade_scheme, levels: m.levels, base_version: base, why: `템플릿: ${key} ${t.version}판`,
    template: { key, version: t.version, ...(firstTemplate ? { hidden: m.hide } : {}) },
  }, locale);

  // 2) 학기 구조: 학교에 규칙 판이 없을 때만 템플릿 학기로 1판을 만든다
  let periods = 0; let keptPeriods = false;
  if (await latestPeriodRule(db, schoolId)) keptPeriods = true;
  else {
    await definePeriodRule(db, schoolId, {
      periods: m.periods.map((p) => ({ id: p.id, label: p.label, assessments: [] })), rationale: `템플릿 ${key} ${t.version}판의 학기 구조`, base_version: 0,
    });
    periods = m.periods.length;
  }

  // 3) 척도: 학교에 같은 코드가 없을 때만 만든다(미리 만든 척도는 이름으로, 템플릿 고유 척도는 띠 그대로)
  const { rows } = await db.query<{ code: string }>('select code from public.scales where school_id = $1', [schoolId]);
  const have = new Set(rows.map((r) => r.code));
  const madeScales: string[] = []; const keptScales: string[] = [];
  for (const s of m.scales) {
    if (have.has(s.code)) { keptScales.push(s.code); continue; }
    if (s.preset != null) {
      // 미리 만든 척도 이름이 모르는 것이면 띠 없이 저장으로 넘어가지 않고 멈춘다(DB 검사와 같은 목록)
      if (!(s.preset in SCALE_PRESETS)) throw new ValidationError('err.template.unknown');
      await saveScalePreset(db, schoolId, s.preset as keyof typeof SCALE_PRESETS, s.code);
    } else await saveScale(db, schoolId, { code: s.code, kind: s.kind, bands: s.bands, why: s.why, base_version: 0 });
    madeScales.push(s.code);
  }
  return {
    key, version: t.version, profileVersion: scheme.version,
    made: { levels: scheme.levels, grades: scheme.grades, periods, scales: madeScales },
    kept: { periods: keptPeriods, scales: keptScales, scheme: keepScheme && keepScheme !== m.grade_scheme ? keepScheme : null },
  };
}

/** 학교가 고른 템플릿(관할 판에 남은 키·판)과 그 템플릿의 최신 판 */
export async function schoolTemplate(db: Db, schoolId: string) {
  const p = await schoolProfile(db, schoolId);
  if (!p?.template_key) return null;
  const latest = (await listTemplates(db)).find((x) => x.key === p.template_key) ?? null;
  return { key: p.template_key as string, version: p.template_version as number, latest, profileVersion: p.version as number };
}

export type SetupStep = { key: string; done: boolean; href: string };

/** 남은 설정 점검표: 앞에서부터 차례로. 템플릿이 채운 단계는 끝난 것으로 보인다 */
export async function setupChecklist(db: Db, schoolId: string): Promise<SetupStep[]> {
  const { rows: [c] } = await db.query<Record<string, number | boolean>>(
    `select
       exists(select 1 from public.school_profiles where school_id = $1 and template_key is not null) as template,
       (select count(*)::int from public.grade_levels where school_id = $1) as grades,
       exists(select 1 from public.school_rules where school_id = $1 and topic = 'period_structure') as rule,
       (select count(*)::int from public.academic_years where school_id = $1) as years,
       (select count(*)::int from public.terms where school_id = $1 and starts_on is not null) as dated_terms,
       (select count(*)::int from public.calendar_days where school_id = $1) as days,
       (select count(*)::int from public.homerooms where school_id = $1) as homerooms,
       (select count(*)::int from public.enrollments_school where school_id = $1) as enrolled,
       (select count(*)::int from public.course_offerings where school_id = $1) as offerings`, [schoolId]);
  return [
    { key: 'template', done: !!c.template, href: '/academics/templates' },
    { key: 'grades', done: Number(c.grades) > 0, href: '/academics' },
    { key: 'terms', done: !!c.rule, href: '/academics' },
    { key: 'year', done: Number(c.years) > 0 && Number(c.dated_terms) > 0, href: '/academics' },
    { key: 'calendar', done: Number(c.days) > 0, href: '/attendance' },
    { key: 'people', done: Number(c.enrolled) > 0 && Number(c.homerooms) > 0, href: '/people' },
    { key: 'courses', done: Number(c.offerings) > 0, href: '/courses' },
  ];
}
