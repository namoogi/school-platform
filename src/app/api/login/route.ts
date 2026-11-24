import { NextResponse } from 'next/server';
import { checkCredentials, SESSION_COOKIE, sessionCookieOptions, signSession } from '@/lib/auth';
import { safeNext } from '@/lib/next-path';

export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get('email') ?? '');
  const password = String(form.get('password') ?? '');
  const userId = await checkCredentials(email, password);
  const next = safeNext(form.get('next'));
  if (!userId) return NextResponse.redirect(new URL(`/login?error=1${next ? `&next=${encodeURIComponent(next)}` : ''}`, req.url), 303);
  const res = NextResponse.redirect(new URL(next ?? '/', req.url), 303);
  res.cookies.set(SESSION_COOKIE, await signSession(userId), sessionCookieOptions());
  return res;
}
