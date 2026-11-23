import { asUser } from '@/lib/db';
import { currentUserId } from '@/lib/auth';
import { preferredSchoolId } from '@/lib/context';
import { currentSchool } from '@/lib/services';
import { memberAsset } from '@/lib/site';
import { fileHeaders } from '@/lib/pdf-check';
import { assetResponse } from '@/lib/storage';

/** 구성원 미리보기용 그림 (시안에만 쓰인 그림 포함). 학교 소속·RLS로 확인 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return new Response('로그인이 필요합니다.', { status: 401 });
  const { id } = await params;
  const preferred = await preferredSchoolId();
  const a = await asUser(userId, async (db) => memberAsset(db, (await currentSchool(db, preferred)).id, id)).catch(() => null);
  if (!a) return new Response('Not found', { status: 404 });
  return assetResponse(a, fileHeaders(a.mime), 'private, max-age=60');
}
