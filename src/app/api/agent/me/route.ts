import { agentHeader, handleAgent } from '@/lib/agent-api';
import { agentWhoami } from '@/lib/agent';

/** 토큰 확인: 학교 이름 · 범위 · 기한. 83차: 이 요청이 알린 세션 이름·작업자를 그대로 돌려줘 머리가 제대로 오는지 확인하게 한다 */
export async function GET(req: Request) {
  return handleAgent(req, async (db, token) => ({
    ...(await agentWhoami(db, token)),
    you: { session: agentHeader(req, 'x-agent-session', 80), operator: agentHeader(req, 'x-agent-operator', 120) },
  }));
}
