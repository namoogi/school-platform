import { handleControl } from '@/lib/control-api';
import { control } from '@/lib/control';

/** 보고·메모: {body, kind?: report|note|status, status?, author_session?} */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleControl(req, (db, t, body) => control.post(db, t, id, body));
}
