import { handleAgent } from '@/lib/agent-api';
import { agentEntry } from '@/lib/agent';

/** 항목 하나: 최신 판 내용(새 판을 만들 바탕) */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string; key: string }> }) {
  const { kind, key } = await params;
  return handleAgent(req, (db, token) => agentEntry(db, token, kind, key));
}
