import { handle } from '@/lib/api';
import { listDocuments, publishDocument } from '@/lib/services';

export async function GET(req: Request) {
  return handle(req, ({ db, school }) => listDocuments(db, school.id), { module: 'records' });
}

export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const body = await req.json().catch(() => ({}));
    return publishDocument(db, school, { revisionOf: typeof body?.revisionOf === 'string' ? body.revisionOf : null });
  }, { module: 'records', admin: true });
}
