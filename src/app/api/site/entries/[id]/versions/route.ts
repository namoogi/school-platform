import { handle } from '@/lib/api';
import { saveVersion } from '@/lib/site';

/** 새 판 저장 (구성원). 이전 판은 그대로 남는다 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return handle(req, ({ db, school }) => saveVersion(db, school.id, id, body ?? {}), { module: 'homepage' });
}
