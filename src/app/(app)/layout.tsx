import { loadForPage } from '@/lib/page';
import { accessibleSchools, me, openQuestion } from '@/lib/services';
import { getUiPrefs } from '@/lib/ui';
import { roleTag, schoolNav, Shell } from '@/components/Shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { school, account, schools, open, prefs } = await loadForPage(async ({ db, school }) => ({
    prefs: await getUiPrefs(db),
    account: await me(db),
    schools: await accessibleSchools(db),
    open: school.modules.includes('intake') ? await openQuestion(db, school.id) : null,
  }));
  return (
    <Shell account={{ name: account.display_name, isPlatformAdmin: account.is_platform_admin }}
      current={{ id: school.id, name: school.name, status: school.status }} schools={schools}
      groups={schoolNav(school, { openQuestions: open ? 1 : 0 })} roleLabel={roleTag(school)}
      inSchoolAsPlatform={school.isPlatformAdmin && !school.role}
      alerts={school.modules.includes('intake') ? { count: open ? 1 : 0, href: '/review' } : null}
      ui={{ scope: 'school', choice: prefs.school }}>
      {children}
    </Shell>
  );
}
