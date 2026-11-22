'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Item, Kind } from '@/lib/lab';

type Kinds = Record<Kind, { label: string; statuses: Record<string, string> }>;
type Priorities = Record<string, string>;
const ORDER: Kind[] = ['todo', 'plan', 'tool', 'method', 'lab'];
const DONE = new Set(['done', 'dropped', 'rejected', 'concluded', 'adopted']);

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? '처리하지 못했습니다.');
  return data;
}

export function LabBoard({ items, kinds, priorities }: { items: Item[]; kinds: Kinds; priorities: Priorities }) {
  const router = useRouter();
  const [tab, setTab] = useState<Kind>('todo');
  const [query, setQuery] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 체크하면 서버 응답 전에 바로 표시한다
  const [pending, setPending] = useState<Record<string, string>>({});
  const byId = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const parents = items.filter((i) => i.kind !== 'todo' && !i.archived_at);

  const counts = Object.fromEntries(ORDER.map((k) => [k, items.filter((i) => i.kind === k && !i.archived_at && !DONE.has(i.status)).length]));
  const visible = items.filter((i) => i.kind === tab
    && (showArchived ? true : !i.archived_at)
    && (showClosed || !DONE.has(i.status) || tab === 'tool' || tab === 'method')
    && (!query || `${i.title} ${i.body} ${i.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())));

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try { await fn(); router.refresh(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="lab" data-testid="lab">
      <div className="tabs" role="tablist">
        {ORDER.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => { setTab(k); setEditing(null); }}>
            {kinds[k].label}<span className="count">{counts[k]}</span>
          </button>
        ))}
      </div>

      <QuickAdd kind={tab} kinds={kinds} parents={parents} onAdd={(v) => run(() => call('/api/admin/items', 'POST', { ...v, kind: tab }))} />

      <div className="toolbar">
        <input type="search" placeholder="제목·내용·태그 검색" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="검색" />
        {tab !== 'tool' && tab !== 'method' && <label className="radio"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> 끝난 항목 보기</label>}
        <label className="radio"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> 보관한 항목 보기</label>
      </div>
      {error && <p className="alert" role="alert">{error}</p>}

      <ul className="items" data-testid="lab-items">
        {visible.length === 0 && <li className="muted empty">항목이 없습니다.</li>}
        {visible.map((i) => (
          <li key={i.id} className={`item${i.archived_at ? ' archived' : ''}${DONE.has(i.status) ? ' closed' : ''}`}>
            <div className="item-main">
              {i.kind === 'todo' && (
                <input type="checkbox" aria-label="끝남 표시" checked={(pending[i.id] ?? i.status) === 'done'}
                  onChange={(e) => {
                    const status = e.target.checked ? 'done' : 'todo';
                    setPending({ ...pending, [i.id]: status });
                    run(() => call(`/api/admin/items/${i.id}`, 'PATCH', { status }))
                      .finally(() => setPending((p) => { const n = { ...p }; delete n[i.id]; return n; }));
                  }} />
              )}
              <div className="item-text">
                <button type="button" className="item-title" onClick={() => setEditing(editing === i.id ? null : i.id)}>{i.title}</button>
                <div className="item-meta">
                  <select aria-label="상태" value={i.status} onChange={(e) => run(() => call(`/api/admin/items/${i.id}`, 'PATCH', { status: e.target.value }))}>
                    {Object.entries(kinds[i.kind].statuses).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <span className={`badge prio-${i.priority}`}>{priorities[i.priority]}</span>
                  {i.due_date && <span className="tag">기한 {i.due_date}</span>}
                  {i.parent_id && byId[i.parent_id] && <span className="badge" data-tone="info">↳ {byId[i.parent_id].title.slice(0, 24)}</span>}
                  {i.tags.map((t) => <span key={t} className="tag">#{t}</span>)}
                  {i.history_count > 0 && <span className="muted small-text">변경 {i.history_count}회</span>}
                </div>
                {i.body && editing !== i.id && <p className="item-body">{i.body}</p>}
              </div>
            </div>
            {editing === i.id && (
              <EditForm item={i} kinds={kinds} priorities={priorities} parents={parents.filter((p) => p.id !== i.id)}
                onSave={(v) => run(async () => { await call(`/api/admin/items/${i.id}`, 'PATCH', v); setEditing(null); })}
                onArchive={() => run(() => call(`/api/admin/items/${i.id}`, 'PATCH', { archived: !i.archived_at }))} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuickAdd({ kind, kinds, parents, onAdd }: { kind: Kind; kinds: Kinds; parents: Item[]; onAdd: (v: Record<string, unknown>) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [parent, setParent] = useState('');
  const [priority, setPriority] = useState('normal');
  const [due, setDue] = useState('');
  return (
    <form className="quick-add" data-testid="quick-add" onSubmit={async (e) => {
      e.preventDefault();
      if (!title.trim()) return;
      await onAdd({ title, priority, due_date: due || null, parent_id: kind === 'todo' && parent ? parent : null });
      setTitle(''); setDue('');
    }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`새 ${kinds[kind].label} 제목`} aria-label="새 항목 제목" />
      <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="우선순위">
        <option value="high">높음</option><option value="normal">보통</option><option value="low">낮음</option>
      </select>
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="기한" />
      {kind === 'todo' && (
        <select value={parent} onChange={(e) => setParent(e.target.value)} aria-label="연결할 기획·연구">
          <option value="">연결 없음</option>
          {parents.map((p) => <option key={p.id} value={p.id}>[{kinds[p.kind].label}] {p.title.slice(0, 30)}</option>)}
        </select>
      )}
      <button type="submit" className="btn btn-primary" disabled={!title.trim()}>추가</button>
    </form>
  );
}

function EditForm({ item, kinds, priorities, parents, onSave, onArchive }: {
  item: Item; kinds: Kinds; priorities: Priorities; parents: Item[];
  onSave: (v: Record<string, unknown>) => Promise<void>; onArchive: () => Promise<void>;
}) {
  const [f, setF] = useState({ title: item.title, body: item.body, priority: item.priority, due_date: item.due_date ?? '',
    tags: item.tags.join(', '), link: item.link ?? '', parent_id: item.parent_id ?? '' });
  return (
    <div className="edit-form">
      <label>제목<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
      <label>내용·메모<textarea rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></label>
      <div className="row">
        <label>우선순위<select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Item['priority'] })}>
          {Object.entries(priorities).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>기한<input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></label>
        <label>태그 (쉼표)<input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></label>
      </div>
      <label>참고 링크<input value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://" /></label>
      <label>연결 항목<select value={f.parent_id} onChange={(e) => setF({ ...f, parent_id: e.target.value })}>
        <option value="">연결 없음</option>
        {parents.map((p) => <option key={p.id} value={p.id}>[{kinds[p.kind].label}] {p.title.slice(0, 40)}</option>)}</select></label>
      <div className="row">
        <button type="button" className="primary" onClick={() => onSave({ ...f, due_date: f.due_date || null, link: f.link || null, parent_id: f.parent_id || null })}>저장</button>
        <button type="button" className="secondary" onClick={onArchive}>{item.archived_at ? '보관 해제' : '보관'}</button>
        {item.link && <a className="button secondary" href={item.link} target="_blank" rel="noopener noreferrer">링크 열기</a>}
      </div>
    </div>
  );
}
