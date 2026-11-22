import { handlePlatform } from '@/lib/api';
import { createStatement } from '@/lib/admin';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePlatform(req, async ({ db }) => {
    const body = await req.json().catch(() => ({}));
    return createStatement(db, id, body?.period);
  });
}
