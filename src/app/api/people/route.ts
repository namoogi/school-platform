import { handle } from '@/lib/api';
import { ValidationError } from '@/lib/services';
import { addPerson, endEnrollment, enroll, renamePerson } from '@/lib/people';

/** 71차: 사람·학적. body.action: add | rename | enroll | end-enrollment (학교 관리자 확인은 DB 명령 함수가 한다) */
export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const b = await req.json().catch(() => { throw new ValidationError('err.badRequest'); });
    switch (b?.action) {
      case 'add': return { id: await addPerson(db, school.id, { name: b.name, nameLatin: b.nameLatin || null }) };
      case 'rename': return { version: await renamePerson(db, school.id, b.personId, { name: b.name, nameLatin: b.nameLatin || null, reason: b.reason }) };
      case 'enroll': return { id: await enroll(db, school.id, { personId: b.personId, levelId: b.levelId, startsOn: b.startsOn, note: b.note || null }) };
      case 'end-enrollment': await endEnrollment(db, school.id, b.enrollmentId, { endsOn: b.endsOn, status: b.status, note: b.note || null }); return { ok: true };
      default: throw new ValidationError('err.unknownAction');
    }
  }, { module: 'records', admin: true });
}
