import { handle } from '@/lib/api';
import { ValidationError } from '@/lib/services';
import { decideRecordRequest } from '@/lib/portal';

/** 63차: 요청 결정(학교 관리자). body: { requestId, status, note?, fromStatus?, correctionRef? } */
export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const b = await req.json().catch(() => { throw new ValidationError('요청 형식이 올바르지 않습니다.'); });
    return { status: await decideRecordRequest(db, school.id, b ?? {}) };
  }, { admin: true });
}
