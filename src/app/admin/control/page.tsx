import Link from 'next/link';
import { loadForPlatform } from '@/lib/page';
import { listControl, NEEDS_USER, STATUS } from '@/lib/control';
import { isUuid } from '@/lib/services';
import { Kpi, PageHeader } from '@/components/ui';
import { ControlCenter } from './ControlCenter';

export default async function ControlPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const { requests, sessions, lab } = await loadForPlatform(async ({ db }) => {
    const data = await listControl(db);
    // 개발·연구소 항목에서 '세션에 지시'로 들어오면 그 항목의 제목·내용을 새 지시에 채운다
    const lab = from && isUuid(from)
      ? (await db.query<{ id: string; title: string; body: string }>('select id, title, body from public.platform_items where id = $1', [from])).rows[0] ?? null
      : null;
    return { ...data, lab };
  });
  const count = (s: string[]) => requests.filter((r) => s.includes(r.status)).length;
  return (
    <>
      <PageHeader title="관제 센터" crumbs={[{ label: '전체 관리' }, { label: '관제 센터' }]}
        description={<>세션들이 올린 결정 요청과 선생님의 지시를 한곳에서 다룹니다. 세부 내용을 보고 선택지를 고르거나 추가 요청사항을 적어 보내면, 관제 세션이 해당 세션에 전달하거나 새 세션을 만들어 실행합니다. 세션은 답을 기다리며 멈추지 않습니다(되돌릴 수 있는 일은 추천안으로 먼저 진행). 할 일 목록은 <Link href="/admin/lab">개발·연구소</Link>.</>} />
      <div className="kpis" data-testid="control-summary">
        <Kpi label="답 필요" value={`${count(NEEDS_USER)}건`} tone={count(NEEDS_USER) ? 'warning' : undefined}
          hint={`보류 ${count(['parked'])} · 추천안 진행 중 ${count(['proceeding'])}`} />
        <Kpi label={STATUS.answered.label} value={`${count(['answered'])}건`} hint="관제가 세션에 보낼 지시" />
        <Kpi label={STATUS.delivered.label} value={`${count(['delivered'])}건`} hint="세션이 일하는 중" />
      </div>
      <ControlCenter requests={JSON.parse(JSON.stringify(requests))} sessions={sessions} lab={lab} />
    </>
  );
}
