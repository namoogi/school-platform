import { handle } from '@/lib/api';
import { ValidationError } from '@/lib/services';
import { endPortalAccount } from '@/lib/portal';

/** 62차: 열람 계정 끝내기(다시 열지 않음). body: { id, reason? } */
export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const b = await req.json().catch(() => { throw new ValidationError('요청 형식이 올바르지 않습니다.'); });
    await endPortalAccount(db, school.id, b?.id, b?.reason);
    return { ok: true };
  }, { admin: true });
}
