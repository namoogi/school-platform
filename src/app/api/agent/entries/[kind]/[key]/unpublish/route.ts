import { handleAgent } from '@/lib/agent-api';
import { agentUnpublish } from '@/lib/agent';

/** 40차(ADR 0016): 공개 내림. publish 권한 */
export async function POST(req: Request, { params }: { params: Promise<{ kind: string; key: string }> }) {
  const { kind, key } = await params;
  return handleAgent(req, (db, token) => agentUnpublish(db, token, kind, key));
}
