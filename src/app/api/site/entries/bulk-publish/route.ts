import { handle } from '@/lib/api';
import { bulkPublishStories } from '@/lib/site-bulk-publish';

export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const body: unknown = await req.json().catch(() => null);
    return bulkPublishStories(db, school.id, body);
  }, { module: 'stories', admin: true });
}
