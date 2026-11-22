import { handlePlatform } from '@/lib/api';
import { createSchool, overview } from '@/lib/admin';
import { ValidationError } from '@/lib/services';

export async function GET(req: Request) {
  return handlePlatform(req, ({ db }) => overview(db));
}

export async function POST(req: Request) {
  return handlePlatform(req, async ({ db }) => {
    const body = await req.json().catch(() => { throw new ValidationError('요청 형식이 올바르지 않습니다.'); });
    return createSchool(db, body ?? {});
  });
}
