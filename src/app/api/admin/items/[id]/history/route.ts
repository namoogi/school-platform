import { handlePlatform } from '@/lib/api';
import { itemHistory } from '@/lib/lab';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePlatform(req, ({ db }) => itemHistory(db, id));
}
