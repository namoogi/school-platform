import { handle } from '@/lib/api';
import { publish } from '@/lib/site';

/** 공개: { versionId?: string } (없으면 최신 판), 공개 내림: { versionId: null } — 학교 관리자 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { versionId?: string | null };
  return handle(req, ({ db, school }) => publish(db, school.id, id, body?.versionId), { module: 'homepage', admin: true });
}
