import { handlePlatform } from '@/lib/api';
import { ValidationError } from '@/lib/services';
import { publishAcademicTemplate } from '@/lib/template-offers';

/** 121차: 관제가 학사 관리 템플릿 새 판을 낸다(ADR 0043). 전체 관리자만(handlePlatform + DB 함수). 그 템플릿을 쓰는 학교에 제안이 생긴다 */
export async function POST(req: Request) {
  return handlePlatform(req, async ({ db }) => {
    const b = await req.json().catch(() => { throw new ValidationError('err.badRequest'); });
    return { version: await publishAcademicTemplate(db, b ?? {}) };
  });
}
