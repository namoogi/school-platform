import { loadForPage } from '@/lib/page';
import { listRecordRequests, retentionRule } from '@/lib/portal';
import { getI18n, userLang } from '@/lib/i18n/server';
import type { MsgKey } from '@/lib/i18n/catalog';
import { listPeople } from '@/lib/people';
import { PageHeader, StatusBadge } from '@/components/ui';
import { DecideForm, RedactPanel, RetentionForm } from './RequestsClient';

/** 63차(ADR 0030·0028): 학생·보호자의 열람·수정 요청과 이의 의견서, 보존 규칙과 파기(가림 판) */
export default async function RequestsPage() {
  const { requests, rule, people, uiLang, school } = await loadForPage(async ({ db, school }) => ({
    uiLang: await userLang(db),
    requests: await listRecordRequests(db, school.id),
    rule: await retentionRule(db, school.id),
    people: (await listPeople(db, school.id)).map((p) => ({ id: p.id, name: p.name })),
  }), { module: 'records', admin: true });
  const open = requests.filter((r) => !['granted', 'amended', 'not_applicable', 'closed'].includes(r.status));
  const today = new Date().toISOString().slice(0, 10);
  const { t } = await getI18n(uiLang, school.locale);
  const status = (s: string) => t(`req.status.${s}` as MsgKey);
  return (
    <>
      <PageHeader title={t('nav.requests.title')} crumbs={[{ label: t('intake.crumb') }, { label: t('nav.requests.title') }]}
        description={t('req.lead')}
        meta={<><span>{t('req.metaOpen', { n: open.length })}</span><span>{t('req.metaOverdue', { n: open.filter((r) => r.due_on < today).length })}</span></>} />
      <section className="card" data-testid="request-list">
        <h2>{t('req.list')}</h2>
        {requests.length === 0 && <p className="muted empty">{t('req.empty')}</p>}
        <ul className="issue-list">{requests.map((r) => (
          <li key={r.id} className="stack">
            <span><StatusBadge tone={r.status === 'denied' ? 'warning' : open.includes(r) ? (r.due_on < today ? 'danger' : 'info') : 'neutral'}>{status(r.status)}</StatusBadge>{' '}
              <strong>{r.name}</strong> <small className="muted">{t(r.requester_relation === 'child' ? 'req.byGuardian' : 'req.bySelf')} · {t(r.kind === 'amend' ? 'req.kind.amend' : 'req.kind.inspect')} · {t('req.due', { date: r.due_on })}</small></span>
            <span>{r.body}</span>
            {r.events.filter((e) => e.note).map((e, i) => <small key={i} className="muted">{status(e.status)}: {e.note}</small>)}
            {r.annotation && <small>{t('req.statement', { body: r.annotation.body })}</small>}
            <DecideForm id={r.id} status={r.status} />
          </li>
        ))}</ul>
      </section>
      <div className="settings-grid">
        <section className="card">
          <h2>{t('req.retention')}</h2>
          <p className="fine">{rule ? `${t('common.version', { v: rule.version })} · ${rule.years_after_exit == null ? t('req.forever') : t('req.yearsAfter', { n: rule.years_after_exit })}${rule.why ? ` · ${rule.why}` : ''}` : t('req.noRule')}</p>
          <RetentionForm current={rule} />
        </section>
        <section className="card">
          <h2>{t('req.redaction')}</h2>
          <p className="fine">{t('req.redactionNote')}</p>
          <RedactPanel people={people} />
        </section>
      </div>
    </>
  );
}
