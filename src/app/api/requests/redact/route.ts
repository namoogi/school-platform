import { handle } from '@/lib/api';
import { ValidationError } from '@/lib/services';
import { redactPerson, redactionPreview } from '@/lib/portal';

/** 63차(ADR 0028): 파기 미리보기(GET ?person=) · 파기(POST { personId, reason, expectedCounts }) — 되돌릴 수 없으므로 화면은 미리보기 건수를 함께 보낸다 */
export async function GET(req: Request) {
  const person = new URL(req.url).searchParams.get('person');
  return handle(req, ({ db, school }) => redactionPreview(db, school.id, person), { admin: true });
}
export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const b = await req.json().catch(() => { throw new ValidationError('err.badRequest'); });
    if (!b?.expectedCounts || typeof b.expectedCounts !== 'object') throw new ValidationError('err.req.previewFirst');
    return redactPerson(db, school.id, { personId: b.personId, reason: b.reason, expectedCounts: b.expectedCounts });
  }, { admin: true });
}
