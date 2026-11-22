import { loadForPage } from '@/lib/page';
import { flowProgress, listSources, openQuestion } from '@/lib/services';
import { LEARNING_STEPS, PageHeader, Steps, StatusBadge } from '@/components/ui';
import { IntakeClient } from './IntakeClient';

export default async function IntakePage() {
  const { sources, question, done } = await loadForPage(async ({ db, school }) => ({
    sources: await listSources(db, school.id),
    question: await openQuestion(db, school.id),
    done: await flowProgress(db, school.id),
  }), { module: 'intake' });
  return (
    <>
      <PageHeader title="자료 첨부" crumbs={[{ label: '학사 운영' }, { label: '자료 첨부' }]}
        description="학교 자료를 여러 번에 나눠 올리면 기존 목록에 더해집니다. 읽은 행을 근거로 관리자에게 확인을 요청합니다."
        meta={<><span>등록 {sources.length}개</span><span>내용을 읽음 {sources.filter((s) => s.status === 'parsed').length}개</span><span>읽기 대기 {sources.filter((s) => s.status !== 'parsed').length}개</span></>}
        status={question ? <StatusBadge tone="warning" dot>확인할 질문 1건</StatusBadge> : undefined}
        actions={question ? <a className="btn btn-primary" href="/review">질문 확인하기</a> : undefined}>
        <Steps current="intake" done={done} items={LEARNING_STEPS} />
      </PageHeader>
      <IntakeClient sources={JSON.parse(JSON.stringify(sources))} />
    </>
  );
}
