import { handle } from '@/lib/api';
import { ValidationError } from '@/lib/services';
import { migrateImages } from '@/lib/site-templates';

export const maxDuration = 60;

/** 67차: 옛 사이트 그림 가져오기(고른 것만, 10장). body: { urls: string[] } */
export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const b = await req.json().catch(() => { throw new ValidationError('요청 형식이 올바르지 않습니다.'); });
    return migrateImages(db, school.id, Array.isArray(b?.urls) ? b.urls.map(String) : []);
  }, { module: 'homepage', admin: true });
}
