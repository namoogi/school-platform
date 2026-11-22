import Link from 'next/link';
import { loadForPage } from '@/lib/page';
import { buildSnapshot, flowProgress, latestRule, latestTemplate, listDocuments } from '@/lib/services';
import { LEARNING_STEPS, PageHeader, Steps, StatusBadge } from '@/components/ui';
import { DocumentPaper } from '@/components/DocumentPaper';
import { PublishButton, TemplateForm } from './DocumentsClient';

export default async function DocumentsPage() {
  const { rule, template, docs, preview, school, done } = await loadForPage(async ({ db, school }) => {
    const rule = await latestRule(db, school.id);
    const template = await latestTemplate(db, school.id);
    const preview = rule && template ? await buildSnapshot(db, school, rule, template, { number: 1, of: null }) : null;
    return { rule, template, docs: await listDocuments(db, school.id), preview, done: await flowProgress(db, school.id) };
  }, { module: 'records' });
  return (
    <>
      <PageHeader title="학사 문서실" crumbs={[{ label: '학사 운영' }, { label: '학사 문서실' }]}
        description="확정한 학기 규칙과 현재 양식으로 문서를 발행합니다. 발행본은 당시 값을 그대로 보관합니다."
        meta={<><span>발행 {docs.length}건</span>{rule && <span>규칙 {rule.version}판</span>}{template && <span>양식 {template.version}판</span>}</>}
        status={rule ? undefined : <StatusBadge tone="warning">규칙 확정 전</StatusBadge>}>
        <Steps current="documents" done={done} items={LEARNING_STEPS} />
      </PageHeader>
      <div className="docs-grid">
        <div className="stack">
          <section className="card">
            <div className="between"><h2>발행 기준</h2></div>
            <dl className="facts">
              <dt>학기 규칙</dt><dd>{rule ? <span className="tag green">{rule.version}판</span> : <span className="tag amber">확정 전</span>}</dd>
              <dt>양식</dt><dd>{template ? <span className="tag">{template.version}판 · {template.title}</span> : '없음'}</dd>
            </dl>
            {!rule && <p className="muted">관리자 확인에서 학기 규칙을 먼저 확정해 주세요. <Link href="/review">관리자 확인으로</Link></p>}
            {rule && (school.isAdmin ? <PublishButton /> : <p className="muted">발행은 학교 관리자가 합니다.</p>)}
          </section>
          {template && school.isAdmin && <section className="card"><TemplateForm template={JSON.parse(JSON.stringify(template))} /></section>}
          <section className="card">
            <div className="between"><h2>발행 기록</h2><span className="tag">{docs.length}건</span></div>
            {docs.length === 0 && <p className="muted empty">아직 발행한 문서가 없습니다.</p>}
            <ul className="doc-list" data-testid="doc-list">
              {docs.map((d) => (
                <li key={d.id}>
                  <Link href={`/documents/${d.id}`}>{d.snapshot.template.title}</Link>
                  <span className="tag">{d.revision_number === 1 ? '첫 발행' : `수정 ${d.revision_number - 1}`}</span>
                  {d.superseded_by && <span className="tag amber">수정본 있음</span>}
                  <small className="muted">규칙 {d.snapshot.rule.version}판 · 양식 {d.snapshot.template.version}판 · {new Date(d.published_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</small>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <section className="paper-wrap">
          <div className="between"><span className="overline">발행 전 미리보기</span><span className="muted">현재 규칙·양식 기준</span></div>
          {preview ? <DocumentPaper snapshot={preview} status="미리보기 · 아직 발행 전" /> : <p className="muted empty">확정한 규칙이 생기면 미리보기가 나타납니다.</p>}
        </section>
      </div>
    </>
  );
}
