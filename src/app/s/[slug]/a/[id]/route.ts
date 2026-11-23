import { publicAsset } from '@/lib/site';

/** 공개 그림: 지금 공개된 판이 가리키는 그림만 (DB 함수가 판단). 내용 주소(sha256)로 캐시. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const a = await publicAsset(slug, id);
  if (!a) return new Response('Not found', { status: 404 });
  if (req.headers.get('if-none-match') === `"${a.sha256}"`) return new Response(null, { status: 304 });
  return new Response(new Uint8Array(a.bytes), {
    headers: { 'content-type': a.mime, etag: `"${a.sha256}"`, 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' },
  });
}
