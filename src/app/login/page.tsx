import { redirect } from 'next/navigation';
import { currentUserId } from '@/lib/auth';
import { supabaseAuthConfig } from '@/lib/google';
import { GoogleButton } from '@/components/GoogleButton';
import { safeNext } from '@/lib/next-path';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next: rawNext } = await searchParams;
  // 48차: 공개 화면의 '교직원 로그인'에서 왔으면 로그인 뒤 그 화면 편집으로 돌아간다
  const next = safeNext(rawNext);
  if (await currentUserId()) redirect(next ?? '/');
  const auth = supabaseAuthConfig();
  return (
    <main className="login">
      <div className="login-card">
        <div className="brand"><span className="brand-mark" aria-hidden="true">學</span><span>학교 운영 플랫폼</span></div>
        <h1>학교 관리자 로그인</h1>
        <p className="muted">학교마다 자료와 문서가 따로 보관됩니다. 초대받은 계정으로 로그인하세요.</p>
        {error && <p className="alert" role="alert">이메일 또는 비밀번호가 맞지 않습니다.</p>}
        {next?.startsWith('/site/open') && <p className="muted" data-testid="login-edit-note">로그인하면 보고 있던 홈페이지 화면을 바로 고칠 수 있습니다.</p>}
        {auth && <><GoogleButton supabaseUrl={auth.url} next={next} /><div className="divider"><span>또는 이메일·비밀번호 (예시 계정)</span></div></>}
        <form method="post" action="/api/login" className="stack">
          {next && <input type="hidden" name="next" value={next} />}
          <label>이메일<input name="email" type="email" autoComplete="username" required /></label>
          <label>비밀번호<input name="password" type="password" autoComplete="current-password" required /></label>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>로그인</button>
        </form>
        <p className="fine">처음 오셨나요? <a href="/intro" data-testid="login-intro-link">이 플랫폼 소개 보기</a></p>
        <details className="hint">
          <summary>예시 계정 (합성 자료)</summary>
          <p>예시 A · admin-a@school-a.test<br />예시 B · admin-b@school-b.test</p>
          <p className="muted">로컬 기본 비밀번호는 README의 ‘로컬 실행’을 참고하세요.</p>
        </details>
      </div>
    </main>
  );
}
