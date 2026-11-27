import { loadForPlatform } from '@/lib/page';
import { accessibleSchools } from '@/lib/services';
import { getUiPrefs } from '@/lib/ui';
import { platformGroup, Shell } from '@/components/Shell';
import { getI18n } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { account, schools, prefs, uiLang } = await loadForPlatform(async ({ db }) => ({
    schools: await accessibleSchools(db), prefs: await getUiPrefs(db),
    uiLang: (await db.query('select ui_lang from public.user_preferences where user_id = app.uid()')).rows[0]?.ui_lang as string | null,
  }));
  const i18n = await getI18n(uiLang);
  return (
    <Shell i18n={i18n} account={{ name: account.display_name, isPlatformAdmin: true }} current={null} schools={schools}
      groups={[platformGroup(i18n.t)]} roleLabel={i18n.t('role.platformAdmin')} ui={{ scope: 'platform', choice: prefs.platform }} chat="platform">
      {children}
    </Shell>
  );
}
