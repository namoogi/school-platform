import Link from 'next/link';
import { loadForPage } from '@/lib/page';
import { Nav } from '@/components/Nav';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { school } = await loadForPage(async () => ({}));
  return (
    <div className="layout">
      <aside>
        <Link className="brand" href="/intake"><span>學</span><div><strong>학교 운영 플랫폼</strong><small>{school.name}</small></div></Link>
        <Nav />
        <form method="post" action="/api/logout" className="logout"><button type="submit" className="link-button">로그아웃</button></form>
      </aside>
      <div className="workspace">
        <header className="top"><span data-testid="school-name">{school.name}</span><span className="tag">개발판 · 합성 자료</span></header>
        <main>{children}</main>
      </div>
    </div>
  );
}
