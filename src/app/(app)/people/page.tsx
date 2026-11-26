import Link from 'next/link';
import { loadForPage } from '@/lib/page';
import { listPeople, listSchoolLevels, nameHistory } from '@/lib/people';
import { enrolledToday, personEnrollments } from '@/lib/academics';
import { isUuid } from '@/lib/services';
import { PageHeader, StatusBadge } from '@/components/ui';
import { ActionForm } from '@/components/ActionForm';

const STATUS: Record<string, string> = { enrolled: '재학', graduated: '졸업', transferred_out: '전출', withdrawn: '자퇴·제적' };

/** 71차: 사람·학적 — 사람은 id로만 구분하고 이름은 판으로 쌓는다(지침 7). 학적은 학교급 단위 기간 */
export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ id?: string; q?: string }> }) {
  const sp = await searchParams;
  const { people, levels, enrolled, detail, school } = await loadForPage(async ({ db, school }) => {
    const people = await listPeople(db, school.id);
    const sel = sp.id && isUuid(sp.id) ? people.find((p) => p.id === sp.id) : undefined;
    return { people, levels: await listSchoolLevels(db, school.id), enrolled: await enrolledToday(db, school.id),
      detail: sel ? { person: sel, names: await nameHistory(db, school.id, sel.id), enrollments: await personEnrollments(db, school.id, sel.id) } : null };
  }, { module: 'records' });
  const q = (sp.q ?? '').trim();
  const shown = q ? people.filter((p) => p.name.includes(q) || (p.name_latin ?? '').toLowerCase().includes(q.toLowerCase())) : people;
  const admin = school.isAdmin;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title="사람·학적" crumbs={[{ label: '학사 운영' }, { label: '사람·학적' }]}
        description="학생·교직원·보호자를 사람으로 등록하고, 학생은 학교급 학적을 기간으로 남깁니다. 이름이 바뀌면 이유와 함께 새 판으로 쌓입니다."
        meta={<><span>사람 {people.length}</span><span>오늘 재학 {Object.keys(enrolled).length}</span></>} />
      <div className="people-layout">
        <section className="card stack" aria-label="사람 목록">
          <form className="row-wrap" action="/people"><input name="q" defaultValue={q} placeholder="이름으로 찾기" aria-label="이름으로 찾기" /><button className="btn btn-sm" type="submit">찾기</button></form>
          <ul className="people-list" data-testid="people-list">{shown.map((p) => (
            <li key={p.id}><Link href={`/people?id=${p.id}${q ? `&q=${encodeURIComponent(q)}` : ''}`} aria-current={detail?.person.id === p.id ? 'page' : undefined}>
              <span>{p.name}{p.name_latin ? <small className="muted"> {p.name_latin}</small> : null}</span>
              {enrolled[p.id] && <small className="muted">{enrolled[p.id]}</small>}</Link></li>))}</ul>
          {shown.length === 0 && <p className="muted">사람이 없습니다.</p>}
          {admin && <><h2>사람 추가</h2><ActionForm url="/api/people" action="add" submitLabel="추가" successText="사람을 추가했습니다." testId="person-add"
            fields={[{ name: 'name', label: '이름', required: true }, { name: 'nameLatin', label: '로마자 이름(선택)', placeholder: 'Hong Gildong' }]} /></>}
        </section>
        <section className="card stack" aria-label="사람 자세히" data-testid="person-detail">
          {!detail ? <p className="muted">왼쪽에서 사람을 고르세요.</p> : (
            <>
              <h2>{detail.person.name} {detail.person.name_latin && <small className="muted">{detail.person.name_latin}</small>}</h2>
              <h3>학적</h3>
              {detail.enrollments.length === 0 ? <p className="muted">학적이 없습니다.</p> : (
                <ul className="issue-list">{detail.enrollments.map((e) => (
                  <li key={e.id} className="stack">
                    <span><StatusBadge tone={e.status === 'enrolled' ? 'success' : 'neutral'}>{STATUS[e.status] ?? e.status}</StatusBadge> {e.level_name} · {e.starts_on} ~ {e.ends_on ?? ''}</span>
                    {admin && e.status === 'enrolled' && <ActionForm url="/api/people" action="end-enrollment" extra={{ enrollmentId: e.id }} inline submitLabel="학적 끝내기" successText="학적을 끝냈습니다."
                      confirmText="학적을 끝냅니다. 끝낸 학적은 되돌리지 않고 새 학적으로 다시 등록합니다. 진행할까요?"
                      fields={[{ name: 'endsOn', label: '끝 날짜', type: 'date', required: true, defaultValue: today }, { name: 'status', label: '사유', type: 'select', options: [{ value: 'graduated', label: '졸업' }, { value: 'transferred_out', label: '전출' }, { value: 'withdrawn', label: '자퇴·제적' }] }]} />}
                  </li>))}</ul>)}
              {admin && levels.length > 0 && <ActionForm url="/api/people" action="enroll" extra={{ personId: detail.person.id }} inline submitLabel="학적 등록" successText="학적을 등록했습니다." testId="enroll-form"
                fields={[{ name: 'levelId', label: '학교급', type: 'select', options: levels.map((l) => ({ value: l.id, label: l.name })) }, { name: 'startsOn', label: '시작', type: 'date', required: true, defaultValue: today }]} />}
              {admin && levels.length === 0 && <p className="fine">학적을 등록하려면 <Link href="/academics">학교 구조</Link>에서 학교급을 먼저 만드세요.</p>}
              <h3>이름 판</h3>
              <ul className="issue-list">{detail.names.map((n) => <li key={n.version}>{n.version}판 · {n.name}{n.name_latin ? ` (${n.name_latin})` : ''}{n.reason ? <small className="muted"> — {n.reason}</small> : null}</li>)}</ul>
              {admin && <ActionForm url="/api/people" action="rename" extra={{ personId: detail.person.id }} inline submitLabel="새 이름 판" successText="이름을 새 판으로 저장했습니다."
                fields={[{ name: 'name', label: '이름', required: true, defaultValue: detail.person.name }, { name: 'nameLatin', label: '로마자', defaultValue: detail.person.name_latin ?? '' }, { name: 'reason', label: '바꾸는 이유', required: true, width: 'wide' }]} />}
            </>
          )}
        </section>
      </div>
    </>
  );
}
