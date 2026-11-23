import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { asUser } from '@/lib/db';
import { currentUserId, isInspector, sessionCookieOptions } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { enterSchool } from '@/lib/admin';
import { SCHOOL_COOKIE } from '@/lib/context';

/** 작업 학교 전환 (전체 관리자, 여러 학교 소속). schoolId 가 null 이면 선택을 지운다. */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (origin && new URL(origin).host !== host) return NextResponse.json({ error: '허용되지 않은 요청 출처입니다.' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const store = await cookies();
  if (!body?.schoolId) {
    store.set(SCHOOL_COOKIE, '', { path: '/', maxAge: 0 });
    return NextResponse.json({ ok: true });
  }
  try {
    // 점검 계정(읽기 전용)은 입장 기록을 쓰지 못하므로 학교가 있는지만 확인한다. 토큰 사용은 inspector_tokens.last_used_at 에 남는다.
    const r = isInspector(userId)
      ? await asUser(userId, async (db) => {
          const { rows: [s] } = await db.query('select id from public.schools where id = $1', [String(body.schoolId)]);
          if (!s) throw Object.assign(new Error('학교를 찾을 수 없습니다.'), { code: 'P0002' });
          return { id: s.id as string };
        })
      : await asUser(userId, (db) => enterSchool(db, String(body.schoolId)));
    store.set(SCHOOL_COOKIE, r.id, sessionCookieOptions());
    return NextResponse.json(r);
  } catch (e) {
    return errorResponse(e);
  }
}
