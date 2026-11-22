import { handlePlatform } from '@/lib/api';
import { updateLink } from '@/lib/devlinks';
import { ValidationError } from '@/lib/services';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePlatform(req, async ({ db }) => {
    const body = await req.json().catch(() => { throw new ValidationError('요청 형식이 올바르지 않습니다.'); });
    return updateLink(db, id, body ?? {});
  });
}
