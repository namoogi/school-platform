import { loadForPlatform } from '@/lib/page';
import { accessibleSchools } from '@/lib/services';
import { currentPlacements, placementHistories, TIER_COST_USD, TIERS, type Tier } from '@/lib/placement';
import { getI18n } from '@/lib/i18n/server';
import type { MsgKey } from '@/lib/i18n/catalog';
import { PageHeader, StatusBadge } from '@/components/ui';
import { PlacementForm } from './PlacementForm';

/** ADR 0038: 학교별 격리 등급 배정(전체 관리) */
export default async function PlacementsPage() {
  const { schools, current, histories, uiLang } = await loadForPlatform(async ({ db }) => {
    const schools = await accessibleSchools(db);
    return {
      schools, current: await currentPlacements(db),
      histories: await placementHistories(db),
      uiLang: (await db.query('select ui_lang from public.user_preferences where user_id = app.uid()')).rows[0]?.ui_lang as string | null,
    };
  });
  const { t } = await getI18n(uiLang);
  const tierName = (k: Tier) => t(`placement.tier.${k}` as MsgKey);
  const cost = (k: Tier) => { const r = TIER_COST_USD[k]; return r ? t('placement.costRange', { min: r[0], max: r[1] }) : t('placement.costSchool'); };
  return (
    <>
      <PageHeader title={t('placement.title')} crumbs={[{ label: t('nav.group.platform') }, { label: t('placement.title') }]} description={t('placement.lead')} />
      <section className="card">
        <div className="table-wrap">
          <table className="grid-table" data-testid="tier-guide">
            <thead><tr><th scope="col">{t('placement.tier')}</th><th scope="col">{t('placement.reason')}</th><th scope="col" className="num">{t('placement.cost')}</th></tr></thead>
            <tbody>{TIERS.map((k) => (
              <tr key={k}><th scope="row">{tierName(k)}</th><td>{t(`placement.tier.${k}.desc` as MsgKey)}</td><td className="num">{cost(k)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      {schools.map((s) => {
        const p = current[s.id];
        return (
          <section className="card" key={s.id} data-testid="placement-card">
            <div className="card-header">
              <h2>{s.name}</h2>
              <span>
                <StatusBadge tone={!p || p.tier === 'shared' ? 'neutral' : 'info'}>{tierName(p?.tier ?? 'shared')}</StatusBadge>{' '}
                <StatusBadge tone={p?.state === 'moved' ? 'success' : p?.state === 'moving' ? 'warning' : 'neutral'} dot>{t(`placement.state.${p?.state ?? 'active'}` as MsgKey)}</StatusBadge>
              </span>
            </div>
            <PlacementForm schoolId={s.id} current={p ? { version: p.version, tier: p.tier, state: p.state, target_url: p.target_url, monthly_cost_usd: p.monthly_cost_usd } : null} />
            <details>
              <summary>{t('placement.history')}</summary>
              {histories[s.id]?.length ? (
                <ol className="activity">{histories[s.id].map((h) => (
                  <li key={h.version}><span><b>{t('placement.version')} {h.version}</b> · {tierName(h.tier)} · {t(`placement.state.${h.state}` as MsgKey)}{h.target_url ? ` · ${h.target_url}` : ''}</span>
                    <span className="fine">{h.reason}</span><time dateTime={h.created_at}>{new Date(h.created_at).toISOString().slice(0, 16).replace('T', ' ')}</time></li>
                ))}</ol>
              ) : <p className="fine">{t('placement.none')}</p>}
            </details>
          </section>
        );
      })}
    </>
  );
}
