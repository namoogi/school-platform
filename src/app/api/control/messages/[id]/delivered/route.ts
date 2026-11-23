import { handleControl } from '@/lib/control-api';
import { control } from '@/lib/control';

/** 전달됨 표시: {note?} — send_message·create_session 을 한 뒤에 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleControl(req, (db, t, body) => control.delivered(db, t, id, body.note));
}
