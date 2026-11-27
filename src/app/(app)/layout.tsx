import { loadForPage } from '@/lib/page';
import { accessibleSchools, me, openQuestion } from '@/lib/services';
import { getUiPrefs } from '@/lib/ui';
import { isInspector } from '@/lib/auth';
import { roleTag, schoolNav, Shell } from '@/components/Shell';
import { getI18n } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { school, account, schools, open, prefs, uiLang } = await loadForPage(async ({ db, school }) => ({
    prefs: await getUiPrefs(db),
    uiLang: (await db.query('select ui_lang from public.user_preferences where user_id = app.uid()')).rows[0]?.ui_lang as string | null,
    account: await me(db),
    schools: await accessibleSchools(db),
    open: school.modules.includes('intake') ? await openQuestion(db, school.id) : null,
  }));
  const i18n = await getI18n(uiLang);
  const { t } = i18n;
  return (
    <Shell i18n={i18n} account={{ name: account.display_name, isPlatformAdmin: account.is_platform_admin }}
      current={{ id: school.id, name: school.name, status: school.status }} schools={schools}
      groups={schoolNav(t, school, { openQuestions: open ? 1 : 0 })} roleLabel={roleTag(t, school)}
      inSchoolAsPlatform={school.isPlatformAdmin && !school.role} inspector={isInspector(account.id)}
      alerts={school.modules.includes('intake') ? { count: open ? 1 : 0, href: '/review' } : null}
      ui={{ scope: 'school', choice: prefs.school }} chat={school.isAdmin ? 'school' : null}>
      {children}
    </Shell>
  );
}
