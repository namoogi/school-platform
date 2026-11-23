import Link from 'next/link';
import { Bell } from 'lucide-react';
import { Nav, type NavGroup } from './Nav';
import { LeaveSchoolButton, SchoolSwitcher } from './SchoolSwitcher';
import { UiControls } from './UiControls';
import { ChatDock } from './ChatDock';
import type { UiChoice, UiScope } from '@/lib/ui-shared';

const ROLE: Record<string, string> = { admin: '학교 관리자', teacher: '교사' };

export type ShellAccount = { name: string; isPlatformAdmin: boolean };
export type ShellSchool = { id: string; name: string; status: string };

/**
 * 앱 셸: 왼쪽 메뉴 + 상단 막대(학교 전환 · 화면 선택 · 알림 · 계정) + 본문.
 * 25차(ADR 0006) 학사 업무형이 학교 기본, 26차(ADR 0007) 분석 대시보드형이 전체 관리 기본.
 * 형식은 data-ui, 명암은 data-mode로 바꾸며 같은 마크업을 CSS 토큰·배치로 다르게 그린다.
 */
export function Shell({ account, current, schools, groups, roleLabel, inSchoolAsPlatform, inspector = false, alerts, ui, chat, children }: {
  account: ShellAccount; current: ShellSchool | null; schools: ShellSchool[]; groups: NavGroup[];
  roleLabel: string; inSchoolAsPlatform?: boolean;
  /** 30차 Claude 점검 계정(읽기 전용). 쓰기가 막혀 입장 기록을 남기지 못하고 토큰 마지막 사용 시각만 남는다(ADR 0010) */
  inspector?: boolean; alerts?: { count: number; href: string } | null;
  /** 26차(ADR 0007): 사용자가 고른 화면 형식·명암. 데이터와 무관하게 셸과 토큰만 바꾼다 */
  ui: { scope: UiScope; choice: UiChoice };
  /** 41차(ADR 0017): 어디서나 여는 대화창. platform = 모든 대화, school = 그 학교 대화(학교 관리자) */
  chat?: 'platform' | 'school' | null; children: React.ReactNode;
}) {
  return (
    <div className="app" data-ui={ui.choice.ui} data-mode={ui.choice.mode} data-scope={ui.scope}>
      <a className="skip-link" href="#content">본문으로 건너뛰기</a>
      <aside className="sidebar" aria-label="메뉴">
        <Link className="brand" href="/" aria-label="학교 운영 플랫폼 홈"><span className="brand-mark" aria-hidden="true">學</span></Link>
        <Nav groups={groups} />
      </aside>
      <header className="topbar top">
        <SchoolSwitcher current={current} schools={schools} platform={account.isPlatformAdmin} />
        {inSchoolAsPlatform && (inspector
          ? <span className="impersonation" data-testid="inspector-banner">Claude 점검(읽기 전용)으로 보는 중 · 점검 토큰의 마지막 사용 시각이 남습니다 <LeaveSchoolButton /></span>
          : <span className="impersonation">전체 관리자로 보는 중 · 접근이 기록됩니다 <LeaveSchoolButton /></span>)}
        <div className="topbar-spacer" />
        <div className="topbar-right">
          {chat && <ChatDock scope={chat} />}
          <UiControls scope={ui.scope} initial={ui.choice} />
          {alerts && (
            <Link className="bell" href={alerts.href}>
              <Bell size={20} aria-hidden="true" />
              {/* 보이는 숫자가 접근 이름에 그대로 들어가게 한다 (WCAG 2.5.3) */}
              {alerts.count > 0
                ? <><span className="sr-only">확인 대기 </span><span className="bell-count">{alerts.count}</span><span className="sr-only">건</span></>
                : <span className="sr-only">확인 대기 없음</span>}
            </Link>
          )}
          <span className="account"><span className="avatar" aria-hidden="true">{account.name.slice(0, 1)}</span>
            <span className="account-name"><b>{account.name}</b>{roleLabel}</span></span>
          <form method="post" action="/api/logout"><button type="submit" className="btn btn-ghost btn-sm">로그아웃</button></form>
        </div>
      </header>
      <div className="content" id="content">
        <main className="content-inner">{children}</main>
      </div>
    </div>
  );
}

export function schoolNav(school: { modules: string[]; isAdmin: boolean; isPlatformAdmin: boolean }, counts: { openQuestions?: number } = {}): NavGroup[] {
  const work: NavGroup['items'] = [{ href: '/home', label: '홈', title: '홈 · 오늘의 학사 업무' }];
  if (school.modules.includes('intake')) {
    work.push({ href: '/intake', label: '자료', title: '자료 첨부' }, { href: '/review', label: '확인', title: '관리자 확인', count: counts.openQuestions });
  }
  if (school.modules.includes('records')) work.push({ href: '/documents', label: '문서', title: '학사 문서실' });
  if (school.modules.includes('homepage')) work.push({ href: '/site', label: '홈페이지', title: '학교 홈페이지' });
  const groups: NavGroup[] = [{ label: '학사', items: work }];
  if (school.isAdmin) groups.push({ label: '학교', items: [{ href: '/settings', label: '설정', title: '학교 설정' }] });
  if (school.isPlatformAdmin) groups.push(platformGroup);
  return groups;
}

export const platformGroup: NavGroup = {
  label: '전체 관리', items: [
    { href: '/admin', label: '학교', title: '학교·라이선스' },
    { href: '/admin/integrations', label: '연동', title: '학교별 개발 연동' },
    { href: '/admin/control', label: '관제', title: '관제 센터' },
    { href: '/admin/usage', label: '사용량', title: '사용량·저장소' },
    { href: '/admin/lab', label: '연구소', title: '개발·연구소' },
    { href: '/admin/design', label: '디자인', title: '디자인 원형' },
  ],
};

export function roleTag(school: { role: string | null; isPlatformAdmin: boolean }) {
  return school.role ? ROLE[school.role] : school.isPlatformAdmin ? '전체 관리자' : '';
}
