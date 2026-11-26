import type { Db } from './db';
import { validatePeriodValue, type PeriodValue } from './analyze';
import { isUuid, NotFoundError, ValidationError } from './services';

/**
 * 71차: 학사 화면용 묶음. 쓰기는 기존 app.* 명령 함수(people.ts·foundation.ts)를 그대로 쓰고, 여기에는 화면이 필요로 하는 읽기와
 * '학기 구조 직접 정하기'(자료 첨부 없이 관리자가 근거와 함께 새 확정 규칙 판을 만드는 길)만 둔다.
 */
export type RuleSummary = { id: string; version: number; value: PeriodValue; decision: string; rationale: string | null; confirmed_at: string };
export async function latestPeriodRule(db: Db, schoolId: string): Promise<RuleSummary | null> {
  const { rows } = await db.query<RuleSummary>(
    `select id, version, value, decision, rationale, confirmed_at from public.school_rules
      where school_id = $1 and topic = 'period_structure' order by version desc limit 1`, [schoolId]);
  return rows[0] ?? null;
}

/** 학기 구조 새 판(관리자, 근거 필수). base_version 으로 동시 수정 409. 기존 판은 그대로 남는다(지침 4·6) */
export async function definePeriodRule(db: Db, schoolId: string, input: { periods?: unknown; rationale?: unknown; base_version?: unknown }) {
  const value = validatePeriodValue({ periods: input.periods });
  const rationale = typeof input.rationale === 'string' ? input.rationale.trim() : '';
  if (!rationale) throw new ValidationError('학기 구조를 정한 근거(예: 학교 학사 규정)를 적어 주세요.');
  if (rationale.length > 1000) throw new ValidationError('근거는 1000자 이내로 적어 주세요.');
  const cur = await latestPeriodRule(db, schoolId);
  const base = Number(input.base_version ?? 0);
  if ((cur?.version ?? 0) !== base) throw Object.assign(new Error('그 사이 새 판이 생겼습니다. 새로 고친 뒤 다시 정해 주세요.'), { code: 'P0409' });
  const { rows: [r] } = await db.query(
    `insert into public.school_rules(school_id, topic, version, value, decision, rationale, evidence, confirmed_by)
     values ($1, 'period_structure', $2, $3, 'edited', $4, '[]', app.uid()) returning id, version`,
    [schoolId, base + 1, JSON.stringify(value), rationale]);
  return r as { id: string; version: number };
}

export type EnrollmentOfPerson = { id: string; level: string; level_name: string; status: string; starts_on: string; ends_on: string | null; note: string | null };
export async function personEnrollments(db: Db, schoolId: string, personId: unknown): Promise<EnrollmentOfPerson[]> {
  if (typeof personId !== 'string' || !isUuid(personId)) throw new NotFoundError('사람을 찾을 수 없습니다.');
  return (await db.query<EnrollmentOfPerson>(
    `select e.id, l.code as level, l.name as level_name, e.status, to_char(e.starts_on, 'YYYY-MM-DD') as starts_on, to_char(e.ends_on, 'YYYY-MM-DD') as ends_on, e.note
       from public.enrollments_school e join public.school_levels l on l.id = e.school_level_id
      where e.school_id = $1 and e.person_id = $2 order by e.starts_on desc`, [schoolId, personId])).rows;
}

/** 오늘 재적 중인 사람 id 묶음(목록 표시용) */
export async function enrolledToday(db: Db, schoolId: string): Promise<Record<string, string>> {
  const { rows } = await db.query<{ person_id: string; level_name: string }>(
    `select e.person_id, l.name as level_name from public.enrollments_school e join public.school_levels l on l.id = e.school_level_id
      where e.school_id = $1 and e.status = 'enrolled' and e.starts_on <= current_date`, [schoolId]);
  return Object.fromEntries(rows.map((r) => [r.person_id, r.level_name]));
}
