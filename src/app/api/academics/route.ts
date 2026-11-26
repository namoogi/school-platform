import { handle } from '@/lib/api';
import { ValidationError } from '@/lib/services';
import { addAcademicYear, addSchoolLevel, createTermsFromRule, setTermDates } from '@/lib/people';
import { definePeriodRule, latestPeriodRule } from '@/lib/academics';

/**
 * 71차: 학교 구조(학교급·학년도·학기 구조·학기). 쓰기는 기존 명령 함수(학교 관리자 확인은 DB가 한다).
 * body.action: level | year | rule | terms | term-dates
 */
export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const b = await req.json().catch(() => { throw new ValidationError('요청 형식이 올바르지 않습니다.'); });
    switch (b?.action) {
      case 'level': return { id: await addSchoolLevel(db, school.id, { code: b.code, name: b.name, sortOrder: Number.isInteger(b.sortOrder) ? b.sortOrder : 0 }) };
      case 'year': return { id: await addAcademicYear(db, school.id, { label: b.label, startsOn: b.startsOn, endsOn: b.endsOn }) };
      case 'rule': return definePeriodRule(db, school.id, { periods: b.periods, rationale: b.rationale, base_version: b.base_version });
      case 'terms': {
        const rule = await latestPeriodRule(db, school.id);
        if (!rule) throw new ValidationError('학기 구조를 먼저 정해 주세요.');
        return { created: await createTermsFromRule(db, school.id, b.yearId, rule.id), rule_version: rule.version };
      }
      case 'term-dates': await setTermDates(db, school.id, b.termId, b.startsOn, b.endsOn); return { ok: true };
      default: throw new ValidationError('알 수 없는 작업입니다.');
    }
  }, { module: 'records', admin: true });
}
