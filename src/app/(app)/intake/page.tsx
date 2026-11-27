import { loadForPage } from '@/lib/page';
import { flowProgress, listSources, openQuestion } from '@/lib/services';
import { LEARNING_STEPS, PageHeader, Steps, StatusBadge } from '@/components/ui';
import { IntakeClient } from './IntakeClient';
import { getI18n, userLang } from '@/lib/i18n/server';

export default async function IntakePage() {
  const { sources, question, done, uiLang, school } = await loadForPage(async ({ db, school }) => ({
    uiLang: await userLang(db),
    sources: await listSources(db, school.id),
    question: await openQuestion(db, school.id),
    done: await flowProgress(db, school.id),
  }), { module: 'intake' });
  const { t } = await getI18n(uiLang, school.locale);
  return (
    <>
      <PageHeader title={t('steps.intake')} crumbs={[{ label: t('intake.crumb') }, { label: t('steps.intake') }]}
        description={t('intake.lead')}
        meta={<><span>{t('intake.metaRegistered', { n: sources.length })}</span><span>{t('intake.metaParsed', { n: sources.filter((s) => s.status === 'parsed').length })}</span><span>{t('intake.metaWaiting', { n: sources.filter((s) => s.status !== 'parsed').length })}</span></>}
        status={question ? <StatusBadge tone="warning" dot>{t('intake.questionBadge')}</StatusBadge> : undefined}
        actions={question ? <a className="btn btn-primary" href="/review">{t('intake.toQuestion')}</a> : undefined}>
        <Steps current="intake" done={done} items={LEARNING_STEPS} />
      </PageHeader>
      <IntakeClient sources={JSON.parse(JSON.stringify(sources))} />
    </>
  );
}
