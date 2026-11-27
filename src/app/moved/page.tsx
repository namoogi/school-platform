import { requireUser } from '@/lib/auth';
import { asUser } from '@/lib/db';
import { myMovedSchools } from '@/lib/placement';
import { getI18n } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

/**
 * ADR 0038: 옮긴 학교 안내. 원본(공용)의 학교는 이용 중지라 학교 화면이 열리지 않으므로 여기서 새 주소를 알려 준다.
 * 주소는 요청 값이 아니라 DB의 옮김 판에서 읽는다(아무 주소로나 보내는 링크가 되지 않게).
 */
export default async function MovedPage() {
  const userId = await requireUser();
  const { moved, uiLang } = await asUser(userId, async (db) => ({
    moved: await myMovedSchools(db),
    uiLang: (await db.query('select ui_lang from public.user_preferences where user_id = app.uid()')).rows[0]?.ui_lang as string | null,
  }));
  // 옮긴 학교의 기본 언어를 쿠키 다음으로 쓴다(ADR 0038 5항)
  const { t, lang, dir } = await getI18n(uiLang, moved[0]?.locale);
  return (
    <main className="login" lang={lang} dir={dir}>
      <div className="login-card" data-testid="moved-page">
        <h1>{t('placement.movedTitle')}</h1>
        {moved.length ? (
          <ul className="stack">{moved.map((m) => (
            <li key={m.target_url}><strong>{m.name}</strong><br /><a href={m.target_url}>{m.target_url}</a></li>
          ))}</ul>
        ) : <p className="muted">{t('placement.movedNone')}</p>}
        <form method="post" action="/api/logout"><button type="submit" className="btn btn-ghost btn-sm">{t('shell.logout')}</button></form>
      </div>
    </main>
  );
}
