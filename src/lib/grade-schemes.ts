import type { Db } from './db';
import { addGradeLevel, listGradeLevels, schoolProfile, setSchoolProfile, type GradeLevel, type LText } from './foundation';
import { addSchoolLevel, listSchoolLevels } from './people';
import { ValidationError } from './services';

/**
 * 109차 ADR 0043 — 학교급·학년 체계.
 * 학년 행(grade_levels)은 정규 서수(PK=-1, K=0, 1~12)를 가진다. 학년 체계는 그 서수를 부르는 방식이다.
 * - kr: 초1~초6 / 중1~중3 / 고1~고3
 * - us: K / Grade 1~5, Grade 6~8, Grade 9~12
 * - custom: 학교가 학년마다 적은 표기(grade_levels.label)를 그대로 쓴다
 * 체계는 학교 관할 판(school_profiles.grade_scheme)에 판으로 쌓는다. 학년 행·학교급은 고치지 않고 빠진 것만 더한다.
 */

export const GRADE_SCHEMES = ['kr', 'us', 'custom'] as const;
export type GradeScheme = (typeof GRADE_SCHEMES)[number];
export const LEVEL_KEYS = ['elementary', 'middle', 'high'] as const;
export type LevelKey = (typeof LEVEL_KEYS)[number];

type PresetGrade = { code: string; ordinal: number; label: LText };
type PresetLevel = { key: LevelKey; name: LText; grades: PresetGrade[] };

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const KR: PresetLevel[] = [
  { key: 'elementary', name: { ko: '초등', en: 'Elementary' }, grades: range(1, 6).map((n) => ({ code: `e${n}`, ordinal: n, label: { ko: `초${n}`, en: `Elementary ${n}` } })) },
  { key: 'middle', name: { ko: '중등', en: 'Middle' }, grades: range(1, 3).map((n) => ({ code: `m${n}`, ordinal: n + 6, label: { ko: `중${n}`, en: `Middle ${n}` } })) },
  { key: 'high', name: { ko: '고등', en: 'High' }, grades: range(1, 3).map((n) => ({ code: `h${n}`, ordinal: n + 9, label: { ko: `고${n}`, en: `High ${n}` } })) },
];
const usGrade = (n: number): PresetGrade => n === 0
  ? { code: 'gk', ordinal: 0, label: { en: 'K', ko: '유치부(K)' } }
  : { code: `g${n}`, ordinal: n, label: { en: `Grade ${n}`, ko: `${n}학년` } };
const US: PresetLevel[] = [
  { key: 'elementary', name: { en: 'Elementary', ko: '초등' }, grades: range(0, 5).map(usGrade) },
  { key: 'middle', name: { en: 'Middle', ko: '중등' }, grades: range(6, 8).map(usGrade) },
  { key: 'high', name: { en: 'High', ko: '고등' }, grades: range(9, 12).map(usGrade) },
];

/** 체계별 기본 구성. custom 은 한국식 자리에서 시작해 표기만 학교가 바꾼다. */
export function presetLevels(scheme: GradeScheme): PresetLevel[] {
  return scheme === 'us' ? US : KR;
}

const KR_BY_ORDINAL = new Map(KR.flatMap((l) => l.grades).map((g) => [g.ordinal, g.label]));
const US_BY_ORDINAL = new Map(US.flatMap((l) => l.grades).map((g) => [g.ordinal, g.label]));

const pick = (l: LText | undefined, lang: string) => (l ? l[lang] ?? l.ko ?? l.en ?? Object.values(l)[0] : undefined);

/**
 * 화면 표기: kr·us 는 서수로 정한다. custom 은 판의 표기(서수 → 글)가 먼저, 없으면 학년 행 표기.
 * 체계에 없는 서수(PK 등)는 학년 행 표기.
 */
export function gradeLabel(g: Pick<GradeLevel, 'ordinal' | 'label'>, scheme: GradeScheme | null, lang: string, customLabels: Record<string, string> = {}): string {
  if (scheme === 'custom' && customLabels[String(g.ordinal)]) return customLabels[String(g.ordinal)];
  const preset = scheme === 'kr' ? KR_BY_ORDINAL.get(g.ordinal) : scheme === 'us' ? US_BY_ORDINAL.get(g.ordinal) : undefined;
  return pick(preset, lang) ?? pick(g.label, lang) ?? String(g.ordinal);
}

export type SchemeView = {
  scheme: GradeScheme | null; profileVersion: number;
  levels: { id: string; code: string; name: string; grades: { id: string; code: string; ordinal: number; label: string }[] }[];
  loose: { id: string; code: string; ordinal: number; label: string }[];
};

export async function schemeView(db: Db, schoolId: string, lang: string): Promise<SchemeView> {
  // 한 연결(트랜잭션)이라 차례로 읽는다
  const profile = await schoolProfile(db, schoolId);
  const levels = await listSchoolLevels(db, schoolId);
  const grades = await listGradeLevels(db, schoolId);
  const scheme = (profile?.grade_scheme ?? null) as GradeScheme | null;
  const custom = (profile?.grade_labels ?? {}) as Record<string, string>;
  const show = (g: GradeLevel) => ({ id: g.id, code: g.code, ordinal: g.ordinal, label: gradeLabel(g, scheme, lang, custom) });
  return {
    scheme, profileVersion: profile?.version ?? 0,
    levels: levels.map((l) => ({ id: l.id, code: l.code, name: l.name, grades: grades.filter((g) => g.school_level_id === l.id).map(show) })),
    loose: grades.filter((g) => !g.school_level_id).map(show),
  };
}

export type ApplyInput = { scheme?: unknown; levels?: unknown; labels?: unknown; why?: unknown; base_version?: unknown;
  /** 113차: 템플릿 적용이 같은 관할 판에 템플릿 키·판을 함께 남길 때. 115차: 처음 고를 때는 숨길 구획도 복사 */
  template?: { key: string; version: number; hidden?: string[] } };

/**
 * 학교급·학년을 체계대로 만든다. 이미 있는 학교급(같은 코드)과 학년(같은 **서수**)은 그대로 두고 빠진 것만 더한다.
 * 학년의 정체는 서수다: 한국식 e1 과 미국식 g1 은 같은 학년이라, 체계를 바꿔도 학년 행이 둘로 늘지 않는다.
 * 학교급 경계는 처음 만든 때를 따른다(한국식으로 만든 뒤 미국식으로 바꾸면 6학년은 초등에 남는다).
 * 쓰기는 기존 명령 함수(app.add_school_level·add_grade_level·set_school_profile)만 쓴다.
 * labels: custom 일 때 학년 코드 → 표기(예: { e1: '씨앗반' }). 학년 행이 아니라 학교 관할 판(grade_labels, 서수 열쇠)에 쌓는다.
 */
export async function applyGradeScheme(db: Db, schoolId: string, input: ApplyInput, locale = 'ko') {
  const scheme = String(input.scheme ?? '') as GradeScheme;
  if (!GRADE_SCHEMES.includes(scheme)) throw new ValidationError('err.scheme.unknown');
  const wanted = Array.isArray(input.levels) ? input.levels.map(String).filter((k): k is LevelKey => (LEVEL_KEYS as readonly string[]).includes(k)) : [];
  if (!wanted.length) throw new ValidationError('err.scheme.levels');
  const labels = input.labels && typeof input.labels === 'object' && !Array.isArray(input.labels) ? input.labels as Record<string, unknown> : {};
  // 지침 10: 판으로 쌓는 쓰기는 보고 고친 판을 받는다. 학년을 만들기 전에 먼저 본다(낡은 판이면 아무것도 만들지 않음)
  const base = Number(input.base_version);
  if (input.base_version == null || input.base_version === '' || !Number.isInteger(base) || base < 0) throw new ValidationError('err.baseVersion');
  const lang = locale;
  const levels = await listSchoolLevels(db, schoolId);
  const grades = await listGradeLevels(db, schoolId);
  const made = { levels: 0, grades: 0 };
  const prev = await schoolProfile(db, schoolId);
  if ((prev?.version ?? 0) !== base) throw Object.assign(new Error('그 사이 새 판이 생겼습니다. 최신 판을 다시 읽어 고쳐 주세요.'), { code: 'P0409' });
  // 커스텀 표기는 직전 판 표기에 이번에 적은 것을 덮어 잇는다
  const customByOrdinal: Record<string, string> = { ...((prev?.grade_labels ?? {}) as Record<string, string>) };
  for (const [i, pl] of presetLevels(scheme).entries()) {
    if (!wanted.includes(pl.key)) continue;
    let levelId = levels.find((l) => l.code === pl.key)?.id;
    if (!levelId) {
      levelId = await addSchoolLevel(db, schoolId, { code: pl.key, name: pick(pl.name, lang), sortOrder: i + 1 });
      made.levels++;
    }
    for (const g of pl.grades) {
      const custom = scheme === 'custom' && typeof labels[g.code] === 'string' ? (labels[g.code] as string).trim().slice(0, 40) : '';
      if (custom) customByOrdinal[String(g.ordinal)] = custom;
      if (grades.some((x) => x.ordinal === g.ordinal)) continue;
      await addGradeLevel(db, schoolId, { levelId, code: g.code, label: custom ? { ko: custom } : g.label, ordinal: g.ordinal, sortOrder: g.ordinal + 10 });
      made.grades++;
    }
  }
  const version = await setSchoolProfile(db, schoolId, {
    country: prev?.country ?? '', sector: prev?.sector ?? '', accreditation: prev?.accreditation ?? '', external_codes: prev?.external_codes ?? {},
    why: typeof input.why === 'string' && input.why.trim() ? input.why : `학년 체계: ${scheme}`, grade_scheme: scheme, grade_labels: customByOrdinal,
    ...(input.template ? { template_key: input.template.key, template_version: input.template.version } : {}),
    ...(input.template?.hidden ? { hidden_sections: input.template.hidden } : {}),
    base_version: base,
  });
  return { scheme, version, ...made };
}
