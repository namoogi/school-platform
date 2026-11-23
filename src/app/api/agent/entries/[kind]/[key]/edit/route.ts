import { handleAgent } from '@/lib/agent-api';
import { agentEditOps } from '@/lib/agent';

/** 38차: 구조 바꾸기 — 화면 편집과 같은 연산(move·insert·remove·hide·set)을 최신 판에 적용해 새 판으로. body: { ops, base_version, note? } */
export async function POST(req: Request, { params }: { params: Promise<{ kind: string; key: string }> }) {
  const { kind, key } = await params;
  const body = await req.json().catch(() => ({}));
  return handleAgent(req, (db, token) => agentEditOps(db, token, kind, key, body ?? {}));
}
