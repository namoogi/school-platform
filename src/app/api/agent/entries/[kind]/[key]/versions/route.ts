import { handleAgent } from '@/lib/agent-api';
import { agentSaveEntry } from '@/lib/agent';

/** 새 판(시안) 저장. body: { content, note, base_version }. 공개는 학교 관리자가 /site 에서 한다 */
export async function POST(req: Request, { params }: { params: Promise<{ kind: string; key: string }> }) {
  const { kind, key } = await params;
  const body = await req.json().catch(() => ({}));
  return handleAgent(req, (db, token) => agentSaveEntry(db, token, kind, key, body ?? {}));
}
