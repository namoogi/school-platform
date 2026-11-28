import { handle } from '@/lib/api';
import { addSheetUrls, ValidationError } from '@/lib/services';

export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const body = await req.json().catch(() => { throw new ValidationError('err.badRequest'); });
    return addSheetUrls(db, school.id, Array.isArray(body?.urls) ? body.urls : []);
  }, { module: 'intake' });
}
