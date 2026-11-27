import { Fragment } from 'react';
import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { portalPeople, portalRecord, portalRequests } from '@/lib/portal';
import { AnnotateForm, RequestForm } from './MyClient';
import { PageHeader, StatusBadge } from '@/components/ui';
import { I18nProvider } from '@/components/I18nProvider';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { getI18n, providerValue, userLang } from '@/lib/i18n/server';
import { CATALOG, type MsgKey } from '@/lib/i18n/catalog';

export const dynamic = 'force-dynamic';

// ADR 0037: 셸 밖 화면이라 사전 공급자·언어 전환 단추를 직접 둔다. 보호자도 자기 언어로 본다

/** 62차(ADR 0029): 학생·보호자 '내 기록' — 열람 계약(app.portal_record_v1)만 읽는다 */
export default async function MyRecordPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const userId = await requireUser();
  const sp = await searchParams;
  const { people, record, requests, chosenId, uiLang } = await asUser(userId, async (db) => {
    const people = await portalPeople(db);
    const chosen = people.find((x) => x.person_id === sp.p) ?? people[0];
    return { people, uiLang: await userLang(db), chosenId: chosen?.person_id ?? null, record: chosen ? await portalRecord(db, chosen.person_id) : null,
      requests: chosen ? await portalRequests(db, chosen.person_id) : [] };
  });
  const i18n = await getI18n(uiLang);
  const { t, lang, locale } = i18n;
  // 형식 이름은 사전의 rec.format.*, 데이터의 언어 칸은 화면 언어 → 한국어 → 영어 → 첫 칸
  const formatName = (f: string) => (`rec.format.${f}` in CATALOG ? t(`rec.format.${f}` as MsgKey) : f);
  const pick = (m: Record<string, string> | undefined) => (m ? m[lang] ?? m.ko ?? m.en ?? Object.values(m)[0] ?? '' : '');
  const day = (d: string) => new Date(d).toLocaleDateString(locale, { timeZone: 'Asia/Seoul' });
  const status = (s: string) => (`req.status.${s}` in CATALOG ? t(`req.status.${s}` as MsgKey) : s);
  return (
    <I18nProvider value={providerValue(i18n)}>
    <div className="portal" lang={i18n.lang} dir={i18n.dir}>
      <header className="portal-top">
        <strong>{t('my.title')}</strong>
        <span className="row-wrap"><LanguageSwitcher />
          <form method="post" action="/api/logout"><button type="submit" className="btn btn-ghost btn-sm">{t('shell.logout')}</button></form></span>
      </header>
      <main className="content-inner content-narrow portal-main" id="main">
        {!record ? (
          <section className="card"><h1>{t('my.noRecordTitle')}</h1><p className="muted">{t('my.noRecordBody')}</p></section>
        ) : (
          <>
            <PageHeader title={`${record.student?.name ?? ''} ${record.relation === 'child' ? t('my.child') : ''}`.trim()} crumbs={[{ label: record.school }, { label: t('my.title') }]}
              description={t('my.lead')} />
            {people.length > 1 && (
              <nav className="row-wrap" aria-label={t('my.whom')}>
                {people.map((x) => <Link key={`${x.school_id}:${x.person_id}`} className="btn btn-sm" aria-current={x.person_id === (sp.p ?? people[0].person_id) ? 'page' : undefined}
                  href={`/my?p=${x.person_id}`}>{x.name} · {x.school}</Link>)}
              </nav>
            )}
            {record.attendance_current && (
              <section className="card" data-testid="my-attendance">
                <h2>{t('my.attendanceTitle')} <small className="muted">{t('my.attendanceUntil', { year: record.attendance_current.year })}</small></h2>
                <p>{t('my.attendanceLine', { days: record.attendance_current.enrolled_days, absent: record.attendance_current.absent_days })}
                  {Object.keys(record.attendance_current.absent_by_reason).length > 0 && <span className="muted"> ({Object.entries(record.attendance_current.absent_by_reason).map(([k, v]) => `${k} ${v}`).join(', ')})</span>}</p>
              </section>
            )}
            <section className="card" data-testid="my-records">
              <h2>{t('my.records')}</h2>
              {record.record_years.length === 0 && <p className="muted">{t('my.noYears')}</p>}
              {record.record_years.map((y) => (
                <div key={y.year.label} className="stack">
                  <h3>{y.year.label} <small className="muted">{t('my.yearMeta', { v: y.version, when: day(y.closed_at) })}{y.reason ? ` · ${y.reason}` : ''}</small></h3>
                  {y.courses.length > 0 && (
                    <div className="table-wrap"><table className="grid-table"><thead><tr><th>{t('my.col.subject')}</th><th>{t('my.col.term')}</th><th>{t('my.col.credits')}</th><th>{t('my.col.result')}</th></tr></thead>
                      <tbody>{y.courses.map((c) => <tr key={`${c.subject_code}-${c.term}`}><td>{pick(c.labels.record) || pick(c.labels.all) || c.subject_name}</td><td>{c.term}</td>
                        <td>{Number(c.result.credits_earned)}/{Number(c.credits)}</td><td>{c.result.level_code ?? (c.result.attempt_status === 'withdrawn' ? t('grade.attempt.withdrawn') : '—')}</td></tr>)}</tbody></table></div>
                  )}
                  {y.narratives.length > 0 && <dl className="facts">{y.narratives.map((n, i) => <Fragment key={i}><dt>{n.kind === 'behavior' || n.kind === 'subject_detail' ? t(`my.narr.${n.kind}`) : n.kind}</dt><dd>{n.body}</dd></Fragment>)}</dl>}
                  {y.attendance && <p className="fine">{t('my.attendanceYear', { days: Number(y.attendance.enrolled_days), absent: Number(y.attendance.absent_days) })}</p>}
                </div>
              ))}
            </section>
            {record.school_records.length > 0 && (
              <section className="card" data-testid="my-school-records">
                <h2>{t('my.schoolRecords')}</h2>
                <ul className="issue-list">{record.school_records.map((r, i) => (
                  <li key={i}><span><strong>{pick(r.title)}</strong> {r.state && <StatusBadge tone="neutral">{r.state}</StatusBadge>}{' '}
                    {r.fields.map((f) => `${pick(f.label)}: ${Array.isArray(f.value) ? f.value.join(', ') : String(f.value)}`).join(' · ')}</span></li>
                ))}</ul>
              </section>
            )}
            <section className="card" data-testid="my-documents">
              <h2>{t('my.documents')}</h2>
              {record.documents.length === 0 ? <p className="muted">{t('my.noDocuments')}</p> : (
                <ul className="issue-list">{record.documents.map((d) => (
                  <li key={d.id}><Link href={`/my/documents/${d.id}`}>{formatName(d.format)}</Link> <small className="muted">{day(d.published_at)}</small></li>
                ))}</ul>)}
            </section>
            <section className="card" data-testid="my-requests">
              <h2>{t('my.requests')}</h2>
              {requests.length > 0 && (
                <ul className="issue-list">{requests.map((r) => (
                  <li key={r.id} className="stack">
                    <span><StatusBadge tone={r.status === 'denied' ? 'warning' : ['granted', 'amended', 'closed', 'not_applicable'].includes(r.status) ? 'neutral' : 'info'}>{status(r.status)}</StatusBadge>{' '}
                      <strong>{t(r.kind === 'amend' ? 'my.amendRequest' : 'my.inspectRequest')}</strong> {r.body} <small className="muted">{t('my.dueBy', { date: r.due_on })}</small></span>
                    {r.events.filter((e) => e.note).map((e, i) => <small key={i} className="muted">{status(e.status)}: {e.note}</small>)}
                    {r.annotation ? <small>{t('my.myStatement', { body: r.annotation.body })}</small> : r.kind === 'amend' && r.events.some((e) => e.status === 'denied') && <AnnotateForm requestId={r.id} />}
                  </li>
                ))}</ul>
              )}
              {chosenId && <RequestForm personId={chosenId} />}
            </section>
          </>
        )}
      </main>
    </div>
    </I18nProvider>
  );
}
