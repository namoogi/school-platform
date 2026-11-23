import { handleChat } from '@/lib/chat-api';
import { getThread } from '@/lib/control';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleChat(req, (db, scope) => getThread(db, scope, id));
}
