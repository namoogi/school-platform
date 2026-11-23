import { handle } from '@/lib/api';
import { createAgentToken, listAgentTokens } from '@/lib/agent';

/** 34차: 외부 작업 토큰 (학교 관리자). 원문은 발급 응답에서 한 번만 돌려준다 */
export async function GET(req: Request) {
  return handle(req, ({ db, school }) => listAgentTokens(db, school.id), { module: 'stories', admin: true });
}
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return handle(req, ({ db, school }) => createAgentToken(db, school.id, body ?? {}), { module: 'stories', admin: true });
}
