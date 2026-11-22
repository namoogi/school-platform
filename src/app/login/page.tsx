import { redirect } from 'next/navigation';
import { currentUserId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUserId()) redirect('/intake');
  const { error } = await searchParams;
  return (
    <main className="login">
      <div className="login-card">
        <div className="brand dark"><span>學</span><div><strong>학교 운영 플랫폼</strong><small>14차 · 검토용</small></div></div>
        <h1>학교 관리자 로그인</h1>
        <p className="muted">학교마다 자료와 문서가 따로 보관됩니다. 소속 학교의 기록만 열 수 있습니다.</p>
        {error && <p className="alert" role="alert">이메일 또는 비밀번호가 맞지 않습니다.</p>}
        <form method="post" action="/api/login" className="stack">
          <label>이메일<input name="email" type="email" autoComplete="username" required /></label>
          <label>비밀번호<input name="password" type="password" autoComplete="current-password" required /></label>
          <button type="submit" className="primary">로그인</button>
        </form>
        <details className="hint">
          <summary>예시 계정 (합성 자료)</summary>
          <p>예시 A · admin-a@school-a.test<br />예시 B · admin-b@school-b.test</p>
          <p className="muted">로컬 기본 비밀번호는 README의 ‘로컬 실행’을 참고하세요.</p>
        </details>
      </div>
    </main>
  );
}
