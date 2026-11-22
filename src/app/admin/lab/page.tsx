import { loadForPlatform } from '@/lib/page';
import { KINDS, listItems, PRIORITIES } from '@/lib/lab';
import { LabBoard } from './LabBoard';
import { PageHeader } from '@/components/ui';

export default async function LabPage() {
  const { items } = await loadForPlatform(async ({ db }) => ({ items: await listItems(db, true) }));
  return (
    <>
      <PageHeader title="개발·연구소" crumbs={[{ label: '전체 관리' }, { label: '개발·연구소' }]}
        description="개발 기획, 도구·방법론 비교, 연구소 실험과 할 일을 한곳에서 관리합니다. 바꾼 내용은 이력으로 남습니다." />
      <LabBoard items={JSON.parse(JSON.stringify(items))} kinds={JSON.parse(JSON.stringify(KINDS))} priorities={{ ...PRIORITIES }} />
    </>
  );
}
