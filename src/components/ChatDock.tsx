'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MessagesSquare, Maximize2, Minimize2, X, ArrowLeft } from 'lucide-react';
import { StatusBadge } from './ui';
import {
  BADGE, CLOSED, NEEDS_USER, SCHOOL_TOPICS, STATUS, TOPIC,
  type Request, type Status, type ThreadSummary, type Topic,
} from '@/lib/control-shared';

/**
 * 41차: 어디서나 여는 대화창 (ADR 0017). 옛 '개선 요청 판'의 떠 있는 창·결정 카드·결과 확인을 가져왔다.
 * - 전체 관리 화면(scope=platform): 모든 대화. 학교 화면(scope=school, 학교 관리자): 그 학교 대화만.
 * - 답은 그 대화를 맡은 Claude 세션이 남긴다(관제가 전달). 유료 API 자동 답변은 아직 없다.
 * - 창 위치·크기는 이 기기에만 기억한다(저장이 막혀도 기본 위치로 그린다).
 */
type Scope = 'platform' | 'school';
type Tab = 'need' | 'flow' | 'closed' | 'all';
const TABS: { key: Tab; label: string; match: (s: Status) => boolean }[] = [
  { key: 'need', label: '답 필요', match: (s) => BADGE.includes(s) },
  { key: 'flow', label: '진행', match: (s) => !BADGE.includes(s) && !CLOSED.includes(s) },
  { key: 'closed', label: '끝남', match: (s) => CLOSED.includes(s) },
  { key: 'all', label: '전체', match: () => true },
];
const KIND: Record<string, string> = { message: '', answer: '결정', directive: '다시 수정 요청', report: '보고', note: '메모', status: '상태' };
const when = (s: string) => new Date(s).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const POS_KEY = 'chatdock:rect';

async function call<T = unknown>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? '처리하지 못했습니다.');
  return data as T;
}

type ListData = { count: number; threads: ThreadSummary[]; schools?: { id: string; name: string }[]; sessions?: { id: string; name: string; school_id: string | null }[] };

export function ChatDock({ scope }: { scope: Scope }) {
  const q = scope === 'platform' ? '?scope=platform' : '';
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [data, setData] = useState<ListData | null>(null);
  const [tab, setTab] = useState<Tab>('need');
  const [sel, setSel] = useState<string | null>(null); // 대화 id, 'new' = 새 대화
  const [error, setError] = useState<string | null>(null);
  const [wide, setWide] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  const refreshList = useCallback(async () => {
    try { const d = await call<ListData>(`/api/chat${q}`); setData(d); setCount(d.count); setError(null); }
    catch (e) { setError(`불러오기 실패 · ${(e as Error).message}`); }
  }, [q]);

  // 닫혀 있으면 1분마다 숫자만, 열려 있으면 10초마다 목록
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.hidden) return;
      if (open) await refreshList();
      else { try { const d = await call<{ count: number }>(`/api/chat${q}${q ? '&' : '?'}badge=1`); if (!stop) setCount(d.count); } catch { /* 숫자만 못 받으면 그대로 둔다 */ } }
    };
    tick();
    const t = setInterval(tick, open ? 10000 : 60000);
    return () => { stop = true; clearInterval(t); };
  }, [open, q, refreshList]);

  // 창 위치·크기 기억
  useEffect(() => {
    if (!open || !panel.current) return;
    try {
      const r = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null') as { x: number; y: number; w: number; h: number } | null;
      if (r) Object.assign(panel.current.style, clampRect(r));
    } catch { /* 기본 위치 */ }
    const el = panel.current;
    const ro = new ResizeObserver(() => save(el));
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target as HTMLElement)?.closest('textarea')) setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function startDrag(e: React.PointerEvent) {
    const el = panel.current; if (!el || wide || (e.target as HTMLElement).closest('button')) return;
    const r = el.getBoundingClientRect(); const dx = e.clientX - r.left; const dy = e.clientY - r.top;
    const move = (ev: PointerEvent) => Object.assign(el.style, clampRect({ x: ev.clientX - dx, y: ev.clientY - dy, w: r.width, h: r.height }));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); save(el); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }

  const threads = data?.threads ?? [];
  const shown = threads.filter((t) => TABS.find((x) => x.key === tab)!.match(t.status));

  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm chatdock-open" aria-expanded={open} aria-controls="chatdock"
        onClick={() => setOpen(!open)} title={`사람이 답하거나 확인할 대화 ${count}건`} data-testid="chatdock-open">
        <MessagesSquare size={16} aria-hidden="true" /> 대화
        {count > 0 ? <><span className="sr-only"> 답 필요 </span><span className="bell-count">{count}</span><span className="sr-only">건</span></> : null}
      </button>
      {open && (
        <div id="chatdock" ref={panel} className="chatdock" data-wide={wide || undefined} role="dialog" aria-label="대화창" data-testid="chatdock">
          <div className="chatdock-bar" onPointerDown={startDrag}>
            <strong>대화{scope === 'school' ? ' · 우리 학교' : ' · 전체'}</strong>
            <span className="muted small-text">세션이 답합니다 · 창을 닫아도 일은 계속됩니다</span>
            <span className="topbar-spacer" />
            <button type="button" className="btn-ghost" onClick={() => setWide(!wide)} aria-label={wide ? '창 복원' : '창 크게'}>{wide ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)} aria-label="대화창 닫기"><X size={16} /></button>
          </div>
          <div className="chatdock-body" data-view={sel ? 'thread' : 'list'}>
            <section className="chatdock-list" aria-label="대화 목록">
              <div className="chatdock-tabs" role="tablist">
                {TABS.map((t) => (
                  <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
                    {t.label}<span className="count">{threads.filter((x) => t.match(x.status)).length}</span>
                  </button>
                ))}
              </div>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setSel('new')}>새 대화</button>
              {error && <p className="field-error" role="status">{error}</p>}
              {!data && !error && <p className="muted">불러오는 중…</p>}
              <ul className="chatdock-threads">
                {data && shown.length === 0 && <li className="muted empty">이 상태의 대화가 없습니다.</li>}
                {shown.map((t) => (
                  <li key={t.id}>
                    <button type="button" aria-current={sel === t.id || undefined} onClick={() => setSel(t.id)} data-testid={`chat-${t.no}`}>
                      <span className="chatdock-row1"><span className="num muted">D-{t.no}</span> <b>{t.title}</b></span>
                      <span className="chatdock-row2">
                        <StatusBadge tone={STATUS[t.status].tone} dot>{STATUS[t.status].label}</StatusBadge>
                        <span className="tag">{TOPIC[t.topic].label}</span>
                        {scope === 'platform' && t.school_name && <span className="tag">{t.school_name}</span>}
                      </span>
                      {t.last && <span className="chatdock-last muted">{t.last.author === 'user' ? '사람' : '세션'}: {t.last.body}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            <section className="chatdock-thread" aria-label="대화 내용">
              {sel === 'new'
                ? <NewChat scope={scope} q={q} data={data} onBack={() => setSel(null)} onDone={async (id) => { await refreshList(); setTab('all'); setSel(id); }} />
                : sel ? <Thread key={sel} id={sel} q={q} scope={scope} onBack={() => setSel(null)} onChange={refreshList} />
                  : <p className="muted chatdock-empty">왼쪽에서 대화를 고르거나 ‘새 대화’를 여세요. 세션이 결정을 기다리는 일은 ‘답 필요’에 모입니다.</p>}
            </section>
          </div>
        </div>
      )}
    </>
  );
}

function clampRect(r: { x: number; y: number; w: number; h: number }) {
  const w = Math.min(Math.max(r.w, 360), window.innerWidth - 16);
  const h = Math.min(Math.max(r.h, 320), window.innerHeight - 16);
  const x = Math.min(Math.max(r.x, 8), window.innerWidth - w - 8);
  const y = Math.min(Math.max(r.y, 8), window.innerHeight - h - 8);
  return { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, right: 'auto', bottom: 'auto' };
}
function save(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  try { localStorage.setItem(POS_KEY, JSON.stringify({ x: r.left, y: r.top, w: r.width, h: r.height })); } catch { /* 저장 못 해도 동작 */ }
}

function Composer({ placeholder, busy, onSend, value, setValue }: {
  placeholder: string; busy: boolean; onSend: () => void; value: string; setValue: (v: string) => void;
}) {
  return (
    <textarea className="chatdock-input" rows={3} value={value} placeholder={placeholder} maxLength={20000} aria-label="보낼 글"
      onChange={(e) => setValue(e.target.value)} disabled={busy}
      onKeyDown={(e) => {
        // Enter 보내기 · Shift+Enter 줄바꿈 · 한글 조합 중 Enter 는 보내지 않는다
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (value.trim()) onSend(); }
      }} />
  );
}

function NewChat({ scope, q, data, onBack, onDone }: { scope: Scope; q: string; data: ListData | null; onBack: () => void; onDone: (id: string) => void }) {
  const topics: Topic[] = scope === 'platform' ? ['control', ...SCHOOL_TOPICS] : SCHOOL_TOPICS;
  const [topic, setTopic] = useState<Topic>(topics[0]);
  const [school, setSchool] = useState('');
  const [assignee, setAssignee] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const needsSchool = scope === 'platform' && (topic === 'school_ai' || topic === 'site_ui');
  async function send() {
    setBusy(true); setErr(null);
    try {
      const r = await call<{ id: string }>(`/api/chat${q}`, 'POST', { topic, body, school_id: school || null, assignee_session: assignee || null });
      onDone(r.id);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="chatdock-new stack">
      <div className="row"><button type="button" className="btn-ghost chatdock-back" onClick={onBack}><ArrowLeft size={14} /> 목록</button><h3>새 대화</h3></div>
      <fieldset className="chatdock-topics">
        <legend>무엇에 관한 대화인가요?</legend>
        {topics.map((t) => (
          <label key={t} className="control-option">
            <input type="radio" name="topic" checked={topic === t} onChange={() => setTopic(t)} />
            <span><strong>{TOPIC[t].label}</strong><span className="field-hint">{TOPIC[t].hint}</span></span>
          </label>
        ))}
      </fieldset>
      {scope === 'school' && topic === 'system' && <p className="field-hint">시스템 기능 요청은 전체 관리자가 승인한 뒤 개발이 시작됩니다.</p>}
      {(needsSchool || (scope === 'platform' && topic === 'system')) && data?.schools && (
        <label className="field">학교{topic === 'system' ? ' (선택)' : ''}
          <select value={school} onChange={(e) => setSchool(e.target.value)}>
            <option value="">{topic === 'system' ? '학교 없음(플랫폼 전체)' : '학교를 고르세요'}</option>
            {data.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}
      {scope === 'platform' && data?.sessions && (
        <label className="field">맡을 세션 (선택)
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">관제가 정함{needsSchool ? ' (그 학교를 맡은 세션이 있으면 그 세션)' : ''}</option>
            {data.sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}
      <Composer placeholder="하고 싶은 말이나 고칠 점을 적으세요. Enter 보내기 · Shift+Enter 줄바꿈" busy={busy} onSend={send} value={body} setValue={setBody} />
      {err && <p className="field-error" role="alert">{err}</p>}
      <div className="row"><button type="button" className="btn btn-primary" disabled={busy || !body.trim() || (needsSchool && !school)} onClick={send}>{busy ? '보내는 중…' : '보내기'}</button></div>
    </div>
  );
}

function Thread({ id, q, scope, onBack, onChange }: { id: string; q: string; scope: Scope; onBack: () => void; onChange: () => Promise<void> }) {
  const [r, setR] = useState<Request | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const feed = useRef<HTMLOListElement>(null);
  const load = useCallback(async () => {
    try { setR(await call<Request>(`/api/chat/${id}${q}`)); setErr(null); } catch (e) { setErr(`불러오지 못했습니다 · ${(e as Error).message}`); }
  }, [id, q]);
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load(); }, 5000); return () => clearInterval(t); }, [load]);
  const n = r?.messages.length ?? 0;
  useEffect(() => { const el = feed.current; if (el) el.scrollTop = el.scrollHeight; }, [n]);

  async function act(fn: () => Promise<unknown>, clear = true) {
    setBusy(true); setErr(null);
    try { await fn(); if (clear) setDraft(''); await load(); await onChange(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const send = (extra: Record<string, unknown> = {}) => act(() => call(`/api/chat/${id}/messages${q}`, 'POST', { body: draft, ...extra }));
  const action = (a: string) => act(() => call(`/api/chat/${id}/action${q}`, 'POST', { action: a }), false);

  if (!r) return <div className="chatdock-thread-inner"><button type="button" className="btn-ghost chatdock-back" onClick={onBack}><ArrowLeft size={14} /> 목록</button><p className="muted">{err ?? '불러오는 중…'}</p></div>;
  const st = STATUS[r.status];
  const closed = CLOSED.includes(r.status);
  const deciding = r.options.length > 0 && NEEDS_USER.includes(r.status) && r.status !== 'pending';
  const label = (k: string | null) => r.options.find((o) => o.key === k)?.label ?? k;
  return (
    <div className="chatdock-thread-inner">
      <header className="chatdock-head">
        <button type="button" className="btn-ghost chatdock-back" onClick={onBack}><ArrowLeft size={14} /> 목록</button>
        <h3><span className="num muted">D-{r.no}</span> {r.title}</h3>
        <div className="item-meta">
          <StatusBadge tone={st.tone} dot>{st.label}</StatusBadge>
          <span className="tag">{TOPIC[r.topic].label}</span>
          {r.school_name && <span className="tag">{r.school_name}</span>}
          {r.reversible === false && <span className="tag">되돌리기 어려움</span>}
          {r.related && <span className="tag">{r.related}</span>}
        </div>
      </header>
      <ol className="chatdock-feed" ref={feed} aria-live="polite">
        {r.detail && <li className="chatdock-msg" data-author={r.author}><div className="chatdock-msg-head"><b>{r.kind === 'decision' ? '결정 요청' : '세부 내용'}</b></div><p>{r.detail}</p></li>}
        {r.messages.map((m) => m.kind === 'status' ? (
          <li key={m.id} className="chatdock-event muted small-text">{when(m.created_at)} · {m.author === 'user' ? (m.mine ? '나' : m.author_name ?? '관리자') : '세션'} · 상태 → ‘{STATUS[m.choice as Status]?.label ?? m.choice}’</li>
        ) : (
          <li key={m.id} className="chatdock-msg" data-author={m.author} data-mine={m.mine || undefined}>
            <div className="chatdock-msg-head">
              <b>{m.author === 'user' ? (m.mine ? '나' : m.author_name ?? '관리자') : m.author === 'control' ? '관제' : '세션'}</b>
              {KIND[m.kind] && <span className="tag">{KIND[m.kind]}</span>}
              <span className="muted num">{when(m.created_at)}</span>
              {m.author === 'user' && m.deliver && <span className="muted small-text">{m.delivered_at ? '· 세션에 전달됨' : r.status === 'pending' ? '· 승인 뒤 전달' : '· 전달 대기'}</span>}
            </div>
            {m.choice && <p><b>선택: {label(m.choice)}</b></p>}
            {m.body && <p>{m.body}</p>}
          </li>
        ))}
      </ol>
      {err && <p className="field-error" role="alert">{err}</p>}

      {r.status === 'pending' && (
        <div className="chatdock-gate">
          <p><b>승인 대기</b> · 학교가 요청한 시스템 기능 개선입니다. 승인하면 세션에 전달됩니다.</p>
          <ApproveButtons q={q} busy={busy} onAction={action} />
        </div>
      )}
      {deciding && (
        <div className="chatdock-decide">
          <p className="small-text">누르면 그 안으로 바로 결정됩니다. 아래 칸에 쓴 글은 추가 지시로 함께 갑니다.</p>
          <div className="chatdock-options">
            {r.options.map((o, i) => (
              <button key={o.key} type="button" className="chatdock-option" disabled={busy} onClick={() => send({ choice: o.key })}>
                <span className="chatdock-option-no" aria-hidden="true">{i + 1}</span>
                <span><b>{o.label}</b>{r.recommended === o.key && <span className="muted small-text"> · 세션 추천</span>}{o.detail && <span className="muted small-text">{o.detail}</span>}</span>
                <span className="chatdock-option-go">이 안으로 결정 →</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {r.status === 'review' && (
        <div className="chatdock-gate">
          <p><b>결과 확인 필요</b> · 세션이 끝났다고 알렸습니다. 확인해 주세요.</p>
          <div className="row">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => action('confirm')}>변경 확인 완료</button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !draft.trim()} onClick={() => send({ revise: true })}
              title="아래 칸에 고칠 점을 적고 누르면 같은 세션이 다시 작업합니다">다시 수정 요청</button>
          </div>
        </div>
      )}
      {closed ? (
        <div className="row chatdock-foot"><span className="muted">끝난 대화입니다.</span><button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => action('reopen')}>다시 열기</button></div>
      ) : (
        <div className="chatdock-compose">
          <Composer placeholder={deciding ? '추가 지시 또는 직접 작성한 안' : '세션에게 보낼 글 · Enter 보내기 · Shift+Enter 줄바꿈'} busy={busy}
            onSend={() => send()} value={draft} setValue={setDraft} />
          <div className="row">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || !draft.trim()} onClick={() => send()}>{busy ? '보내는 중…' : '보내기'}</button>
            {deciding && <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !draft.trim()} onClick={() => send({ own: true })}>직접 작성한 안으로 계속</button>}
            <span className="topbar-spacer" />
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => action('close')}>끝내기</button>
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => action('drop')}>{deciding ? '이 변경 반려' : '접기'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ApproveButtons({ q, busy, onAction }: { q: string; busy: boolean; onAction: (a: string) => void }) {
  if (q !== '?scope=platform') return <p className="muted small-text">전체 관리자 승인을 기다립니다. 글은 계속 남길 수 있고, 승인되면 함께 전달됩니다.</p>;
  return (
    <div className="row">
      <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => onAction('approve')}>승인</button>
      <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onAction('reject')}>반려</button>
    </div>
  );
}
