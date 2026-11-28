import { handle } from '@/lib/api';
import { publish } from '@/lib/site';

/**
 * 공개: { versionId?: string, photo_consent?: true } (없으면 최신 판), 공개 내림: { versionId: null } — 학교 관리자
 * 122차: 사진이 든 판은 공개 창에서 사진 공개 허가를 확인한 뒤(photo_consent: true) 공개된다.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { versionId?: string | null; photo_consent?: unknown };
  return handle(req, ({ db, school }) => publish(db, school.id, id, body?.versionId, { photoConsent: body?.photo_consent === true }), { module: 'homepage', admin: true });
}
