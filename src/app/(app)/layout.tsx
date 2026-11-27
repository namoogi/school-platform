import { loadForPage } from '@/lib/page';
import { accessibleSchools, me, openQuestion } from '@/lib/services';
import { getUiPrefs } from '@/lib/ui';
import { isInspector } from '@/lib/auth';
import { roleTag, schoolNav, Shell } from '@/components/Shell';
import { getI18n } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { school, account, schools, open, prefs, uiLang, placement } = await loadForPage(async ({ db, school }) => ({
    prefs: await getUiPrefs(db),
    uiLang: (await db.query('select ui_lang from public.user_preferences where user_id = app.uid()')).rows[0]?.ui_lang as string | null,
    account: await me(db),
    schools: await accessibleSchools(db),
    open: school.modules.includes('intake') ? await openQuestion(db, school.id) : null,
    // ADR 0038: 이 학교가 다른 주소(전용·독립)로 옮겼으면 안내한다
    placement: (await db.query(
      `select state, target_url from public.school_placements where school_id = $1 order by version desc limit 1`, [school.id])).rows[0] as
      { state: string; target_url: string | null } | undefined,
  }));
  const i18n = await getI18n(uiLang, school.locale);
  const { t } = i18n;
  return (
    <Shell i18n={i18n} account={{ name: account.display_name, isPlatformAdmin: account.is_platform_admin }}
      current={{ id: school.id, name: school.name, status: school.status }} schools={schools}
      groups={schoolNav(t, school, { openQuestions: open ? 1 : 0 })} roleLabel={roleTag(t, school)}
      inSchoolAsPlatform={school.isPlatformAdmin && !school.role} inspector={isInspector(account.id)}
      alerts={school.modules.includes('intake') ? { count: open ? 1 : 0, href: '/review' } : null}
      ui={{ scope: 'school', choice: prefs.school }} chat={school.isAdmin ? 'school' : null}>
      {placement?.state === 'moved' && placement.target_url && (
        <p className="alert" role="status" data-testid="moved-banner">{t('placement.movedBanner', { url: '' })}<a href={placement.target_url}>{placement.target_url}</a></p>
      )}
      {children}
    </Shell>
  );
}
