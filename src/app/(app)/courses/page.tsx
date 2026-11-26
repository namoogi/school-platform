import Link from 'next/link';
import { loadForPage } from '@/lib/page';
import { listSchoolLevels, listPeople } from '@/lib/people';
import { offeringsOfTerm, roster } from '@/lib/courses';
import { allTerms, levelStudentsOn, listCourseTypes, listSubjects, offeringStaff, subjectLabels } from '@/lib/academics';
import { isUuid } from '@/lib/services';
import { PageHeader, StatusBadge } from '@/components/ui';
import { ActionForm } from '@/components/ActionForm';

const TRIGGER: Record<string, string> = { term_start: '학기 시작 때 자동 개설(필수)', application_close: '신청 마감 때 확정(선택)', approval: '관리자 승인(제안 수업)' };
const STATUS: Record<string, string> = { planned: '예정', open: '신청·수강 중', active: '진행', closed: '마감', cancelled: '취소' };
const ENR: Record<string, string> = { enrolled: '수강', applied: '신청', withdrawn: '철회', rejected: '반려' };

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
      terms, levels, term, level, offerings, sel,
      subjects: await listSubjects(db, school.id), types: await listCourseTypes(db, school.id), labels: await subjectLabels(db, school.id),
      people: (await listPeople(db, school.id)).map((p) => ({ id: p.id, name: p.name })),
      roster: sel ? await roster(db, school.id, sel.id) : [], staff: sel ? await offeringStaff(db, school.id, sel.id) : [],
      candidates: sel && level ? await levelStudentsOn(db, school.id, level.id, term?.starts_on ?? null) : [],
    };
  }, { module: 'records' });
  const { terms, levels, term, level, offerings, sel, subjects, types, labels, people, school } = data;
  const admin = school.isAdmin;
  const q = (o?: string) => `/courses?${new URLSearchParams({ ...(term ? { term: term.id } : {}), ...(level ? { level: level.id } : {}), ...(o ? { o } : {}) })}`;
  const missingFirst = !terms.length ? '학교 구조에서 학년도와 학기를 먼저 만드세요.' : !levels.length ? '학교 구조에서 학교급을 먼저 만드세요.' : null;
  return (
    <>
      <PageHeader title="수업" crumbs={[{ label: '학사 운영' }, { label: '수업' }]}
        description="과목과 수업 갈래를 정하고, 학기·학교급마다 수업을 개설해 담당 교사와 수강생을 둡니다. 갈래 규칙은 판으로 쌓입니다."
        meta={<><span>과목 {subjects.length}</span><span>갈래 {types.length}</span>{term && <span>{term.year} {term.label} 개설 {offerings.length}</span>}</>} />
      {missingFirst && <section className="card"><p className="muted">{missingFirst} <Link href="/academics">학교 구조로</Link></p></section>}
      {term && level && (
        <section className="card stack" data-testid="offerings">
          <form className="row-wrap" action="/courses">
            <label>학기<select name="term" defaultValue={term.id}>{terms.map((t) => <option key={t.id} value={t.id}>{t.year} {t.label}</option>)}</select></label>
            <label>학교급<select name="level" defaultValue={level.id}>{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            <button className="btn btn-sm" type="submit">보기</button>
          </form>
          <h2>{term.year} {term.label} · {level.name} 개설</h2>
          {offerings.length === 0 ? <p className="muted">개설한 수업이 없습니다.</p> : (
            <div className="table-wrap"><table className="grid-table"><thead><tr><th>과목</th><th>갈래</th><th>반</th><th>학점</th><th>상태</th><th>수강</th></tr></thead>
              <tbody>{offerings.map((o) => (
                <tr key={o.id} aria-current={sel?.id === o.id ? 'true' : undefined}>
                  <td><Link href={q(o.id)}>{o.subject_name}</Link>{o.pass_fail ? <small className="muted"> P/F</small> : null}</td><td>{o.course_type_name}</td><td>{o.section || '-'}</td>
                  <td>{o.credits}</td><td><StatusBadge tone={o.status === 'active' ? 'success' : o.status === 'cancelled' ? 'danger' : 'neutral'}>{STATUS[o.status]}</StatusBadge></td><td>{o.enrolled}{o.capacity ? `/${o.capacity}` : ''}</td>
                </tr>))}</tbody></table></div>)}
          {admin && subjects.length > 0 && types.some((t) => t.rule_version) && (
            <details><summary>수업 개설</summary>
              <ActionForm url="/api/courses" action="offering" extra={{ termId: term.id, levelId: level.id }} inline submitLabel="개설" successText="수업을 개설했습니다." testId="offering-form"
                fields={[{ name: 'subjectId', label: '과목', type: 'select', options: subjects.map((s) => ({ value: s.id, label: s.name })) },
                  { name: 'typeId', label: '갈래', type: 'select', options: types.filter((t) => t.rule_version).map((t) => ({ value: t.id, label: t.name })) },
                  { name: 'credits', label: '학점', type: 'number', required: true, defaultValue: '1' }, { name: 'section', label: '반(선택)', placeholder: 'A' },
                  { name: 'capacity', label: '정원(선택)', type: 'number' }, { name: 'passFail', label: 'P/F 수업', type: 'select', options: [{ value: 'no', label: '아니오' }, { value: 'yes', label: '예' }] }]} />
            </details>)}
          {admin && offerings.some((o) => o.status === 'planned') && <ActionForm url="/api/courses" action="start-term" extra={{ termId: term.id }} fields={[]} submitLabel="학기 시작(예정 수업 진행·자동 수강)" successText="학기를 시작했습니다." testId="start-term" />}
        </section>
      )}
      {sel && (
        <section className="card stack" data-testid="offering-detail">
          <h2>{sel.subject_name}{sel.section ? ` ${sel.section}반` : ''} <StatusBadge tone="neutral">{STATUS[sel.status]}</StatusBadge></h2>
          <p className="fine">{sel.course_type_name} · {TRIGGER[sel.creation_trigger]} · 갈래 규칙 {sel.rule_version}판 · 학점 {sel.credits}</p>
          {admin && sel.status === 'planned' && sel.creation_trigger === 'approval' && <ActionForm url="/api/courses" action="approve" extra={{ offeringId: sel.id, revision: sel.revision }} fields={[]} submitLabel="승인" successText="승인했습니다." />}
          {admin && sel.status === 'open' && sel.creation_trigger === 'application_close' && <ActionForm url="/api/courses" action="close-applications" extra={{ offeringId: sel.id, revision: sel.revision }} fields={[]} submitLabel="신청 마감·확정" successText="신청을 마감했습니다." />}
          <h3>담당</h3>
          {data.staff.length === 0 ? <p className="muted">담당 교사가 없습니다.</p> : <ul className="issue-list">{data.staff.map((s) => <li key={s.person_id}>{s.name} <small className="muted">{s.role === 'lead' ? '담당' : '보조'}</small></li>)}</ul>}
          {admin && <ActionForm url="/api/courses" action="staff" extra={{ offeringId: sel.id }} inline submitLabel="담당 지정" successText="담당을 지정했습니다." testId="staff-form"
            fields={[{ name: 'personId', label: '사람', type: 'select', options: people.map((p) => ({ value: p.id, label: p.name })) }, { name: 'role', label: '역할', type: 'select', options: [{ value: 'lead', label: '담당' }, { value: 'assistant', label: '보조' }] }]} />}
          <h3>수강 명단 <small className="muted">{data.roster.filter((r) => r.status === 'enrolled').length}명</small></h3>
          {data.roster.length === 0 ? <p className="muted">수강생이 없습니다.</p> : (
            <ul className="issue-list" data-testid="roster">{data.roster.map((r) => (
              <li key={r.person_id}><span>{r.name} <StatusBadge tone={r.status === 'enrolled' ? 'success' : 'neutral'}>{ENR[r.status] ?? r.status}</StatusBadge></span>
                {(sel.status === 'open' || sel.status === 'active') && r.status === 'enrolled' && <ActionForm url="/api/courses" action="enroll" extra={{ offeringId: sel.id, personId: r.person_id, status: 'withdrawn', revision: sel.revision }} fields={[]} submitLabel="철회" successText="철회했습니다." />}
              </li>))}</ul>)}
          {(sel.status === 'open' || sel.status === 'active') ? (data.candidates.length
            ? <ActionForm url="/api/courses" action="enroll" extra={{ offeringId: sel.id, revision: sel.revision }} inline submitLabel="수강 추가" successText="수강생을 더했습니다." testId="enroll-student"
                fields={[{ name: 'personId', label: '학생(이 학교급 재학)', type: 'select', options: data.candidates.map((p) => ({ value: p.id, label: p.name })) }]} />
            : <p className="fine">이 학교급에 학기 시작일 기준 재학생이 없습니다.</p>)
            : <p className="fine">수강 추가는 수업이 신청·수강 중이거나 진행 중일 때 합니다(예정 수업은 학기 시작 뒤).</p>}
        </section>
      )}
      {admin && (
        <div className="settings-grid">
          <section className="card stack" data-testid="subjects">
            <h2>과목</h2>
            {subjects.length === 0 ? <p className="muted">과목이 없습니다.</p> : <ul className="issue-list">{subjects.map((s) => {
              const L = labels[s.id] ?? {};
              return <li key={s.id} className="stack"><span><strong>{s.name}</strong> <small className="muted">{s.code}{s.level_name ? ` · ${s.level_name}` : ''}{L.transcript ? ` · 성적증명서: ${L.transcript.label.en ?? ''}` : ''}</small></span>
                <details><summary>표기(학생부·성적증명서·태국어)</summary>
                  <ActionForm url="/api/courses" action="label" extra={{ subjectId: s.id, bases: Object.fromEntries(Object.entries(L).map(([k, v]) => [k, v.version])) }} inline submitLabel="표기 저장" successText="표기를 새 판으로 저장했습니다."
                    fields={[{ name: 'purpose', label: '용도', type: 'select', options: [{ value: 'all', label: '전체' }, { value: 'record', label: '학생부' }, { value: 'transcript', label: '성적증명서' }, { value: 'report_card', label: '성적표' }] },
                      { name: 'ko', label: '한국어', defaultValue: L.all?.label.ko ?? s.name }, { name: 'en', label: 'English', defaultValue: L.all?.label.en ?? '' }, { name: 'th', label: 'ไทย', defaultValue: L.all?.label.th ?? '' }]} />
                  <p className="fine">표기는 용도별 판으로 쌓입니다. 그 사이 다른 사람이 같은 용도를 고쳤으면 저장을 거부하니, 새로 고친 뒤 다시 저장하세요.</p>
                </details></li>;
            })}</ul>}
            <ActionForm url="/api/courses" action="subject" inline submitLabel="과목 추가" successText="과목을 추가했습니다." testId="subject-form"
              fields={[{ name: 'name', label: '이름', required: true, placeholder: '수학' }, { name: 'code', label: '코드', required: true, placeholder: 'MATH' },
                { name: 'levelId', label: '학교급(선택)', type: 'select', options: [{ value: '', label: '모든 학교급' }, ...levels.map((l) => ({ value: l.id, label: l.name }))] }]} />
          </section>
          <section className="card stack" data-testid="types">
            <h2>수업 갈래</h2>
            {types.length === 0 ? <p className="muted">갈래가 없습니다. 예: 필수·선택·학생 제안.</p> : <ul className="issue-list">{types.map((t) => (
              <li key={t.id} className="stack"><span><strong>{t.name}</strong> <small className="muted">{t.code} · {t.rule_version ? `${TRIGGER[t.creation_trigger!]} · ${t.rule_version}판${t.pass_fail_allowed ? ' · P/F 허용' : ''}` : '규칙 없음(개설 전에 정하세요)'}</small></span>
                <details><summary>규칙 새 판</summary>
                  <ActionForm url="/api/courses" action="type-rule" extra={{ typeId: t.id }} inline submitLabel="규칙 저장" successText="갈래 규칙을 새 판으로 저장했습니다." testId={`type-rule-${t.code}`}
                    fields={[{ name: 'trigger', label: '개설 계기', type: 'select', options: Object.entries(TRIGGER).map(([value, label]) => ({ value, label })) },
                      { name: 'passFailAllowed', label: 'P/F 허용', type: 'select', options: [{ value: 'no', label: '아니오' }, { value: 'yes', label: '예' }] },
                      { name: 'publishable', label: '홈페이지 공개 가능', type: 'select', options: [{ value: 'no', label: '아니오' }, { value: 'yes', label: '예' }] }]} />
                </details></li>))}</ul>}
            <ActionForm url="/api/courses" action="type" inline submitLabel="갈래 추가" successText="갈래를 추가했습니다." testId="type-form"
              fields={[{ name: 'name', label: '이름', required: true, placeholder: '필수' }, { name: 'code', label: '코드', required: true, placeholder: 'required' }]} />
          </section>
        </div>
      )}
    </>
  );
}
