import { handle } from '@/lib/api';
import { setArchived } from '@/lib/site';

/** 38차: 보관·되살리기 (학교 관리자). body: { archived: boolean }. 공개 중이면 보관할 수 없다 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return handle(req, ({ db, school, userId }) => setArchived(db, school.id, id, body?.archived !== false, userId), { module: 'homepage', admin: true });
}
