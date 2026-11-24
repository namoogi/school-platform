import { handle } from '@/lib/api';
import { getEntry, updateEntry } from '@/lib/site';

/** 공개 범위(public/unlisted)·순서·동화의 성품 이름과 주인공 바꾸기 (학교 관리자) */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return handle(req, ({ db, school }) => updateEntry(db, school.id, id, body ?? {}), { module: 'homepage', admin: true });
}

/** 50차: 최신 판(다시 가져오기에서 사람이 고쳤는지 보려고). 학교 구성원 읽기 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(req, async ({ db, school }) => {
    const d = await getEntry(db, school.id, id);
    const v = d.versions[0];
    return { id: d.entry.id, kind: d.entry.kind, key: d.entry.key, version: v?.version ?? 0, note: v?.note ?? null, content: v?.content ?? null, latest_is_live: !!v && d.liveVersionId === v.id };
  }, { module: 'homepage' });
}
