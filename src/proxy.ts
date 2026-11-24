import { NextResponse, type NextRequest } from 'next/server';
import { routeSchoolHost, SCHOOL_HOST_HEADER, slugForHost } from './lib/site-hosts';

/**
 * 47차(ADR 0023): 학교 자체 주소로 온 요청을 그 학교 공개 홈페이지로 다시 쓴다(주소창은 그대로).
 * 다른 주소(플랫폼)로 온 요청은 그대로 두되, 바깥에서 붙여 보낸 학교 주소 머리는 지운다(링크 모양을 속이지 못하게).
 */
export function proxy(req: NextRequest) {
  const slug = slugForHost(req.headers.get('host'));
  const headers = new Headers(req.headers);
  headers.delete(SCHOOL_HOST_HEADER);
  if (!slug) return NextResponse.next({ request: { headers } });
  const r = routeSchoolHost(slug, req.nextUrl.pathname);
  if (r.kind === 'pass') return NextResponse.next({ request: { headers } });
  if (r.kind === 'platform') return NextResponse.redirect(new URL(r.to + req.nextUrl.search), 307);
  const to = new URL(r.to, req.url);
  req.nextUrl.searchParams.forEach((v, k) => to.searchParams.set(k, v));
  if (r.defaultLang && !to.searchParams.get('lang')) to.searchParams.set('lang', r.defaultLang);
  headers.set(SCHOOL_HOST_HEADER, slug);
  return NextResponse.rewrite(to, { request: { headers } });
}

export const config = {
  // 정적 파일·이미지 최적화는 건너뛴다
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
