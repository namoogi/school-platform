import { handleAgent } from '@/lib/agent-api';
import { agentSaveStory } from '@/lib/agent';

/** 새 판(시안) 저장. 공개는 학교 관리자가 /site 에서 한다 */
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const body = await req.json().catch(() => ({}));
  return handleAgent(req, (db, token) => agentSaveStory(db, token, key, body ?? {}));
}
