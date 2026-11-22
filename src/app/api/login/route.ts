import { NextResponse } from 'next/server';
import { checkCredentials, SESSION_COOKIE, sessionCookieOptions, signSession } from '@/lib/auth';

export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get('email') ?? '');
  const password = String(form.get('password') ?? '');
  const userId = await checkCredentials(email, password);
  if (!userId) return NextResponse.redirect(new URL('/login?error=1', req.url), 303);
  const res = NextResponse.redirect(new URL('/', req.url), 303);
  res.cookies.set(SESSION_COOKIE, await signSession(userId), sessionCookieOptions());
  return res;
}
