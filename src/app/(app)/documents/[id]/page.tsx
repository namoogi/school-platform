import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadForPage } from '@/lib/page';
import { getDocument, NotFoundError, verifySnapshot } from '@/lib/services';
import { DocumentPaper } from '@/components/DocumentPaper';
import { PublishButton } from '../DocumentsClient';
import { PageHeader, StatusBadge } from '@/components/ui';

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data;
  try {
    data = await loadForPage(async ({ db, school }) => ({ doc: await getDocument(db, school.id, id) }), { module: 'records' });
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { doc, school } = data;
  const s = doc.snapshot;
  const intact = verifySnapshot(doc);
  return (
    <>
      <PageHeader title={s.template.title}
        crumbs={[{ label: '학사 운영' }, { href: '/documents', label: '학사 문서실' }, { label: `발행본 ${doc.id.slice(0, 8)}` }]}
        status={doc.superseded_by ? <StatusBadge>이전 판 · 수정본 있음</StatusBadge> : <StatusBadge tone="success" dot>발행됨</StatusBadge>}
        meta={<><span>발행 <time dateTime={new Date(doc.published_at).toISOString()}>{new Date(doc.published_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</time></span><span>수정 차수 {doc.revision_number}</span><span>규칙 {s.rule.version}판 · 양식 {s.template.version}판</span></>} />
      <div className="docs-grid">
        <div className="stack">
          <section className="card">
            <h2>발행 당시 기준</h2>
            <dl className="facts" data-testid="doc-facts">
              <dt>학기 규칙</dt><dd>{s.rule.version}판 ({s.rule.decision === 'accepted' ? '분석 결과 확인' : '관리자 수정'})</dd>
              {s.rule.rationale && <><dt>수정 근거</dt><dd>{s.rule.rationale}</dd></>}
              <dt>양식</dt><dd>{s.template.version}판</dd>
              <dt>근거 자료</dt><dd>{s.sources.map((f) => <div key={f.id}>{f.name} <code title={f.sha256 ?? ''}>{f.sha256?.slice(0, 8)}</code></div>)}</dd>
              <dt>무결성</dt><dd>{intact ? <StatusBadge tone="success">발행 당시 값과 일치</StatusBadge> : <StatusBadge tone="danger">해시 불일치</StatusBadge>}</dd>
            </dl>
          </section>
          <section className="card">
            <h2>수정 이력</h2>
            <ul className="doc-list">
              {doc.revision_of && <li>앞선 발행본: <Link href={`/documents/${doc.revision_of}`} data-testid="prev-link">{doc.revision_number === 2 ? '첫 발행' : `수정 ${doc.revision_number - 2}`}</Link></li>}
              {doc.superseded_by
                ? <li>다음 수정본: <Link href={`/documents/${doc.superseded_by}`} data-testid="next-link">열기</Link></li>
                : school.isAdmin && <li><p className="muted">현재 확정 규칙·양식으로 이 문서의 수정본을 발행합니다. 이 발행본은 그대로 남습니다.</p><PublishButton revisionOf={doc.id} label="수정본 발행" /></li>}
            </ul>
          </section>
        </div>
        <section className="paper-wrap">
          <div className="between"><span className="overline">발행본</span><span className="muted">스냅샷에서 재현</span></div>
          <DocumentPaper snapshot={s} status={`발행본 · ${doc.id.slice(0, 8)}`} />
        </section>
      </div>
    </>
  );
}
