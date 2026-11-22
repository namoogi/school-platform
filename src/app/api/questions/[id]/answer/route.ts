import { handle } from '@/lib/api';
import { answerQuestion, ValidationError } from '@/lib/services';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(req, async ({ db, school }) => {
    const body = await req.json().catch(() => { throw new ValidationError('요청 형식이 올바르지 않습니다.'); });
    return answerQuestion(db, school.id, id, { decision: body?.decision, value: body?.value, rationale: body?.rationale });
  }, { module: 'intake', admin: true });
}
