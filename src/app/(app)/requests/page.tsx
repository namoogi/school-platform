import { loadForPage } from '@/lib/page';
import { listRecordRequests, REQUEST_STATUS, retentionRule } from '@/lib/portal';
import { listPeople } from '@/lib/people';
import { PageHeader, StatusBadge } from '@/components/ui';
import { DecideForm, RedactPanel, RetentionForm } from './RequestsClient';

/** 63차(ADR 0030·0028): 학생·보호자의 열람·수정 요청과 이의 의견서, 보존 규칙과 파기(가림 판) */
export default async function RequestsPage() {
  const { requests, rule, people } = await loadForPage(async ({ db, school }) => ({
    requests: await listRecordRequests(db, school.id),
    rule: await retentionRule(db, school.id),
    people: (await listPeople(db, school.id)).map((p) => ({ id: p.id, name: p.name })),
  }), { module: 'records', admin: true });
  const open = requests.filter((r) => !['granted', 'amended', 'not_applicable', 'closed'].includes(r.status));
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title="기록 요청" crumbs={[{ label: '학사 운영' }, { label: '기록 요청' }]}
        description="학생·보호자의 열람·수정 요청에 기한 안에 답합니다. 거부한 수정 요청에는 학생·보호자가 이의 의견서를 붙일 수 있고, 의견서는 이후 발행본에 함께 실립니다."
        meta={<><span>열린 요청 {open.length}건</span><span>기한 지남 {open.filter((r) => r.due_on < today).length}건</span></>} />
      <section className="card" data-testid="request-list">
        <h2>요청</h2>
        {requests.length === 0 && <p className="muted empty">아직 요청이 없습니다.</p>}
        <ul className="issue-list">{requests.map((r) => (
          <li key={r.id} className="stack">
            <span><StatusBadge tone={r.status === 'denied' ? 'warning' : open.includes(r) ? (r.due_on < today ? 'danger' : 'info') : 'neutral'}>{REQUEST_STATUS[r.status]}</StatusBadge>{' '}
              <strong>{r.name}</strong> <small className="muted">{r.requester_relation === 'child' ? '보호자 요청' : '본인 요청'} · {r.kind === 'amend' ? '수정' : '열람'} · 기한 {r.due_on}</small></span>
            <span>{r.body}</span>
            {r.events.filter((e) => e.note).map((e, i) => <small key={i} className="muted">{REQUEST_STATUS[e.status]}: {e.note}</small>)}
            {r.annotation && <small>이의 의견서: {r.annotation.body}</small>}
            <DecideForm id={r.id} status={r.status} />
          </li>
        ))}</ul>
      </section>
      <div className="settings-grid">
        <section className="card">
          <h2>보존 규칙</h2>
          <p className="fine">{rule ? `${rule.version}판 · ${rule.years_after_exit == null ? '영구 보존' : `재적이 끝난 뒤 ${rule.years_after_exit}년`}${rule.why ? ` · ${rule.why}` : ''}` : '아직 정하지 않았습니다(정하기 전에는 파기할 수 없습니다).'}</p>
          <RetentionForm current={rule} />
        </section>
        <section className="card">
          <h2>파기(가림 판)</h2>
          <p className="fine">행을 지우지 않고 파기 사건을 남긴 뒤 서술·메모·의견을 가림 값으로 바꿉니다. 끝나지 않은 요청이 있으면 파기할 수 없습니다.</p>
          <RedactPanel people={people} />
        </section>
      </div>
    </>
  );
}
