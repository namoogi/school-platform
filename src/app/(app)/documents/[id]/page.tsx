import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadForPage } from '@/lib/page';
import { getDocument, NotFoundError, verifySnapshot } from '@/lib/services';
import { DocumentPaper } from '@/components/DocumentPaper';
import { PublishButton } from '../DocumentsClient';
import { PageHeader, StatusBadge } from '@/components/ui';
import { getI18n, userLang } from '@/lib/i18n/server';

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data;
  try {
    data = await loadForPage(async ({ db, school }) => ({ doc: await getDocument(db, school.id, id), uiLang: await userLang(db) }), { module: 'records' });
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { doc, school, uiLang } = data;
  const { t, locale } = await getI18n(uiLang, school.locale);
  const s = doc.snapshot;
  const intact = verifySnapshot(doc);
  return (
    <>
      <PageHeader title={s.template.title}
        crumbs={[{ label: t('intake.crumb') }, { href: '/documents', label: t('nav.documents.title') }, { label: t('docs.issuedN', { id: doc.id.slice(0, 8) }) }]}
        status={doc.superseded_by ? <StatusBadge>{t('docs.prevVersionRevised')}</StatusBadge> : <StatusBadge tone="success" dot>{t('docs.issued')}</StatusBadge>}
        meta={<><span><time dateTime={new Date(doc.published_at).toISOString()}>{t('docs.issuedAt', { when: new Date(doc.published_at).toLocaleString(locale, { timeZone: 'Asia/Seoul' }) })}</time></span><span>{t('docs.revisionNo', { n: doc.revision_number })}</span><span>{t('docs.ruleTpl', { rule: s.rule.version, tpl: s.template.version })}</span></>} />
      <div className="docs-grid">
        <div className="stack">
          <section className="card">
            <h2>{t('docs.basisAtIssue')}</h2>
            <dl className="facts" data-testid="doc-facts">
              <dt>{t('docs.termRule')}</dt><dd>{t('docs.ruleWithHow', { v: s.rule.version, how: t(s.rule.decision === 'accepted' ? 'rule.decision.accepted' : 'rule.decision.edited') })}</dd>
              {s.rule.rationale && <><dt>{t('review.rationale')}</dt><dd>{s.rule.rationale}</dd></>}
              <dt>{t('docs.template')}</dt><dd>{t('common.version', { v: s.template.version })}</dd>
              <dt>{t('docs.sources')}</dt><dd>{s.sources.map((f) => <div key={f.id}>{f.name} <code title={f.sha256 ?? ''}>{f.sha256?.slice(0, 8)}</code></div>)}</dd>
              <dt>{t('docs.integrity')}</dt><dd>{intact ? <StatusBadge tone="success">{t('docs.intact')}</StatusBadge> : <StatusBadge tone="danger">{t('docs.hashMismatch')}</StatusBadge>}</dd>
            </dl>
          </section>
          <section className="card">
            <h2>{t('docs.revisions')}</h2>
            <ul className="doc-list">
              {doc.revision_of && <li>{t('docs.prevIssue')}<Link href={`/documents/${doc.revision_of}`} data-testid="prev-link">{doc.revision_number === 2 ? t('docs.firstIssue') : t('docs.revisionN', { n: doc.revision_number - 2 })}</Link></li>}
              {doc.superseded_by
                ? <li>{t('docs.nextRevision')}<Link href={`/documents/${doc.superseded_by}`} data-testid="next-link">{t('common.open')}</Link></li>
                : school.isAdmin && <li><p className="muted">{t('docs.reviseNote')}</p><PublishButton revisionOf={doc.id} label={t('docs.issueRevision')} /></li>}
            </ul>
          </section>
        </div>
        <section className="paper-wrap">
          <div className="between"><span className="overline">{t('docs.issuedLabel')}</span><span className="muted">{t('docs.fromSnapshot')}</span></div>
          <DocumentPaper snapshot={s} status={t('docs.paperStatus', { id: doc.id.slice(0, 8) })} />
        </section>
      </div>
    </>
  );
}
