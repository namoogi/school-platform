import { handle } from '@/lib/api';
import { nameHistory } from '@/lib/people';
import { personEnrollments } from '@/lib/academics';

/** 71차: 한 사람의 이름 판·학적 이력 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(req, async ({ db, school }) => ({ names: await nameHistory(db, school.id, id), enrollments: await personEnrollments(db, school.id, id) }), { module: 'records' });
}
