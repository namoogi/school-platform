import { loadForPlatform } from '@/lib/page';
import { directiveCounts, KINDS, listItems, PRIORITIES } from '@/lib/lab';
import { LabBoard } from './LabBoard';
import { Banner, PageHeader } from '@/components/ui';
import Link from 'next/link';

/** 81차: 개발·연구소 — 카드 격자(요약·진행·도식 수). 상세에서 표·도식으로 보고, 하단 지침으로 세션에 맡긴다 */
export default async function LabPage() {
  const { items, open, counts } = await loadForPlatform(async ({ db }) => ({
    items: await listItems(db, true),
    open: (await db.query<{ n: number }>("select count(*)::int as n from public.control_requests where status in ('open', 'parked', 'proceeding')")).rows[0].n,
    counts: await directiveCounts(db),
  }));
  return (
    <>
      <PageHeader title="개발·연구소" crumbs={[{ label: '전체 관리' }, { label: '개발·연구소' }]}
        description="기획·도구·방법론·연구·할 일을 카드로 한눈에 봅니다. 카드를 열면 표·도식으로 내용을 보고, 맨 아래 '지침'에 적으면 세션이 그 지침대로 이어서 진행하고 결과를 그 자리에 보고합니다." />
      <Banner tone={open ? 'warning' : 'info'}>
        세션이 결정을 기다리는 일은 <Link href="/admin/control">관제 센터</Link>에 있습니다{open ? ` — 지금 답 필요 ${open}건` : ''}. 연구소 카드의 지침도 관제 센터를 거쳐 세션에 전달됩니다.
      </Banner>
      <LabBoard items={JSON.parse(JSON.stringify(items))} kinds={JSON.parse(JSON.stringify(KINDS))} priorities={{ ...PRIORITIES }} counts={counts} />
    </>
  );
}
