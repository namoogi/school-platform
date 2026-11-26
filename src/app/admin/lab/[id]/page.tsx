import Link from 'next/link';
import { loadForPlatform } from '@/lib/page';
import { activeSessions, directivesOf, getItem, KINDS, listItems, PRIORITIES } from '@/lib/lab';
import { STATUS, type Status } from '@/lib/control-shared';
import { outline } from '@/lib/richdoc';
import { PageHeader, StatusBadge } from '@/components/ui';
import { RichDoc } from '@/components/RichDoc';
import { DirectiveForm, ItemControls } from './ItemClient';

const DONE = new Set(['done', 'dropped', 'rejected', 'concluded', 'adopted']);
const WHO: Record<string, string> = { user: '선생님', control: '관제', session: '세션' };

/** 81차: 연구소 항목 상세 — 본문(표·지표·흐름도·막대·계단), 목차, 연결된 할 일, 맨 아래 지침과 그 진행 */
export default async function LabItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { item, all, directives, sessions } = await loadForPlatform(async ({ db }) => ({
    item: await getItem(db, id), all: await listItems(db, true), directives: await directivesOf(db, id), sessions: await activeSessions(db),
  }));
  const kind = KINDS[item.kind];
  const toc = outline(item.body);
  const todos = all.filter((x) => x.parent_id === item.id && !x.archived_at);
  const parent = item.parent_id ? all.find((x) => x.id === item.parent_id) : null;
  const names = Object.fromEntries(sessions.map((s) => [s.id, s.name]));
  return (
    <>
      <PageHeader title={item.title} crumbs={[{ label: '전체 관리' }, { label: '개발·연구소', href: '/admin/lab' }, { label: kind.label }]}
        status={<StatusBadge tone={DONE.has(item.status) ? 'success' : 'info'}>{(kind.statuses as Record<string, string>)[item.status]}</StatusBadge>}
        meta={<><span>{kind.label}</span><span>우선순위 {PRIORITIES[item.priority]}</span>{item.due_date && <span>기한 {item.due_date}</span>}
          <span>고침 {new Date(item.updated_at).toLocaleString('ko-KR')}</span>{item.history_count > 0 && <span>변경 {item.history_count}회</span>}</>}
        actions={<Link className="btn" href="/admin/lab">카드 보기</Link>} />
      <div className="lab-detail">
        <article className="card lab-doc" data-testid="lab-doc">
          {item.tags.length > 0 && <p className="lab-tags">{item.tags.map((t) => <span key={t} className="tag">#{t}</span>)}</p>}
          <RichDoc body={item.body} testId="lab-body" />
          {item.link && <p className="fine">참고: <a href={item.link} target="_blank" rel="noopener noreferrer">{item.link}</a></p>}
        </article>
        <aside className="lab-side stack">
          {toc.length > 0 && (
            <nav className="card lab-toc" aria-label="목차">
              <h2>목차</h2>
              <ol>{toc.map((t) => <li key={t.id} data-level={t.level}><a href={`#${t.id}`}>{t.text}</a></li>)}</ol>
            </nav>)}
          <section className="card stack">
            <h2>진행</h2>
            <dl className="lab-facts">
              <div><dt>지침</dt><dd>{directives.length}건 · 끝남 {directives.filter((d) => d.status === 'done' || d.status === 'dropped').length}</dd></div>
              <div><dt>할 일</dt><dd>{todos.length ? `${todos.filter((t) => t.status === 'done').length}/${todos.length}` : '없음'}</dd></div>
              {parent && <div><dt>상위</dt><dd><Link href={`/admin/lab/${parent.id}`}>{parent.title}</Link></dd></div>}
            </dl>
            {todos.length > 0 && <ul className="lab-todos">{todos.map((t) => <li key={t.id}>{t.status === 'done' ? '☑' : '☐'} <Link href={`/admin/lab/${t.id}`}>{t.title}</Link></li>)}</ul>}
          </section>
          <ItemControls item={JSON.parse(JSON.stringify(item))} kinds={JSON.parse(JSON.stringify(KINDS))} priorities={{ ...PRIORITIES }} />
        </aside>
      </div>

      <section className="card stack lab-directives" data-testid="lab-directives" id="directives">
        <h2>지침과 진행</h2>
        <p className="fine">이 항목에 대한 선생님의 지침입니다. 보내면 관제 센터를 거쳐 세션에 전달되고, 세션은 지침대로 이 항목의 내용(표·도식)을 고치거나 일을 진행한 뒤 아래에 결과를 보고합니다. 결과를 보고 '끝남'으로 닫거나 다음 지침을 이어 쓰세요.</p>
        {directives.length === 0 ? <p className="muted">아직 지침이 없습니다.</p> : (
          <ol className="lab-thread">{directives.map((d) => (
            <li key={d.id} className="lab-thread-item" data-testid={`directive-${d.no}`}>
              <div className="lab-thread-head">
                <strong>#{d.no}</strong>
                <StatusBadge tone={STATUS[d.status as Status]?.tone === 'success' ? 'success' : STATUS[d.status as Status]?.tone === 'warning' ? 'warning' : 'info'}>{STATUS[d.status as Status]?.label ?? d.status}</StatusBadge>
                <span className="muted small-text">{new Date(d.created_at).toLocaleString('ko-KR')}{d.assignee_session ? ` · ${names[d.assignee_session] ?? d.assignee_session}` : ''}</span>
                <Link className="small-text" href={`/admin/control#r-${d.no}`}>관제 센터에서 보기</Link>
              </div>
              <ul className="lab-msgs">{d.messages.filter((m) => m.body).map((m) => (
                <li key={m.id} className={`lab-msg lab-msg-${m.author}`}>
                  <span className="lab-msg-who">{WHO[m.author] ?? m.author}{m.author_session ? ` · ${names[m.author_session] ?? '세션'}` : ''}</span>
                  {m.author === 'user' ? <p className="prewrap">{m.body}</p> : <RichDoc body={m.body} />}
                  <span className="muted small-text">{new Date(m.created_at).toLocaleString('ko-KR')}{m.author === 'user' ? (m.delivered_at ? ' · 전달됨' : ' · 전달 대기') : ''}</span>
                </li>))}</ul>
            </li>))}</ol>)}
        <DirectiveForm item={{ id: item.id, title: item.title }} sessions={sessions} />
      </section>
    </>
  );
}
