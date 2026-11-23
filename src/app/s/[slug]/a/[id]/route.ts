import { publicAsset } from '@/lib/site';
import { fileHeaders } from '@/lib/pdf-check';
import { assetResponse } from '@/lib/storage';

/**
 * 공개 그림: 지금 공개된 판이 가리키는 그림만 (DB 함수가 판단). 내용 주소(sha256)로 캐시.
 * 43차: R2에 있으면 짧은 서명 주소로 넘긴다(바이트는 R2가 보냄, 내려받기 요금 없음).
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const a = await publicAsset(slug, id);
  if (!a) return new Response('Not found', { status: 404 });
  if (!a.object_key && req.headers.get('if-none-match') === `"${a.sha256}"`) return new Response(null, { status: 304 });
  const res = await assetResponse(a, { etag: `"${a.sha256}"`, ...fileHeaders(a.mime) }, 'public, max-age=300');
  return res;
}
