import { loadForPlatform } from '@/lib/page';
import { latestBaseline, latestReports, offerCounts } from '@/lib/baseline';
import { Kpi, PageHeader, StatusBadge } from '@/components/ui';
import { ActionForm } from '@/components/ActionForm';
import { getI18n, userLang } from '@/lib/i18n/server';
import { CATALOG, type MsgKey } from '@/lib/i18n/catalog';

// 제안 상태 이름은 사전의 offer.status.*(학교 설정과 같은 사전)

/**
 * 76차 ADR 0027: 관제 기본판·보고. 기본판은 판으로 내고, 학교에는 '제안'으로 간다(학교가 수락하면 추가할 것만 반영, 학교가 고친 값과 부딪치면 학교 값 유지).
 * 학교 정보는 보고 계약(app.school_report_v1) 스냅샷으로만 모은다 — 학교 내부 표를 직접 읽지 않는다.
 */
export default async function BaselinePage() {
  const { base, reports, offers, uiLang } = await loadForPlatform(async ({ db }) => ({
    uiLang: await userLang(db),
    base: await latestBaseline(db), reports: await latestReports(db), offers: await offerCounts(db),
  }));
  const { t, locale } = await getI18n(uiLang);
  const status = (s: string) => (`offer.status.${s}` in CATALOG ? t(`offer.status.${s}` as MsgKey) : s);
  const m = base?.manifest ?? {};
  const sum = (k: 'students_enrolled' | 'offerings' | 'closures' | 'people') => reports.reduce((n, r) => n + Number(r.data.counts?.[k] ?? 0), 0);
  const behind = reports.filter((r) => base && (r.data.baseline_version ?? 0) < base.version).length;
  const byVersion = [...new Set(offers.map((o) => o.to_version))];
  return (
    <>
      <PageHeader title={t('nav.baseline.title')} crumbs={[{ label: t('nav.group.platform') }, { label: t('nav.baseline.title') }]}
        description={t('base.lead')} />
      <div className="kpis" data-testid="report-kpis">
        <Kpi label={t('base.kpi.reported')} value={String(reports.length)} hint={reports[0] ? t('base.kpi.latest', { when: new Date(reports.map((r) => r.collected_at).sort().at(-1)!).toLocaleString(locale) }) : t('base.kpi.notCollected')} />
        <Kpi label={t('base.kpi.students')} value={String(sum('students_enrolled'))} hint={t('base.kpi.people', { n: sum('people') })} />
        <Kpi label={t('base.kpi.offerings')} value={`${sum('offerings')} · ${sum('closures')}`} />
        <Kpi label={t('base.kpi.behind')} value={String(behind)} tone={behind ? 'warning' : undefined} hint={base ? t('base.kpi.latestV', { v: base.version }) : t('base.kpi.none')} />
      </div>
      <section className="card stack" data-testid="reports">
        <div className="card-header"><h2>{t('base.reports')}</h2>
          <ActionForm url="/api/admin/baseline" action="collect" fields={[]} submitLabel={t('base.collect')} successText={t('base.collected')} testId="collect-reports" /></div>
        {reports.length === 0 ? <p className="muted">{t('base.noReports')}</p> : (
          <div className="table-wrap" tabIndex={0} role="region" aria-label={t('base.tableAria')}><table className="grid-table">
            <thead><tr>{(['school', 'status', 'baseline', 'enrolled', 'staff', 'offerings', 'closures', 'site', 'collected'] as const).map((c) => <th key={c} scope="col">{t(`base.col.${c}`)}</th>)}</tr></thead>
            <tbody>{reports.map((r) => (
              <tr key={r.school_id}><th scope="row">{r.data.school.name}</th><td>{r.data.school.status}</td>
                <td>{r.data.baseline_version ?? '-'}{base && (r.data.baseline_version ?? 0) < base.version ? <> <StatusBadge tone="warning">{t('base.behindBadge')}</StatusBadge></> : null}</td>
                <td>{r.data.counts.students_enrolled}</td><td>{r.data.counts.staff_active}</td><td>{r.data.counts.offerings}</td><td>{r.data.counts.closures}</td><td>{r.data.counts.site_entries}</td>
                <td>{new Date(r.collected_at).toLocaleString(locale)}</td></tr>))}</tbody>
          </table></div>)}
        <p className="fine">{t('base.contract', { contract: reports[0]?.contract ?? 'school-report/1' })}</p>
      </section>
      <section className="card stack" data-testid="baseline">
        <h2>{t('base.title')} {base ? <StatusBadge tone="success">{t('common.version', { v: base.version })}</StatusBadge> : null}</h2>
        {base ? <p className="fine">{base.title}{base.why ? ` · ${base.why}` : ''}{t('base.summary', { codes: m.code_lists?.length ?? 0, scales: m.scales?.length ?? 0, policy: t(m.grading_policy ? 'base.yes' : 'base.no') })}</p> : <p className="muted">{t('base.empty')}</p>}
        {byVersion.length > 0 && <ul className="issue-list">{byVersion.map((v) => (
          <li key={v}><span><strong>{t('base.offerV', { v })}</strong> <small className="muted">{offers.filter((o) => o.to_version === v).map((o) => `${status(o.status)} ${o.n}`).join(' · ')}</small></span></li>))}</ul>}
        <details><summary>{t('base.publishJson')}</summary>
          <ActionForm url="/api/admin/baseline" action="publish" extra={{ base_version: base?.version ?? 0 }} submitLabel={t('base.publish')} successText={t('base.published')} testId="baseline-form"
            confirmText={t('base.publishConfirm')}
            fields={[{ name: 'title', label: t('base.fieldTitle'), required: true, defaultValue: base?.title ?? '' }, { name: 'why', label: t('base.fieldWhy'), required: true, width: 'wide' },
              { name: 'manifest', label: t('base.fieldManifest'), type: 'textarea', required: true, width: 'wide', defaultValue: JSON.stringify(m, null, 2) }]} />
        </details>
      </section>
    </>
  );
}
