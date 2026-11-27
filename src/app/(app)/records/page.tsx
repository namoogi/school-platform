import Link from 'next/link';
import { loadForPage } from '@/lib/page';
import { listAcademicYears, listPeople } from '@/lib/people';
import { recordClosures } from '@/lib/records';
import { countReports } from '@/lib/qualifications';
import { documentsOf, externalResultsOf, qualificationsOf } from '@/lib/recordbook';
import { isUuid } from '@/lib/services';
import { PageHeader, StatusBadge, withLink } from '@/components/ui';
import { ActionForm } from '@/components/ActionForm';
import { getI18n, userLang } from '@/lib/i18n/server';
import type { MsgKey } from '@/lib/i18n/catalog';

// 형식·보고 이름은 사전의 rec.format.* · rec.report.*
const FORMATS = ['kr_alt_record', 'us_transcript', 'th_por_por_1', 'en_record', 'us_school_profile'];
const PERSON_FORMATS = ['kr_alt_record', 'us_transcript', 'th_por_por_1', 'en_record'];
const REPORT_CODES = ['enrollment_count', 'kr_school_stats', 'us_fall_enrollment'];
const day = () => new Date().toISOString().slice(0, 10);
const key = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** 75차: 기록 — 학생별 학년도 기록 마감 판·발행(학생부·성적증명서·ปพ.1·영어권)·외부 결과·자격, 학교 소개서·지정일 보고 */
export default async function RecordsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const sp = await searchParams;
  const pid = sp.p && isUuid(sp.p) ? sp.p : null;
  const data = await loadForPage(async ({ db, school }) => {
    const people = await listPeople(db, school.id);
    const person = people.find((x) => x.id === pid) ?? null;
    return {
      people, person, years: await listAcademicYears(db, school.id), uiLang: await userLang(db),
      closures: person ? await recordClosures(db, school.id, person.id) : [],
      docs: person ? await documentsOf(db, school.id, person.id) : [],
      external: person ? await externalResultsOf(db, school.id, person.id) : [],
      quals: person ? await qualificationsOf(db, school.id, person.id) : [],
      schoolDocs: await documentsOf(db, school.id, null), reports: await countReports(db, school.id),
    };
  }, { module: 'records', admin: true });
  const { people, person, years, closures, docs, external, quals, schoolDocs, reports, uiLang, school } = data;
  const { t, lang, locale } = await getI18n(uiLang, school.locale);
  const FORMAT = Object.fromEntries(FORMATS.map((f) => [f, t(`rec.format.${f}` as MsgKey)]));
  const REPORTS = REPORT_CODES.map((value) => ({ value, label: t(`rec.report.${value}` as MsgKey) }));
  const yesNo = [{ value: 'no', label: t('common.no') }, { value: 'yes', label: t('common.yes') }];
  // 데이터의 언어 칸: 화면 언어 → 한국어 → 영어 → 첫 칸
  const pick = (l: Record<string, string>) => l[lang] ?? l.ko ?? l.en ?? Object.values(l)[0] ?? '';
  const closedByYear = Object.fromEntries(closures.map((c) => [c.academic_year_id, c]));
  const reportBases = Object.fromEntries(reports.map((r) => [r.code, Math.max(...reports.filter((x) => x.code === r.code).map((x) => x.version))]));
  const latestReports = reports.filter((r) => r.version === reportBases[r.code]);
  return (
    <>
      <PageHeader title={t('nav.records')} crumbs={[{ label: t('intake.crumb') }, { label: t('nav.records') }]}
        description={t('rec.lead')}
        meta={<><span>{t('rec.metaPeople', { n: people.length })}</span><span>{t('rec.metaSchoolDocs', { n: schoolDocs.length })}</span><span>{t('rec.metaReports', { n: latestReports.length })}</span></>} />
      <div className="people-layout">
        <section className="card stack" data-testid="record-student">
          <h2>{t('rec.students')}</h2>
          <form className="row-wrap" action="/records">
            <label>{t('common.student')}<select name="p" defaultValue={person?.id ?? ''}><option value="">{t('rec.pick')}</option>{people.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <button className="btn btn-sm" type="submit">{t('common.open')}</button>
          </form>
          <p className="fine">{withLink(t('rec.whereElse'), { people: <Link href="/people">{t('nav.people')}</Link>, grades: <Link href="/grades">{t('nav.grades')}</Link> })}</p>
        </section>
        <div className="stack">
          {!person ? <section className="card"><p className="muted">{t('rec.pickHint')}</p></section> : (
            <>
              <section className="card stack" data-testid="record-years">
                <h2>{t('rec.yearsTitle', { name: person.name })}</h2>
                {years.length === 0 ? <p className="muted">{t('rec.noYears')}</p> : (
                  <ul className="issue-list">{years.map((y) => {
                    const c = closedByYear[y.id];
                    return <li key={y.id}><span><strong>{y.label}</strong> {c ? <StatusBadge tone="success">{t('common.version', { v: c.version })}</StatusBadge> : <StatusBadge tone="neutral">{t('rec.notClosed')}</StatusBadge>}
                      <small className="muted">{c ? `${t('rec.yearMeta', { courses: c.snapshot.courses.length, days: c.snapshot.attendance.enrolled_days, when: new Date(c.closed_at).toLocaleDateString(locale) })}${c.reason ? ` · ${c.reason}` : ''}` : ''}</small></span></li>;
                  })}</ul>)}
                {years.length > 0 && (
                  <ActionForm url="/api/records" action="close-year" inline testId="close-year-form" submitLabel={t('rec.closeYear')} successText={t('rec.yearClosed')}
                    confirmText={t('rec.closeYearConfirm')}
                    extra={{ personId: person.id, requestKey: key('ry'), bases: Object.fromEntries(closures.map((c) => [c.academic_year_id, c.version])) }}
                    fields={[{ name: 'yearId', label: t('rec.year'), type: 'select', options: years.map((y) => ({ value: y.id, label: `${y.label}${closedByYear[y.id] ? t('rec.yearCorrection', { v: closedByYear[y.id].version }) : ''}` })) },
                      { name: 'reason', label: t('rec.reasonWhenReclosing'), placeholder: t('rec.reasonPlaceholder') }]} />)}
              </section>
              <section className="card stack" data-testid="record-docs">
                <h2>{t('rec.issue')}</h2>
                {closures.length === 0 ? <p className="muted">{t('rec.needClosure')}</p> : (
                  <ActionForm url="/api/records" action="publish" inline testId="publish-form" submitLabel={t('rec.issue')} successText={t('rec.issued')}
                    extra={{ personId: person.id }}
                    fields={[{ name: 'format', label: t('rec.format'), type: 'select', options: PERSON_FORMATS.map((f) => ({ value: f, label: FORMAT[f] })) },
                      { name: 'blind', label: t('rec.blind'), type: 'select', options: yesNo }]} />)}
                {docs.length === 0 ? <p className="muted">{t('rec.noDocs')}</p> : (
                  <ul className="issue-list">{docs.map((d) => (
                    <li key={d.id}><span><Link href={`/records/doc/${d.id}`}>{d.title ?? FORMAT[d.format]}</Link> <small className="muted">{FORMAT[d.format] ?? d.format} · {new Date(d.published_at).toLocaleString(locale)}{d.blind ? t('rec.blindSuffix') : ''}{t('rec.docMeta', { q: d.issues.filter((i) => i.level === 'question').length, d: d.disclosures })}</small></span></li>))}</ul>)}
              </section>
              <div className="settings-grid">
                <section className="card stack" data-testid="external-results">
                  <h2>{t('rec.external')} <small className="muted">{t('rec.externalSub')}</small></h2>
                  {external.length === 0 ? <p className="muted">{t('rec.none')}</p> : <ul className="issue-list">{external.map((x) => (
                    <li key={x.id}><span><strong>{pick(x.title) || x.exam_code}</strong> <small className="muted">{x.issuer_code} · {x.exam_code} · {x.sat_on} · {x.result.grade ?? x.result.score}{x.corrected ? t('rec.corrected') : ''}</small></span></li>))}</ul>}
                  <ActionForm url="/api/records" action="external" extra={{ personId: person.id }} inline submitLabel={t('rec.recordResult')} successText={t('rec.resultRecorded')} testId="external-form"
                    fields={[{ name: 'issuer', label: t('rec.issuerCode'), required: true, placeholder: 'college_board' }, { name: 'exam', label: t('rec.examCode'), required: true, placeholder: 'AP-CALC-AB' },
                      { name: 'title', label: t('rec.titleEn'), placeholder: 'AP Calculus AB' }, { name: 'satOn', label: t('rec.satOn'), type: 'date', required: true, defaultValue: day() },
                      { name: 'grade', label: t('rec.grade'), placeholder: '5' }, { name: 'score', label: t('rec.score'), type: 'number' }]} />
                </section>
                <section className="card stack" data-testid="qualifications">
                  <h2>{t('rec.quals')} <small className="muted">{t('rec.qualsSub')}</small></h2>
                  {quals.length === 0 ? <p className="muted">{t('rec.none')}</p> : <ul className="issue-list">{quals.map((q) => (
                    <li key={q.id}><span><strong>{pick(q.title)}</strong> <small className="muted">{q.kind_code} · {q.awarded_on}{q.corrected ? t('rec.corrected') : ''}</small></span></li>))}</ul>}
                  <ActionForm url="/api/records" action="qualification" extra={{ personId: person.id }} inline submitLabel={t('rec.award')} successText={t('rec.awarded')} testId="qualification-form"
                    confirmText={t('rec.awardConfirm')}
                    fields={[{ name: 'kind', label: t('rec.kindCode'), required: true, placeholder: 'diploma' }, { name: 'title', label: t('common.name'), required: true, placeholder: t('rec.qualPlaceholder') },
                      { name: 'awardedOn', label: t('rec.awardedOn'), type: 'date', defaultValue: day() }, { name: 'minCredits', label: t('rec.minCredits'), type: 'number' }]} />
                </section>
              </div>
            </>
          )}
          <div className="settings-grid">
            <section className="card stack" data-testid="school-docs">
              <h2>{t('rec.profile')}</h2>
              {schoolDocs.length === 0 ? <p className="muted">{t('rec.noDocs')}</p> : <ul className="issue-list">{schoolDocs.slice(0, 5).map((d) => (
                <li key={d.id}><span><Link href={`/records/doc/${d.id}`}>{d.title ?? FORMAT[d.format]}</Link> <small className="muted">{new Date(d.published_at).toLocaleDateString(locale)}</small></span></li>))}</ul>}
              <ActionForm url="/api/records" action="publish" extra={{ format: 'us_school_profile' }} fields={[]} submitLabel={t('rec.issueProfile')} successText={t('rec.profileIssued')} testId="profile-publish" />
            </section>
            <section className="card stack" data-testid="count-reports">
              <h2>{t('rec.reports')} <small className="muted">{t('rec.reportsSub')}</small></h2>
              {latestReports.length === 0 ? <p className="muted">{t('rec.noReports')}</p> : <ul className="issue-list">{latestReports.map((r) => {
                const snap = r.snapshot as { enrollment?: { total?: number }; attendance_ytd?: { rate?: number | null; chronic_absent_students?: number }; qualifications_awarded?: number };
                const rate = snap.attendance_ytd?.rate;
                return <li key={r.id}><span><strong>{REPORTS.find((x) => x.value === r.code)?.label ?? r.code}</strong> <small className="muted">{t('rec.reportMeta', { asOf: r.as_of, v: r.version, enrolled: snap.enrollment?.total ?? 0, rate: rate == null ? '-' : `${Math.round(Number(rate) * 1000) / 10}%`, chronic: snap.attendance_ytd?.chronic_absent_students ?? 0, quals: snap.qualifications_awarded ?? 0 })}</small></span></li>;
              })}</ul>}
              <ActionForm url="/api/records" action="count-report" inline submitLabel={t('rec.closeReport')} successText={t('rec.reportClosed')} testId="count-report-form"
                extra={{ requestKey: key('cr'), bases: reportBases }}
                fields={[{ name: 'code', label: t('rec.report'), type: 'select', options: REPORTS }, { name: 'asOf', label: t('rec.asOf'), type: 'date', required: true, defaultValue: day() },
                  { name: 'reason', label: t('rec.reasonWhenReclosing') }]} />
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
