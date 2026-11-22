import { handle } from '@/lib/api';
import { archiveSource } from '@/lib/services';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(req, ({ db, school }) => archiveSource(db, school.id, id));
}
