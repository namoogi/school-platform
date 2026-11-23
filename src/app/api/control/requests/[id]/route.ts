import { handleControl } from '@/lib/control-api';
import { control } from '@/lib/control';

/** 대화 하나 전체 (세션이 맥락을 읽을 때) */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleControl(req, (db, t) => control.thread(db, t, id));
}
