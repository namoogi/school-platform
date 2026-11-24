'use client';
import { useEffect, useState } from 'react';

/** Supabase(Google) 로그인 후 돌아오는 화면. 주소의 #access_token 을 서버로 보내 확인받는다. */
export default function AuthCallback() {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    // 토큰이 주소창·방문 기록에 남지 않게 바로 지운다.
    window.history.replaceState(null, '', '/auth/callback');
    const failed = hash.get('error_description') || query.get('error_description');
    const token = hash.get('access_token');
    if (failed || !token) { setError(failed || '로그인 정보를 받지 못했습니다.'); return; }
    fetch('/api/auth/google', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ access_token: token }) })
      .then(async (res) => {
        if (res.ok) {
          let next: string | null = null;
          try { next = sessionStorage.getItem('sp_next'); sessionStorage.removeItem('sp_next'); } catch { /* 없음 */ }
          window.location.replace(next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/');
        }
        else setError((await res.json()).error ?? '로그인하지 못했습니다.');
      })
      .catch(() => setError('로그인 서버에 연결하지 못했습니다.'));
  }, []);
  return (
    <main className="login">
      <div className="login-card">
        {error
          ? <><h1>로그인하지 못했습니다</h1><p className="alert" role="alert">{error}</p><a className="button secondary" href="/login">로그인 화면으로</a></>
          : <><h1>로그인 확인 중…</h1><p className="muted">잠시만 기다려 주세요.</p></>}
      </div>
    </main>
  );
}
