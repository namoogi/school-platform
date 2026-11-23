import { handleAgent } from '@/lib/agent-api';
import { agentPublish } from '@/lib/agent';

/** 40차(ADR 0016): 공개 — 사람이 AI에게 공개를 지시했을 때 바로 공개. body: { version? } (없으면 최신 판). publish 권한 */
export async function POST(req: Request, { params }: { params: Promise<{ kind: string; key: string }> }) {
  const { kind, key } = await params;
  const body = await req.json().catch(() => ({}));
  return handleAgent(req, (db, token) => agentPublish(db, token, kind, key, body ?? {}));
}
