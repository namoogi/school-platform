import Link from 'next/link';
import { loadForPage } from '@/lib/page';
import { roster } from '@/lib/courses';
import { currentResults, offeringClosure } from '@/lib/grading';
import { assessmentsOf, latestPolicy, listScales, narrativesOf, offeringContext } from '@/lib/gradebook';
import { isUuid } from '@/lib/services';
import { listCalcRules } from '@/lib/calc-rules';
import { PageHeader, StatusBadge } from '@/components/ui';
import { ActionForm, type FieldSpec } from '@/components/ActionForm';
import { ResultGrid } from '@/components/ResultGrid';
import { GradeSettings } from './GradeSettings';
import { getI18n, userLang } from '@/lib/i18n/server';
import type { MsgKey } from '@/lib/i18n/catalog';

// 이름은 사전의 grade.preset.* · grade.attempt.* · grade.kind.*
const KINDS = ['exam', 'assignment', 'project', 'performance'];

/** 73차: 성적 — 척도·성적 정책 판·계산식 판(관리자, 131차 GradeSettings), 수업별 평가 항목·점수 입력·과목 서술·수업 마감 판 */
export default async function GradesPage({ searchParams }: { searchParams: Promise<{ o?: string; calcFrom?: string }> }) {
  const sp = await searchParams;
  const o = sp.o && isUuid(sp.o) ? sp.o : null;
  const data = await loadForPage(async ({ db, school }) => {
    const ctx = o ? await offeringContext(db, school.id, o) : null;
    return {
      uiLang: await userLang(db), scales: await listScales(db, school.id), policy: await latestPolicy(db, school.id), ctx,
      assessments: ctx && o ? await assessmentsOf(db, school.id, o) : [],
      students: ctx && o ? (await roster(db, school.id, o)).filter((r) => r.status === 'enrolled' || r.status === 'withdrawn') : [],
      results: ctx && o && ctx.can_grade ? await currentResults(db, school.id, o) : [],
      narratives: ctx && o && ctx.can_grade ? await narrativesOf(db, school.id, o) : [],
      closure: ctx && o ? await offeringClosure(db, school.id, o) : null,
      calcRules: school.isAdmin ? await listCalcRules(db, school.id) : [],
    };
  }, { module: 'records' });
  const { school, scales, policy, ctx, assessments, students, results, narratives, closure, uiLang, calcRules } = data;
  const admin = school.isAdmin;
  const { t, lang, locale } = await getI18n(uiLang, school.locale);
  const tk = (prefix: string, v: string) => t(`${prefix}.${v}` as MsgKey);
  const KIND = KINDS.map((value) => ({ value, label: tk('grade.kind', value) }));
  const name = Object.fromEntries(students.map((s) => [s.person_id, s.name]));
  const enrolled = students.filter((s) => s.status === 'enrolled');
  const course = assessments.filter((a) => a.axis === 'course');
  const values = Object.fromEntries(results.filter((r) => r.score != null).map((r) => [`${r.assessment_id}:${r.person_id}`, String(r.score)]));
  const note = Object.fromEntries(narratives.filter((n) => n.kind === 'subject_detail').map((n) => [n.person_id, n.body]));
  const totalWeight = course.reduce((a, x) => a + x.weight, 0);
  // 평가 항목 이름은 데이터의 언어 칸: 화면 언어 → 한국어 → 영어 → 첫 칸
  const title = (m: Record<string, string>) => m[lang] ?? m.ko ?? m.en ?? Object.values(m)[0] ?? '';
  const reasonField: FieldSpec[] = closure ? [{ name: 'reason', label: t('grades.correctionReason'), required: true }] : [];
  return (
    <>
      <PageHeader title={t('nav.grades.title')} crumbs={[{ label: t('intake.crumb') }, { label: t('nav.grades.title') }]}
        description={t('grades.lead')}
        meta={<><span>{t('grades.metaScales', { n: scales.length })}</span><span>{t('grades.metaPolicy', { v: policy ? t('common.version', { v: policy.version }) : t('common.default') })}</span>{ctx && <span>{ctx.year_label} {ctx.term_label}</span>}</>} />
      {!ctx && (
        <section className="card"><p className="muted">{t(o ? 'grades.notFound' : 'grades.pickCourse')} <Link href="/courses">{t('grades.toCourses')}</Link></p></section>
      )}
      {ctx && o && (
        <>
          <section className="card stack" data-testid="grade-offering">
            <h2>{ctx.subject_name}{ctx.section ? t('courses.sectionSuffix', { section: ctx.section }) : ''} {closure ? <StatusBadge tone="success">{t('grades.closedV', { v: closure.version })}</StatusBadge> : <StatusBadge tone="neutral">{t('grades.entering')}</StatusBadge>}</h2>
            <p className="fine">{t('grades.courseMeta', { credits: ctx.credits, pf: ctx.pass_fail ? ' · P/F' : '', n: enrolled.length })} · <Link href={`/courses?o=${o}`}>{t('grades.courseDetail')}</Link>{!ctx.can_grade ? t('grades.onlyTeachers') : ''}</p>
            <h3>{t('grades.assessments')} <small className="muted">{t('grades.weightSum', { n: totalWeight })}</small></h3>
            {assessments.length === 0 ? <p className="muted">{t('grades.noAssessments')}</p> : (
              <ul className="issue-list" data-testid="assessments">{assessments.map((a) => (
                <li key={a.id}>
                  <span><strong>{title(a.title)}</strong> <small className="muted">{t('grades.assessmentMeta', { code: a.code, kind: KIND.find((k) => k.value === a.kind)?.label ?? a.kind, w: a.weight })}{a.max_score != null ? t('grades.maxSuffix', { n: a.max_score }) : ''}</small></span>
                  {ctx.can_grade && !closure && <ActionForm url="/api/grades" action="archive-assessment" extra={{ assessmentId: a.id }} fields={[]} submitLabel={t('common.archive')} successText={t('common.archived')} confirmText={t('grades.archiveConfirm')} tone="secondary" />}
                </li>))}</ul>)}
            {ctx.can_grade && !closure && (
              <ActionForm url="/api/grades" action="assessment" extra={{ offeringId: o }} inline submitLabel={t('grades.addAssessment')} successText={t('grades.assessmentAdded')} testId="assessment-form"
                fields={[{ name: 'title', label: t('common.name'), required: true, placeholder: t('grades.assessmentPlaceholder') }, { name: 'code', label: t('common.code'), required: true, placeholder: 'mid' },
                  { name: 'kind', label: t('grades.kind'), type: 'select', options: KIND }, { name: 'weight', label: t('grades.weight'), type: 'number', required: true, defaultValue: '30' },
                  { name: 'maxScore', label: t('grades.max'), type: 'number', required: true, defaultValue: '100' }]} />)}
          </section>
          {ctx.can_grade && (
            <section className="card stack">
              <h2>{t('grades.scoreEntry')}</h2>
              <ResultGrid offeringId={o} closed={!!closure} values={values}
                students={enrolled.map((s) => ({ id: s.person_id, name: s.name }))}
                assessments={course.map((a) => ({ id: a.id, code: a.code, title: title(a.title), max: a.max_score }))} />
            </section>)}
          {ctx.can_grade && enrolled.length > 0 && (
            <section className="card stack" data-testid="narratives">
              <h2>{t('grades.narratives')} <small className="muted">{t('grades.narrativesSub')}</small></h2>
              {enrolled.map((s) => (
                <ActionForm key={s.person_id} url="/api/grades" action="narrative" keep submitLabel={t('grades.saveNarrative')} successText={t('grades.narrativeSaved')} testId={`narrative-${s.person_id}`}
                  extra={{ personId: s.person_id, offeringId: o, academicYearId: ctx.academic_year_id, termId: ctx.term_id, kind: 'subject_detail' }}
                  fields={[{ name: 'body', label: s.name, type: 'textarea', defaultValue: note[s.person_id] ?? '', width: 'wide' }, ...reasonField]} />))}
            </section>)}
          <section className="card stack" data-testid="closure">
            <h2>{t('grades.closing')}</h2>
            {closure ? (
              <>
                <p className="fine">{t('grades.closureMeta', { v: closure.version, when: new Date(closure.closed_at).toLocaleString(locale), policy: closure.policy_version ? t('common.version', { v: closure.policy_version }) : t('common.default') })}{closure.scale_version ? t('grades.scaleSuffix', { v: closure.scale_version }) : ''}{closure.calc_code ? t('grades.calcSuffix', { code: closure.calc_code, v: closure.calc_version ?? '' }) : ''}{closure.reason ? t('grades.reasonSuffix', { reason: closure.reason }) : ''}</p>
                <p className="fine">{t('grades.stats', { n: closure.stats.n, mean: closure.stats.mean ?? '-', sd: closure.stats.sd ?? '-' })}</p>
                <div className="table-wrap"><table className="grid-table" data-testid="closure-results">
                  <thead><tr><th scope="col">{t('common.student')}</th><th scope="col">{t('grades.col.raw')}</th><th scope="col">{t('grades.col.final')}</th><th scope="col">{t('grades.col.level')}</th><th scope="col">{t('grades.col.status')}</th><th scope="col">{t('grades.col.credits')}</th></tr></thead>
                  <tbody>{closure.results.map((r) => (
                    <tr key={r.person_id}><th scope="row">{name[r.person_id] ?? '—'}</th><td>{r.raw_score ?? '-'}</td><td>{r.final_score ?? '-'}</td><td>{r.level_code ?? '-'}</td>
                      <td><StatusBadge tone={r.attempt_status === 'completed' ? 'success' : r.attempt_status === 'failed' ? 'danger' : 'neutral'}>{tk('grade.attempt', r.attempt_status)}</StatusBadge></td>
                      <td>{r.credits_earned}/{r.credits_attempted}</td></tr>))}</tbody></table></div>
              </>) : <p className="muted">{t('grades.notClosed')}</p>}
            {admin && (
              <ActionForm url="/api/grades" action="close" inline testId="close-form"
                extra={{ offeringId: o, base_version: closure?.version ?? 0, requestKey: `close-${o.slice(0, 8)}-${Date.now()}` }}
                submitLabel={closure ? t('grades.closeCorrection') : t('grades.closing')} successText={t('grades.closed')}
                confirmText={t(closure ? 'grades.confirmCorrection' : 'grades.confirmClose')}
                fields={[{ name: 'scaleId', label: t('grades.scale'), type: 'select', options: [{ value: '', label: t('grades.noGrade') }, ...scales.map((s) => ({ value: s.id, label: `${s.code} ${t('common.version', { v: s.version })}` }))] },
                  // ADR 0042: 계산식으로 마감하면 성취도·이수·학점을 그 식의 결과로 굳힌다
                  ...(calcRules.length ? [{ name: 'calcCode', label: t('grades.calc'), type: 'select' as const, options: [{ value: '', label: t('grades.noCalc') }, ...calcRules.map((r) => ({ value: r.code, label: `${r.code} ${t('common.version', { v: r.version })}` }))] }] : []),
                  ...reasonField]} />)}
          </section>
          {ctx.can_grade && enrolled.length > 0 && (
            <section className="card stack" data-testid="remediation">
              <h2>{t('grades.remediation')}</h2>
              <p className="fine">{t('grades.remediationLead')}</p>
              <ActionForm url="/api/grades" action="remediation" inline testId="remediation-form" extra={{ offeringId: o }}
                submitLabel={t('grades.remediationSave')} successText={t('grades.remediationSaved')}
                fields={[
                  { name: 'personId', label: t('common.student'), type: 'select', required: true, options: enrolled.map((s) => ({ value: s.person_id, label: s.name })) },
                  { name: 'kind', label: t('grades.remediationKind'), type: 'select', options: ['achievement', 'attendance'].map((k) => ({ value: k, label: tk('grade.remediation', k) })) },
                  { name: 'completed', label: t('grades.remediationState'), type: 'select', options: [{ value: 'true', label: t('grades.completedYes') }, { value: 'false', label: t('grades.completedNo') }] },
                  { name: 'note', label: t('grades.remediationNote'), width: 'wide' },
                ]} />
            </section>
          )}
        </>
      )}
      {admin && <GradeSettings t={t} lang={lang} scales={scales} policy={policy} calcRules={calcRules} calcFrom={sp.calcFrom ?? null} offering={o} />}
    </>
  );
}
