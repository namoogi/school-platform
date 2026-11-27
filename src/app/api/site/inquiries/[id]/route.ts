import { handle } from '@/lib/api';
import { ValidationError } from '@/lib/services';
import { setInquiryStatus } from '@/lib/site-inquiries';

/** 91차: 신청 처리 상태 바꾸기(학교 관리자). body: { status: 'new' | 'done' } */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(req, async ({ db, school, userId }) => {
    const b = await req.json().catch(() => { throw new ValidationError('요청 형식이 올바르지 않습니다.'); });
    return setInquiryStatus(db, school.id, userId, id, b?.status);
  }, { module: 'homepage', admin: true });
}
