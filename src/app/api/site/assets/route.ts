import { handle } from '@/lib/api';
import { ValidationError } from '@/lib/services';
import { listAssets, uploadAsset } from '@/lib/site';

export async function GET(req: Request) {
  return handle(req, ({ db, school }) => listAssets(db, school.id), { module: 'homepage' });
}

/** 그림 올리기 (multipart, 필드 이름: file). 같은 그림이면 이미 있는 것을 돌려준다 */
export async function POST(req: Request) {
  return handle(req, async ({ db, school }) => {
    const form = await req.formData().catch(() => { throw new ValidationError('파일 형식의 요청이 아닙니다.'); });
    const f = form.get('file');
    if (!f || typeof f !== 'object' || !('arrayBuffer' in f)) throw new ValidationError('그림 파일을 골라 주세요.');
    return uploadAsset(db, school.id, { name: f.name, type: f.type, bytes: Buffer.from(await f.arrayBuffer()) });
  }, { module: 'homepage' });
}
