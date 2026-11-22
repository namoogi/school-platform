import { handle } from '@/lib/api';
import { getDocument, verifySnapshot } from '@/lib/services';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(req, async ({ db, school }) => {
    const doc = await getDocument(db, school.id, id);
    return { ...doc, integrity: verifySnapshot(doc) };
  }, { module: 'records' });
}
