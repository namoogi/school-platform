import { handle } from '@/lib/api';
import { ValidationError } from '@/lib/services';
import { addPortalAccount } from '@/lib/portal';

/** 62차(ADR 0029): 학생·보호자 열람 계정 만들기. body: { kind, personId, email, underConsentAge?, consentBasis?, consentNote? } */
export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const b = await req.json().catch(() => { throw new ValidationError('err.badRequest'); });
    return { id: await addPortalAccount(db, school.id, b ?? {}) };
  }, { admin: true });
}
