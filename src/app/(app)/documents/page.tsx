import Link from 'next/link';
import { loadForPage } from '@/lib/page';
import { buildSnapshot, flowProgress, latestRule, latestTemplate, listDocuments } from '@/lib/services';
import { LEARNING_STEPS, PageHeader, Steps, StatusBadge } from '@/components/ui';
import { DocumentPaper } from '@/components/DocumentPaper';
import { PublishButton, TemplateForm } from './DocumentsClient';
import { getI18n, userLang } from '@/lib/i18n/server';

export default async function DocumentsPage() {
  const { rule, template, docs, preview, school, done, uiLang } = await loadForPage(async ({ db, school }) => {
    const rule = await latestRule(db, school.id);
    const template = await latestTemplate(db, school.id);
    const preview = rule && template ? await buildSnapshot(db, school, rule, template, { number: 1, of: null }) : null;
    return { rule, template, docs: await listDocuments(db, school.id), preview, done: await flowProgress(db, school.id), uiLang: await userLang(db) };
  }, { module: 'records' });
  const { t, locale } = await getI18n(uiLang);
  return (
    <>
      <PageHeader title={t('nav.documents.title')} crumbs={[{ label: t('intake.crumb') }, { label: t('nav.documents.title') }]}
        description={t('docs.lead')}
        meta={<><span>{t('docs.metaIssued', { n: docs.length })}</span>{rule && <span>{t('docs.metaRule', { v: rule.version })}</span>}{template && <span>{t('docs.metaTemplate', { v: template.version })}</span>}</>}
        status={rule ? undefined : <StatusBadge tone="warning">{t('docs.ruleNotConfirmed')}</StatusBadge>}>
        <Steps current="documents" done={done} items={LEARNING_STEPS} />
      </PageHeader>
      <div className="docs-grid">
        <div className="stack">
          <section className="card">
            <div className="between"><h2>{t('docs.basis')}</h2></div>
            <dl className="facts">
              <dt>{t('docs.termRule')}</dt><dd>{rule ? <span className="tag green">{t('common.version', { v: rule.version })}</span> : <span className="tag amber">{t('docs.notConfirmed')}</span>}</dd>
              <dt>{t('docs.template')}</dt><dd>{template ? <span className="tag">{t('common.version', { v: template.version })} · {template.title}</span> : t('docs.none')}</dd>
            </dl>
            {!rule && <p className="muted">{t('docs.confirmFirst')} <Link href="/review">{t('docs.toReview')}</Link></p>}
            {rule && (school.isAdmin ? <PublishButton /> : <p className="muted">{t('docs.adminIssues')}</p>)}
          </section>
          {template && school.isAdmin && <section className="card"><TemplateForm template={JSON.parse(JSON.stringify(template))} /></section>}
          <section className="card">
            <div className="between"><h2>{t('docs.history')}</h2><span className="tag">{t('common.countItems', { n: docs.length })}</span></div>
            {docs.length === 0 && <p className="muted empty">{t('docs.empty')}</p>}
            <ul className="doc-list" data-testid="doc-list">
              {docs.map((d) => (
                <li key={d.id}>
                  <Link href={`/documents/${d.id}`}>{d.snapshot.template.title}</Link>
                  <span className="tag">{d.revision_number === 1 ? t('docs.firstIssue') : t('docs.revisionN', { n: d.revision_number - 1 })}</span>
                  {d.superseded_by && <span className="tag amber">{t('docs.hasRevision')}</span>}
                  <small className="muted">{t('docs.itemMeta', { rule: d.snapshot.rule.version, tpl: d.snapshot.template.version, when: new Date(d.published_at).toLocaleString(locale, { timeZone: 'Asia/Seoul' }) })}</small>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <section className="paper-wrap">
          <div className="between"><span className="overline">{t('docs.preview')}</span><span className="muted">{t('docs.previewBasis')}</span></div>
          {preview ? <DocumentPaper snapshot={preview} status={t('docs.previewStatus')} /> : <p className="muted empty">{t('docs.previewEmpty')}</p>}
        </section>
      </div>
    </>
  );
}
