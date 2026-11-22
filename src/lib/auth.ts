import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { asSystem } from './db';

/**
 * 14차 최소 인증: 이 프로젝트 DB의 private.app_users 와 서명된 세션 쿠키.
 * Supabase Auth로 옮길 때는 세션의 sub(사용자 ID)만 같은 방식으로 RLS에 넘기면 된다.
 */
export const SESSION_COOKIE = 'sp_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET 은 32자 이상이어야 합니다.');
  return s;
}

export function signSession(userId: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySession(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', secret()).update(payload).digest();
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
  return verifySession(store.get(SESSION_COOKIE)?.value);
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
