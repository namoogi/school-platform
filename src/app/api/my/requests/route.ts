import { handleUser } from '@/lib/api';
import { ValidationError } from '@/lib/services';
import { portalRequest } from '@/lib/portal';

/** 63차(ADR 0030): 학생·보호자 열람·수정 요청. body: { personId, kind: inspect|amend, targetKind?, targetId?, body } — 볼 수 있는 사람인지는 DB 계약 함수가 확인한다 */
export async function POST(req: Request) {
  return handleUser(req, async ({ db }) => {
    const b = await req.json().catch(() => { throw new ValidationError('err.badRequest'); });
    return { id: await portalRequest(db, b ?? {}) };
  });
}
