import { handlePlatform } from '@/lib/api';
import { createLink, listLinks } from '@/lib/devlinks';
import { ValidationError } from '@/lib/services';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePlatform(req, ({ db }) => listLinks(db, id, true));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePlatform(req, async ({ db }) => {
    const body = await req.json().catch(() => { throw new ValidationError('요청 형식이 올바르지 않습니다.'); });
    return createLink(db, id, body ?? {});
  });
}
