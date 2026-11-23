import { handleControl } from '@/lib/control-api';
import { control } from '@/lib/control';

/** 맡을 세션 정하기: {session} — 이 대화의 다음 글은 이 세션으로 간다 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleControl(req, (db, t, body) => control.assign(db, t, id, body.session));
}
