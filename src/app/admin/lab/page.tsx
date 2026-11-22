import { loadForPlatform } from '@/lib/page';
import { KINDS, listItems, PRIORITIES } from '@/lib/lab';
import { LabBoard } from './LabBoard';

export default async function LabPage() {
  const { items } = await loadForPlatform(async ({ db }) => ({ items: await listItems(db, true) }));
  return (
    <>
      <div className="page-head">
        <div><h1>개발·연구소</h1><p>개발 기획, 도구·방법론 비교, 연구소 실험과 할 일을 한곳에서 관리합니다. 바꾼 내용은 이력으로 남습니다.</p></div>
      </div>
      <LabBoard items={JSON.parse(JSON.stringify(items))} kinds={JSON.parse(JSON.stringify(KINDS))} priorities={{ ...PRIORITIES }} />
    </>
  );
}
