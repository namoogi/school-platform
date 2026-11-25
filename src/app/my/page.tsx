import { Fragment } from 'react';
import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { portalPeople, portalRecord } from '@/lib/portal';
import { PageHeader, StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

const FORMAT: Record<string, string> = { kr_alt_record: '학교생활기록부(학교 자체)', us_transcript: 'Transcript', us_school_profile: 'School Profile' };
const pick = (t: Record<string, string> | undefined) => (t ? t.ko ?? t.en ?? Object.values(t)[0] ?? '' : '');
const day = (d: string) => new Date(d).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });

/** 62차(ADR 0029): 학생·보호자 '내 기록' — 열람 계약(app.portal_record_v1)만 읽는다 */
export default async function MyRecordPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const userId = await requireUser();
  const sp = await searchParams;
  const { people, record } = await asUser(userId, async (db) => {
    const people = await portalPeople(db);
    const chosen = people.find((x) => x.person_id === sp.p) ?? people[0];
    return { people, record: chosen ? await portalRecord(db, chosen.person_id) : null };
  });
  return (
    <div className="portal">
      <header className="portal-top">
        <strong>내 기록</strong>
        <form method="post" action="/api/logout"><button type="submit" className="btn btn-ghost btn-sm">로그아웃</button></form>
      </header>
      <main className="content-inner content-narrow portal-main" id="main">
        {!record ? (
          <section className="card"><h1>볼 수 있는 기록이 없습니다</h1><p className="muted">학교가 열람 계정을 열면 여기에서 기록을 봅니다. 학교 관리자에게 문의하세요.</p></section>
        ) : (
          <>
            <PageHeader title={`${record.student?.name ?? ''} ${record.relation === 'child' ? '(자녀)' : ''}`.trim()} crumbs={[{ label: record.school }, { label: '내 기록' }]}
              description="학교가 확정한 기록과 발행본입니다. 바로잡을 것이 있으면 학교에 수정 요청을 할 수 있습니다(곧 열림)." />
            {people.length > 1 && (
              <nav className="row-wrap" aria-label="볼 사람">
                {people.map((x) => <Link key={`${x.school_id}:${x.person_id}`} className="btn btn-sm" aria-current={x.person_id === (sp.p ?? people[0].person_id) ? 'page' : undefined}
                  href={`/my?p=${x.person_id}`}>{x.name} · {x.school}</Link>)}
              </nav>
            )}
            {record.attendance_current && (
              <section className="card" data-testid="my-attendance">
                <h2>올해 출결 <small className="muted">{record.attendance_current.year} · 오늘까지</small></h2>
                <p>수업일 {record.attendance_current.enrolled_days}일 중 결석 {record.attendance_current.absent_days}일
                  {Object.keys(record.attendance_current.absent_by_reason).length > 0 && <span className="muted"> ({Object.entries(record.attendance_current.absent_by_reason).map(([k, v]) => `${k} ${v}`).join(', ')})</span>}</p>
              </section>
            )}
            <section className="card" data-testid="my-records">
              <h2>확정 기록</h2>
              {record.record_years.length === 0 && <p className="muted">아직 마감한 학년도 기록이 없습니다.</p>}
              {record.record_years.map((y) => (
                <div key={y.year.label} className="stack">
                  <h3>{y.year.label} <small className="muted">{y.version}판 · {day(y.closed_at)} 마감{y.reason ? ` · ${y.reason}` : ''}</small></h3>
                  {y.courses.length > 0 && (
                    <div className="table-wrap"><table className="grid-table"><thead><tr><th>과목</th><th>학기</th><th>학점</th><th>성취</th></tr></thead>
                      <tbody>{y.courses.map((c) => <tr key={`${c.subject_code}-${c.term}`}><td>{pick(c.labels.record) || pick(c.labels.all) || c.subject_name}</td><td>{c.term}</td>
                        <td>{Number(c.result.credits_earned)}/{Number(c.credits)}</td><td>{c.result.level_code ?? (c.result.attempt_status === 'withdrawn' ? '철회' : '—')}</td></tr>)}</tbody></table></div>
                  )}
                  {y.narratives.length > 0 && <dl className="facts">{y.narratives.map((n, i) => <Fragment key={i}><dt>{n.kind === 'behavior' ? '행동 특성' : n.kind === 'subject_detail' ? '과목 세부 특기' : n.kind}</dt><dd>{n.body}</dd></Fragment>)}</dl>}
                  {y.attendance && <p className="fine">출결: 수업일 {Number(y.attendance.enrolled_days)}일 · 결석 {Number(y.attendance.absent_days)}일</p>}
                </div>
              ))}
            </section>
            {record.school_records.length > 0 && (
              <section className="card" data-testid="my-school-records">
                <h2>학교 활동 기록</h2>
                <ul className="issue-list">{record.school_records.map((r, i) => (
                  <li key={i}><span><strong>{pick(r.title)}</strong> {r.state && <StatusBadge tone="neutral">{r.state}</StatusBadge>}{' '}
                    {r.fields.map((f) => `${pick(f.label)}: ${Array.isArray(f.value) ? f.value.join(', ') : String(f.value)}`).join(' · ')}</span></li>
                ))}</ul>
              </section>
            )}
            <section className="card" data-testid="my-documents">
              <h2>발행본</h2>
              {record.documents.length === 0 ? <p className="muted">아직 발행한 문서가 없습니다.</p> : (
                <ul className="issue-list">{record.documents.map((d) => (
                  <li key={d.id}><Link href={`/my/documents/${d.id}`}>{FORMAT[d.format] ?? d.format}</Link> <small className="muted">{day(d.published_at)}</small></li>
                ))}</ul>)}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
