import type { Db } from './db';
import { schoolProfile, setSchoolProfile } from './foundation';
import { ValidationError } from './services';

/**
 * 118차 ADR 0043 — 학교가 숨길 구획(석차·평점·석차등급·교시 출결).
 * 값은 학교 관할 판(school_profiles.hidden_sections)에 있는 학교 사본이다. 템플릿을 처음 고를 때 템플릿 hide 를 복사하고,
 * 그 뒤에는 학교가 고친다. 화면·발행본은 이 함수로만 읽는다(구획을 숨기는 곳이 늘어도 읽는 길은 하나).
 */
export const HIDEABLE = ['rank', 'gpa', 'rank_grade', 'period_attendance'] as const;
export type Hideable = (typeof HIDEABLE)[number];

export async function hiddenSections(db: Db, schoolId: string): Promise<Set<Hideable>> {
  const p = await schoolProfile(db, schoolId);
  return new Set(((p?.hidden_sections ?? []) as string[]).filter((x): x is Hideable => (HIDEABLE as readonly string[]).includes(x)));
}

/** 학교가 숨길 구획을 고친다(학교 관리자, base_version 필수 — 지침 10) */
export async function setHiddenSections(db: Db, schoolId: string, input: { sections?: unknown; base_version?: unknown }) {
  const base = Number(input.base_version);
  if (input.base_version == null || input.base_version === '' || !Number.isInteger(base) || base < 0) throw new ValidationError('err.baseVersion');
  const list = Array.isArray(input.sections) ? input.sections.map(String) : [];
  if (list.some((x) => !(HIDEABLE as readonly string[]).includes(x))) throw new ValidationError('err.sections.unknown');
  const prev = await schoolProfile(db, schoolId);
  return setSchoolProfile(db, schoolId, {
    country: prev?.country ?? '', sector: prev?.sector ?? '', accreditation: prev?.accreditation ?? '', external_codes: prev?.external_codes ?? {},
    why: '숨길 구획', hidden_sections: list, base_version: base,
  });
}
