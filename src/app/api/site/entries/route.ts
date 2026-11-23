import { handle } from '@/lib/api';
import { createEntry } from '@/lib/site';

/** 새 쪽·소식·동화 시안 (구성원). 동화는 성품 동화 기능이 켜진 학교만(RLS) */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return handle(req, ({ db, school }) => createEntry(db, school.id, body ?? {}), { module: 'homepage' });
}
