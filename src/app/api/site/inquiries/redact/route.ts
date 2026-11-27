import { handle } from '@/lib/api';
import { ValidationError } from '@/lib/services';
import { redactInquiries } from '@/lib/site-inquiries';

/** 91차: 보존 기간이 지난 신청의 이름·연락처·내용 가리기(학교 관리자). body: { keep_days } */
export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const b = await req.json().catch(() => { throw new ValidationError('요청 형식이 올바르지 않습니다.'); });
    return redactInquiries(db, school.id, b?.keep_days);
  }, { module: 'homepage', admin: true });
}
