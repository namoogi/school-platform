import { handleAgent } from '@/lib/agent-api';
import { agentEntry, agentUpdateMeta } from '@/lib/agent';

/** 항목 하나: 최신 판 내용(새 판을 만들 바탕) */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string; key: string }> }) {
  const { kind, key } = await params;
  return handleAgent(req, (db, token) => agentEntry(db, token, kind, key));
}

/** 38차: 항목 정보(동화 성품 이름·주인공·그림 안 글)·순서. body: { meta?, sort? } */
export async function PATCH(req: Request, { params }: { params: Promise<{ kind: string; key: string }> }) {
  const { kind, key } = await params;
  const body = await req.json().catch(() => ({}));
  return handleAgent(req, (db, token) => agentUpdateMeta(db, token, kind, key, body ?? {}));
}
