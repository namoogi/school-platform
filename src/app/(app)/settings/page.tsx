import { loadForPage } from '@/lib/page';
import { accessLog, licenseInfo, members, statements } from '@/lib/admin';
import { LINK_KINDS, listLinks } from '@/lib/devlinks';
import { LicenseForm, MembersPanel, PortalAccountsPanel } from './SettingsClient';
import { listPortalAccounts } from '@/lib/portal';
import { listPeople } from '@/lib/people';
import { PageHeader, StatusBadge } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { estimate, fmtBytes, schoolUsage, usd } from '@/lib/usage';
import { baselineOffers, schoolBaseline } from '@/lib/baseline';
import { ActionForm } from '@/components/ActionForm';
import { getI18n, userLang } from '@/lib/i18n/server';
import { CATALOG, type MsgKey } from '@/lib/i18n/catalog';

// 기록 종류 이름은 사전의 log.action.<종류>(없는 종류는 코드 그대로)

export default async function SettingsPage() {
  const { school, license, team, log, bills, links, usage, portal, people, baseline, offers, uiLang } = await loadForPage(async ({ db, school }) => ({
    uiLang: await userLang(db),
    license: await licenseInfo(db, school.id),
    team: await members(db, school.id),
    log: await accessLog(db, school.id, 30),
    bills: await statements(db, school.id),
    links: await listLinks(db, school.id),
    usage: (await schoolUsage(db, school.id))[0],
    portal: await listPortalAccounts(db, school.id),
    people: (await listPeople(db, school.id)).map((p) => ({ id: p.id, name: p.name })),
    baseline: await schoolBaseline(db, school.id),
    offers: await baselineOffers(db, school.id),
  }), { admin: true });
  const { t, locale } = await getI18n(uiLang);
  const fmt = (d: string) => new Date(d).toLocaleString(locale, { timeZone: 'Asia/Seoul' });
  const won = (n: number) => t('common.won', { n: n.toLocaleString(locale) });
  const action = (a: string) => (`log.action.${a}` in CATALOG ? t(`log.action.${a}` as MsgKey) : a);
  return (
    <>
      <PageHeader title={t('nav.settings.title')} crumbs={[{ label: t('settings.crumb') }, { label: t('nav.settings.title') }]}
        description={t('settings.lead')}
        status={<StatusBadge tone={school.status === 'active' ? 'success' : school.status === 'trial' ? 'info' : 'danger'}>{t(school.status === 'trial' ? 'switcher.trial' : school.status === 'active' ? 'home.status.active' : 'switcher.suspended')}</StatusBadge>}
        meta={<><span>{school.name}</span>{license.current && <span>{t('settings.metaLicense', { v: license.current.version })}</span>}</>} />
      {usage && (() => { const e = estimate(usage); return (
        <section className="card" data-testid="school-usage">
          <div className="card-header"><h2>{t('settings.usage')}</h2><span className="fine">{t('settings.usageSub')}</span></div>
          <div className="kpis">
            <div className="kpi"><span className="kpi-label">{t('settings.storage')}</span><span className="kpi-value">{fmtBytes(usage.db_site_bytes + usage.db_source_bytes + usage.r2_bytes)}</span><span className="muted small-text">{t('settings.files', { n: usage.files })}</span></div>
            <div className="kpi"><span className="kpi-label">{t('settings.ai')}</span><span className="kpi-value">{t('settings.times', { n: usage.ai_calls_30d })}</span><span className="muted small-text">{t('settings.tokens', { n: usage.ai_tokens_30d.toLocaleString(locale) })}</span></div>
            <div className="kpi"><span className="kpi-label">{t('settings.agent')}</span><span className="kpi-value">{t('settings.times', { n: usage.agent_actions_30d })}</span><span className="muted small-text">{t('settings.bySubscription')}</span></div>
            <div className="kpi"><span className="kpi-label">{t('settings.monthly')}</span><span className="kpi-value">{usd(e.total)}</span><span className="muted small-text">{t('settings.monthlySub', { storage: usd(e.db + e.r2), ai: usd(e.ai) })}</span></div>
          </div>
        </section>
      ); })()}
      <div className="settings-grid">
        <section className="card" data-testid="license">
          <LicenseForm info={JSON.parse(JSON.stringify(license))} />
        </section>
        <section className="card" data-testid="members">
          <MembersPanel members={JSON.parse(JSON.stringify(team.members))} invitations={JSON.parse(JSON.stringify(team.invitations))}
            seats={license.current?.seats ?? 0} used={license.seatsUsed} />
        </section>
        <section className="card" data-testid="portal-accounts">
          <PortalAccountsPanel accounts={JSON.parse(JSON.stringify(portal))} people={people} />
        </section>
        <section className="card" data-testid="school-dev-links">
          <h2>{t('settings.devLinks')}</h2>
          <p className="fine">{t('settings.devLinksNote')}</p>
          {links.length === 0 ? <p className="muted">{t('settings.noDevLinks')}</p> : (
            <ul className="sources">{links.map((l) => (
              <li key={l.id}><div><strong>{l.label}</strong><small>{LINK_KINDS[l.kind].label} · <a href={l.url} target="_blank" rel="noopener noreferrer">{l.url}</a></small></div></li>
            ))}</ul>)}
        </section>
        <section className="card stack" data-testid="baseline-offers">
          <h2>{t('settings.offers')}</h2>
          <p className="fine">{t('settings.offersNote', { copy: baseline ? t('common.version', { v: baseline.version }) : t('docs.none') })}</p>
          {offers.length === 0 ? <p className="muted">{t('settings.noOffers')}</p> : (
            <ul className="issue-list">{offers.map((o) => {
              const add = o.items.add as { kind: string; item: { code?: string; list_key?: string } }[];
              const conflicts = o.items.conflicts as { kind: string; item: { code?: string; list_key?: string } }[];
              const name = (x: { kind: string; item: { code?: string; list_key?: string } }) => x.kind === 'grading_policy' ? t('settings.policyName') : `${x.kind === 'scale' ? t('settings.scaleName') : x.item.list_key} ${x.item.code ?? ''}`;
              return (
                <li key={o.id} className="stack">
                  <span><strong>{t('settings.offerVersions', { from: o.from_version, to: o.to_version })}</strong> <StatusBadge tone={o.status === 'accepted' ? 'success' : o.status === 'offered' ? 'info' : 'neutral'}>{['offered', 'accepted', 'declined', 'held'].includes(o.status) ? t(`offer.status.${o.status}` as MsgKey) : o.status}</StatusBadge>
                    <small className="muted">{t('settings.offerAdd', { n: add.length })}{add.length ? `(${add.slice(0, 6).map(name).join(', ')}${add.length > 6 ? ' …' : ''})` : ''}{t('settings.offerKeep', { n: conflicts.length })}{conflicts.length ? `(${conflicts.slice(0, 4).map(name).join(', ')}${conflicts.length > 4 ? ' …' : ''})` : ''}{o.note ? ` · ${o.note}` : ''}</small></span>
                  {(o.status === 'offered' || o.status === 'held') && (
                    <ActionForm url="/api/baseline" extra={{ offerId: o.id }} inline submitLabel={t('settings.decide')} successText={t('settings.decided')} testId={`offer-${o.to_version}`}
                      fields={[{ name: 'decision', label: t('settings.decision'), type: 'select', options: ['accepted', 'held', 'declined'].map((v) => ({ value: v, label: t(`offer.status.${v}` as MsgKey) })) },
                        { name: 'note', label: t('settings.memoOptional') }]} />)}
                </li>);
            })}</ul>)}
        </section>
        <section className="card">
          <h2>{t('settings.bills')}</h2>
          <p className="fine">{t('settings.billsNote')}</p>
          <DataTable caption={t('settings.bills')} testId="bill-table" empty={t('settings.noBills')} initialSort={{ key: 'period', dir: 'desc' }}
            columns={[{ key: 'period', header: t('settings.col.period'), sortable: true }, { key: 'seats', header: t('settings.col.seats'), num: true, sortable: true },
              { key: 'modules', header: t('settings.col.modules') }, { key: 'amount', header: t('settings.col.amount'), num: true, sortable: true }]}
            rows={bills.map((b) => ({
              id: b.id,
              sort: { period: b.period, seats: b.seats, amount: b.amount_krw },
              cells: { period: b.period, seats: b.seats, modules: b.modules.map((k) => license.catalog.find((m) => m.key === k)?.name ?? k).join(', '), amount: won(b.amount_krw) },
            }))} />
        </section>
        <section className="card">
          <h2>{t('settings.log')}</h2>
          <p className="fine">{t('settings.logNote')}</p>
          <ul className="log" data-testid="access-log">
            {log.map((e) => (
              <li key={e.id}><time>{fmt(e.created_at)}</time> <strong>{e.actor_label}</strong> · {action(e.action)}
                {typeof e.detail?.email === 'string' && <span className="muted"> · {e.detail.email}</span>}</li>
            ))}
            {log.length === 0 && <li className="muted">{t('settings.noLog')}</li>}
          </ul>
        </section>
      </div>
    </>
  );
}
