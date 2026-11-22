import { handle } from '@/lib/api';
import { createTemplateVersion, ValidationError } from '@/lib/services';

export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const body = await req.json().catch(() => { throw new ValidationError('요청 형식이 올바르지 않습니다.'); });
    return createTemplateVersion(db, school.id, body ?? {});
  }, { module: 'records', admin: true });
}
