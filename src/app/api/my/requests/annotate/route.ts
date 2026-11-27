import { handleUser } from '@/lib/api';
import { ValidationError } from '@/lib/services';
import { portalAnnotate } from '@/lib/portal';

/** 63차: 거부된 수정 요청에 이의 의견서 붙이기. body: { requestId, body } */
export async function POST(req: Request) {
  return handleUser(req, async ({ db }) => {
    const b = await req.json().catch(() => { throw new ValidationError('err.badRequest'); });
    return { id: await portalAnnotate(db, b?.requestId, b?.body) };
  });
}
