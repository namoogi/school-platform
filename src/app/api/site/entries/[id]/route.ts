import { handle } from '@/lib/api';
import { updateEntry } from '@/lib/site';

/** 공개 범위(public/unlisted)·순서·동화의 성품 이름과 주인공 바꾸기 (학교 관리자) */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return handle(req, ({ db, school }) => updateEntry(db, school.id, id, body ?? {}), { module: 'homepage', admin: true });
}
