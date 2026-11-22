import { loadForPlatform } from '@/lib/page';
import { Shell } from '@/components/Shell';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { account } = await loadForPlatform(async () => ({}));
  return (
    <Shell title="전체 관리" subtitle={account.display_name} tag="전체 관리자" platform
      items={[{ href: '/admin', label: '학교·라이선스' }]}>
      {children}
    </Shell>
  );
}
