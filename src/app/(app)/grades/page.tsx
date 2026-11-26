import Link from 'next/link';
import { loadForPage } from '@/lib/page';
import { roster } from '@/lib/courses';
import { currentResults, offeringClosure, SCALE_PRESETS } from '@/lib/grading';
import { assessmentsOf, latestPolicy, listScales, narrativesOf, offeringContext } from '@/lib/gradebook';
import { isUuid } from '@/lib/services';
import { PageHeader, StatusBadge } from '@/components/ui';
import { ActionForm, type FieldSpec } from '@/components/ActionForm';
import { ResultGrid } from '@/components/ResultGrid';

const PRESET: Record<string, string> = { kr_achievement: '한국 성취평가제 A–E', us_letter: '미국 글자 성적 A–F(GPA 4.0)', pass_fail: '통과·미통과(P/F)' };
const ATTEMPT: Record<string, string> = { completed: '이수', failed: '미이수', incomplete: '미완료', withdrawn: '철회' };
const KIND = [{ value: 'exam', label: '시험' }, { value: 'assignment', label: '과제' }, { value: 'project', label: '프로젝트' }, { value: 'performance', label: '수행' }];

/** 73차: 성적 — 척도·성적 정책 판(관리자), 수업별 평가 항목·점수 입력·과목 서술·수업 마감 판 */
export default async function GradesPage({ searchParams }: { searchParams: Promise<{ o?: string }> }) {
  const sp = await searchParams;
  const o = sp.o && isUuid(sp.o) ? sp.o : null;
  const data = await loadForPage(async ({ db, school }) => {
    const ctx = o ? await offeringContext(db, school.id, o) : null;
    return {
      scales: await listScales(db, school.id), policy: await latestPolicy(db, school.id), ctx,
      assessments: ctx && o ? await assessmentsOf(db, school.id, o) : [],
      students: ctx && o ? (await roster(db, school.id, o)).filter((r) => r.status === 'enrolled' || r.status === 'withdrawn') : [],
      results: ctx && o && ctx.can_grade ? await currentResults(db, school.id, o) : [],
      narratives: ctx && o && ctx.can_grade ? await narrativesOf(db, school.id, o) : [],
      closure: ctx && o ? await offeringClosure(db, school.id, o) : null,
    };
  }, { module: 'records' });
  const { school, scales, policy, ctx, assessments, students, results, narratives, closure } = data;
  const admin = school.isAdmin;
  const name = Object.fromEntries(students.map((s) => [s.person_id, s.name]));
  const enrolled = students.filter((s) => s.status === 'enrolled');
  const course = assessments.filter((a) => a.axis === 'course');
  const values = Object.fromEntries(results.filter((r) => r.score != null).map((r) => [`${r.assessment_id}:${r.person_id}`, String(r.score)]));
  const note = Object.fromEntries(narratives.filter((n) => n.kind === 'subject_detail').map((n) => [n.person_id, n.body]));
  const totalWeight = course.reduce((a, x) => a + x.weight, 0);
  const title = (t: Record<string, string>) => t.ko ?? Object.values(t)[0] ?? '';
  const reasonField: FieldSpec[] = closure ? [{ name: 'reason', label: '정정 사유', required: true }] : [];
  return (
    <>
      <PageHeader title="성적" crumbs={[{ label: '학사 운영' }, { label: '성적' }]}
        description="평가 항목을 정하고 점수·서술을 넣은 뒤 수업을 마감합니다. 결과·서술은 고쳐 쓰지 않고 새 사건으로 쌓이고, 마감 판은 그때 값과 적용 정책·척도를 얼립니다."
        meta={<><span>척도 {scales.length}</span><span>성적 정책 {policy ? `${policy.version}판` : '기본값'}</span>{ctx && <span>{ctx.year_label} {ctx.term_label}</span>}</>} />
      {!ctx && (
        <section className="card"><p className="muted">{o ? '수업을 찾을 수 없습니다.' : '수업 화면에서 수업을 고른 뒤 ‘성적 입력·마감’으로 들어오세요.'} <Link href="/courses">수업으로</Link></p></section>
      )}
      {ctx && o && (
        <>
          <section className="card stack" data-testid="grade-offering">
            <h2>{ctx.subject_name}{ctx.section ? ` ${ctx.section}반` : ''} {closure ? <StatusBadge tone="success">마감 {closure.version}판</StatusBadge> : <StatusBadge tone="neutral">입력 중</StatusBadge>}</h2>
            <p className="fine">학점 {ctx.credits}{ctx.pass_fail ? ' · P/F' : ''} · 수강 {enrolled.length}명 · <Link href={`/courses?o=${o}`}>수업 상세</Link>{!ctx.can_grade ? ' · 이 수업의 담당 교사나 학교 관리자만 입력합니다.' : ''}</p>
            <h3>평가 항목 <small className="muted">가중 합 {totalWeight}</small></h3>
            {assessments.length === 0 ? <p className="muted">평가 항목이 없습니다. 예: 중간 30 · 기말 40 · 수행 30(가중은 상대값).</p> : (
              <ul className="issue-list" data-testid="assessments">{assessments.map((a) => (
                <li key={a.id}>
                  <span><strong>{title(a.title)}</strong> <small className="muted">{a.code} · {KIND.find((k) => k.value === a.kind)?.label ?? a.kind} · 가중 {a.weight}{a.max_score != null ? ` · 만점 ${a.max_score}` : ''}</small></span>
                  {ctx.can_grade && !closure && <ActionForm url="/api/grades" action="archive-assessment" extra={{ assessmentId: a.id }} fields={[]} submitLabel="보관" successText="보관했습니다." confirmText="이 평가 항목을 보관할까요? 넣은 결과는 남고 마감 계산에서 빠집니다." />}
                </li>))}</ul>)}
            {ctx.can_grade && !closure && (
              <ActionForm url="/api/grades" action="assessment" extra={{ offeringId: o }} inline submitLabel="항목 추가" successText="평가 항목을 추가했습니다." testId="assessment-form"
                fields={[{ name: 'title', label: '이름', required: true, placeholder: '중간고사' }, { name: 'code', label: '코드', required: true, placeholder: 'mid' },
                  { name: 'kind', label: '종류', type: 'select', options: KIND }, { name: 'weight', label: '가중', type: 'number', required: true, defaultValue: '30' },
                  { name: 'maxScore', label: '만점', type: 'number', required: true, defaultValue: '100' }]} />)}
          </section>
          {ctx.can_grade && (
            <section className="card stack">
              <h2>점수 입력</h2>
              <ResultGrid offeringId={o} closed={!!closure} values={values}
                students={enrolled.map((s) => ({ id: s.person_id, name: s.name }))}
                assessments={course.map((a) => ({ id: a.id, code: a.code, title: title(a.title), max: a.max_score }))} />
            </section>)}
          {ctx.can_grade && enrolled.length > 0 && (
            <section className="card stack" data-testid="narratives">
              <h2>과목 서술 <small className="muted">세부능력·특기사항 / course comment</small></h2>
              {enrolled.map((s) => (
                <ActionForm key={s.person_id} url="/api/grades" action="narrative" keep submitLabel="서술 저장" successText="서술을 새 사건으로 저장했습니다." testId={`narrative-${s.person_id}`}
                  extra={{ personId: s.person_id, offeringId: o, academicYearId: ctx.academic_year_id, termId: ctx.term_id, kind: 'subject_detail' }}
                  fields={[{ name: 'body', label: s.name, type: 'textarea', defaultValue: note[s.person_id] ?? '', width: 'wide' }, ...reasonField]} />))}
            </section>)}
          <section className="card stack" data-testid="closure">
            <h2>수업 마감</h2>
            {closure ? (
              <>
                <p className="fine">{closure.version}판 · {new Date(closure.closed_at).toLocaleString('ko-KR')} · 정책 {closure.policy_version ? `${closure.policy_version}판` : '기본값'}{closure.scale_version ? ` · 척도 ${closure.scale_version}판` : ''}{closure.reason ? ` · 사유: ${closure.reason}` : ''}</p>
                <p className="fine">통계 모집단 {closure.stats.n}명 · 평균 {closure.stats.mean ?? '-'} · 표준편차 {closure.stats.sd ?? '-'}</p>
                <div className="table-wrap"><table className="grid-table" data-testid="closure-results">
                  <thead><tr><th scope="col">학생</th><th scope="col">원점수</th><th scope="col">최종</th><th scope="col">등급</th><th scope="col">상태</th><th scope="col">취득 학점</th></tr></thead>
                  <tbody>{closure.results.map((r) => (
                    <tr key={r.person_id}><th scope="row">{name[r.person_id] ?? '—'}</th><td>{r.raw_score ?? '-'}</td><td>{r.final_score ?? '-'}</td><td>{r.level_code ?? '-'}</td>
                      <td><StatusBadge tone={r.attempt_status === 'completed' ? 'success' : r.attempt_status === 'failed' ? 'danger' : 'neutral'}>{ATTEMPT[r.attempt_status]}</StatusBadge></td>
                      <td>{r.credits_earned}/{r.credits_attempted}</td></tr>))}</tbody></table></div>
              </>) : <p className="muted">아직 마감하지 않았습니다. 마감하면 지금 점수로 원점수·최종·등급·이수를 계산해 판으로 얼립니다.</p>}
            {admin && (
              <ActionForm url="/api/grades" action="close" inline testId="close-form"
                extra={{ offeringId: o, base_version: closure?.version ?? 0, requestKey: `close-${o.slice(0, 8)}-${Date.now()}` }}
                submitLabel={closure ? '정정 마감(새 판)' : '수업 마감'} successText="마감 판을 만들었습니다."
                confirmText={closure ? '새 마감 판을 만들까요? 이전 판은 그대로 남습니다.' : '이 수업을 마감할까요? 마감 뒤 점수는 관리자가 사유와 함께 정정합니다.'}
                fields={[{ name: 'scaleId', label: '척도', type: 'select', options: [{ value: '', label: '등급 없음(점수만)' }, ...scales.map((s) => ({ value: s.id, label: `${s.code} ${s.version}판` }))] }, ...reasonField]} />)}
          </section>
        </>
      )}
      {admin && (
        <div className="settings-grid">
          <section className="card stack" data-testid="scales">
            <h2>척도</h2>
            {scales.length === 0 ? <p className="muted">척도가 없습니다. 아래에서 미리 만든 척도를 넣으세요.</p> : (
              <ul className="issue-list">{scales.map((s) => (
                <li key={s.id}><span><strong>{s.code}</strong> <small className="muted">{s.version}판 · {s.bands.map((b) => `${b.code}${b.min != null ? `≥${b.min}` : ''}`).join(' ')}</small></span></li>))}</ul>)}
            {Object.keys(SCALE_PRESETS).some((k) => !scales.some((s) => s.code === k)) && (
              <ActionForm url="/api/grades" action="scale-preset" inline submitLabel="척도 넣기" successText="척도를 넣었습니다." testId="scale-preset"
                fields={[{ name: 'preset', label: '미리 만든 척도', type: 'select', options: Object.keys(SCALE_PRESETS).filter((k) => !scales.some((s) => s.code === k)).map((k) => ({ value: k, label: PRESET[k] ?? k })) }]} />)}
          </section>
          <section className="card stack" data-testid="policy">
            <h2>성적 정책</h2>
            <p className="fine">{policy ? `${policy.version}판${policy.why ? ` · ${policy.why}` : ''}` : '판 없음 — 원점수 소수 2자리, 최종 정수, 모표준편차를 씁니다.'}</p>
            <ActionForm url="/api/grades" action="policy" extra={{ base_version: policy?.version ?? 0 }} inline submitLabel="정책 새 판" successText="성적 정책을 새 판으로 저장했습니다."
              fields={[{ name: 'score_digits', label: '원점수 자리', type: 'number', defaultValue: String(policy?.policy.score_digits ?? 2) },
                { name: 'final_digits', label: '최종 자리', type: 'number', defaultValue: String(policy?.policy.final_digits ?? 0) },
                { name: 'sd', label: '표준편차', type: 'select', options: [{ value: 'population', label: '모표준편차' }, { value: 'sample', label: '표본표준편차' }] },
                { name: 'why', label: '근거', required: true, placeholder: '학업성적관리규정 제00조' }]} />
          </section>
        </div>
      )}
    </>
  );
}
