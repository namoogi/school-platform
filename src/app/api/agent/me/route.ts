import { handleAgent } from '@/lib/agent-api';
import { agentWhoami } from '@/lib/agent';

/** 토큰 확인: 학교 이름 · 범위 · 기한 */
export async function GET(req: Request) {
  return handleAgent(req, (db, token) => agentWhoami(db, token));
}
