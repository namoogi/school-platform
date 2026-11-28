import { handle } from '@/lib/api';
import { ValidationError } from '@/lib/services';
import { addAcademicYear, addSchoolLevel, createTermsFromRule, setTermDates } from '@/lib/people';
import { definePeriodRule, latestPeriodRule } from '@/lib/academics';
import { applyGradeScheme } from '@/lib/grade-schemes';
import { applyTemplate } from '@/lib/academic-templates';
import { setHiddenSections } from '@/lib/sections';
import { decideTemplateOffer } from '@/lib/template-offers';

/**
 * 71차: 학교 구조(학교급·학년도·학기 구조·학기). 쓰기는 기존 명령 함수(학교 관리자 확인은 DB가 한다).
 * body.action: level | year | rule | terms | term-dates | grade-scheme(109차) | template(113차) | hidden-sections(118차) | template-offer(121차)
 */
export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const b = await req.json().catch(() => { throw new ValidationError('err.badRequest'); });
    switch (b?.action) {
      case 'level': return { id: await addSchoolLevel(db, school.id, { code: b.code, name: b.name, sortOrder: Number.isInteger(b.sortOrder) ? b.sortOrder : 0 }) };
      case 'year': return { id: await addAcademicYear(db, school.id, { label: b.label, startsOn: b.startsOn, endsOn: b.endsOn }) };
      case 'rule': return definePeriodRule(db, school.id, { periods: b.periods, rationale: b.rationale, base_version: b.base_version });
      case 'terms': {
        const rule = await latestPeriodRule(db, school.id);
        if (!rule) throw new ValidationError('err.acad.structureFirst');
        return { created: await createTermsFromRule(db, school.id, b.yearId, rule.id), rule_version: rule.version };
      }
      case 'grade-scheme': return applyGradeScheme(db, school.id, { scheme: b.scheme, levels: b.levels, labels: b.labels, base_version: b.base_version }, school.locale);
      case 'template': return applyTemplate(db, school.id, { key: b.key, version: b.version, base_version: b.base_version }, school.locale);
      case 'template-offer': return decideTemplateOffer(db, school.id, { offerId: b.offerId, decision: b.decision, note: b.note, base_version: b.base_version }, school.locale);
      case 'hidden-sections': return { version: await setHiddenSections(db, school.id, { sections: b.sections, base_version: b.base_version }) };
      case 'term-dates': await setTermDates(db, school.id, b.termId, b.startsOn, b.endsOn); return { ok: true };
      default: throw new ValidationError('err.unknownAction');
    }
  }, { module: 'records', admin: true });
}
