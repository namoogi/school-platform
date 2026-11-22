import Link from 'next/link';
import { Nav, type NavGroup } from './Nav';
import { LeaveSchoolButton, SchoolSwitcher } from './SchoolSwitcher';

const ROLE: Record<string, string> = { admin: '학교 관리자', teacher: '교사' };

export type ShellAccount = { name: string; isPlatformAdmin: boolean };
export type ShellSchool = { id: string; name: string; status: string };

/**
 * 앱 셸: 상단 막대(로고 · 학교 전환 · 계정) + 그룹형 왼쪽 탐색 + 본문.
 * 근거: docs/research/ui-rea-2026-11.md §5.2
 */
export function Shell({ account, current, schools, groups, roleLabel, inSchoolAsPlatform, children }: {
  account: ShellAccount; current: ShellSchool | null; schools: ShellSchool[]; groups: NavGroup[];
  roleLabel: string; inSchoolAsPlatform?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="app">
      <a className="skip-link" href="#content">본문으로 건너뛰기</a>
      <header className="topbar top">
        <Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">學</span><span className="brand-text">학교 운영 플랫폼</span></Link>
        <SchoolSwitcher current={current} schools={schools} platform={account.isPlatformAdmin} />
        {inSchoolAsPlatform && <span className="impersonation">전체 관리자로 보는 중 · 접근이 기록됩니다 <LeaveSchoolButton /></span>}
        <div className="topbar-spacer" />
        <div className="topbar-right">
          <span className="account"><span className="avatar" aria-hidden="true">{account.name.slice(0, 1)}</span>
            <span className="account-name">{account.name}{roleLabel && <span className="muted"> · {roleLabel}</span>}</span></span>
          <form method="post" action="/api/logout"><button type="submit" className="btn btn-ghost btn-sm">로그아웃</button></form>
        </div>
      </header>
      <aside className="sidebar" aria-label="메뉴">
        <Nav groups={groups} />
      </aside>
      <div className="content" id="content">
        <main className="content-inner">{children}</main>
      </div>
    </div>
  );
}

export function schoolNav(school: { modules: string[]; isAdmin: boolean; isPlatformAdmin: boolean }, counts: { openQuestions?: number } = {}): NavGroup[] {
  const work: NavGroup['items'] = [];
  if (school.modules.includes('intake')) {
    work.push({ href: '/intake', label: '자료 첨부' }, { href: '/review', label: '관리자 확인', count: counts.openQuestions });
  }
  if (school.modules.includes('records')) work.push({ href: '/documents', label: '학사 문서실' });
  const groups: NavGroup[] = [];
  if (work.length) groups.push({ label: '학사 운영', items: work });
  if (school.isAdmin) groups.push({ label: '학교 관리', items: [{ href: '/settings', label: '학교 설정' }] });
  if (school.isPlatformAdmin) groups.push(platformGroup);
  return groups;
}

export const platformGroup: NavGroup = {
  label: '전체 관리', items: [{ href: '/admin', label: '학교·라이선스' }, { href: '/admin/lab', label: '개발·연구소' }],
};

export function roleTag(school: { role: string | null; isPlatformAdmin: boolean }) {
  return school.role ? ROLE[school.role] : school.isPlatformAdmin ? '전체 관리자' : '';
}
