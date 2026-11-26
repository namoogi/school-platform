import Link from 'next/link';
import { loadForPage } from '@/lib/page';
import { listAcademicYears, listPeople } from '@/lib/people';
import { recordClosures } from '@/lib/records';
import { countReports } from '@/lib/qualifications';
import { documentsOf, externalResultsOf, qualificationsOf } from '@/lib/recordbook';
import { isUuid } from '@/lib/services';
import { PageHeader, StatusBadge } from '@/components/ui';
import { ActionForm } from '@/components/ActionForm';

const FORMAT: Record<string, string> = {
  kr_alt_record: '학교생활기록부(학교 자체)', us_transcript: '미국 성적증명서(Transcript)', th_por_por_1: '태국 ปพ.1 학교 사본', en_record: '영어권 학업 기록(Academic Record)', us_school_profile: '학교 소개서(School Profile)',
};
const PERSON_FORMATS = ['kr_alt_record', 'us_transcript', 'th_por_por_1', 'en_record'];
const REPORTS = [{ value: 'enrollment_count', label: '재학생 수(지정일)' }, { value: 'kr_school_stats', label: '한국 학교 통계(4월 1일 기준 등)' }, { value: 'us_fall_enrollment', label: '미국 가을 재적(10월 기준)' }];
const day = () => new Date().toISOString().slice(0, 10);
const key = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const t = (l: Record<string, string>) => l.ko ?? l.en ?? Object.values(l)[0] ?? '';

/** 75차: 기록 — 학생별 학년도 기록 마감 판·발행(학생부·성적증명서·ปพ.1·영어권)·외부 결과·자격, 학교 소개서·지정일 보고 */
export default async function RecordsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const sp = await searchParams;
  const pid = sp.p && isUuid(sp.p) ? sp.p : null;
  const data = await loadForPage(async ({ db, school }) => {
    const people = await listPeople(db, school.id);
    const person = people.find((x) => x.id === pid) ?? null;
    return {
      people, person, years: await listAcademicYears(db, school.id),
      closures: person ? await recordClosures(db, school.id, person.id) : [],
      docs: person ? await documentsOf(db, school.id, person.id) : [],
      external: person ? await externalResultsOf(db, school.id, person.id) : [],
      quals: person ? await qualificationsOf(db, school.id, person.id) : [],
      schoolDocs: await documentsOf(db, school.id, null), reports: await countReports(db, school.id),
    };
  }, { module: 'records', admin: true });
  const { people, person, years, closures, docs, external, quals, schoolDocs, reports } = data;
  const closedByYear = Object.fromEntries(closures.map((c) => [c.academic_year_id, c]));
  const reportBases = Object.fromEntries(reports.map((r) => [r.code, Math.max(...reports.filter((x) => x.code === r.code).map((x) => x.version))]));
  const latestReports = reports.filter((r) => r.version === reportBases[r.code]);
  return (
    <>
      <PageHeader title="기록" crumbs={[{ label: '학사 운영' }, { label: '기록' }]}
        description="학년도 기록 마감 판은 그때의 학적·성적 마감 판·출결·서술을 DB가 모아 얼립니다. 발행본은 마감 판 스냅샷만으로 그리고, 해시로 바뀌지 않았음을 확인합니다."
        meta={<><span>사람 {people.length}</span><span>학교 발행본 {schoolDocs.length}</span><span>지정일 보고 {latestReports.length}</span></>} />
      <div className="people-layout">
        <section className="card stack people-list">
          <h2>학생</h2>
          <form className="row-wrap" action="/records">
            <label>학생<select name="p" defaultValue={person?.id ?? ''}><option value="">— 고르기</option>{people.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <button className="btn btn-sm" type="submit">열기</button>
          </form>
          <p className="fine">학적·이름은 <Link href="/people">사람</Link>, 성적 마감은 <Link href="/grades">성적</Link>에서 합니다.</p>
        </section>
        <div className="stack">
          {!person ? <section className="card"><p className="muted">학생을 고르면 학년도 기록 마감·발행·외부 결과·자격을 다룹니다.</p></section> : (
            <>
              <section className="card stack" data-testid="record-years">
                <h2>{person.name} · 학년도 기록 마감 판</h2>
                {years.length === 0 ? <p className="muted">학년도가 없습니다.</p> : (
                  <ul className="issue-list">{years.map((y) => {
                    const c = closedByYear[y.id];
                    return <li key={y.id}><span><strong>{y.label}</strong> {c ? <StatusBadge tone="success">{c.version}판</StatusBadge> : <StatusBadge tone="neutral">마감 전</StatusBadge>}
                      <small className="muted">{c ? ` · 과목 ${c.snapshot.courses.length} · 수업일 ${c.snapshot.attendance.enrolled_days} · ${new Date(c.closed_at).toLocaleDateString('ko-KR')}${c.reason ? ` · ${c.reason}` : ''}` : ''}</small></span></li>;
                  })}</ul>)}
                {years.length > 0 && (
                  <ActionForm url="/api/records" action="close-year" inline testId="close-year-form" submitLabel="학년도 기록 마감" successText="학년도 기록 마감 판을 만들었습니다."
                    confirmText="이 학년도 기록을 지금 값으로 마감할까요? 다시 마감하면 이전 판은 남고 새 판이 됩니다."
                    extra={{ personId: person.id, requestKey: key('ry'), bases: Object.fromEntries(closures.map((c) => [c.academic_year_id, c.version])) }}
                    fields={[{ name: 'yearId', label: '학년도', type: 'select', options: years.map((y) => ({ value: y.id, label: `${y.label}${closedByYear[y.id] ? ` (${closedByYear[y.id].version}판 → 정정)` : ''}` })) },
                      { name: 'reason', label: '정정 사유(다시 마감할 때)', placeholder: '성적 정정 반영' }]} />)}
              </section>
              <section className="card stack" data-testid="record-docs">
                <h2>발행</h2>
                {closures.length === 0 ? <p className="muted">학년도 기록 마감 판이 있어야 발행합니다.</p> : (
                  <ActionForm url="/api/records" action="publish" inline testId="publish-form" submitLabel="발행" successText="발행했습니다. 아래 목록에서 열어 확인하세요."
                    extra={{ personId: person.id }}
                    fields={[{ name: 'format', label: '형식', type: 'select', options: PERSON_FORMATS.map((f) => ({ value: f, label: FORMAT[f] })) },
                      { name: 'blind', label: '블라인드(이름·학교 가림)', type: 'select', options: [{ value: 'no', label: '아니오' }, { value: 'yes', label: '예' }] }]} />)}
                {docs.length === 0 ? <p className="muted">발행본이 없습니다.</p> : (
                  <ul className="issue-list">{docs.map((d) => (
                    <li key={d.id}><span><Link href={`/records/doc/${d.id}`}>{d.title ?? FORMAT[d.format]}</Link> <small className="muted">{FORMAT[d.format] ?? d.format} · {new Date(d.published_at).toLocaleString('ko-KR')}{d.blind ? ' · 블라인드' : ''} · 확인 질문 {d.issues.filter((i) => i.level === 'question').length} · 공개 기록 {d.disclosures}</small></span></li>))}</ul>)}
              </section>
              <div className="settings-grid">
                <section className="card stack" data-testid="external-results">
                  <h2>외부 결과 <small className="muted">기관 발급 · 고치지 않고 정정 행</small></h2>
                  {external.length === 0 ? <p className="muted">없습니다.</p> : <ul className="issue-list">{external.map((x) => (
                    <li key={x.id}><span><strong>{t(x.title) || x.exam_code}</strong> <small className="muted">{x.issuer_code} · {x.exam_code} · {x.sat_on} · {x.result.grade ?? x.result.score}{x.corrected ? ' · 정정됨' : ''}</small></span></li>))}</ul>}
                  <ActionForm url="/api/records" action="external" extra={{ personId: person.id }} inline submitLabel="결과 기록" successText="외부 결과를 기록했습니다." testId="external-form"
                    fields={[{ name: 'issuer', label: '기관 코드', required: true, placeholder: 'college_board' }, { name: 'exam', label: '시험 코드', required: true, placeholder: 'AP-CALC-AB' },
                      { name: 'title', label: '이름(영문)', placeholder: 'AP Calculus AB' }, { name: 'satOn', label: '응시일', type: 'date', required: true, defaultValue: day() },
                      { name: 'grade', label: '등급', placeholder: '5' }, { name: 'score', label: '점수', type: 'number' }]} />
                </section>
                <section className="card stack" data-testid="qualifications">
                  <h2>자격 <small className="muted">학점 요건 확인·증거 얼림</small></h2>
                  {quals.length === 0 ? <p className="muted">없습니다.</p> : <ul className="issue-list">{quals.map((q) => (
                    <li key={q.id}><span><strong>{t(q.title)}</strong> <small className="muted">{q.kind_code} · {q.awarded_on}{q.corrected ? ' · 정정됨' : ''}</small></span></li>))}</ul>}
                  <ActionForm url="/api/records" action="qualification" extra={{ personId: person.id }} inline submitLabel="수여" successText="자격을 수여했습니다." testId="qualification-form"
                    confirmText="자격을 수여할까요? 수여 기록은 고치지 않고, 정정은 새 행으로 합니다."
                    fields={[{ name: 'kind', label: '종류 코드', required: true, placeholder: 'diploma' }, { name: 'title', label: '이름', required: true, placeholder: '졸업' },
                      { name: 'awardedOn', label: '수여일', type: 'date', defaultValue: day() }, { name: 'minCredits', label: '필요 학점(선택)', type: 'number' }]} />
                </section>
              </div>
            </>
          )}
          <div className="settings-grid">
            <section className="card stack" data-testid="school-docs">
              <h2>학교 소개서</h2>
              {schoolDocs.length === 0 ? <p className="muted">발행본이 없습니다.</p> : <ul className="issue-list">{schoolDocs.slice(0, 5).map((d) => (
                <li key={d.id}><span><Link href={`/records/doc/${d.id}`}>{d.title ?? FORMAT[d.format]}</Link> <small className="muted">{new Date(d.published_at).toLocaleDateString('ko-KR')}</small></span></li>))}</ul>}
              <ActionForm url="/api/records" action="publish" extra={{ format: 'us_school_profile' }} fields={[]} submitLabel="학교 소개서 발행" successText="학교 소개서를 발행했습니다." testId="profile-publish" />
            </section>
            <section className="card stack" data-testid="count-reports">
              <h2>지정일 보고 <small className="muted">집계만 얼림</small></h2>
              {latestReports.length === 0 ? <p className="muted">마감한 보고가 없습니다.</p> : <ul className="issue-list">{latestReports.map((r) => {
                const snap = r.snapshot as { enrollment?: { total?: number }; attendance_ytd?: { rate?: number | null; chronic_absent_students?: number }; qualifications_awarded?: number };
                const rate = snap.attendance_ytd?.rate;
                return <li key={r.id}><span><strong>{REPORTS.find((x) => x.value === r.code)?.label ?? r.code}</strong> <small className="muted">기준일 {r.as_of} · {r.version}판 · 재학 {snap.enrollment?.total ?? 0}명 · 출석률 {rate == null ? '-' : `${Math.round(Number(rate) * 1000) / 10}%`} · 만성 결석 {snap.attendance_ytd?.chronic_absent_students ?? 0}명 · 자격 {snap.qualifications_awarded ?? 0}</small></span></li>;
              })}</ul>}
              <ActionForm url="/api/records" action="count-report" inline submitLabel="보고 마감" successText="지정일 보고를 마감했습니다." testId="count-report-form"
                extra={{ requestKey: key('cr'), bases: reportBases }}
                fields={[{ name: 'code', label: '보고', type: 'select', options: REPORTS }, { name: 'asOf', label: '기준일', type: 'date', required: true, defaultValue: day() },
                  { name: 'reason', label: '정정 사유(다시 마감할 때)' }]} />
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
