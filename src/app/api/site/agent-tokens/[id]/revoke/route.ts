import { handle } from '@/lib/api';
import { revokeAgentToken } from '@/lib/agent';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(req, ({ db, school }) => revokeAgentToken(db, school.id, id), { module: 'homepage', admin: true });
}
