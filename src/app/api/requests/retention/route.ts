import { handle } from '@/lib/api';
import { ValidationError } from '@/lib/services';
import { saveRetentionRule } from '@/lib/portal';

/** 63차(ADR 0028): 보존 규칙 새 판. body: { yearsAfterExit: number|null(영구), why?, base_version } */
export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const b = await req.json().catch(() => { throw new ValidationError('요청 형식이 올바르지 않습니다.'); });
    const y = b?.yearsAfterExit === null || b?.yearsAfterExit === '' ? null : Number(b?.yearsAfterExit);
    if (y !== null && !Number.isInteger(y)) throw new ValidationError('보존 기간은 정수(년)이거나 영구입니다.');
    return { version: await saveRetentionRule(db, school.id, { yearsAfterExit: y, why: typeof b?.why === 'string' ? b.why : undefined, base_version: Number(b?.base_version ?? 0) }) };
  }, { admin: true });
}
