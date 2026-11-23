import { NextResponse } from 'next/server';

/**
 * 31차: 옛 후원자 주소(/friends …) 호환 → 숨은 쪽.
 * /friends → /p/friends · /friends/about → /p/friends-about · /friends/letters/<id> → /p/friends-letter-<id>
 * 옛 후원자 쪽은 한국어가 기본이었으므로 ?lang= 이 없으면 ko 로 연다. /friends/admin 같은 관리 주소는 첫 쪽으로 보낸다.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; rest?: string[] }> }) {
  const { slug, rest = [] } = await params;
  const from = new URL(req.url);
  const ok = (s: string) => /^[a-z0-9][a-z0-9-]{0,40}$/.test(s);
  let key = 'friends';
  if (rest[0] === 'letters' && rest[1] && ok(rest[1])) key = `friends-letter-${rest[1]}`;
  else if (rest[0] && ok(rest[0]) && rest[0] !== 'admin') key = `friends-${rest[0]}`;
  const q = new URLSearchParams(from.search);
  if (!q.get('lang')) q.set('lang', 'ko');
  return NextResponse.redirect(new URL(`/s/${encodeURIComponent(slug)}/p/${key}?${q}`, from), 308);
}
