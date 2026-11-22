import Link from 'next/link';
import { Nav, type NavItem } from './Nav';
import { LeaveSchoolButton } from './SchoolSwitch';

const ROLE: Record<string, string> = { admin: '학교 관리자', teacher: '교사' };

/** 공통 화면 틀. 메뉴는 학교 라이선스(모듈)와 역할에 따라 달라진다. */
export function Shell({ title, subtitle, items, tag, platform, inSchoolAsPlatform, children }: {
  title: string; subtitle: string; items: NavItem[]; tag: string;
  platform: boolean; inSchoolAsPlatform?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="layout">
      <aside>
        <Link className="brand" href="/"><span>學</span><div><strong>학교 운영 플랫폼</strong><small>{subtitle}</small></div></Link>
        <Nav items={items} />
        <div className="aside-foot">
          {platform && <Link className="aside-link" href="/admin">전체 관리</Link>}
          <form method="post" action="/api/logout"><button type="submit" className="link-button">로그아웃</button></form>
        </div>
      </aside>
      <div className="workspace">
        <header className="top">
          <span data-testid="school-name">{title}</span>
          <span className="top-right">
            {inSchoolAsPlatform && <><span className="tag amber">전체 관리자로 보는 중 · 접근이 기록됩니다</span><LeaveSchoolButton /></>}
            <span className="tag">{tag}</span>
          </span>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}

export function schoolNav(school: { modules: string[]; isAdmin: boolean }): NavItem[] {
  const items: NavItem[] = [];
  if (school.modules.includes('intake')) items.push({ href: '/intake', label: '자료 첨부' }, { href: '/review', label: '관리자 확인' });
  if (school.modules.includes('records')) items.push({ href: '/documents', label: '학사 문서실' });
  if (school.isAdmin) items.push({ href: '/settings', label: '학교 설정' });
  return items;
}

export function roleTag(school: { role: string | null; isPlatformAdmin: boolean }) {
  return school.role ? ROLE[school.role] : school.isPlatformAdmin ? '전체 관리자' : '';
}
