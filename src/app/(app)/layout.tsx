import { loadForPage } from '@/lib/page';
import { roleTag, schoolNav, Shell } from '@/components/Shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { school } = await loadForPage(async () => ({}));
  const statusTag = school.status === 'trial' ? ' · 시범' : school.status === 'suspended' ? ' · 이용 중지' : '';
  return (
    <Shell title={school.name} subtitle={school.name} items={schoolNav(school)} tag={`${roleTag(school)}${statusTag}`}
      platform={school.isPlatformAdmin} inSchoolAsPlatform={school.isPlatformAdmin && !school.role}>
      {children}
    </Shell>
  );
}
