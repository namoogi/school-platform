import crypto from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { asSystem, INSPECTOR_ID } from './db';
export { INSPECTOR_ID };

/**
 * 14차 최소 인증: 이 프로젝트 DB의 private.app_users 와 서명된 세션 쿠키.
 * Supabase Auth로 옮길 때는 세션의 sub(사용자 ID)만 같은 방식으로 RLS에 넘기면 된다.
 */
export const SESSION_COOKIE = 'sp_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8;

// 서명 키: SESSION_SECRET 환경 변수가 있으면 그 값을, 없으면 DB(private.app_secrets)가 만든 키를 쓴다.
let cachedSecret: string | null = null;
async function secret(): Promise<string> {
  const env = process.env.SESSION_SECRET;
  if (env) {
    if (env.length < 32) throw new Error('SESSION_SECRET 은 32자 이상이어야 합니다.');
    return env;
  }
  if (!cachedSecret) {
    const value = await asSystem(async (db) => {
      const { rows } = await db.query("select value from private.app_secrets where name = 'session_secret'");
      return rows[0]?.value as string | undefined;
    });
    if (!value || value.length < 32) throw new Error('세션 서명 키가 없습니다. 마이그레이션을 적용하세요.');
    cachedSecret = value;
  }
  return cachedSecret;
}

export async function signSession(userId: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS })).toString('base64url');
  const sig = crypto.createHmac('sha256', await secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export async function verifySession(token: string | undefined, now = Date.now()): Promise<string | null> {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', await secret()).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const { sub, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof sub !== 'string' || typeof exp !== 'number' || exp * 1000 < now) return null;
    return sub;
  } catch {
    return null;
  }
}

function verifyPassword(password: string, stored: string) {
  const [scheme, n, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: Number(n), r: 8, p: 1 });
  return crypto.timingSafeEqual(actual, expected);
}

// 계정이 없을 때도 같은 시간이 걸리도록 쓰는 더미 해시
const DUMMY_HASH = `scrypt$16384$${Buffer.alloc(16).toString('base64')}$${Buffer.alloc(32).toString('base64')}`;

export async function checkCredentials(email: string, password: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) return null;
  const user = await asSystem(async (db) => {
    const { rows } = await db.query('select id, password_hash from private.app_users where lower(email) = $1', [normalized]);
    return rows[0] as { id: string; password_hash: string } | undefined;
  });
  const ok = verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  return ok && user ? user.id : null;
}

export async function currentUserId(): Promise<string | null> {
  const store = await cookies();
  const fromSession = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (fromSession) return fromSession;
  // 30차: Claude 점검 토큰 (요청 머리). 토큰 원문은 저장하지 않고 DB가 해시로 확인한다.
  const token = (await headers()).get('x-inspector-token');
  if (token && /^insp_[0-9a-f]{64}$/.test(token)) return verifyInspector(token);
  return null;
}

async function verifyInspector(token: string): Promise<string | null> {
  return asSystem(async (db) => {
    const { rows: [r] } = await db.query('select private.inspector_user_for($1) as id', [token]);
    return (r?.id as string | null) ?? null;
  });
}

export function isInspector(userId: string | null) {
  return userId === INSPECTOR_ID;
}

/** 페이지용: 로그인하지 않았으면 로그인 화면으로 보낸다. */
export async function requireUser(): Promise<string> {
  const id = await currentUserId();
  if (!id) redirect('/login');
  return id;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}
