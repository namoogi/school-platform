'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Field } from '@/components/Field';
import { StatusBadge } from '@/components/ui';
import { NEEDS_USER, STATUS, type Request, type Session, type Status } from '@/lib/control-shared';

type Lab = { id: string; title: string; body: string } | null;
const TABS: { key: string; label: string; statuses: Status[] }[] = [
  { key: 'need', label: '답 필요', statuses: NEEDS_USER },
  { key: 'flow', label: '전달·진행', statuses: ['answered', 'delivered'] },
  { key: 'closed', label: '끝남', statuses: ['done', 'dropped'] },
];
const KIND_LABEL: Record<string, string> = { answer: '답', directive: '지시', report: '보고', note: '메모', status: '상태' };
const when = (s: string) => new Date(s).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? '처리하지 못했습니다.');
  return data;
}

/** 받을 곳 값: 세션 id · 'new'(새 세션 만들어 실행) · ''(전달하지 않고 메모만) */
function TargetSelect({ value, onChange, sessions, allowNote, id }: { value: string; onChange: (v: string) => void; sessions: Session[]; allowNote?: boolean; id?: string }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {sessions.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      <option value="new">새 세션 만들어 실행</option>
      {allowNote && <option value="">전달하지 않고 메모만 남기기</option>}
    </select>
  );
}
const target = (v: string) => (v === 'new' ? { new_session: true } : { target_session: v || null });

export function ControlCenter({ requests, sessions, lab }: { requests: Request[]; sessions: Session[]; lab: Lab }) {
  const router = useRouter();
  const [tab, setTab] = useState(lab ? 'flow' : 'need');
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(!!lab);
  const names = Object.fromEntries(sessions.map((s) => [s.id, s.name]));
  const current = TABS.find((t) => t.key === tab)!;
  // 답 필요는 오래된 요청부터, 나머지는 최근 것부터
  const visible = requests.filter((r) => current.statuses.includes(r.status)).sort((a, b) => (tab === 'need' ? a.no - b.no : b.no - a.no));

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try { await fn(); router.refresh(); return true; } catch (e) { setError((e as Error).message); return false; }
  }

  return (
    <div className="control stack" data-testid="control">
      <div className="row control-bar">
        <div className="tabs" role="tablist" aria-label="요청 묶음">
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
              {t.label}<span className="count">{requests.filter((r) => t.statuses.includes(r.status)).length}</span>
            </button>
          ))}
        </div>
        {!composing && <button type="button" className="btn btn-primary" onClick={() => setComposing(true)}>새 지시</button>}
      </div>
      {error && <p className="alert" role="alert">{error}</p>}
      {composing && <NewDirective sessions={sessions} lab={lab} onCancel={() => setComposing(false)}
        onSend={(v) => run(() => call('/api/admin/control/requests', 'POST', v)).then((ok) => { if (ok) { setComposing(false); setTab('flow'); } })} />}

      <ul className="control-list" data-testid="control-list">
        {visible.length === 0 && <li className="muted empty">요청이 없습니다.</li>}
        {visible.map((r) => <RequestCard key={r.id} r={r} names={names} sessions={sessions} run={run} />)}
      </ul>
    </div>
  );
}

function NewDirective({ sessions, lab, onSend, onCancel }: { sessions: Session[]; lab: Lab; onSend: (v: Record<string, unknown>) => void; onCancel: () => void }) {
  const [f, setF] = useState({ title: lab?.title ?? '', detail: lab?.body ?? '', body: '', to: sessions.find((s) => s.active)?.id ?? 'new' });
  return (
    <form className="card control-compose" data-testid="control-compose" onSubmit={(e) => { e.preventDefault(); onSend({ title: f.title, detail: f.detail, body: f.body, lab_item_id: lab?.id ?? null, ...target(f.to) }); }}>
      <h2>새 지시{lab && <small className="muted"> · 개발·연구소 항목에서</small>}</h2>
      <Field label="제목" required count={{ value: f.title.length, max: 200 }}><input value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
      <Field label="세부 내용" hint="배경·범위·완료 조건. 세션은 이 글만 보고 일을 시작합니다."><textarea rows={6} value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} /></Field>
      <Field label="추가 요청사항" optional><textarea rows={3} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
      <Field label="받을 곳"><TargetSelect value={f.to} onChange={(to) => setF({ ...f, to })} sessions={sessions} /></Field>
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={!f.title.trim()}>지시 보내기</button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>닫기</button>
      </div>
    </form>
  );
}

function RequestCard({ r, names, sessions, run }: { r: Request; names: Record<string, string>; sessions: Session[]; run: (fn: () => Promise<unknown>) => Promise<boolean> }) {
  const st = STATUS[r.status];
  const [choice, setChoice] = useState<string>('');
  const [body, setBody] = useState('');
  const [to, setTo] = useState(r.source_session ?? sessions.find((s) => s.active)?.id ?? 'new');
  const [open, setOpen] = useState(NEEDS_USER.includes(r.status) || r.status === 'answered');
  const pending = r.messages.filter((m) => m.author === 'user' && !m.delivered_at && (m.target_session || m.new_session));
  const label = (key: string | null) => r.options.find((o) => o.key === key)?.label ?? key;
  const send = () => run(() => call(`/api/admin/control/requests/${r.id}/messages`, 'POST', { choice: choice || null, body, ...target(to) }))
    .then((ok) => { if (ok) { setChoice(''); setBody(''); } });
  return (
    <li className="control-item card" data-testid={`control-${r.no}`} data-status={r.status}>
      <div className="control-head">
        <button type="button" className="item-title" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="control-no num">D-{r.no}</span> {r.title}
        </button>
        <div className="item-meta">
          <StatusBadge tone={st.tone} dot>{st.label}</StatusBadge>
          <span className="tag">{r.kind === 'decision' ? '결정 요청' : '지시'}</span>
          {r.source_session && <span className="tag">{r.kind === 'decision' ? '요청' : '받는 곳'}: {names[r.source_session] ?? r.source_session}</span>}
          {r.reversible === true && <span className="tag">되돌릴 수 있음</span>}
          {r.reversible === false && <span className="tag">되돌리기 어려움</span>}
          {r.related && <span className="tag">{r.related}</span>}
          {pending.length > 0 && <span className="tag">전달 대기 {pending.length}</span>}
        </div>
      </div>
      {open && <>
        {r.detail && <p className="control-detail">{r.detail}</p>}
        {r.messages.length > 0 && (
          <ol className="control-thread" aria-label="주고받은 내용">
            {r.messages.map((m) => (
              <li key={m.id} data-author={m.author}>
                <div className="control-msg-head">
                  <strong>{m.author === 'user' ? '선생님' : m.author === 'control' ? '관제' : names[m.author_session ?? ''] ?? '세션'}</strong>
                  <span className="muted">{KIND_LABEL[m.kind] ?? m.kind} · {when(m.created_at)}</span>
                  {m.author === 'user' && (m.target_session || m.new_session) && (
                    <StatusBadge tone={m.delivered_at ? 'success' : 'discovery'}>
                      {m.delivered_at ? `전달됨 ${when(m.delivered_at)}` : '전달 대기'} → {m.new_session ? '새 세션' : names[m.target_session ?? ''] ?? m.target_session}
                    </StatusBadge>
                  )}
                </div>
                {m.choice && <p>{m.kind === 'status' ? `상태: ${STATUS[m.choice as Status]?.label ?? m.choice}` : `선택: ${label(m.choice)}`}</p>}
                {m.body && <p className="control-detail">{m.body}</p>}
                {m.delivery_note && <p className="muted small-text">전달 메모: {m.delivery_note}</p>}
              </li>
            ))}
          </ol>
        )}
        {!['done', 'dropped'].includes(r.status) && (
          <form className="control-answer stack" onSubmit={(e) => { e.preventDefault(); send(); }}>
            {r.options.length > 0 && (
              <fieldset className="control-options">
                <legend>선택지</legend>
                {r.options.map((o) => (
                  <label key={o.key} className="control-option">
                    <input type="radio" name={`choice-${r.id}`} value={o.key} checked={choice === o.key} onChange={() => setChoice(o.key)} />
                    <span><span className="row"><strong>{o.label}</strong>{r.recommended === o.key && <StatusBadge tone="info">추천</StatusBadge>}</span>
                      {o.detail && <span className="field-hint">{o.detail}</span>}</span>
                  </label>
                ))}
              </fieldset>
            )}
            <Field label="추가 요청사항" optional hint="선택지에 더할 조건이나 새로 시킬 일. 그대로 세션에 전달됩니다.">
              <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
            </Field>
            <div className="row control-send">
              <Field label="받을 곳"><TargetSelect value={to} onChange={setTo} sessions={sessions} allowNote /></Field>
              <button type="submit" className="btn btn-primary" disabled={!choice && !body.trim()}>{to === '' ? '메모 남기기' : '지시 보내기'}</button>
              <button type="button" className="btn btn-secondary" onClick={() => run(() => call(`/api/admin/control/requests/${r.id}`, 'PATCH', { status: 'done' }))}>끝남</button>
              <button type="button" className="btn-ghost" onClick={() => run(() => call(`/api/admin/control/requests/${r.id}`, 'PATCH', { status: 'dropped' }))}>접기</button>
            </div>
          </form>
        )}
        {['done', 'dropped'].includes(r.status) && (
          <div className="row"><button type="button" className="btn btn-secondary btn-sm" onClick={() => run(() => call(`/api/admin/control/requests/${r.id}`, 'PATCH', { status: 'open' }))}>다시 열기</button></div>
        )}
      </>}
    </li>
  );
}
