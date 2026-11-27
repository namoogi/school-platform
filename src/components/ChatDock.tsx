'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MessagesSquare, Maximize2, Minimize2, X, ArrowLeft } from 'lucide-react';
import { StatusBadge } from './ui';
import { useI18n } from './I18nProvider';
import type { MsgKey } from '@/lib/i18n/catalog';
import type { Translate } from '@/lib/i18n/base';
import {
  BADGE, CLOSED, NEEDS_USER, SCHOOL_TOPICS, STATUS,
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
const TABS: { key: Tab; match: (s: Status) => boolean }[] = [
  { key: 'need', match: (s) => BADGE.includes(s) },
  { key: 'flow', match: (s) => !BADGE.includes(s) && !CLOSED.includes(s) },
  { key: 'closed', match: (s) => CLOSED.includes(s) },
  { key: 'all', match: () => true },
];
// 글 종류 표시(보통 글 message 는 표시 없음)
const KIND = new Set(['answer', 'directive', 'report', 'note', 'status']);
// 상태·주제 이름은 사전에서(ADR 0037). 모르는 값은 그대로 보인다
const statusLabel = (t: Translate, s: string) => (s in STATUS ? t(`control.status.${s}` as MsgKey) : s);
const topicLabel = (t: Translate, k: string) => t(`control.topic.${k}` as MsgKey);
// 날짜는 화면 언어 형식으로. 시간대는 아직 서울 고정(학교 시간대 설정이 생기면 그것을 쓴다)
const when = (s: string, lang: string) => new Date(s).toLocaleString(lang, { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const POS_KEY = 'chatdock:rect';

// failed: 서버가 오류 문구를 주지 않을 때 보일 글(화면 언어로 넘긴다)
async function call<T = unknown>(url: string, method: string, body: unknown, failed: string): Promise<T> {
  const res = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? failed);
  return data as T;
}

type ListData = { count: number; threads: ThreadSummary[]; schools?: { id: string; name: string }[]; sessions?: { id: string; name: string; school_id: string | null }[] };

export function ChatDock({ scope }: { scope: Scope }) {
  const { t } = useI18n();
  const q = scope === 'platform' ? '?scope=platform' : '';
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [data, setData] = useState<ListData | null>(null);
  const [tab, setTab] = useState<Tab>('need');
  const [sel, setSel] = useState<string | null>(null); // 대화 id, 'new' = 새 대화
  const [error, setError] = useState<string | null>(null);
  const [wide, setWide] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  // 49차: 다른 화면에서 대화창 열기 — 주소의 ?chat=1, 또는 'chatdock:open' 사건(편집 화면의 '개선 요청')
  useEffect(() => {
    try { if (new URLSearchParams(window.location.search).get('chat') === '1') setOpen(true); } catch { /* 없음 */ }
    const onOpen = () => setOpen(true);
    window.addEventListener('chatdock:open', onOpen);
    return () => window.removeEventListener('chatdock:open', onOpen);
  }, []);

  const refreshList = useCallback(async () => {
    try { const d = await call<ListData>(`/api/chat${q}`, 'GET', undefined, t('common.failed')); setData(d); setCount(d.count); setError(null); }
    catch (e) { setError(t('chat.loadFailed', { error: (e as Error).message })); }
  }, [q, t]);

  // 닫혀 있으면 1분마다 숫자만, 열려 있으면 10초마다 목록
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.hidden) return;
      if (open) await refreshList();
      else { try { const d = await call<{ count: number }>(`/api/chat${q}${q ? '&' : '?'}badge=1`, 'GET', undefined, ''); if (!stop) setCount(d.count); } catch { /* 숫자만 못 받으면 그대로 둔다 */ } }
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
  const shown = threads.filter((th) => TABS.find((x) => x.key === tab)!.match(th.status));

  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm chatdock-open" aria-expanded={open} aria-controls="chatdock"
        onClick={() => setOpen(!open)} title={t('chat.openTitle', { n: count })} data-testid="chatdock-open">
        <MessagesSquare size={16} aria-hidden="true" /> <span className="chatdock-label">{t('chat.label')}</span>
        {count > 0 ? <><span className="sr-only"> {t('chat.badgeSr', { n: count })}</span><span className="bell-count" aria-hidden="true">{count}</span></> : null}
      </button>
      {open && (
        <div id="chatdock" ref={panel} className="chatdock" data-wide={wide || undefined} role="dialog" aria-label={t('chat.dialog')} data-testid="chatdock">
          <div className="chatdock-bar" onPointerDown={startDrag}>
            <strong>{t(scope === 'school' ? 'chat.titleSchool' : 'chat.titlePlatform')}</strong>
            <span className="muted small-text">{t('chat.subtitle')}</span>
            <span className="topbar-spacer" />
            <button type="button" className="btn-ghost" onClick={() => setWide(!wide)} aria-label={t(wide ? 'chat.restore' : 'chat.expand')}>{wide ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)} aria-label={t('chat.close')}><X size={16} /></button>
          </div>
          <div className="chatdock-body" data-view={sel ? 'thread' : 'list'}>
            <section className="chatdock-list" aria-label={t('chat.list')}>
              <div className="chatdock-tabs" role="tablist">
                {TABS.map((tb) => (
                  <button key={tb.key} role="tab" aria-selected={tab === tb.key} className={tab === tb.key ? 'active' : ''} onClick={() => setTab(tb.key)}>
                    {t(`chat.tab.${tb.key}`)}<span className="count">{threads.filter((x) => tb.match(x.status)).length}</span>
                  </button>
                ))}
              </div>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setSel('new')}>{t('chat.new')}</button>
              {error && <p className="field-error" role="status">{error}</p>}
              {!data && !error && <p className="muted">{t('common.loading')}</p>}
              <ul className="chatdock-threads">
                {data && shown.length === 0 && <li className="muted empty">{t('chat.emptyTab')}</li>}
                {shown.map((th) => (
                  <li key={th.id}>
                    <button type="button" aria-current={sel === th.id || undefined} onClick={() => setSel(th.id)} data-testid={`chat-${th.no}`}>
                      <span className="chatdock-row1"><span className="num muted">D-{th.no}</span> <b>{th.title}</b></span>
                      <span className="chatdock-row2">
                        <StatusBadge tone={STATUS[th.status].tone} dot>{statusLabel(t, th.status)}</StatusBadge>
                        <span className="tag">{topicLabel(t, th.topic)}</span>
                        {scope === 'platform' && th.school_name && <span className="tag">{th.school_name}</span>}
                      </span>
                      {th.last && <span className="chatdock-last muted">{t(th.last.author === 'user' ? 'chat.person' : 'chat.session')}: {th.last.body}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            <section className="chatdock-thread" aria-label={t('chat.thread')}>
              {sel === 'new'
                ? <NewChat scope={scope} q={q} data={data} onBack={() => setSel(null)} onDone={async (id) => { await refreshList(); setTab('all'); setSel(id); }} />
                : sel ? <Thread key={sel} id={sel} q={q} scope={scope} onBack={() => setSel(null)} onChange={refreshList} />
                  : <p className="muted chatdock-empty">{t('chat.pick')}</p>}
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
  const { t } = useI18n();
  return (
    <textarea className="chatdock-input" rows={3} value={value} placeholder={placeholder} maxLength={20000} aria-label={t('chat.input')}
      onChange={(e) => setValue(e.target.value)} disabled={busy}
      onKeyDown={(e) => {
        // Enter 보내기 · Shift+Enter 줄바꿈 · 한글 조합 중 Enter 는 보내지 않는다
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (value.trim()) onSend(); }
      }} />
  );
}

function NewChat({ scope, q, data, onBack, onDone }: { scope: Scope; q: string; data: ListData | null; onBack: () => void; onDone: (id: string) => void }) {
  const { t } = useI18n();
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
      const r = await call<{ id: string }>(`/api/chat${q}`, 'POST', { topic, body, school_id: school || null, assignee_session: assignee || null }, t('common.failed'));
      onDone(r.id);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="chatdock-new stack">
      <div className="row"><button type="button" className="btn-ghost chatdock-back" onClick={onBack}><ArrowLeft size={14} /> {t('common.backToList')}</button><h3>{t('chat.new')}</h3></div>
      <fieldset className="chatdock-topics">
        <legend>{t('chat.topicQuestion')}</legend>
        {topics.map((tp) => (
          <label key={tp} className="control-option">
            <input type="radio" name="topic" checked={topic === tp} onChange={() => setTopic(tp)} />
            <span><strong>{topicLabel(t, tp)}</strong><span className="field-hint">{t(`control.topic.${tp}.hint` as MsgKey)}</span></span>
          </label>
        ))}
      </fieldset>
      {scope === 'school' && topic === 'system' && <p className="field-hint">{t('chat.systemNote')}</p>}
      {(needsSchool || (scope === 'platform' && topic === 'system')) && data?.schools && (
        <label className="field">{t('chat.school')}{topic === 'system' ? t('chat.optional') : ''}
          <select value={school} onChange={(e) => setSchool(e.target.value)}>
            <option value="">{t(topic === 'system' ? 'chat.noSchool' : 'chat.pickSchool')}</option>
            {data.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}
      {scope === 'platform' && data?.sessions && (
        <label className="field">{t('chat.assignee')}
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">{t(needsSchool ? 'chat.controlDecidesSchool' : 'chat.controlDecides')}</option>
            {data.sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}
      <Composer placeholder={t('chat.newPlaceholder')} busy={busy} onSend={send} value={body} setValue={setBody} />
      {err && <p className="field-error" role="alert">{err}</p>}
      <div className="row"><button type="button" className="btn btn-primary" disabled={busy || !body.trim() || (needsSchool && !school)} onClick={send}>{busy ? t('common.sending') : t('common.send')}</button></div>
    </div>
  );
}

function Thread({ id, q, scope, onBack, onChange }: { id: string; q: string; scope: Scope; onBack: () => void; onChange: () => Promise<void> }) {
  const { t, lang } = useI18n();
  const [r, setR] = useState<Request | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const feed = useRef<HTMLOListElement>(null);
  const load = useCallback(async () => {
    try { setR(await call<Request>(`/api/chat/${id}${q}`, 'GET', undefined, t('common.failed'))); setErr(null); } catch (e) { setErr(t('chat.loadThreadFailed', { error: (e as Error).message })); }
  }, [id, q, t]);
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load(); }, 5000); return () => clearInterval(t); }, [load]);
  const n = r?.messages.length ?? 0;
  useEffect(() => { const el = feed.current; if (el) el.scrollTop = el.scrollHeight; }, [n]);

  async function act(fn: () => Promise<unknown>, clear = true) {
    setBusy(true); setErr(null);
    try { await fn(); if (clear) setDraft(''); await load(); await onChange(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const send = (extra: Record<string, unknown> = {}) => act(() => call(`/api/chat/${id}/messages${q}`, 'POST', { body: draft, ...extra }, t('common.failed')));
  const action = (a: string) => act(() => call(`/api/chat/${id}/action${q}`, 'POST', { action: a }, t('common.failed')), false);

  if (!r) return <div className="chatdock-thread-inner"><button type="button" className="btn-ghost chatdock-back" onClick={onBack}><ArrowLeft size={14} /> {t('common.backToList')}</button><p className="muted">{err ?? t('common.loading')}</p></div>;
  const st = STATUS[r.status];
  const closed = CLOSED.includes(r.status);
  const deciding = r.options.length > 0 && NEEDS_USER.includes(r.status) && r.status !== 'pending';
  const label = (k: string | null) => r.options.find((o) => o.key === k)?.label ?? k;
  const who = (m: Request['messages'][number]) => m.author === 'user' ? (m.mine ? t('chat.me') : m.author_name ?? t('chat.admin')) : m.author === 'control' ? t('chat.control') : t('chat.session');
  return (
    <div className="chatdock-thread-inner">
      <header className="chatdock-head">
        <button type="button" className="btn-ghost chatdock-back" onClick={onBack}><ArrowLeft size={14} /> {t('common.backToList')}</button>
        <h3><span className="num muted">D-{r.no}</span> {r.title}</h3>
        <div className="item-meta">
          <StatusBadge tone={st.tone} dot>{statusLabel(t, r.status)}</StatusBadge>
          <span className="tag">{topicLabel(t, r.topic)}</span>
          {r.school_name && <span className="tag">{r.school_name}</span>}
          {r.reversible === false && <span className="tag">{t('chat.hardToUndo')}</span>}
          {r.related && <span className="tag">{r.related}</span>}
        </div>
      </header>
      <ol className="chatdock-feed" ref={feed} aria-live="polite">
        {r.detail && <li className="chatdock-msg" data-author={r.author}><div className="chatdock-msg-head"><b>{t(r.kind === 'decision' ? 'chat.decisionRequest' : 'chat.detail')}</b></div><p>{r.detail}</p></li>}
        {r.messages.map((m) => m.kind === 'status' ? (
          <li key={m.id} className="chatdock-event muted small-text">{t('chat.statusChange', { when: when(m.created_at, lang), who: m.author === 'user' ? who(m) : t('chat.session'), status: statusLabel(t, m.choice ?? '') })}</li>
        ) : (
          <li key={m.id} className="chatdock-msg" data-author={m.author} data-mine={m.mine || undefined}>
            <div className="chatdock-msg-head">
              <b>{who(m)}</b>
              {KIND.has(m.kind) && <span className="tag">{t(`chat.kind.${m.kind}` as MsgKey)}</span>}
              <span className="muted num">{when(m.created_at, lang)}</span>
              {m.author === 'user' && m.deliver && <span className="muted small-text">{t(m.delivered_at ? 'chat.delivered' : r.status === 'pending' ? 'chat.afterApproval' : 'chat.waitingDelivery')}</span>}
            </div>
            {m.choice && <p><b>{t('chat.choice', { label: label(m.choice) })}</b></p>}
            {m.body && <p>{m.body}</p>}
          </li>
        ))}
      </ol>
      {err && <p className="field-error" role="alert">{err}</p>}

      {r.status === 'pending' && (
        <div className="chatdock-gate">
          <p><b>{t('chat.pendingTitle')}</b> · {t('chat.pendingBody')}</p>
          <ApproveButtons q={q} busy={busy} onAction={action} />
        </div>
      )}
      {deciding && (
        <div className="chatdock-decide">
          <p className="small-text">{t('chat.decideHint')}</p>
          <div className="chatdock-options">
            {r.options.map((o, i) => (
              <button key={o.key} type="button" className="chatdock-option" disabled={busy} onClick={() => send({ choice: o.key })}>
                <span className="chatdock-option-no" aria-hidden="true">{i + 1}</span>
                <span><b>{o.label}</b>{r.recommended === o.key && <span className="muted small-text">{t('chat.recommended')}</span>}{o.detail && <span className="muted small-text">{o.detail}</span>}</span>
                <span className="chatdock-option-go">{t('chat.decideGo')}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {r.status === 'review' && (
        <div className="chatdock-gate">
          <p><b>{t('chat.reviewTitle')}</b> · {t('chat.reviewBody')}</p>
          <div className="row">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => action('confirm')}>{t('chat.confirmDone')}</button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !draft.trim()} onClick={() => send({ revise: true })}
              title={t('chat.reviseTitle')}>{t('chat.revise')}</button>
          </div>
        </div>
      )}
      {closed ? (
        <div className="row chatdock-foot"><span className="muted">{t('chat.closedNote')}</span><button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => action('reopen')}>{t('chat.reopen')}</button></div>
      ) : (
        <div className="chatdock-compose">
          <Composer placeholder={t(deciding ? 'chat.decidePlaceholder' : 'chat.replyPlaceholder')} busy={busy}
            onSend={() => send()} value={draft} setValue={setDraft} />
          <div className="row">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || !draft.trim()} onClick={() => send()}>{busy ? t('common.sending') : t('common.send')}</button>
            {deciding && <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !draft.trim()} onClick={() => send({ own: true })}>{t('chat.ownOption')}</button>}
            <span className="topbar-spacer" />
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => action('close')}>{t('chat.end')}</button>
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => action('drop')}>{t(deciding ? 'chat.rejectChange' : 'chat.fold')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ApproveButtons({ q, busy, onAction }: { q: string; busy: boolean; onAction: (a: string) => void }) {
  const { t } = useI18n();
  if (q !== '?scope=platform') return <p className="muted small-text">{t('chat.waitApproval')}</p>;
  return (
    <div className="row">
      <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => onAction('approve')}>{t('chat.approve')}</button>
      <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onAction('reject')}>{t('chat.reject')}</button>
    </div>
  );
}
