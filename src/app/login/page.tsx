import { redirect } from 'next/navigation';
import { currentUserId } from '@/lib/auth';
import { supabaseAuthConfig } from '@/lib/google';
import { GoogleButton } from '@/components/GoogleButton';
import { safeNext } from '@/lib/next-path';
import { getI18n } from '@/lib/i18n/server';
import { I18nProvider } from '@/components/I18nProvider';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next: rawNext } = await searchParams;
  // 48차: 공개 화면의 '교직원 로그인'에서 왔으면 로그인 뒤 그 화면 편집으로 돌아간다
  const next = safeNext(rawNext);
  if (await currentUserId()) redirect(next ?? '/');
  const auth = supabaseAuthConfig();
  // ADR 0037: 로그인 전에는 쿠키·브라우저 언어로 고른다(고르면 쿠키에 남는다)
  const i18n = await getI18n();
  const { t } = i18n;
  return (
    <I18nProvider value={{ lang: i18n.lang, dir: i18n.dir, dict: i18n.dict, languages: i18n.languages.filter((l) => l.active).map((l) => ({ code: l.code, native_name: l.native_name })) }}>
      <main className="login" lang={i18n.lang} dir={i18n.dir}>
        <div className="login-card">
          <div className="between">
            <div className="brand"><span className="brand-mark" aria-hidden="true">學</span><span>onschools</span></div>
            <LanguageSwitcher />
          </div>
          <h1>{t('login.title')}</h1>
          <p className="muted">{t('login.lead')}</p>
          {error && <p className="alert" role="alert">{t('login.error')}</p>}
          {next?.startsWith('/site/open') && <p className="muted" data-testid="login-edit-note">{t('login.editNote')}</p>}
          {auth && <><GoogleButton supabaseUrl={auth.url} next={next} /><div className="divider"><span>{t('login.orPassword')}</span></div></>}
          <form method="post" action="/api/login" className="stack">
            {next && <input type="hidden" name="next" value={next} />}
            <label>{t('login.email')}<input name="email" type="email" autoComplete="username" required /></label>
            <label>{t('login.password')}<input name="password" type="password" autoComplete="current-password" required /></label>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>{t('login.submit')}</button>
          </form>
          <p className="fine">{t('login.firstVisit')} <a href="/intro" data-testid="login-intro-link">{t('login.introLink')}</a></p>
          <details className="hint">
            <summary>{t('login.sampleAccounts')}</summary>
            <p>{t('login.sampleA')} · admin-a@school-a.test<br />{t('login.sampleB')} · admin-b@school-b.test</p>
            <p className="muted">{t('login.samplePassword')}</p>
          </details>
        </div>
      </main>
    </I18nProvider>
  );
}
