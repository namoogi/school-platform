import { handlePlatform } from '@/lib/api';
import { setModulePrice } from '@/lib/admin';

export async function POST(req: Request) {
  return handlePlatform(req, async ({ db }) => {
    const body = await req.json().catch(() => ({}));
    await setModulePrice(db, body?.key, body?.price);
  });
}
