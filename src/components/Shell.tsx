import Link from 'next/link';
import { Bell } from 'lucide-react';
import { Nav, type NavGroup } from './Nav';
import { LeaveSchoolButton, SchoolSwitcher } from './SchoolSwitcher';
import { UiControls } from './UiControls';
import { ChatDock } from './ChatDock';
import { LanguageSwitcher } from './LanguageSwitcher';
import { I18nProvider } from './I18nProvider';
import type { UiChoice, UiScope } from '@/lib/ui-shared';
import type { I18n } from '@/lib/i18n/server';
import type { MsgKey } from '@/lib/i18n/catalog';

type T = I18n['t'];

export type ShellAccount = { name: string; isPlatformAdmin: boolean };
export type ShellSchool = { id: string; name: string; status: string };

/**
 * 앱 셸: 왼쪽 메뉴 + 상단 막대(학교 전환 · 화면 선택 · 알림 · 계정) + 본문.
 * 25차(ADR 0006) 학사 업무형이 학교 기본, 26차(ADR 0007) 분석 대시보드형이 전체 관리 기본.
 * 형식은 data-ui, 명암은 data-mode로 바꾸며 같은 마크업을 CSS 토큰·배치로 다르게 그린다.
 */
export function Shell({ i18n, account, current, schools, groups, roleLabel, inSchoolAsPlatform, inspector = false, alerts, ui, chat, children }: {
  /** ADR 0037: 화면 언어. 셸 글자는 여기서, 안쪽 브라우저 부품은 I18nProvider 로 같은 사전을 쓴다 */
  i18n: I18n;
  account: ShellAccount; current: ShellSchool | null; schools: ShellSchool[]; groups: NavGroup[];
  roleLabel: string; inSchoolAsPlatform?: boolean;
  /** 관제 세션 계정(전체 관리자, ADR 0024) */
  inspector?: boolean; alerts?: { count: number; href: string } | null;
  /** 26차(ADR 0007): 사용자가 고른 화면 형식·명암. 데이터와 무관하게 셸과 토큰만 바꾼다 */
  ui: { scope: UiScope; choice: UiChoice };
  /** 41차(ADR 0017): 어디서나 여는 대화창. platform = 모든 대화, school = 그 학교 대화(학교 관리자) */
  chat?: 'platform' | 'school' | null; children: React.ReactNode;
}) {
  const { t } = i18n;
  return (
    <I18nProvider value={{ lang: i18n.lang, dir: i18n.dir, dict: i18n.dict, languages: i18n.languages.filter((l) => l.active).map((l) => ({ code: l.code, native_name: l.native_name })) }}>
    <div className="app" data-ui={ui.choice.ui} data-mode={ui.choice.mode} data-scope={ui.scope} lang={i18n.lang} dir={i18n.dir}>
      <a className="skip-link" href="#content">{t('shell.skipToContent')}</a>
      <aside className="sidebar" aria-label={t('shell.menu')}>
        <Link className="brand" href="/" aria-label={t('shell.homeLink')}><span className="brand-mark" aria-hidden="true">學</span></Link>
        <Nav groups={groups} />
      </aside>
      <header className="topbar top">
        <SchoolSwitcher current={current} schools={schools} platform={account.isPlatformAdmin} />
        {inSchoolAsPlatform && (inspector
          ? <span className="impersonation" data-testid="inspector-banner">{t('shell.inspectorBanner')} <LeaveSchoolButton /></span>
          : <span className="impersonation">{t('shell.platformViewBanner')} <LeaveSchoolButton /></span>)}
        <div className="topbar-spacer" />
        <div className="topbar-right">
          {chat && <ChatDock scope={chat} />}
          <LanguageSwitcher />
          <UiControls scope={ui.scope} initial={ui.choice} />
          {alerts && (
            <Link className="bell" href={alerts.href}>
              <Bell size={20} aria-hidden="true" />
              {/* 보이는 숫자가 접근 이름에 그대로 들어가게 한다 (WCAG 2.5.3) */}
              {alerts.count > 0
                ? <><span className="sr-only">{t('shell.alertsPending')}</span><span className="bell-count">{alerts.count}</span><span className="sr-only">{t('shell.alertsUnit')}</span></>
                : <span className="sr-only">{t('shell.alertsNone')}</span>}
            </Link>
          )}
          <span className="account"><span className="avatar" aria-hidden="true">{account.name.slice(0, 1)}</span>
            <span className="account-name"><b>{account.name}</b>{roleLabel}</span></span>
          <form method="post" action="/api/logout"><button type="submit" className="btn btn-ghost btn-sm">{t('shell.logout')}</button></form>
        </div>
      </header>
      <div className="content" id="content">
        <main className="content-inner">{children}</main>
      </div>
    </div>
    </I18nProvider>
  );
}

/** 메뉴 한 줄: 짧은 이름·화면 이름 모두 사전에서(nav.<이름>, nav.<이름>.title) */
const item = (t: T, href: string, name: string, count?: number) =>
  ({ href, label: t(`nav.${name}` as MsgKey), title: t(`nav.${name}.title` as MsgKey), ...(count !== undefined ? { count } : {}) });

export function schoolNav(t: T, school: { modules: string[]; isAdmin: boolean; isPlatformAdmin: boolean }, counts: { openQuestions?: number } = {}): NavGroup[] {
  const work: NavGroup['items'] = [item(t, '/home', 'home')];
  if (school.modules.includes('intake')) work.push(item(t, '/intake', 'intake'), item(t, '/review', 'review', counts.openQuestions));
  if (school.modules.includes('records')) work.push(item(t, '/academics', 'academics'), item(t, '/people', 'people'), item(t, '/courses', 'courses'), item(t, '/grades', 'grades'), item(t, '/attendance', 'attendance'), item(t, '/documents', 'documents'), item(t, '/packages', 'packages'));
  if (school.modules.includes('records') && school.isAdmin) work.push(item(t, '/records', 'records'), item(t, '/requests', 'requests'));
  if (school.modules.includes('homepage')) work.push(item(t, '/site', 'site'));
  const groups: NavGroup[] = [{ label: t('nav.group.work'), items: work }];
  if (school.isAdmin) groups.push({ label: t('nav.group.school'), items: [item(t, '/settings', 'settings')] });
  if (school.isPlatformAdmin) groups.push(platformGroup(t));
  return groups;
}

export function platformGroup(t: T): NavGroup {
  return {
    label: t('nav.group.platform'), items: [
      item(t, '/admin', 'admin'), item(t, '/admin/integrations', 'integrations'), item(t, '/admin/control', 'control'),
      item(t, '/admin/usage', 'usage'), item(t, '/admin/baseline', 'baseline'), item(t, '/admin/lab', 'lab'),
      item(t, '/admin/placements', 'placements'), item(t, '/admin/languages', 'languages'), item(t, '/admin/design', 'design'),
    ],
  };
}

export function roleTag(t: T, school: { role: string | null; isPlatformAdmin: boolean }) {
  return school.role === 'admin' ? t('role.admin') : school.role === 'teacher' ? t('role.teacher') : school.isPlatformAdmin ? t('role.platformAdmin') : '';
}
