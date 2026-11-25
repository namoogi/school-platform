import { NextResponse } from 'next/server';
import { asUser, type Db } from './db';
import { currentUserId } from './auth';
import { preferredSchoolId } from './context';
import { currentSchool, hasModule, me, NoSchoolError, NotFoundError, ValidationError, type Me, type ModuleKey, type School } from './services';

export type Ctx = { db: Db; school: School; userId: string };
type Opts = { module?: ModuleKey; admin?: boolean };

/**
 * API 공통 처리: 로그인 확인 → 같은 출처 확인(쓰기) → RLS가 걸린 트랜잭션 → 오류 변환.
 * 학교 ID는 클라이언트가 보내는 값을 쓰지 않고 로그인 사용자의 소속에서 정한다.
 */
export async function handle(req: Request, fn: (ctx: Ctx) => Promise<unknown>, opts: Opts = {}) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  if (req.method !== 'GET' && !sameOrigin(req)) {
    return NextResponse.json({ error: '허용되지 않은 요청 출처입니다.' }, { status: 403 });
  }
  try {
    const preferred = await preferredSchoolId();
    const result = await asUser(userId, async (db) => {
      const school = await currentSchool(db, preferred);
      if (opts.module && !hasModule(school, opts.module)) throw new ForbiddenError('이 기능은 학교 라이선스에 포함돼 있지 않습니다.');
      if (opts.admin && !school.isAdmin) throw new ForbiddenError('학교 관리자만 할 수 있습니다.');
      return fn({ db, school, userId });
    });
    return NextResponse.json(result ?? { ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** 전체 관리자 전용 API (작업 학교 없이) */
export async function handlePlatform(req: Request, fn: (ctx: { db: Db; account: Me; userId: string }) => Promise<unknown>) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  if (req.method !== 'GET' && !sameOrigin(req)) {
    return NextResponse.json({ error: '허용되지 않은 요청 출처입니다.' }, { status: 403 });
  }
  try {
    const result = await asUser(userId, async (db) => {
      const account = await me(db);
      if (!account.is_platform_admin) throw new ForbiddenError('전체 관리자만 할 수 있습니다.');
      return fn({ db, account, userId });
    });
    return NextResponse.json(result ?? { ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** 로그인만 확인하는 개인 설정 API (학교·권한과 무관, 본인 행만 RLS로 허용) */
export async function handleUser(req: Request, fn: (ctx: { db: Db; userId: string }) => Promise<unknown>) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  if (req.method !== 'GET' && !sameOrigin(req)) {
    return NextResponse.json({ error: '허용되지 않은 요청 출처입니다.' }, { status: 403 });
  }
  try {
    const result = await asUser(userId, (db) => fn({ db, userId }));
    return NextResponse.json(result ?? { ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export class ForbiddenError extends Error {}

const hangul = /[가-힣]/;

export function errorResponse(e: unknown) {
  if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
  if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
  if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
  if (e instanceof NoSchoolError) return NextResponse.json({ error: e.message }, { status: 409 });
  const code = (e as { code?: string })?.code;
  const msg = (e as Error)?.message ?? '';
  // DB 함수가 낸 한국어 안내는 그대로 보여 준다. (값·비밀은 담지 않음)
  if (code === '22023') return NextResponse.json({ error: msg }, { status: 400 });
  if (code === 'P0002') return NextResponse.json({ error: msg }, { status: 404 });
  if (code === '23505') return NextResponse.json({ error: '이미 있는 값입니다. (중복)' }, { status: 409 });
  if (code === '42501') return NextResponse.json({ error: hangul.test(msg) ? msg : '이 학교의 기록에 접근할 권한이 없습니다.' }, { status: 403 });
  if (code === 'P0001') return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  // ADR 0013 판(base_version) 충돌: 그 사이 새 판이 생겼다 → 다시 읽어 고친다
  if (code === 'P0409') return NextResponse.json({ error: msg }, { status: 409 });
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
