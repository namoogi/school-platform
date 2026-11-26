import { Fragment } from 'react';
import { loadForPage } from '@/lib/page';
import { listAcademicYears, listSchoolLevels, listTerms } from '@/lib/people';
import { latestPeriodRule } from '@/lib/academics';
import { PageHeader, StatusBadge } from '@/components/ui';
import { ActionForm } from '@/components/ActionForm';
import { RuleForm } from './RuleForm';

/** 71차: 학교 구조 — 학교급·학년도·학기 구조(확정 규칙 판)·학년도별 학기와 날짜 */
export default async function AcademicsPage() {
  const { levels, years, rule, terms, school } = await loadForPage(async ({ db, school }) => {
    const years = await listAcademicYears(db, school.id);
    const terms: Record<string, Awaited<ReturnType<typeof listTerms>>> = {};
    for (const y of years) terms[y.id] = await listTerms(db, school.id, y.id);
    return { levels: await listSchoolLevels(db, school.id), years, rule: await latestPeriodRule(db, school.id), terms };
  }, { module: 'records' });
  const admin = school.isAdmin;
  return (
    <>
      <PageHeader title="학교 구조" crumbs={[{ label: '학사 운영' }, { label: '학교 구조' }]}
        description="학교급·학년도·학기를 정합니다. 학기 구조는 근거와 함께 판으로 쌓이고, 학년도마다 그 판으로 학기를 만듭니다."
        meta={<><span>학교급 {levels.length}</span><span>학년도 {years.length}</span>{rule && <span>학기 구조 {rule.version}판</span>}</>} />
      <div className="settings-grid">
        <section className="card" data-testid="levels">
          <h2>학교급</h2>
          {levels.length === 0 ? <p className="muted">아직 없습니다. 예: 초등·중등·고등, 또는 학교 과정 이름.</p>
            : <ul className="issue-list">{levels.map((l) => <li key={l.id}><strong>{l.name}</strong> <small className="muted">{l.code}</small></li>)}</ul>}
          {admin && <ActionForm url="/api/academics" action="level" inline submitLabel="학교급 추가" successText="학교급을 추가했습니다." testId="level-form"
            fields={[{ name: 'name', label: '이름', required: true, placeholder: '중등' }, { name: 'code', label: '코드(영문 소문자·숫자·_)', required: true, placeholder: 'middle' }]} />}
        </section>
        <section className="card" data-testid="period-rule">
          <h2>학기 구조 {rule && <StatusBadge tone="neutral">{rule.version}판</StatusBadge>}</h2>
          {rule ? <p className="fine">{rule.value.periods.map((p) => p.label).join(' · ')}{rule.rationale ? ` — 근거: ${rule.rationale}` : rule.decision === 'accepted' ? ' — 자료에서 확인' : ''}</p>
            : <p className="muted">아직 없습니다. 자료 첨부 → 관리자 확인으로 정하거나, 여기서 근거와 함께 직접 정합니다.</p>}
          {admin && <RuleForm baseVersion={rule?.version ?? 0} current={rule?.value.periods ?? []} />}
        </section>
      </div>
      <section className="card" data-testid="years">
        <h2>학년도와 학기</h2>
        {years.length === 0 && <p className="muted">아직 학년도가 없습니다.</p>}
        {years.map((y) => (
          <div key={y.id} className="stack">
            <h3>{y.label} <small className="muted">{y.starts_on} ~ {y.ends_on}</small></h3>
            {terms[y.id].length === 0
              ? (admin && rule ? <ActionForm url="/api/academics" action="terms" extra={{ yearId: y.id }} fields={[]} submitLabel={`학기 구조 ${rule.version}판으로 학기 만들기`} successText="학기를 만들었습니다." testId={`terms-${y.label}`} />
                : <p className="muted">학기 구조를 먼저 정하세요.</p>)
              : <dl className="facts">{terms[y.id].map((t) => (
                <Fragment key={t.id}><dt>{t.label}</dt><dd>
                  {t.starts_on ? `${t.starts_on} ~ ${t.ends_on}` : <span className="muted">날짜 없음</span>}
                  {admin && <ActionForm url="/api/academics" action="term-dates" extra={{ termId: t.id }} inline submitLabel="날짜 저장" successText="학기 날짜를 저장했습니다."
                    fields={[{ name: 'startsOn', label: '시작', type: 'date', required: true, defaultValue: t.starts_on ?? '' }, { name: 'endsOn', label: '끝', type: 'date', required: true, defaultValue: t.ends_on ?? '' }]} />}
                </dd></Fragment>))}</dl>}
          </div>
        ))}
        {admin && <><h3>학년도 추가</h3><ActionForm url="/api/academics" action="year" inline submitLabel="학년도 추가" successText="학년도를 추가했습니다." testId="year-form"
          fields={[{ name: 'label', label: '이름', required: true, placeholder: '2027' }, { name: 'startsOn', label: '시작', type: 'date', required: true }, { name: 'endsOn', label: '끝(다음 학년도 시작일)', type: 'date', required: true }]} /></>}
      </section>
    </>
  );
}
