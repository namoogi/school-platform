import Link from 'next/link';
import { loadForPage } from '@/lib/page';
import { listPeople, listSchoolLevels, nameHistory } from '@/lib/people';
import { enrolledToday, personEnrollments } from '@/lib/academics';
import { isUuid } from '@/lib/services';
import { PageHeader, StatusBadge, withLink } from '@/components/ui';
import { ActionForm } from '@/components/ActionForm';
import { getI18n, userLang } from '@/lib/i18n/server';
import type { MsgKey } from '@/lib/i18n/catalog';

// 학적 상태 이름은 사전의 enroll.status.<상태>
const STATUSES = ['enrolled', 'graduated', 'transferred_out', 'withdrawn'];

/** 71차: 사람·학적 — 사람은 id로만 구분하고 이름은 판으로 쌓는다(지침 7). 학적은 학교급 단위 기간 */
export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ id?: string; q?: string }> }) {
  const sp = await searchParams;
  const { people, levels, enrolled, detail, school, uiLang } = await loadForPage(async ({ db, school }) => {
    const people = await listPeople(db, school.id);
    const sel = sp.id && isUuid(sp.id) ? people.find((p) => p.id === sp.id) : undefined;
    return { people, uiLang: await userLang(db), levels: await listSchoolLevels(db, school.id), enrolled: await enrolledToday(db, school.id),
      detail: sel ? { person: sel, names: await nameHistory(db, school.id, sel.id), enrollments: await personEnrollments(db, school.id, sel.id) } : null };
  }, { module: 'records' });
  const q = (sp.q ?? '').trim();
  const shown = q ? people.filter((p) => p.name.includes(q) || (p.name_latin ?? '').toLowerCase().includes(q.toLowerCase())) : people;
  const admin = school.isAdmin;
  const { t } = await getI18n(uiLang, school.locale);
  const statusLabel = (s: string) => (STATUSES.includes(s) ? t(`enroll.status.${s}` as MsgKey) : s);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title={t('nav.people.title')} crumbs={[{ label: t('intake.crumb') }, { label: t('nav.people.title') }]}
        description={t('people.lead')}
        meta={<><span>{t('people.metaPeople', { n: people.length })}</span><span>{t('people.metaEnrolled', { n: Object.keys(enrolled).length })}</span></>} />
      <div className="people-layout">
        <section className="card stack" aria-label={t('people.list')}>
          <form className="row-wrap" action="/people"><input name="q" defaultValue={q} placeholder={t('people.searchName')} aria-label={t('people.searchName')} /><button className="btn btn-secondary" type="submit">{t('common.search')}</button></form>
          <ul className="people-list" data-testid="people-list">{shown.map((p) => (
            <li key={p.id}><Link href={`/people?id=${p.id}${q ? `&q=${encodeURIComponent(q)}` : ''}`} aria-current={detail?.person.id === p.id ? 'page' : undefined}>
              <span>{p.name}{p.name_latin ? <small className="muted"> {p.name_latin}</small> : null}</span>
              {enrolled[p.id] && <small className="muted">{enrolled[p.id]}</small>}</Link></li>))}</ul>
          {shown.length === 0 && <p className="muted">{t('people.empty')}</p>}
          {admin && <><h2>{t('people.add')}</h2><ActionForm url="/api/people" action="add" submitLabel={t('common.add')} successText={t('people.added')} testId="person-add"
            fields={[{ name: 'name', label: t('common.name'), required: true }, { name: 'nameLatin', label: t('people.latinOptional'), placeholder: 'Hong Gildong' }]} /></>}
        </section>
        <section className="card stack" aria-label={t('people.detail')} data-testid="person-detail">
          {!detail ? <p className="muted">{t('people.pick')}</p> : (
            <>
              <h2>{detail.person.name} {detail.person.name_latin && <small className="muted">{detail.person.name_latin}</small>}</h2>
              <h3>{t('people.enrollment')}</h3>
              {detail.enrollments.length === 0 ? <p className="muted">{t('people.noEnrollment')}</p> : (
                <ul className="issue-list">{detail.enrollments.map((e) => (
                  <li key={e.id} className="stack">
                    <span><StatusBadge tone={e.status === 'enrolled' ? 'success' : 'neutral'}>{statusLabel(e.status)}</StatusBadge> {e.level_name} · {e.starts_on} ~ {e.ends_on ?? ''}</span>
                    {admin && e.status === 'enrolled' && <ActionForm url="/api/people" action="end-enrollment" extra={{ enrollmentId: e.id }} inline submitLabel={t('people.endEnrollment')} successText={t('people.ended')}
                      confirmText={t('people.endConfirm')}
                      fields={[{ name: 'endsOn', label: t('people.endDate'), type: 'date', required: true, defaultValue: today }, { name: 'status', label: t('people.reason'), type: 'select', options: ['graduated', 'transferred_out', 'withdrawn'].map((v) => ({ value: v, label: statusLabel(v) })) }]} />}
                  </li>))}</ul>)}
              {admin && levels.length > 0 && <ActionForm url="/api/people" action="enroll" extra={{ personId: detail.person.id }} inline submitLabel={t('people.enroll')} successText={t('people.enrolled')} testId="enroll-form"
                fields={[{ name: 'levelId', label: t('people.level'), type: 'select', options: levels.map((l) => ({ value: l.id, label: l.name })) }, { name: 'startsOn', label: t('common.start'), type: 'date', required: true, defaultValue: today }]} />}
              {admin && levels.length === 0 && <p className="fine">{withLink(t('people.needLevel'), <Link href="/academics">{t('nav.academics.title')}</Link>)}</p>}
              <h3>{t('people.names')}</h3>
              <ul className="issue-list">{detail.names.map((n) => <li key={n.version}>{t('common.version', { v: n.version })} · {n.name}{n.name_latin ? ` (${n.name_latin})` : ''}{n.reason ? <small className="muted"> — {n.reason}</small> : null}</li>)}</ul>
              {admin && <ActionForm url="/api/people" action="rename" extra={{ personId: detail.person.id }} inline submitLabel={t('people.rename')} successText={t('people.renamed')}
                fields={[{ name: 'name', label: t('common.name'), required: true, defaultValue: detail.person.name }, { name: 'nameLatin', label: t('people.latin'), defaultValue: detail.person.name_latin ?? '' }, { name: 'reason', label: t('people.renameReason'), required: true, width: 'wide' }]} />}
            </>
          )}
        </section>
      </div>
    </>
  );
}
