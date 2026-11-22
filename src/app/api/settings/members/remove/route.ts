import { handle } from '@/lib/api';
import { removeMember } from '@/lib/admin';

export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const body = await req.json().catch(() => ({}));
    await removeMember(db, school.id, String(body?.userId ?? ''));
  }, { admin: true });
}
