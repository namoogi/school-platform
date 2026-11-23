import { handleChat, jsonBody } from '@/lib/chat-api';
import { chatAction } from '@/lib/control';

/** {action: approve | reject | confirm | close | drop | reopen} */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleChat(req, async (db, scope) => chatAction(db, scope, id, (await jsonBody(req)).action));
}
