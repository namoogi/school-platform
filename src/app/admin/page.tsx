import { loadForPlatform } from '@/lib/page';
import Link from 'next/link';
import { accessLog, activityByDay, catalog, overview, statements } from '@/lib/admin';
import { BarChart, HBars } from '@/components/Charts';
import { EnterSchoolButton } from '@/components/SchoolSwitcher';
import { DataTable } from '@/components/DataTable';
import { Kpi, PageHeader, StatusBadge, withLink } from '@/components/ui';
import { CreateSchoolForm, PriceForm, SchoolActions } from './AdminClient';
import { getI18n, userLang } from '@/lib/i18n/server';
import { CATALOG, type MsgKey } from '@/lib/i18n/catalog';

// 학교 상태 이름은 사전의 school.status.*, 기록 종류는 log.action.*(학교 설정과 같은 사전)

const RANGES = [7, 14, 30] as const;

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days: rawDays } = await searchParams;
  const days = RANGES.find((d) => String(d) === rawDays) ?? 14;
  const { schools, modules, log, bills, activity, uiLang } = await loadForPlatform(async ({ db }) => ({
    uiLang: await userLang(db),
    schools: await overview(db), modules: await catalog(db), log: await accessLog(db, null, 40), bills: await statements(db, null),
    activity: await activityByDay(db, days),
  }));
  const { t, locale } = await getI18n(uiLang);
  const won = (n: number | null) => (n == null ? '—' : t('common.won', { n: n.toLocaleString(locale) }));
  const STATUS: Record<string, string> = Object.fromEntries(['trial', 'active', 'suspended'].map((k) => [k, t(`school.status.${k}` as MsgKey)]));
  const action = (a: string) => (`log.action.${a}` in CATALOG ? t(`log.action.${a}` as MsgKey) : a);
  const activityTotal = activity.reduce((n, a) => n + a.count, 0);
  const names = Object.fromEntries(schools.map((s) => [s.id, s.name]));
  const moduleName = Object.fromEntries(modules.map((m) => [m.key, m.name]));
  const totalSeats = schools.reduce((n, s) => n + (s.seats ?? 0), 0);
  const monthly = schools.filter((s) => s.status !== 'suspended').reduce((n, s) => n + (s.monthly_estimate_krw ?? 0), 0);
  const period = new Date().toISOString().slice(0, 7);
  const fmt = (d: string) => new Date(d).toLocaleString(locale, { timeZone: 'Asia/Seoul' });
  return (
    <>
      <PageHeader title={t('nav.admin.title')} crumbs={[{ label: t('nav.group.platform') }, { label: t('nav.admin.title') }]}
        description={t('admin.lead')}
        actions={
          <nav className="segmented" aria-label={t('admin.range')}>
            {RANGES.map((d) => <Link key={d} href={`/admin?days=${d}`} aria-current={d === days ? 'true' : undefined}>{t('admin.days', { n: d })}</Link>)}
          </nav>
        } />
      <div className="kpis" data-testid="platform-summary">
        <Kpi label={t('admin.kpi.schools')} value={t('admin.kpi.schoolsValue', { n: schools.length })} hint={t('admin.kpi.schoolsHint', { trial: schools.filter((s) => s.status === 'trial').length, suspended: schools.filter((s) => s.status === 'suspended').length })} />
        <Kpi label={t('admin.kpi.seats')} value={t('admin.kpi.seatsValue', { n: totalSeats })} hint={t('admin.kpi.seatsHint', { n: schools.reduce((n, s) => n + s.seats_used, 0) })} />
        <Kpi label={t('admin.kpi.monthly')} value={won(monthly)} hint={t('admin.kpi.monthlyHint')} />
        <Kpi label={t('admin.kpi.questions')} value={t('common.countItems', { n: schools.reduce((n, s) => n + s.open_questions, 0) })} tone={schools.some((s) => s.open_questions) ? 'warning' : undefined} />
      </div>
      <div className="panel-grid" data-testid="analytics-panels">
        <section className="card panel-wide">
          <div className="card-header"><h2>{t('admin.activity')}</h2><span className="fine">{withLink(t('admin.activitySub', { days }), <span className="analytics-value">{activityTotal}</span>, 'total')}</span></div>
          <BarChart title={t('admin.activityChart', { days })} unit={t('admin.unitItems')} data={activity.map((a) => ({ label: a.day.slice(5).replace('-', '.'), value: a.count }))} />
        </section>
        <section className="card">
          <div className="card-header"><h2>{t('admin.seatUse')}</h2><span className="fine">{t('admin.seatUseSub')}</span></div>
          {schools.length ? <HBars rows={schools.map((s) => ({ label: s.name, value: s.seats_used, max: s.seats ?? 0, note: STATUS[s.status] }))} /> : <p className="muted">{t('admin.noSchools')}</p>}
        </section>
      </div>
      <section className="card">
        <div className="card-header"><h2>{t('admin.schools')}</h2><span className="fine">{t('admin.kpi.schoolsValue', { n: schools.length })}</span></div>
        <DataTable caption={t('admin.schoolList')} testId="school-table" densityControl empty={t('admin.noSchools')}
          columns={[
            { key: 'name', header: t('admin.col.school'), sortable: true }, { key: 'status', header: t('admin.col.status'), sortable: true },
            { key: 'seats', header: t('admin.col.seats'), num: true, sortable: true }, { key: 'modules', header: t('admin.col.modules') },
            { key: 'monthly', header: t('admin.col.monthly'), num: true, sortable: true },
            { key: 'records', header: t('admin.col.records'), num: true, sortable: true }, { key: 'actions', header: t('admin.col.actions'), srOnly: true },
          ]}
          rows={schools.map((s) => ({
            id: s.id,
            sort: { name: s.name, status: STATUS[s.status], seats: s.seats_used, monthly: s.monthly_estimate_krw, records: s.open_questions },
            cells: {
              name: <><strong>{s.name}</strong><br /><small className="muted">{s.slug} · {s.locale}</small></>,
              status: <StatusBadge tone={s.status === 'active' ? 'success' : s.status === 'trial' ? 'info' : 'danger'}>{STATUS[s.status]}</StatusBadge>,
              seats: <>{s.seats_used} / {s.seats ?? '—'}</>,
              modules: (s.modules ?? []).map((k) => moduleName[k] ?? k).join(', '),
              monthly: won(s.monthly_estimate_krw),
              records: <>{s.sources} · {s.documents} · {s.open_questions ? <StatusBadge tone="warning">{s.open_questions}</StatusBadge> : 0}</>,
              actions: <div className="actions"><EnterSchoolButton schoolId={s.id} /><SchoolActions schoolId={s.id} schoolName={s.name} status={s.status} period={period} /></div>,
            },
          }))} />
      </section>
      <div className="grid-2">
        <section className="card"><CreateSchoolForm modules={JSON.parse(JSON.stringify(modules))} /></section>
        <section className="card"><PriceForm modules={JSON.parse(JSON.stringify(modules))} /></section>
        <section className="card">
          <h2>{t('admin.bills')}</h2>
          <p className="fine">{t('admin.billsNote')}</p>
          <DataTable caption={t('admin.bills')} testId="bill-table" empty={t('admin.none')} initialSort={{ key: 'period', dir: 'desc' }}
            columns={[{ key: 'period', header: t('admin.col.month'), sortable: true }, { key: 'school', header: t('admin.col.school'), sortable: true },
              { key: 'seats', header: t('admin.col.seats'), num: true, sortable: true }, { key: 'amount', header: t('admin.col.amount'), num: true, sortable: true }]}
            rows={bills.map((b) => ({
              id: b.id,
              sort: { period: b.period, school: names[b.school_id] ?? '', seats: b.seats, amount: b.amount_krw },
              cells: { period: b.period, school: names[b.school_id] ?? b.school_id.slice(0, 8), seats: b.seats, amount: won(b.amount_krw) },
            }))} />
        </section>
        <section className="card">
          <h2>{t('admin.recentLog')}</h2>
          <ul className="log">{log.map((e) => (
            <li key={e.id}><time>{fmt(e.created_at)}</time> <strong>{e.actor_label}</strong> · {action(e.action)}{e.school_id && <span className="muted"> · {names[e.school_id] ?? ''}</span>}</li>
          ))}</ul>
        </section>
      </div>
    </>
  );
}
