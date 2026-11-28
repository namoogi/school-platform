import { handleAgent } from '@/lib/agent-api';
import { agentPackages, agentSavePackage } from '@/lib/packages';

/** 61차 F5: 학사 꾸러미 — 정의(최신 판·검사 결과)와 꾸러미(최신 판·켜짐 상태) */
export async function GET(req: Request) {
  return handleAgent(req, (db, token) => agentPackages(db, token));
}

/** 꾸러미 새 판. body: { code, title, members: [{ kind, code, version? }], why?, base_version } — 켜기는 학교 관리자가 한다 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return handleAgent(req, (db, token) => agentSavePackage(db, token, body ?? {}));
}
