import { Fragment } from 'react';
import { loadForPage } from '@/lib/page';
import { listAcademicYears, listSchoolLevels, listTerms } from '@/lib/people';
import { latestPeriodRule } from '@/lib/academics';
import { PageHeader, StatusBadge } from '@/components/ui';
import { ActionForm } from '@/components/ActionForm';
import { RuleForm } from './RuleForm';
import { getI18n, userLang } from '@/lib/i18n/server';

/** 71차: 학교 구조 — 학교급·학년도·학기 구조(확정 규칙 판)·학년도별 학기와 날짜 */
export default async function AcademicsPage() {
  const { levels, years, rule, terms, school, uiLang } = await loadForPage(async ({ db, school }) => {
    const years = await listAcademicYears(db, school.id);
    const terms: Record<string, Awaited<ReturnType<typeof listTerms>>> = {};
    for (const y of years) terms[y.id] = await listTerms(db, school.id, y.id);
    return { levels: await listSchoolLevels(db, school.id), years, rule: await latestPeriodRule(db, school.id), terms, uiLang: await userLang(db) };
  }, { module: 'records' });
  const admin = school.isAdmin;
  const { t } = await getI18n(uiLang);
  return (
    <>
      <PageHeader title={t('nav.academics.title')} crumbs={[{ label: t('intake.crumb') }, { label: t('nav.academics.title') }]}
        description={t('academics.lead')}
        meta={<><span>{t('academics.metaLevels', { n: levels.length })}</span><span>{t('academics.metaYears', { n: years.length })}</span>{rule && <span>{t('academics.metaRule', { v: rule.version })}</span>}</>} />
      <div className="settings-grid">
        <section className="card" data-testid="levels">
          <h2>{t('academics.levels')}</h2>
          {levels.length === 0 ? <p className="muted">{t('academics.levelsEmpty')}</p>
            : <ul className="issue-list">{levels.map((l) => <li key={l.id}><strong>{l.name}</strong> <small className="muted">{l.code}</small></li>)}</ul>}
          {admin && <ActionForm url="/api/academics" action="level" inline submitLabel={t('academics.addLevel')} successText={t('academics.levelAdded')} testId="level-form"
            fields={[{ name: 'name', label: t('common.name'), required: true, placeholder: t('academics.levelPlaceholder') }, { name: 'code', label: t('academics.codeLabel'), required: true, placeholder: 'middle' }]} />}
        </section>
        <section className="card" data-testid="period-rule">
          <h2>{t('academics.termStructure')} {rule && <StatusBadge tone="neutral">{t('common.version', { v: rule.version })}</StatusBadge>}</h2>
          {rule ? <p className="fine">{rule.value.periods.map((p) => p.label).join(' · ')}{rule.rationale ? t('academics.ruleReason', { why: rule.rationale }) : rule.decision === 'accepted' ? t('academics.ruleFromFiles') : ''}</p>
            : <p className="muted">{t('academics.ruleEmpty')}</p>}
          {admin && <RuleForm baseVersion={rule?.version ?? 0} current={rule?.value.periods ?? []} />}
        </section>
      </div>
      <section className="card" data-testid="years">
        <h2>{t('academics.yearsTerms')}</h2>
        {years.length === 0 && <p className="muted">{t('academics.yearsEmpty')}</p>}
        {years.map((y) => (
          <div key={y.id} className="stack">
            <h3>{y.label} <small className="muted">{y.starts_on} ~ {y.ends_on}</small></h3>
            {terms[y.id].length === 0
              ? (admin && rule ? <ActionForm url="/api/academics" action="terms" extra={{ yearId: y.id }} fields={[]} submitLabel={t('academics.makeTerms', { v: rule.version })} successText={t('academics.termsMade')} testId={`terms-${y.label}`} />
                : <p className="muted">{t('academics.ruleFirst')}</p>)
              : <dl className="facts">{terms[y.id].map((tm) => (
                <Fragment key={tm.id}><dt>{tm.label}</dt><dd>
                  {tm.starts_on ? `${tm.starts_on} ~ ${tm.ends_on}` : <span className="muted">{t('academics.noDates')}</span>}
                  {admin && <ActionForm url="/api/academics" action="term-dates" extra={{ termId: tm.id }} inline submitLabel={t('academics.saveDates')} successText={t('academics.datesSaved')}
                    fields={[{ name: 'startsOn', label: t('common.start'), type: 'date', required: true, defaultValue: tm.starts_on ?? '' }, { name: 'endsOn', label: t('common.end'), type: 'date', required: true, defaultValue: tm.ends_on ?? '' }]} />}
                </dd></Fragment>))}</dl>}
          </div>
        ))}
        {admin && <><h3>{t('academics.addYear')}</h3><ActionForm url="/api/academics" action="year" inline submitLabel={t('academics.addYear')} successText={t('academics.yearAdded')} testId="year-form"
          fields={[{ name: 'label', label: t('common.name'), required: true, placeholder: '2027' }, { name: 'startsOn', label: t('common.start'), type: 'date', required: true }, { name: 'endsOn', label: t('academics.yearEnd'), type: 'date', required: true }]} /></>}
      </section>
    </>
  );
}
