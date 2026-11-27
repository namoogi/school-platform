import Link from 'next/link';
import { loadForPage } from '@/lib/page';
import { listSchoolLevels, listPeople } from '@/lib/people';
import { offeringsOfTerm, roster } from '@/lib/courses';
import { allTerms, levelStudentsOn, listCourseTypes, listSubjects, offeringStaff, subjectLabels } from '@/lib/academics';
import { isUuid } from '@/lib/services';
import { PageHeader, StatusBadge } from '@/components/ui';
import { ActionForm } from '@/components/ActionForm';
import { getI18n, userLang } from '@/lib/i18n/server';
import type { MsgKey } from '@/lib/i18n/catalog';

// 이름은 사전의 course.trigger.* · course.status.* · course.enr.*
const TRIGGERS = ['term_start', 'application_close', 'approval'];

/** 72차: 수업 — 과목·갈래(생성 계기 판)·학기별 개설·담당·수강 명단 */
export default async function CoursesPage({ searchParams }: { searchParams: Promise<{ term?: string; level?: string; o?: string }> }) {
  const sp = await searchParams;
  const data = await loadForPage(async ({ db, school }) => {
    const terms = await allTerms(db, school.id);
    const levels = await listSchoolLevels(db, school.id);
    const term = terms.find((t) => t.id === sp.term) ?? terms[0] ?? null;
    const level = levels.find((l) => l.id === sp.level) ?? levels[0] ?? null;
    const offerings = term && level ? await offeringsOfTerm(db, school.id, term.id, level.id) : [];
    const sel = sp.o && isUuid(sp.o) ? offerings.find((o) => o.id === sp.o) ?? null : null;
    return {
      terms, levels, term, level, offerings, sel, uiLang: await userLang(db),
      subjects: await listSubjects(db, school.id), types: await listCourseTypes(db, school.id), labels: await subjectLabels(db, school.id),
      people: (await listPeople(db, school.id)).map((p) => ({ id: p.id, name: p.name })),
      roster: sel ? await roster(db, school.id, sel.id) : [], staff: sel ? await offeringStaff(db, school.id, sel.id) : [],
      candidates: sel && level ? await levelStudentsOn(db, school.id, level.id, term?.starts_on ?? null) : [],
    };
  }, { module: 'records' });
  const { terms, levels, term, level, offerings, sel, subjects, types, labels, people, school, uiLang } = data;
  const admin = school.isAdmin;
  const { t } = await getI18n(uiLang, school.locale);
  const tk = (prefix: string, v: string) => t(`${prefix}.${v}` as MsgKey);
  const yesNo = [{ value: 'no', label: t('common.no') }, { value: 'yes', label: t('common.yes') }];
  const q = (o?: string) => `/courses?${new URLSearchParams({ ...(term ? { term: term.id } : {}), ...(level ? { level: level.id } : {}), ...(o ? { o } : {}) })}`;
  const missingFirst = !terms.length ? t('courses.needYears') : !levels.length ? t('courses.needLevels') : null;
  return (
    <>
      <PageHeader title={t('nav.courses.title')} crumbs={[{ label: t('intake.crumb') }, { label: t('nav.courses.title') }]}
        description={t('courses.lead')}
        meta={<><span>{t('courses.metaSubjects', { n: subjects.length })}</span><span>{t('courses.metaTypes', { n: types.length })}</span>{term && <span>{t('courses.metaOffered', { term: `${term.year} ${term.label}`, n: offerings.length })}</span>}</>} />
      {missingFirst && <section className="card"><p className="muted">{missingFirst} <Link href="/academics">{t('courses.toAcademics')}</Link></p></section>}
      {term && level && (
        <section className="card stack" data-testid="offerings">
          <form className="row-wrap" action="/courses">
            <label>{t('courses.term')}<select name="term" defaultValue={term.id}>{terms.map((tm) => <option key={tm.id} value={tm.id}>{tm.year} {tm.label}</option>)}</select></label>
            <label>{t('people.level')}<select name="level" defaultValue={level.id}>{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            <button className="btn btn-sm" type="submit">{t('common.view')}</button>
          </form>
          <h2>{t('courses.offeredTitle', { term: `${term.year} ${term.label}`, level: level.name })}</h2>
          {offerings.length === 0 ? <p className="muted">{t('courses.noOfferings')}</p> : (
            <div className="table-wrap"><table className="grid-table"><thead><tr><th>{t('courses.col.subject')}</th><th>{t('courses.col.type')}</th><th>{t('courses.col.section')}</th><th>{t('courses.col.credits')}</th><th>{t('courses.col.status')}</th><th>{t('courses.col.enrolled')}</th></tr></thead>
              <tbody>{offerings.map((o) => (
                <tr key={o.id} aria-current={sel?.id === o.id ? 'true' : undefined}>
                  <td><Link href={q(o.id)}>{o.subject_name}</Link>{o.pass_fail ? <small className="muted"> P/F</small> : null}</td><td>{o.course_type_name}</td><td>{o.section || '-'}</td>
                  <td>{o.credits}</td><td><StatusBadge tone={o.status === 'active' ? 'success' : o.status === 'cancelled' ? 'danger' : 'neutral'}>{tk('course.status', o.status)}</StatusBadge></td><td>{o.enrolled}{o.capacity ? `/${o.capacity}` : ''}</td>
                </tr>))}</tbody></table></div>)}
          {admin && subjects.length > 0 && types.some((ty) => ty.rule_version) && (
            <details><summary>{t('courses.offer')}</summary>
              <ActionForm url="/api/courses" action="offering" extra={{ termId: term.id, levelId: level.id }} inline submitLabel={t('courses.offerSubmit')} successText={t('courses.offered')} testId="offering-form"
                fields={[{ name: 'subjectId', label: t('courses.col.subject'), type: 'select', options: subjects.map((s) => ({ value: s.id, label: s.name })) },
                  { name: 'typeId', label: t('courses.col.type'), type: 'select', options: types.filter((ty) => ty.rule_version).map((ty) => ({ value: ty.id, label: ty.name })) },
                  { name: 'credits', label: t('courses.col.credits'), type: 'number', required: true, defaultValue: '1' }, { name: 'section', label: t('courses.sectionOptional'), placeholder: 'A' },
                  { name: 'capacity', label: t('courses.capacityOptional'), type: 'number' }, { name: 'passFail', label: t('courses.passFail'), type: 'select', options: yesNo }]} />
            </details>)}
          {admin && offerings.some((o) => o.status === 'planned') && <ActionForm url="/api/courses" action="start-term" extra={{ termId: term.id }} fields={[]} submitLabel={t('courses.startTerm')} successText={t('courses.termStarted')} testId="start-term" />}
        </section>
      )}
      {sel && (
        <section className="card stack" data-testid="offering-detail">
          <h2>{sel.subject_name}{sel.section ? t('courses.sectionSuffix', { section: sel.section }) : ''} <StatusBadge tone="neutral">{tk('course.status', sel.status)}</StatusBadge></h2>
          <p className="fine">{t('courses.detailMeta', { type: sel.course_type_name, trigger: tk('course.trigger', sel.creation_trigger), v: sel.rule_version, credits: sel.credits })} · <Link href={`/grades?o=${sel.id}`} data-testid="to-grades">{t('courses.toGrades')}</Link></p>
          {admin && sel.status === 'planned' && sel.creation_trigger === 'approval' && <ActionForm url="/api/courses" action="approve" extra={{ offeringId: sel.id, revision: sel.revision }} fields={[]} submitLabel={t('common.approve')} successText={t('courses.approved')} />}
          {admin && sel.status === 'open' && sel.creation_trigger === 'application_close' && <ActionForm url="/api/courses" action="close-applications" extra={{ offeringId: sel.id, revision: sel.revision }} fields={[]} submitLabel={t('courses.closeApplications')} successText={t('courses.applicationsClosed')} />}
          <h3>{t('courses.staff')}</h3>
          {data.staff.length === 0 ? <p className="muted">{t('courses.noStaff')}</p> : <ul className="issue-list">{data.staff.map((s) => <li key={s.person_id}>{s.name} <small className="muted">{t(s.role === 'lead' ? 'course.role.lead' : 'course.role.assistant')}</small></li>)}</ul>}
          {admin && <ActionForm url="/api/courses" action="staff" extra={{ offeringId: sel.id }} inline submitLabel={t('courses.assign')} successText={t('courses.assigned')} testId="staff-form"
            fields={[{ name: 'personId', label: t('courses.person'), type: 'select', options: people.map((p) => ({ value: p.id, label: p.name })) }, { name: 'role', label: t('courses.role'), type: 'select', options: [{ value: 'lead', label: t('course.role.lead') }, { value: 'assistant', label: t('course.role.assistant') }] }]} />}
          <h3>{t('courses.roster')} <small className="muted">{t('courses.rosterCount', { n: data.roster.filter((r) => r.status === 'enrolled').length })}</small></h3>
          {data.roster.length === 0 ? <p className="muted">{t('courses.noRoster')}</p> : (
            <ul className="issue-list" data-testid="roster">{data.roster.map((r) => (
              <li key={r.person_id}><span>{r.name} <StatusBadge tone={r.status === 'enrolled' ? 'success' : 'neutral'}>{['enrolled', 'applied', 'withdrawn', 'rejected'].includes(r.status) ? tk('course.enr', r.status) : r.status}</StatusBadge></span>
                {(sel.status === 'open' || sel.status === 'active') && r.status === 'enrolled' && <ActionForm url="/api/courses" action="enroll" extra={{ offeringId: sel.id, personId: r.person_id, status: 'withdrawn', revision: sel.revision }} fields={[]} submitLabel={t('courses.withdraw')} successText={t('courses.withdrawn')} />}
              </li>))}</ul>)}
          {(sel.status === 'open' || sel.status === 'active') ? (data.candidates.length
            ? <ActionForm url="/api/courses" action="enroll" extra={{ offeringId: sel.id, revision: sel.revision }} inline submitLabel={t('courses.addStudent')} successText={t('courses.studentAdded')} testId="enroll-student"
                fields={[{ name: 'personId', label: t('courses.studentOfLevel'), type: 'select', options: data.candidates.map((p) => ({ value: p.id, label: p.name })) }]} />
            : <p className="fine">{t('courses.noCandidates')}</p>)
            : <p className="fine">{t('courses.addWhen')}</p>}
        </section>
      )}
      {admin && (
        <div className="settings-grid">
          <section className="card stack" data-testid="subjects">
            <h2>{t('courses.subjects')}</h2>
            {subjects.length === 0 ? <p className="muted">{t('courses.noSubjects')}</p> : <ul className="issue-list">{subjects.map((s) => {
              const L = labels[s.id] ?? {};
              return <li key={s.id} className="stack"><span><strong>{s.name}</strong> <small className="muted">{s.code}{s.level_name ? ` · ${s.level_name}` : ''}{L.transcript ? t('courses.transcriptLabel', { label: L.transcript.label.en ?? '' }) : ''}</small></span>
                <details><summary>{t('courses.labels')}</summary>
                  <ActionForm url="/api/courses" action="label" extra={{ subjectId: s.id, bases: Object.fromEntries(Object.entries(L).map(([k, v]) => [k, v.version])) }} inline submitLabel={t('courses.saveLabel')} successText={t('courses.labelSaved')}
                    fields={[{ name: 'purpose', label: t('courses.purpose'), type: 'select', options: ['all', 'record', 'transcript', 'report_card'].map((v) => ({ value: v, label: tk('courses.purpose', v) })) },
                      { name: 'ko', label: t('courses.korean'), defaultValue: L.all?.label.ko ?? s.name }, { name: 'en', label: 'English', defaultValue: L.all?.label.en ?? '' }, { name: 'th', label: 'ไทย', defaultValue: L.all?.label.th ?? '' }]} />
                  <p className="fine">{t('courses.labelNote')}</p>
                </details></li>;
            })}</ul>}
            <ActionForm url="/api/courses" action="subject" inline submitLabel={t('courses.addSubject')} successText={t('courses.subjectAdded')} testId="subject-form"
              fields={[{ name: 'name', label: t('common.name'), required: true, placeholder: t('courses.subjectPlaceholder') }, { name: 'code', label: t('common.code'), required: true, placeholder: 'MATH' },
                { name: 'levelId', label: t('courses.levelOptional'), type: 'select', options: [{ value: '', label: t('courses.allLevels') }, ...levels.map((l) => ({ value: l.id, label: l.name }))] }]} />
          </section>
          <section className="card stack" data-testid="types">
            <h2>{t('courses.types')}</h2>
            {types.length === 0 ? <p className="muted">{t('courses.noTypes')}</p> : <ul className="issue-list">{types.map((ty) => (
              <li key={ty.id} className="stack"><span><strong>{ty.name}</strong> <small className="muted">{ty.code} · {ty.rule_version ? `${t('courses.typeRuleMeta', { trigger: tk('course.trigger', ty.creation_trigger!), v: ty.rule_version })}${ty.pass_fail_allowed ? t('courses.pfAllowed') : ''}` : t('courses.noRule')}</small></span>
                <details><summary>{t('courses.newRule')}</summary>
                  <ActionForm url="/api/courses" action="type-rule" extra={{ typeId: ty.id }} inline submitLabel={t('courses.saveRule')} successText={t('courses.ruleSaved')} testId={`type-rule-${ty.code}`}
                    fields={[{ name: 'trigger', label: t('courses.trigger'), type: 'select', options: TRIGGERS.map((value) => ({ value, label: tk('course.trigger', value) })) },
                      { name: 'passFailAllowed', label: t('courses.pfAllow'), type: 'select', options: yesNo },
                      { name: 'publishable', label: t('courses.publishable'), type: 'select', options: yesNo }]} />
                </details></li>))}</ul>}
            <ActionForm url="/api/courses" action="type" inline submitLabel={t('courses.addType')} successText={t('courses.typeAdded')} testId="type-form"
              fields={[{ name: 'name', label: t('common.name'), required: true, placeholder: t('courses.typePlaceholder') }, { name: 'code', label: t('common.code'), required: true, placeholder: 'required' }]} />
          </section>
        </div>
      )}
    </>
  );
}
