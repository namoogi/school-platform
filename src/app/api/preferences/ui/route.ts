import { handleUser } from '@/lib/api';
import { setUiPref } from '@/lib/ui';

/** 화면 선택 저장: { scope: 'platform' | 'school', ui?: 'campus' | 'analytics', mode?: 'light' | 'dark' } */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return handleUser(req, async ({ db }) => setUiPref(db, body ?? {}));
}
