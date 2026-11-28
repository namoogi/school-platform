import Link from 'next/link';
import { loadForPlatform } from '@/lib/page';
import { activeSessions, directivesOf, getItem, listItems } from '@/lib/lab';
import { getI18n, userLang } from '@/lib/i18n/server';
import type { MsgKey } from '@/lib/i18n/catalog';
import { labLabels } from '../labels';
import { STATUS, type Status } from '@/lib/control-shared';
import { outline } from '@/lib/richdoc';
import { PageHeader, StatusBadge } from '@/components/ui';
import { RichDoc } from '@/components/RichDoc';
import { DirectiveForm, ItemControls } from './ItemClient';

const DONE = new Set(['done', 'dropped', 'rejected', 'concluded', 'adopted']);
// 쓴 사람 이름: 선생님 · 관제 · 세션(사전의 cc.teacher · chat.control · chat.session)
const WHO: Record<string, MsgKey> = { user: 'cc.teacher', control: 'chat.control', session: 'chat.session' };

/** 81차: 연구소 항목 상세 — 본문(표·지표·흐름도·막대·계단), 목차, 연결된 할 일, 맨 아래 지침과 그 진행 */
export default async function LabItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { item, all, directives, sessions, uiLang } = await loadForPlatform(async ({ db }) => ({
    uiLang: await userLang(db),
    item: await getItem(db, id), all: await listItems(db, true), directives: await directivesOf(db, id), sessions: await activeSessions(db),
  }));
  const { t, locale } = await getI18n(uiLang);
  const { kinds, priorities } = labLabels(t);
  const kind = kinds[item.kind];
  const ctrlStatus = (s: string) => (s in STATUS ? t(`control.status.${s}` as MsgKey) : s);
  const toc = outline(item.body);
  const todos = all.filter((x) => x.parent_id === item.id && !x.archived_at);
  const parent = item.parent_id ? all.find((x) => x.id === item.parent_id) : null;
  const names = Object.fromEntries(sessions.map((s) => [s.id, s.name]));
  return (
    <>
      <PageHeader title={item.title} crumbs={[{ label: t('nav.group.platform') }, { label: t('nav.lab.title'), href: '/admin/lab' }, { label: kind.label }]}
        status={<StatusBadge tone={DONE.has(item.status) ? 'success' : 'info'}>{kind.statuses[item.status] ?? item.status}</StatusBadge>}
        meta={<><span>{kind.label}</span><span>{t('lab.metaPriority', { p: priorities[item.priority] })}</span>{item.due_date && <span>{t('lab.due', { date: item.due_date })}</span>}
          <span>{t('lab.edited', { when: new Date(item.updated_at).toLocaleString(locale) })}</span>{item.history_count > 0 && <span>{t('lab.changes', { n: item.history_count })}</span>}</>}
        actions={<Link className="btn" href="/admin/lab">{t('lab.cards')}</Link>} />
      <div className="lab-detail">
        <article className="card lab-doc" data-testid="lab-doc">
          {item.tags.length > 0 && <p className="lab-tags">{item.tags.map((tag) => <span key={tag} className="tag">#{tag}</span>)}</p>}
          <RichDoc body={item.body} testId="lab-body" t={t} />
          {item.link && <p className="fine">{t('lab.ref')}<a href={item.link} target="_blank" rel="noopener noreferrer">{item.link}</a></p>}
        </article>
        <aside className="lab-side stack">
          {toc.length > 0 && (
            <nav className="card lab-toc" aria-label={t('lab.toc')}>
              <h2>{t('lab.toc')}</h2>
              <ol>{toc.map((h) => <li key={h.id} data-level={h.level}><a href={`#${h.id}`}>{h.text}</a></li>)}</ol>
            </nav>)}
          <section className="card stack">
            <h2>{t('lab.progress')}</h2>
            <dl className="lab-facts">
              <div><dt>{t('lab.fact.directives')}</dt><dd>{t('lab.fact.directivesValue', { n: directives.length, done: directives.filter((d) => d.status === 'done' || d.status === 'dropped').length })}</dd></div>
              <div><dt>{t('lab.fact.todos')}</dt><dd>{todos.length ? `${todos.filter((x) => x.status === 'done').length}/${todos.length}` : t('lab.none')}</dd></div>
              {parent && <div><dt>{t('lab.fact.parent')}</dt><dd><Link href={`/admin/lab/${parent.id}`}>{parent.title}</Link></dd></div>}
            </dl>
            {todos.length > 0 && <ul className="lab-todos">{todos.map((x) => <li key={x.id}>{x.status === 'done' ? '☑' : '☐'} <Link href={`/admin/lab/${x.id}`}>{x.title}</Link></li>)}</ul>}
          </section>
          <ItemControls item={JSON.parse(JSON.stringify(item))} kinds={kinds} priorities={priorities} />
        </aside>
      </div>

      <section className="card stack lab-directives" data-testid="lab-directives" id="directives">
        <h2>{t('lab.thread')}</h2>
        <p className="fine">{t('lab.threadNote')}</p>
        {directives.length === 0 ? <p className="muted">{t('lab.noDirectives')}</p> : (
          <ol className="lab-thread">{directives.map((d) => (
            <li key={d.id} className="lab-thread-item" data-testid={`directive-${d.no}`}>
              <div className="lab-thread-head">
                <strong>#{d.no}</strong>
                <StatusBadge tone={STATUS[d.status as Status]?.tone === 'success' ? 'success' : STATUS[d.status as Status]?.tone === 'warning' ? 'warning' : 'info'}>{ctrlStatus(d.status)}</StatusBadge>
                <span className="muted small-text">{new Date(d.created_at).toLocaleString(locale)}{d.assignee_session ? ` · ${names[d.assignee_session] ?? d.assignee_session}` : ''}</span>
                <Link className="small-text" href={`/admin/control#r-${d.no}`}>{t('lab.inControl')}</Link>
              </div>
              <ul className="lab-msgs">{d.messages.filter((m) => m.body).map((m) => (
                <li key={m.id} className={`lab-msg lab-msg-${m.author}`}>
                  <span className="lab-msg-who">{m.author in WHO ? t(WHO[m.author]) : m.author}{m.author_session ? ` · ${names[m.author_session] ?? t('chat.session')}` : ''}</span>
                  {m.author === 'user' ? <p className="prewrap">{m.body}</p> : <RichDoc body={m.body} t={t} />}
                  <span className="muted small-text">{new Date(m.created_at).toLocaleString(locale)}{m.author === 'user' ? t(m.delivered_at ? 'lab.delivered' : 'lab.awaiting') : ''}</span>
                </li>))}</ul>
            </li>))}</ol>)}
        <DirectiveForm item={{ id: item.id, title: item.title }} sessions={sessions} />
      </section>
    </>
  );
}
