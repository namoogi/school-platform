import { handleAgent } from '@/lib/agent-api';
import { agentStories } from '@/lib/agent';

/** 토큰 범위 안의 성품 동화 목록 (최신 판·공개 판 번호) */
export async function GET(req: Request) {
  return handleAgent(req, (db, token) => agentStories(db, token));
}
