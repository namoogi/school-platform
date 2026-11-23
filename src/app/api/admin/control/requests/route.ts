import { handlePlatform } from '@/lib/api';
import { createDirective } from '@/lib/control';
import { ValidationError } from '@/lib/services';

/** 새 지시 (전체 관리자) */
export async function POST(req: Request) {
  return handlePlatform(req, async ({ db }) => {
    const body = await req.json().catch(() => { throw new ValidationError('요청 형식이 올바르지 않습니다.'); });
    return createDirective(db, body ?? {});
  });
}
