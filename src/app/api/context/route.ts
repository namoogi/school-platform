import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { asUser } from '@/lib/db';
import { currentUserId, sessionCookieOptions } from '@/lib/auth';
import { errorResponse, fail } from '@/lib/api';
import { enterSchool } from '@/lib/admin';
import { SCHOOL_COOKIE } from '@/lib/context';

/** 작업 학교 전환 (전체 관리자, 여러 학교 소속). schoolId 가 null 이면 선택을 지운다. */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return fail(401, 'err.loginRequired');
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (origin && new URL(origin).host !== host) return fail(403, 'err.badOrigin', { userId });
  const body = await req.json().catch(() => ({}));
  const store = await cookies();
  if (!body?.schoolId) {
    store.set(SCHOOL_COOKIE, '', { path: '/', maxAge: 0 });
    return NextResponse.json({ ok: true });
  }
  try {
    const r = await asUser(userId, (db) => enterSchool(db, String(body.schoolId)));
    store.set(SCHOOL_COOKIE, r.id, sessionCookieOptions());
    return NextResponse.json(r);
  } catch (e) {
    return errorResponse(e, { userId });
  }
}
