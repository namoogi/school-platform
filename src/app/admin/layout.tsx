import { loadForPlatform } from '@/lib/page';
import { accessibleSchools } from '@/lib/services';
import { getUiPrefs } from '@/lib/ui';
import { platformGroup, Shell } from '@/components/Shell';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { account, schools, prefs } = await loadForPlatform(async ({ db }) => ({ schools: await accessibleSchools(db), prefs: await getUiPrefs(db) }));
  return (
    <Shell account={{ name: account.display_name, isPlatformAdmin: true }} current={null} schools={schools}
      groups={[platformGroup]} roleLabel="전체 관리자" ui={{ scope: 'platform', choice: prefs.platform }} chat="platform">
      {children}
    </Shell>
  );
}
