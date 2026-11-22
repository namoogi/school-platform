import { handlePlatform } from '@/lib/api';
import { createItem, listItems } from '@/lib/lab';
import { ValidationError } from '@/lib/services';

export async function GET(req: Request) {
  const all = new URL(req.url).searchParams.get('archived') === '1';
  return handlePlatform(req, ({ db }) => listItems(db, all));
}

export async function POST(req: Request) {
  return handlePlatform(req, async ({ db }) => {
    const body = await req.json().catch(() => { throw new ValidationError('요청 형식이 올바르지 않습니다.'); });
    return createItem(db, body ?? {});
  });
}
