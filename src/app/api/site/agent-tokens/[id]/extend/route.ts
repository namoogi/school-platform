import { handle } from '@/lib/api';
import { extendAgentToken } from '@/lib/agent';

/** 38차: 기한 연장 (학교 관리자). body: { days: 7|30|90|365|null(무기한) } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return handle(req, ({ db, school }) => extendAgentToken(db, school.id, id, body ?? {}), { module: 'homepage', admin: true });
}
