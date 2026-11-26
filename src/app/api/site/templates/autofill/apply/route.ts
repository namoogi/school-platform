import { handle } from '@/lib/api';
import { ValidationError } from '@/lib/services';
import { autofillApply } from '@/lib/site-templates';

/** 66차: 고른 제안 넣기 → 쪽마다 새 시안 판(안내 자리만 채움). body: { key, fills: [{ slotId, value }] } */
export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const b = await req.json().catch(() => { throw new ValidationError('요청 형식이 올바르지 않습니다.'); });
    return autofillApply(db, school.id, String(b?.key ?? ''), Array.isArray(b?.fills) ? b.fills : []);
  }, { module: 'homepage', admin: true });
}
