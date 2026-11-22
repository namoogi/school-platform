import { NextResponse } from 'next/server';
import { asUser, type Db } from './db';
import { currentUserId } from './auth';
import { currentSchool, NotFoundError, ValidationError, type School } from './services';

export type Ctx = { db: Db; school: School; userId: string };

/**
 * API 공통 처리: 로그인 확인 → 같은 출처 확인(쓰기) → RLS가 걸린 트랜잭션 → 오류 변환.
 * 학교 ID는 클라이언트가 보내는 값을 쓰지 않고 로그인 사용자의 소속에서 정한다.
 */
export async function handle(req: Request, fn: (ctx: Ctx) => Promise<unknown>) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  if (req.method !== 'GET' && !sameOrigin(req)) {
    return NextResponse.json({ error: '허용되지 않은 요청 출처입니다.' }, { status: 403 });
  }
  try {
    const result = await asUser(userId, async (db) => fn({ db, school: await currentSchool(db), userId }));
    return NextResponse.json(result ?? { ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export function errorResponse(e: unknown) {
  if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
  if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
  const code = (e as { code?: string })?.code;
  if (code === '42501') return NextResponse.json({ error: '이 학교의 기록에 접근할 권한이 없습니다.' }, { status: 403 });
  if (code === 'P0001') return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  console.error(e);
  return NextResponse.json({ error: '처리 중 오류가 발생했습니다.' }, { status: 500 });
}

function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return req.headers.get('sec-fetch-site') !== 'cross-site';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
