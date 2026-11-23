import { handleAgent } from '@/lib/agent-api';
import { agentArchive } from '@/lib/agent';

/** 38차: 보관(소프트 삭제). 공개 중이면 409. 되살리기는 학교 관리자만 */
export async function POST(req: Request, { params }: { params: Promise<{ kind: string; key: string }> }) {
  const { kind, key } = await params;
  return handleAgent(req, (db, token) => agentArchive(db, token, kind, key));
}
