import { loadForPage } from '@/lib/page';
import { listSources, openQuestion } from '@/lib/services';
import { IntakeClient } from './IntakeClient';

export default async function IntakePage() {
  const { sources, question } = await loadForPage(async ({ db, school }) => ({
    sources: await listSources(db, school.id),
    question: await openQuestion(db, school.id),
  }));
  return (
    <>
      <div className="page-head">
        <div><h1>학교 제도 분석</h1><p>학교 자료를 여러 번에 나눠 올리면 기존 목록에 더해집니다. 읽은 행을 근거로 관리자에게 확인을 요청합니다.</p></div>
      </div>
      <div className="summary">
        <strong>학교 자료</strong>
        <span className="tag">등록 {sources.length}개</span>
        <span className="tag green">내용을 읽음 {sources.filter((s) => s.status === 'parsed').length}개</span>
        <span className="tag amber">읽기 대기 {sources.filter((s) => s.status !== 'parsed').length}개</span>
        {question && <a className="tag blue" href="/review">확인할 질문 1건</a>}
      </div>
      <IntakeClient sources={JSON.parse(JSON.stringify(sources))} />
    </>
  );
}
