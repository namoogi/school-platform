import { handle } from '@/lib/api';
import { ValidationError } from '@/lib/services';
import { decideBaselineOffer } from '@/lib/baseline';

/** 76차: 학교가 관제 기본판 갱신 제안을 수락·보류·거절한다(ADR 0027). 학교 관리자 확인·충돌 시 학교 값 유지는 DB 함수가 한다 */
export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const b = await req.json().catch(() => { throw new ValidationError('err.badRequest'); });
    if (!['accepted', 'declined', 'held'].includes(b?.decision)) throw new ValidationError('err.base.decision');
    return await decideBaselineOffer(db, school.id, b.offerId, b.decision, typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 500) : undefined);
  });
}
