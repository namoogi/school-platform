import { handlePlatform } from '@/lib/api';
import { createDirective } from '@/lib/control';
import { ValidationError } from '@/lib/services';

/** 새 지시 (전체 관리자) */
export async function POST(req: Request) {
  return handlePlatform(req, async ({ db }) => {
    const body = await req.json().catch(() => { throw new ValidationError('err.badRequest'); });
    return createDirective(db, body ?? {});
  });
}
