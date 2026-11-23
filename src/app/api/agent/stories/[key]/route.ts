import { handleAgent } from '@/lib/agent-api';
import { agentStory } from '@/lib/agent';

/** 동화 하나: 최신 판 내용(새 판을 만들 바탕) */
export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return handleAgent(req, (db, token) => agentStory(db, token, key));
}
