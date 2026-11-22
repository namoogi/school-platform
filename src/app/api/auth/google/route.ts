import { NextResponse } from 'next/server';
import { loginWithSupabaseToken } from '@/lib/google';
import { SESSION_COOKIE, sessionCookieOptions, signSession } from '@/lib/auth';

/** Supabase(Google 등) 로그인 후 받은 access token을 확인하고 이 앱의 세션을 만든다. */
export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (origin && new URL(origin).host !== host) return NextResponse.json({ error: '허용되지 않은 요청 출처입니다.' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const result = await loginWithSupabaseToken(typeof body?.access_token === 'string' ? body.access_token : '');
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const res = NextResponse.json({ ok: true, joined: result.joined });
  res.cookies.set(SESSION_COOKIE, await signSession(result.userId), sessionCookieOptions());
  return res;
}
