import type { MsgKey } from './i18n/catalog';
import type { Vars } from './i18n/format';
import { asSystem } from './db';

/**
 * Google(및 Supabase Auth가 지원하는 다른 계정) 로그인.
 * 브라우저가 Supabase에서 받은 access token을 서버가 Supabase에 다시 확인한 뒤,
 * 초대된 이메일(또는 전체 관리자)만 이 앱의 계정과 연결한다. 비밀 키는 쓰지 않는다.
 */

export function supabaseAuthConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}

type SupabaseUser = {
  id?: string; email?: string; email_confirmed_at?: string | null;
  app_metadata?: { provider?: string };
  user_metadata?: { full_name?: string; name?: string };
};

export type ExternalLoginResult =
  | { ok: true; userId: string; joined: number }
  | { ok: false; status: number; error: MsgKey; vars?: Vars };

export async function loginWithSupabaseToken(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<ExternalLoginResult> {
  const cfg = supabaseAuthConfig();
  if (!cfg) return { ok: false, status: 503, error: 'err.google.notConfigured' };
  if (!accessToken || accessToken.length > 8192) return { ok: false, status: 400, error: 'err.google.noToken' };

  let user: SupabaseUser;
  try {
    const res = await fetchImpl(`${cfg.url}/auth/v1/user`, {
      headers: { apikey: cfg.key, Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, status: 401, error: 'err.google.badToken' };
    user = (await res.json()) as SupabaseUser;
  } catch {
    return { ok: false, status: 502, error: 'err.google.unreachable' };
  }
  const email = user.email?.trim().toLowerCase();
  if (!user.id || !email) return { ok: false, status: 401, error: 'err.google.noEmail' };
  if (!user.email_confirmed_at) return { ok: false, status: 403, error: 'err.google.unconfirmed' };
  const display = (user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0]).slice(0, 80);

  return asSystem(async (db) => {
    await db.query('begin');
    try {
      let { rows: [account] } = await db.query(
        'select id, auth_subject from private.app_users where auth_subject = $1 or lower(email) = $2 order by (auth_subject = $1) desc nulls last limit 1',
        [user.id, email]);
      if (account?.auth_subject && account.auth_subject !== user.id) {
        await db.query('rollback');
        return { ok: false as const, status: 403, error: 'err.google.linkedElsewhere' };
      }
      const { rows: pending } = await db.query(
        `select id, school_id, role from public.invitations
         where lower(email) = $1 and accepted_at is null and revoked_at is null for update`, [email]);
      // 62차(ADR 0029): 학생·보호자 열람 계정도 초대와 같은 길로 첫 로그인 때 연결한다
      const { rows: portal } = await db.query(
        `select id, school_id from public.portal_accounts where email = $1 and user_id is null and ends_on is null for update`, [email]);
      if (!account && !pending.length && !portal.length) {
        await db.query('rollback');
        return { ok: false as const, status: 403, error: 'err.google.notInvited', vars: { email } };
      }
      if (!account) {
        ({ rows: [account] } = await db.query(
          'insert into private.app_users(email, display_name, auth_subject) values ($1, $2, $3) returning id, auth_subject',
          [email, display, user.id]));
      } else if (!account.auth_subject) {
        await db.query('update private.app_users set auth_subject = $1 where id = $2', [user.id, account.id]);
      }
      for (const inv of pending) {
        await db.query('insert into public.memberships(user_id, school_id, role) values ($1,$2,$3) on conflict do nothing',
          [account.id, inv.school_id, inv.role]);
        await db.query('update public.invitations set accepted_at = now() where id = $1', [inv.id]);
        await db.query(
          `insert into public.access_log(school_id, actor, actor_label, action, detail) values ($1,$2,$3,'member.join',$4)`,
          [inv.school_id, account.id, display, JSON.stringify({ email, role: inv.role, via: user.app_metadata?.provider ?? 'oauth' })]);
      }
      for (const pa of portal) {
        await db.query('update public.portal_accounts set user_id = $1, claimed_at = now() where id = $2', [account.id, pa.id]);
        await db.query(
          `insert into public.access_log(school_id, actor, actor_label, action, detail) values ($1,$2,$3,'portal.claim',$4)`,
          [pa.school_id, account.id, display, JSON.stringify({ account: pa.id, via: user.app_metadata?.provider ?? 'oauth' })]);
      }
      await db.query('commit');
      return { ok: true as const, userId: account.id as string, joined: pending.length + portal.length };
    } catch (e) {
      await db.query('rollback');
      throw e;
    }
  });
}
