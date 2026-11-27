import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/auth';
import { asUser } from '@/lib/db';
import { sameOrigin, fail } from '@/lib/api';
import { getLanguages, LANG_COOKIE } from '@/lib/i18n/server';

/**
 * ADR 0037: 화면 언어 저장 { lang }. 로그인 전(로그인 화면)에는 쿠키만, 로그인 뒤에는 사용자 설정(user_preferences.ui_lang)에도 둔다.
 * 언어 목록에 있고 켜진 언어만 받는다(목록은 DB라 언어를 더해도 이 코드는 그대로).
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, 'err.badOrigin');
  const body = await req.json().catch(() => ({}));
  const lang = typeof body?.lang === 'string' ? body.lang : '';
  const langs = (await getLanguages()).filter((l) => l.active);
  if (!langs.some((l) => l.code === lang)) return fail(400, 'err.langUnavailable');
  const userId = await currentUserId();
  if (userId) {
    await asUser(userId, (db) => db.query(
      `insert into public.user_preferences (user_id, ui_lang) values (app.uid(), $1)
       on conflict (user_id) do update set ui_lang = excluded.ui_lang, updated_at = now()`, [lang]));
  }
  const res = NextResponse.json({ lang });
  res.cookies.set(LANG_COOKIE, lang, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365, httpOnly: false });
  return res;
}
