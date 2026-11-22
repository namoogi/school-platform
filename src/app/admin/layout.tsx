import { loadForPlatform } from '@/lib/page';
import { accessibleSchools } from '@/lib/services';
import { platformGroup, Shell } from '@/components/Shell';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { account, schools } = await loadForPlatform(async ({ db }) => ({ schools: await accessibleSchools(db) }));
  return (
    <Shell account={{ name: account.display_name, isPlatformAdmin: true }} current={null} schools={schools}
      groups={[platformGroup]} roleLabel="전체 관리자">
      {children}
    </Shell>
  );
}
