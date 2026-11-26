import Link from 'next/link';
import { loadForPage } from '@/lib/page';
import { recordDocument, verifyRecordDocument } from '@/lib/records';
import { disclosuresOf } from '@/lib/recordbook';
import { PageHeader, StatusBadge } from '@/components/ui';
import { ActionForm } from '@/components/ActionForm';
import { PrintButton } from '@/components/PrintButton';
import { RecordDocumentView } from '@/components/RecordDocumentView';

const PURPOSE = [{ value: 'issued_to_student', label: '학생·보호자 발급' }, { value: 'transfer', label: '전학 이관' }, { value: 'admission', label: '입학 지원 제출' }, { value: 'other', label: '기타' }];

/** 75차: 발행본 보기·인쇄 — 저장한 스냅샷만 그리고(지침 5), 해시를 다시 계산해 바뀌지 않았음을 보인다. 공개 기록(받는 곳·목적·근거) */
export default async function RecordDocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { doc, ok, disclosures } = await loadForPage(async ({ db, school }) => ({
    doc: await recordDocument(db, school.id, id), ok: await verifyRecordDocument(db, school.id, id), disclosures: await disclosuresOf(db, school.id, id),
  }), { module: 'records', admin: true });
  const issues = (doc.issues ?? []) as { level: string; where: string; message: string }[];
  const back = doc.person_id ? `/records?p=${doc.person_id}` : '/records';
  return (
    <>
      <PageHeader title={(doc.content?.title as string) ?? '발행본'} crumbs={[{ label: '학사 운영' }, { label: '기록', href: back }, { label: '발행본' }]}
        description={`발행 ${new Date(doc.published_at).toLocaleString('ko-KR')} · 확인값 ${String(doc.content_sha256).slice(0, 16)}…`}
        meta={<>{ok ? <StatusBadge tone="success">내용 확인됨</StatusBadge> : <StatusBadge tone="danger">확인값 불일치</StatusBadge>}{doc.blind ? <StatusBadge tone="neutral">블라인드</StatusBadge> : null}</>}
        actions={<><Link className="btn" href={back}>기록으로</Link><PrintButton /></>} />
      {issues.length > 0 && (
        <section className="card stack" data-testid="doc-issues">
          <h2>발행 때 남긴 확인 사항 <small className="muted">{issues.length}</small></h2>
          <ul className="issue-list">{issues.map((i, n) => <li key={n}><span>{i.level === 'question' ? <StatusBadge tone="danger">질문</StatusBadge> : <StatusBadge tone="neutral">참고</StatusBadge>} <strong>{i.where}</strong> {i.message}</span></li>)}</ul>
        </section>)}
      <div className="paper-wrap"><div className="paper"><RecordDocumentView content={doc.content} /></div></div>
      <section className="card stack" data-testid="disclosures">
        <h2>공개 기록 <small className="muted">받는 곳·목적·근거</small></h2>
        {disclosures.length === 0 ? <p className="muted">아직 내보낸 기록이 없습니다.</p> : (
          <ul className="issue-list">{disclosures.map((d) => <li key={d.id}><span><strong>{d.recipient}</strong> <small className="muted">{PURPOSE.find((p) => p.value === d.purpose)?.label ?? d.purpose} · {new Date(d.disclosed_at).toLocaleString('ko-KR')}{d.basis ? ` · ${d.basis}` : ''}</small></span></li>)}</ul>)}
        <ActionForm url="/api/records" action="disclose" extra={{ documentId: doc.id }} inline submitLabel="공개 기록 남기기" successText="공개 기록을 남겼습니다." testId="disclose-form"
          fields={[{ name: 'recipient', label: '받는 곳', required: true, placeholder: '○○고등학교 입학처' }, { name: 'purpose', label: '목적', type: 'select', options: PURPOSE },
            { name: 'basis', label: '근거(선택)', placeholder: '본인 동의서 2026-11-26' }]} />
      </section>
    </>
  );
}
