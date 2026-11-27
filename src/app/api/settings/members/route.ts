import { handle } from '@/lib/api';
import { invite, members } from '@/lib/admin';
import { ValidationError } from '@/lib/services';

export async function GET(req: Request) {
  return handle(req, ({ db, school }) => members(db, school.id), { admin: true });
}

export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const body = await req.json().catch(() => { throw new ValidationError('err.badRequest'); });
    return invite(db, school.id, body?.email, body?.role);
  }, { admin: true });
}
