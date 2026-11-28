import { NextResponse } from 'next/server';
import { asUser, type Db } from './db';
import { currentUserId } from './auth';
import { preferredSchoolId } from './context';
import { AppError, localVars, ForbiddenError, NoSchoolError, NotFoundError, ValidationError } from './errors';
import { currentSchool, hasModule, me, type Me, type ModuleKey, type School } from './services';
import { BASE_LANG, CATALOG, type MsgKey } from './i18n/catalog';
import { formatMessage, type Vars } from './i18n/format';
import { getDictionary, resolveLang, userLang, type Dictionary } from './i18n/server';

export type Ctx = { db: Db; school: School; userId: string };
type Opts = { module?: ModuleKey; admin?: boolean };
/** 오류 문구를 고를 때 쓰는 요청 정보(ADR 0039): 누가 · 어느 학교 언어로 보고 있었나 */
export type ErrCtx = { userId?: string | null; schoolLang?: string | null };

/**
 * API 공통 처리: 로그인 확인 → 같은 출처 확인(쓰기) → RLS가 걸린 트랜잭션 → 오류 변환.
 * 학교 ID는 클라이언트가 보내는 값을 쓰지 않고 로그인 사용자의 소속에서 정한다.
 */
export async function handle(req: Request, fn: (ctx: Ctx) => Promise<unknown>, opts: Opts = {}) {
  const userId = await currentUserId();
  if (!userId) return fail(401, 'err.loginRequired');
  if (req.method !== 'GET' && !sameOrigin(req)) return fail(403, 'err.badOrigin', { userId });
  let schoolLang: string | null = null;
  try {
    const preferred = await preferredSchoolId();
    const result = await asUser(userId, async (db) => {
      const school = await currentSchool(db, preferred);
      schoolLang = school.locale;
      if (opts.module && !hasModule(school, opts.module)) throw new ForbiddenError('err.moduleOff');
      if (opts.admin && !school.isAdmin) throw new ForbiddenError('err.schoolAdminOnly');
      return fn({ db, school, userId });
    });
    return NextResponse.json(result ?? { ok: true });
  } catch (e) {
    return errorResponse(e, { userId, schoolLang });
  }
}

/** 전체 관리자 전용 API (작업 학교 없이) */
export async function handlePlatform(req: Request, fn: (ctx: { db: Db; account: Me; userId: string }) => Promise<unknown>) {
  const userId = await currentUserId();
  if (!userId) return fail(401, 'err.loginRequired');
  if (req.method !== 'GET' && !sameOrigin(req)) return fail(403, 'err.badOrigin', { userId });
  try {
    const result = await asUser(userId, async (db) => {
      const account = await me(db);
      if (!account.is_platform_admin) throw new ForbiddenError('err.platformAdminOnly');
      return fn({ db, account, userId });
    });
    return NextResponse.json(result ?? { ok: true });
  } catch (e) {
    return errorResponse(e, { userId });
  }
}

/** 로그인만 확인하는 개인 설정 API (학교·권한과 무관, 본인 행만 RLS로 허용) */
export async function handleUser(req: Request, fn: (ctx: { db: Db; userId: string }) => Promise<unknown>) {
  const userId = await currentUserId();
  if (!userId) return fail(401, 'err.loginRequired');
  if (req.method !== 'GET' && !sameOrigin(req)) return fail(403, 'err.badOrigin', { userId });
  try {
    const result = await asUser(userId, (db) => fn({ db, userId }));
    return NextResponse.json(result ?? { ok: true });
  } catch (e) {
    return errorResponse(e, { userId });
  }
}

export { ForbiddenError };

const hangul = /[가-힣]/;

/**
 * DB 함수가 낸 고정 문구 → 이름표. 'db.'·'err.' 이름표의 기준 문구가 DB 문구와 글자까지 같을 때만 바꾼다.
 * 값이 든 문구(format)는 맞는 이름표가 없어 한국어 그대로 간다. 'db.' 문구가 마이그레이션과 같은지는 tests/server-errors.test.ts 가 본다.
 */
let dbKeys: Map<string, MsgKey> | null = null;
export function dbMessageKey(text: string): MsgKey | undefined {
  dbKeys ??= new Map((Object.keys(CATALOG) as MsgKey[]).filter((k) => k.startsWith('err.') || k.startsWith('db.')).map((k) => [CATALOG[k] as string, k]));
  return dbKeys.get(text);
}

type Classified = { status: number; text: string; key?: MsgKey; vars?: Vars };

function classify(e: unknown): Classified {
  const of = (status: number, err: AppError): Classified => ({ status, text: err.message, key: err.key, vars: err.vars });
  if (e instanceof ValidationError) return of(400, e);
  if (e instanceof NotFoundError) return of(404, e);
  if (e instanceof ForbiddenError) return of(403, e);
  if (e instanceof NoSchoolError) return of(409, e);
  const code = (e as { code?: string })?.code;
  const msg = (e as Error)?.message ?? '';
  const db = (status: number): Classified => ({ status, text: msg, key: dbMessageKey(msg) });
  // DB 함수가 낸 한국어 안내는 그대로(또는 이름표가 있으면 번역해) 보여 준다. (값·비밀은 담지 않음)
  if (code === '22023') return db(400);
  if (code === 'P0002') return db(404);
  if (code === '23505') return { status: 409, text: CATALOG['err.duplicate'], key: 'err.duplicate' };
  if (code === '42501') return hangul.test(msg) ? db(403) : { status: 403, text: CATALOG['err.noAccess'], key: 'err.noAccess' };
  if (code === 'P0001') return db(409);
  // ADR 0013 판(base_version) 충돌: 그 사이 새 판이 생겼다 → 다시 읽어 고친다
  if (code === 'P0409') return db(409);
  console.error(e);
  return { status: 500, text: CATALOG['err.internal'], key: 'err.internal' };
}

/** 요청한 사람의 화면 언어: 사용자 설정 → 쿠키 → 학교 기본 언어 → 브라우저 → 한국어(화면과 같은 순서) */
async function errorLang(ctx: ErrCtx): Promise<string> {
  try {
    let pref: string | null = null;
    if (ctx.userId) pref = await asUser(ctx.userId, userLang).catch(() => null);
    return await resolveLang(pref, ctx.schoolLang);
  } catch {
    return BASE_LANG; // 요청 밖(시험 등)에서는 기준 문구
  }
}

/**
 * 오류 → 응답. 이름표가 있으면 { error: 사용자 언어 문구, code: 이름표 }, 없으면 { error: 원래 문구 }.
 * 화면은 지금처럼 error 를 보여 주면 된다. code 는 화면·에이전트가 문구 대신 갈래를 나눌 때 쓴다.
 */
export async function errorResponse(e: unknown, ctx: ErrCtx = {}) {
  return reply(classify(e), ctx);
}

/** 이름표 하나로 바로 거절할 때(로그인 전·출처 확인 등) */
export function fail(status: number, key: MsgKey, ctx: ErrCtx = {}, vars?: Vars) {
  return reply({ status, key, vars, text: formatMessage(CATALOG[key], localVars(vars)) }, ctx);
}

/** 응답 본문만 만든다(언어·사전을 받아서). 시험과 reply 가 같이 쓴다 */
export function errorBody(e: unknown, lang: string = BASE_LANG, dict?: Dictionary) {
  return bodyOf(classify(e), lang, dict);
}

function bodyOf(c: Classified, lang: string, dict?: Dictionary) {
  const error = c.key && lang !== BASE_LANG && dict ? formatMessage(dict[c.key] ?? c.text, localVars(c.vars, dict), lang) : c.text;
  return { status: c.status, body: c.key ? { error, code: c.key } : { error } };
}

async function reply(c: Classified, ctx: ErrCtx) {
  let lang: string = BASE_LANG;
  let dict: Dictionary | undefined;
  if (c.key) {
    lang = await errorLang(ctx);
    if (lang !== BASE_LANG) dict = await getDictionary(lang);
  }
  const { status, body } = bodyOf(c, lang, dict);
  return NextResponse.json(body, { status });
}

export function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return req.headers.get('sec-fetch-site') !== 'cross-site';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
