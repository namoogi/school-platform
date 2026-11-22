import { handle } from '@/lib/api';
import { getSource } from '@/lib/services';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(req, ({ db, school }) => getSource(db, school.id, id));
}
