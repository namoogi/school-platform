import { handlePlatform } from '@/lib/api';
import { setRequestStatus } from '@/lib/control';
import { ValidationError } from '@/lib/services';

/** 끝남·접음·다시 열기 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePlatform(req, async ({ db }) => {
    const body = await req.json().catch(() => { throw new ValidationError('err.badRequest'); });
    return setRequestStatus(db, id, body?.status);
  });
}
