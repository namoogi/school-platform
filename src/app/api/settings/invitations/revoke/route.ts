import { handle } from '@/lib/api';
import { revokeInvitation } from '@/lib/admin';

export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const body = await req.json().catch(() => ({}));
    await revokeInvitation(db, school.id, String(body?.id ?? ''));
  }, { admin: true });
}
