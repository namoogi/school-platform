import { handle } from '@/lib/api';
import { ValidationError } from '@/lib/services';
import { migratePropose } from '@/lib/site-templates';

export const maxDuration = 60;

/** 67차(ADR 0031): 기존 홈페이지 주소 → 같은 사이트 8쪽까지 읽기(공개 주소만·robots.txt) → 빈 칸 제안. body: { key, url } */
export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const b = await req.json().catch(() => { throw new ValidationError('요청 형식이 올바르지 않습니다.'); });
    return migratePropose(db, school.id, String(b?.key ?? ''), String(b?.url ?? ''), school.name);
  }, { module: 'homepage', admin: true });
}
