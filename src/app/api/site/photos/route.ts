import { handle } from '@/lib/api';
import { publishPhotos } from '@/lib/site';

/** 121차: 공개하려는 판들의 사진 목록 — 공개 창(사진 공개 허가 확인)이 보여 준다. { targets: [{ entryId, versionId? }] } — 학교 관리자 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  return handle(req, ({ db, school }) => publishPhotos(db, school.id, body), { module: 'homepage', admin: true });
}
