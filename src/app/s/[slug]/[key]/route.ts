import { NextResponse } from 'next/server';

/**
 * 31차: 옛 주소 호환. 옛 사이트의 /about · /curriculum · /<직접 만든 쪽> 이
 * 넘겨주기(rungarunsuksa.vercel.app/:path* → /s/<학교>/:path*)로 들어오면 /p/<key> 로 보낸다(?lang= 유지).
 * news · stories · p · a 는 같은 자리의 고정 경로가 먼저 받는다.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; key: string }> }) {
  const { slug, key } = await params;
  const from = new URL(req.url);
  const safe = /^[a-z0-9][a-z0-9-]{0,59}$/.test(key) ? key : '';
  return NextResponse.redirect(new URL(`/s/${encodeURIComponent(slug)}${safe ? `/p/${safe}` : ''}${from.search}`, from), 308);
}
