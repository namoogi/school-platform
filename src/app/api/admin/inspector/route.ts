import { handlePlatform } from '@/lib/api';
import { createInspectorToken, listInspectorTokens } from '@/lib/inspector';

export async function GET(req: Request) {
  return handlePlatform(req, ({ db }) => listInspectorTokens(db));
}

/** 발급: { label, days } → { token } (원문은 이 응답에서만 보인다) */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return handlePlatform(req, ({ db }) => createInspectorToken(db, body ?? {}));
}
