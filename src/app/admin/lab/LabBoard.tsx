'use client';
import { Switch } from '@/components/Field';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { shapes, summarize } from '@/lib/richdoc';
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

type Counts = Record<string, { total: number; done: number; review: number }>;
type Tab = Kind | 'all';

/** 81차: 연구소 — 카드 격자로 한눈에. 카드는 요약·진행(할 일·지침)·도식 수를 보이고, 누르면 상세(표·도식·지침)로 간다 */
export function LabBoard({ items, kinds, priorities, counts }: { items: Item[]; kinds: Kinds; priorities: Priorities; counts: Counts }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, string>>({});
  const parents = items.filter((i) => i.kind !== 'todo' && !i.archived_at);
  const children = useMemo(() => {
    const m: Record<string, { total: number; done: number }> = {};
    for (const i of items) if (i.parent_id && !i.archived_at) { const c = (m[i.parent_id] ??= { total: 0, done: 0 }); c.total++; if (DONE.has(i.status)) c.done++; }
    return m;
  }, [items]);

  const open = (i: Item) => !i.archived_at && !DONE.has(i.status);
  const tabCount = (k: Tab) => items.filter((i) => (k === 'all' || i.kind === k) && open(i)).length;
  const visible = items.filter((i) => (tab === 'all' || i.kind === tab)
    && (showArchived ? true : !i.archived_at)
    && (showClosed || !DONE.has(i.status) || i.kind === 'tool' || i.kind === 'method')
    && (!query || `${i.title} ${i.body} ${i.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())));

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try { await fn(); router.refresh(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="lab" data-testid="lab">
      <div className="tabs" role="tablist">
        {(['all', ...ORDER] as Tab[]).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {k === 'all' ? '전체' : kinds[k].label}<span className="count">{tabCount(k)}</span>
          </button>
        ))}
      </div>

      <QuickAdd kind={tab === 'all' ? 'todo' : tab} kinds={kinds} parents={parents} pickKind={tab === 'all'}
        onAdd={(v) => run(() => call('/api/admin/items', 'POST', { kind: tab === 'all' ? 'todo' : tab, ...v }))} />

      <div className="toolbar">
        <input type="search" placeholder="제목·내용·태그 검색" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="검색" />
        <Switch label="끝난 항목 보기" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
        <Switch label="보관한 항목 보기" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
      </div>
      {error && <p className="alert" role="alert">{error}</p>}

      <ul className="lab-cards" data-testid="lab-items">
        {visible.length === 0 && <li className="muted empty">항목이 없습니다.</li>}
        {visible.map((i) => {
          const sum = summarize(i.body);
          const sh = shapes(i.body);
          const ch = children[i.id];
          const dc = counts[i.id];
          return (
            <li key={i.id} className={`lab-card${i.archived_at ? ' archived' : ''}${DONE.has(i.status) ? ' closed' : ''}`} data-kind={i.kind}>
              <div className="lab-card-top">
                <span className="lab-kind">{kinds[i.kind].label}</span>
                <span className="badge" data-tone={DONE.has(i.status) ? 'success' : i.status === 'running' || i.status === 'in_progress' || i.status === 'doing' || i.status === 'trial' ? 'info' : 'neutral'}>{(kinds[i.kind].statuses as Record<string, string>)[i.status]}</span>
                {i.priority !== 'normal' && <span className={`badge prio-${i.priority}`}>{i.priority === 'high' ? '▲ ' : '▽ '}{priorities[i.priority]}</span>}
                {dc?.review ? <span className="badge" data-tone="warning">확인 필요 {dc.review}</span> : null}
              </div>
              <div className="lab-card-title">
                {i.kind === 'todo' && (
                  <input type="checkbox" aria-label="끝남 표시" checked={(pending[i.id] ?? i.status) === 'done'}
                    onChange={(e) => {
                      const status = e.target.checked ? 'done' : 'todo';
                      setPending({ ...pending, [i.id]: status });
                      run(() => call(`/api/admin/items/${i.id}`, 'PATCH', { status }))
                        .finally(() => setPending((p) => { const n = { ...p }; delete n[i.id]; return n; }));
                    }} />
                )}
                <Link href={`/admin/lab/${i.id}`} className="item-title">{i.title}</Link>
              </div>
              {sum && <p className="lab-card-sum">{sum}</p>}
              {ch && ch.total > 0 && (
                <div className="lab-progress" aria-label={`연결된 할 일 ${ch.total}개 중 ${ch.done}개 끝남`}>
                  <span className="lab-progress-track"><span className="lab-progress-fill" style={{ width: `${(ch.done / ch.total) * 100}%` }} /></span>
                  <small>할 일 {ch.done}/{ch.total}</small>
                </div>
              )}
              <div className="lab-card-foot">
                {sh.tables > 0 && <span>표 {sh.tables}</span>}
                {sh.visuals > 0 && <span>도식 {sh.visuals}</span>}
                {dc && <span>지침 {dc.done}/{dc.total}</span>}
                {i.due_date && <span>기한 {i.due_date}</span>}
                {i.tags.slice(0, 3).map((t) => <span key={t} className="tag">#{t}</span>)}
                <span className="lab-card-date">{new Date(i.updated_at).toLocaleDateString('ko-KR')}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function QuickAdd({ kind: initialKind, kinds, parents, onAdd, pickKind }: { kind: Kind; kinds: Kinds; parents: Item[]; onAdd: (v: Record<string, unknown>) => Promise<void>; pickKind?: boolean }) {
  const [pick, setPick] = useState<Kind>(initialKind);
  const kind = pickKind ? pick : initialKind;
  const [title, setTitle] = useState('');
  const [parent, setParent] = useState('');
  const [priority, setPriority] = useState('normal');
  const [due, setDue] = useState('');
  return (
    <form className="quick-add" data-testid="quick-add" onSubmit={async (e) => {
      e.preventDefault();
      if (!title.trim()) return;
      await onAdd({ ...(pickKind ? { kind } : {}), title, priority, due_date: due || null, parent_id: kind === 'todo' && parent ? parent : null });
      setTitle(''); setDue('');
    }}>
      {pickKind && <select value={pick} onChange={(e) => setPick(e.target.value as Kind)} aria-label="종류">{ORDER.map((k) => <option key={k} value={k}>{kinds[k].label}</option>)}</select>}
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
