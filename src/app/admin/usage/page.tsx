import { loadForPlatform } from '@/lib/page';
import { estimate, fmtBytes, platformEstimate, PRICES, schoolUsage, storageStatus, usd } from '@/lib/usage';
import { Kpi, PageHeader, StatusBadge } from '@/components/ui';
import { StorageActions } from './StorageActions';
import { getI18n, userLang } from '@/lib/i18n/server';

export default async function UsagePage() {
  const { rows, uiLang } = await loadForPlatform(async ({ db }) => ({ rows: await schoolUsage(db, null), uiLang: await userLang(db) }));
  const { t, locale } = await getI18n(uiLang);
  const st = storageStatus();
  const total = platformEstimate(rows);
  const dbOnly = rows.reduce((n, r) => n + r.db_only_files, 0);
  return (
    <>
      <PageHeader title={t('nav.usage.title')} crumbs={[{ label: t('nav.group.platform') }, { label: t('nav.usage.title') }]}
        description={t('usage.lead', { checked: PRICES.checked, r2: PRICES.r2GbMonth, db: PRICES.dbGbMonth })} />
      <div className="kpis" data-testid="usage-summary">
        <Kpi label={t('usage.kpi.monthly')} value={usd(total.total)} hint={`DB ${usd(total.db)} · R2 ${usd(total.r2)} · AI ${usd(total.ai)}`} />
        <Kpi label={t('usage.kpi.r2')} value={fmtBytes(total.r2Gb * 1024 ** 3)} hint={t('usage.kpi.r2Free', { n: PRICES.r2FreeGb })} />
        <Kpi label={t('usage.kpi.dbFiles')} value={fmtBytes(total.dbGb * 1024 ** 3)} tone={dbOnly ? 'warning' : undefined} hint={t('usage.kpi.toMove', { n: dbOnly })} />
      </div>

      <section className="card" data-testid="storage-card">
        <div className="card-header">
          <h2>{t('usage.r2Title')}</h2>
          {st.configured ? <StatusBadge tone="success" dot>{t('usage.configured', { bucket: st.bucket })}</StatusBadge> : <StatusBadge tone="warning" dot>{t('usage.notConfigured')}</StatusBadge>}
        </div>
        <p className="muted small-text">
          {st.configured
            ? t('usage.r2On')
            : t('usage.r2Off')}
        </p>
        <StorageActions configured={st.configured} left={dbOnly} />
      </section>

      <section className="card">
        <div className="card-header"><h2>{t('usage.bySchool')}</h2><span className="fine">{t('usage.bySchoolSub')}</span></div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label={t('usage.tableAria')}>
          <table className="grid-table" data-testid="usage-table">
            <thead><tr>
              <th scope="col">{t('usage.col.school')}</th><th scope="col" className="num">{t('usage.col.files')}</th><th scope="col" className="num">{t('usage.col.db')}</th><th scope="col" className="num">{t('usage.col.r2')}</th>
              <th scope="col" className="num">{t('usage.col.ai')}</th><th scope="col" className="num">{t('usage.col.agent')}</th><th scope="col" className="num">{t('usage.col.monthly')}</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const e = estimate(r);
                return (
                  <tr key={r.id}>
                    <th scope="row">{r.name}</th>
                    <td className="num">{r.files}{r.db_only_files > 0 && <span className="muted">{t('usage.dbOnly', { n: r.db_only_files })}</span>}</td>
                    <td className="num">{fmtBytes(r.db_site_bytes + r.db_source_bytes)}</td>
                    <td className="num">{fmtBytes(r.r2_bytes)}</td>
                    <td className="num">{t('usage.calls', { n: r.ai_calls_30d })} · {r.ai_tokens_30d.toLocaleString(locale)}</td>
                    <td className="num">{t('usage.calls', { n: r.agent_actions_30d })}</td>
                    <td className="num"><b>{usd(e.total)}</b></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted small-text">{t('usage.aiNote')}</p>
      </section>
    </>
  );
}
