import { handleAgent } from '@/lib/agent-api';
import { agentEntries } from '@/lib/agent';

/** 36차: 토큰 범위 안 항목 목록 (kind = story · page · news) */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  return handleAgent(req, (db, token) => agentEntries(db, token, kind));
}
