import { handle } from '@/lib/api';
import { ValidationError } from '@/lib/services';
import { addCourseType, addSubject, approve, assignStaff, closeApplications, createOffering, removeStaff, setCourseTypeRule, setEnrollment, startTerm } from '@/lib/courses';
import { setSubjectLabel } from '@/lib/grading';

/**
 * 72차: 수업(과목·갈래·개설·담당·수강). 권한(관리자·담당 교사)·개설 상태·판(revision) 충돌은 DB 명령 함수가 판정한다.
 * body.action: subject | label | type | type-rule | offering | staff | unstaff | start-term | approve | close-applications | enroll
 */
export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const b = await req.json().catch(() => { throw new ValidationError('err.badRequest'); });
    switch (b?.action) {
      case 'subject': return { id: await addSubject(db, school.id, { code: b.code, name: b.name, levelId: b.levelId || null }) };
      case 'label': return { version: await setSubjectLabel(db, school.id, b.subjectId, { purpose: b.purpose, label: { ...(b.ko ? { ko: b.ko } : {}), ...(b.en ? { en: b.en } : {}), ...(b.th ? { th: b.th } : {}) }, why: b.why, base_version: Number(b.bases?.[b.purpose || 'all'] ?? 0) }) };
      case 'type': return { id: await addCourseType(db, school.id, { code: b.code, name: b.name }) };
      case 'type-rule': return { version: await setCourseTypeRule(db, school.id, b.typeId, { trigger: b.trigger, publishable: b.publishable === 'yes', passFailAllowed: b.passFailAllowed === 'yes', note: b.note }) };
      case 'offering': return { id: await createOffering(db, school.id, { termId: b.termId, subjectId: b.subjectId, typeId: b.typeId, levelId: b.levelId, credits: b.credits, passFail: b.passFail === 'yes', section: b.section || '', capacity: b.capacity }) };
      case 'staff': await assignStaff(db, school.id, b.offeringId, b.personId, b.role); return { ok: true };
      case 'unstaff': await removeStaff(db, school.id, b.offeringId, b.personId); return { ok: true };
      case 'start-term': return { activated: await startTerm(db, school.id, b.termId) };
      case 'approve': await approve(db, school.id, b.offeringId, b.revision); return { ok: true };
      case 'close-applications': return { enrolled: await closeApplications(db, school.id, b.offeringId, b.revision) };
      case 'enroll': return { revision: await setEnrollment(db, school.id, b.offeringId, b.personId, b.status ?? 'enrolled', b.revision) };
      default: throw new ValidationError('err.unknownAction');
    }
  }, { module: 'records' });
}
