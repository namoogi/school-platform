import { loadForPlatform } from '@/lib/page';
import { KINDS, listItems, PRIORITIES } from '@/lib/lab';
import { LabBoard } from './LabBoard';
import { Banner, PageHeader } from '@/components/ui';
import Link from 'next/link';

export default async function LabPage() {
  const { items, open } = await loadForPlatform(async ({ db }) => ({
    items: await listItems(db, true),
    open: (await db.query<{ n: number }>("select count(*)::int as n from public.control_requests where status in ('open', 'parked', 'proceeding')")).rows[0].n,
  }));
  return (
    <>
      <PageHeader title="개발·연구소" crumbs={[{ label: '전체 관리' }, { label: '개발·연구소' }]}
        description="개발 기획, 도구·방법론 비교, 연구소 실험과 할 일을 한곳에서 관리합니다. 바꾼 내용은 이력으로 남습니다." />
      <Banner tone={open ? 'warning' : 'info'}>
        여기 할 일은 선생님이 적어 두는 목록입니다. 세션이 결정을 기다리는 일(승인 대기)은 <Link href="/admin/control">관제 센터</Link>에 있습니다{open ? ` — 지금 답 필요 ${open}건` : ''}. 항목의 ‘세션에 지시’로 세부 내용과 추가 요청사항을 붙여 세션에 맡길 수 있습니다.
      </Banner>
      <LabBoard items={JSON.parse(JSON.stringify(items))} kinds={JSON.parse(JSON.stringify(KINDS))} priorities={{ ...PRIORITIES }} />
    </>
  );
}
