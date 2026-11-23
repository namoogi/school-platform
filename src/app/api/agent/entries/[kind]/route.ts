import { handleAgent } from '@/lib/agent-api';
import { agentCreateEntry, agentEntries } from '@/lib/agent';

/** 36차: 토큰 범위 안 항목 목록 (kind = story · page · news) */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  return handleAgent(req, (db, token) => agentEntries(db, token, kind));
}

/** 38차: 새 항목 + 첫 판(시안). body: { key, content, meta?, note? } */
export async function POST(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const body = await req.json().catch(() => ({}));
  return handleAgent(req, (db, token) => agentCreateEntry(db, token, kind, body ?? {}));
}
