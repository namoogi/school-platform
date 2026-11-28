'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';

/** Supabase(Google) 로그인 후 돌아오는 화면. 주소의 #access_token 을 서버로 보내 확인받는다. */
export function AuthCallback() {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    // 토큰이 주소창·방문 기록에 남지 않게 바로 지운다.
    window.history.replaceState(null, '', '/auth/callback');
    const failed = hash.get('error_description') || query.get('error_description');
    const token = hash.get('access_token');
    if (failed || !token) { setError(failed || t('auth.cb.noToken')); return; }
    fetch('/api/auth/google', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ access_token: token }) })
      .then(async (res) => {
        if (res.ok) {
          let next: string | null = null;
          try { next = sessionStorage.getItem('sp_next'); sessionStorage.removeItem('sp_next'); } catch { /* 없음 */ }
          window.location.replace(next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/');
        }
        else setError((await res.json()).error ?? t('auth.cb.failed'));
      })
      .catch(() => setError(t('auth.cb.unreachable')));
  }, [t]);
  return (
    <main className="login">
      <div className="login-card">
        {error
          ? <><h1>{t('auth.cb.failedTitle')}</h1><p className="alert" role="alert">{error}</p><a className="button secondary" href="/login">{t('auth.cb.back')}</a></>
          : <><h1>{t('auth.cb.checking')}</h1><p className="muted">{t('auth.cb.wait')}</p></>}
      </div>
    </main>
  );
}
