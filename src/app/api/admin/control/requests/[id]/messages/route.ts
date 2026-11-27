import { handlePlatform } from '@/lib/api';
import { answerRequest } from '@/lib/control';
import { ValidationError } from '@/lib/services';

/** 답·지시: {choice?, body?, target_session?, new_session?} */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePlatform(req, async ({ db }) => {
    const body = await req.json().catch(() => { throw new ValidationError('err.badRequest'); });
    return answerRequest(db, id, body ?? {});
  });
}
