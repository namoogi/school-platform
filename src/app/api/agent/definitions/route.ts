import { handleAgent } from '@/lib/agent-api';
import { agentSaveDefinition } from '@/lib/packages';

/** 61차 F5: 정의 새 판. body: { kind: record_type|form|view|output|flow, code, spec, why?, base_version } → { version, valid, issues } */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return handleAgent(req, (db, token) => agentSaveDefinition(db, token, body ?? {}));
}
