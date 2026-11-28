'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Field } from '@/components/Field';
import { StatusBadge } from '@/components/ui';
import { NEEDS_USER, STATUS, type Request, type Session, type Status } from '@/lib/control-shared';
import { useI18n } from '@/components/I18nProvider';
import { CATALOG, type MsgKey } from '@/lib/i18n/catalog';
import { baseT } from '@/lib/i18n/base';
import { DecisionFacts, DoorBadge } from '@/components/DecisionCard';

type Lab = { id: string; title: string; body: string } | null;
// 묶음·글 종류·상태 이름은 사전의 cc.tab.* · cc.kind.* · control.status.*
const TABS: { key: string; statuses: Status[] }[] = [
  { key: 'need', statuses: NEEDS_USER },
  { key: 'flow', statuses: ['answered', 'delivered', 'review'] },
  { key: 'closed', statuses: ['done', 'dropped'] },
];
// 날짜는 화면 언어 형식(시간대는 아직 서울 고정)
const whenIn = (locale: string) => (s: string) => new Date(s).toLocaleString(locale, { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  // 문구가 없을 때만 기준 문구(오류 문구는 6묶음에서 서버가 이름표로 돌려주게 바꾼다)
  if (!res.ok) throw new Error(data.error ?? baseT('common.failed'));
  return data;
}

/** 받을 곳 값: 세션 id · 'new'(새 세션 만들어 실행) · ''(전달하지 않고 메모만) */
function TargetSelect({ value, onChange, sessions, allowNote, id }: { value: string; onChange: (v: string) => void; sessions: Session[]; allowNote?: boolean; id?: string }) {
  const { t } = useI18n();
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {sessions.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      <option value="new">{t('cc.newSession')}</option>
      {allowNote && <option value="">{t('cc.noteOnly')}</option>}
    </select>
  );
}
const RANK = (r: Request) => (r.door === 'one_way' ? 0 : r.door === 'default' ? 1 : 2);
/** 올린 그대로의 상태(한쪽 문 = 보류, 나머지 = 추천안 진행 중)면 문 종류 배지가 같은 말이라 상태 배지를 숨긴다 */
const sameAsDoor = (r: Request) => !!r.door && r.status === (r.door === 'one_way' ? 'parked' : 'proceeding');
function byUrgency(a: Request, b: Request) {
  const d = RANK(a) - RANK(b);
  if (d) return d;
  if (a.door === 'default' && b.door === 'default') return (a.due_at ?? '').localeCompare(b.due_at ?? '') || a.no - b.no;
  return a.no - b.no;
}
const target = (v: string) => (v === 'new' ? { new_session: true } : { target_session: v || null });

export function ControlCenter({ requests, sessions, lab }: { requests: Request[]; sessions: Session[]; lab: Lab }) {
  const router = useRouter();
  const { t } = useI18n();
  const [tab, setTab] = useState(lab ? 'flow' : 'need');
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(!!lab);
  const names = Object.fromEntries(sessions.map((s) => [s.id, s.name]));
  const current = TABS.find((x) => x.key === tab)!;
  // 답 필요: 되돌리기 어려운 결정 → 기한이 가까운 '기한까지 진행' → 카드 형식 이전 요청 순, 같은 무리는 오래된 것부터.
  // 알림 카드는 답할 일이 없으므로 맨 아래 접힌 묶음으로 (129차, ADR 0048). 나머지 묶음은 최근 것부터.
  const inTab = requests.filter((r) => current.statuses.includes(r.status));
  const notices = tab === 'need' ? inTab.filter((r) => r.door === 'notice').sort((a, b) => b.no - a.no) : [];
  const visible = tab === 'need'
    ? inTab.filter((r) => r.door !== 'notice').sort(byUrgency)
    : inTab.sort((a, b) => b.no - a.no);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try { await fn(); router.refresh(); return true; } catch (e) { setError((e as Error).message); return false; }
  }

  return (
    <div className="control stack" data-testid="control">
      <div className="row control-bar">
        <div className="tabs" role="tablist" aria-label={t('cc.tabs')}>
          {TABS.map((x) => (
            <button key={x.key} role="tab" aria-selected={tab === x.key} className={tab === x.key ? 'active' : ''} onClick={() => setTab(x.key)}>
              {t(`cc.tab.${x.key}` as MsgKey)}<span className="count">{requests.filter((r) => x.statuses.includes(r.status) && !(x.key === 'need' && r.door === 'notice')).length}</span>
            </button>
          ))}
        </div>
        {!composing && <button type="button" className="btn btn-primary" onClick={() => setComposing(true)}>{t('cc.new')}</button>}
      </div>
      {error && <p className="alert" role="alert">{error}</p>}
      {composing && <NewDirective sessions={sessions} lab={lab} onCancel={() => setComposing(false)}
        onSend={(v) => run(() => call('/api/admin/control/requests', 'POST', v)).then((ok) => { if (ok) { setComposing(false); setTab('flow'); } })} />}

      <ul className="control-list" data-testid="control-list">
        {visible.length === 0 && <li className="muted empty">{t('cc.empty')}</li>}
        {visible.map((r) => <RequestCard key={r.id} r={r} names={names} sessions={sessions} run={run} />)}
      </ul>
      {notices.length > 0 && (
        <details className="control-digest" data-testid="control-digest">
          <summary>{t('dc.digest', { n: notices.length })} <span className="muted small-text">{t('dc.digestHint')}</span></summary>
          <ul className="control-list">
            {notices.map((r) => <RequestCard key={r.id} r={r} names={names} sessions={sessions} run={run} />)}
          </ul>
        </details>
      )}
    </div>
  );
}

function NewDirective({ sessions, lab, onSend, onCancel }: { sessions: Session[]; lab: Lab; onSend: (v: Record<string, unknown>) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [f, setF] = useState({ title: lab?.title ?? '', detail: lab?.body ?? '', body: '', to: sessions.find((s) => s.active)?.id ?? 'new' });
  return (
    <form className="card control-compose" data-testid="control-compose" onSubmit={(e) => { e.preventDefault(); onSend({ title: f.title, detail: f.detail, body: f.body, lab_item_id: lab?.id ?? null, ...target(f.to) }); }}>
      <h2>{t('cc.new')}{lab && <small className="muted">{t('cc.fromLab')}</small>}</h2>
      <Field label={t('cc.title')} required count={{ value: f.title.length, max: 200 }}><input value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
      <Field label={t('cc.detail')} hint={t('cc.detailHint')}><textarea rows={6} value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} /></Field>
      <Field label={t('cc.extra')} optional><textarea rows={3} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
      <Field label={t('cc.to')}><TargetSelect value={f.to} onChange={(to) => setF({ ...f, to })} sessions={sessions} /></Field>
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={!f.title.trim()}>{t('cc.send')}</button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>{t('cc.close')}</button>
      </div>
    </form>
  );
}

function RequestCard({ r, names, sessions, run }: { r: Request; names: Record<string, string>; sessions: Session[]; run: (fn: () => Promise<unknown>) => Promise<boolean> }) {
  const { t, locale } = useI18n();
  const when = whenIn(locale);
  const statusLabel = (s: string) => (s in STATUS ? t(`control.status.${s}` as MsgKey) : s);
  const kindLabel = (k: string) => (`cc.kind.${k}` in CATALOG ? t(`cc.kind.${k}` as MsgKey) : k);
  const st = STATUS[r.status];
  const [choice, setChoice] = useState<string>('');
  const [body, setBody] = useState('');
  const [to, setTo] = useState(r.source_session ?? sessions.find((s) => s.active)?.id ?? 'new');
  const [open, setOpen] = useState(r.door !== 'notice' && (NEEDS_USER.includes(r.status) || r.status === 'answered'));
  const pending = r.messages.filter((m) => m.author === 'user' && !m.delivered_at && (m.target_session || m.new_session));
  const label = (key: string | null) => r.options.find((o) => o.key === key)?.label ?? key;
  const send = () => run(() => call(`/api/admin/control/requests/${r.id}/messages`, 'POST', { choice: choice || null, body, ...target(to) }))
    .then((ok) => { if (ok) { setChoice(''); setBody(''); } });
  return (
    <li className="control-item card" id={`r-${r.no}`} data-testid={`control-${r.no}`} data-status={r.status}>
      <div className="control-head">
        <button type="button" className="item-title" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="control-no num">D-{r.no}</span> {r.title}
        </button>
        <div className="item-meta">
          {r.door && <DoorBadge door={r.door} />}
          {!sameAsDoor(r) && <StatusBadge tone={st.tone} dot>{statusLabel(r.status)}</StatusBadge>}
          <span className="tag">{t(r.kind === 'decision' ? 'cc.decision' : 'cc.directive')}</span>
          {r.source_session && <span className="tag">{t(r.kind === 'decision' ? 'cc.requestedBy' : 'cc.sentTo', { name: names[r.source_session] ?? r.source_session })}</span>}
          {!r.door && r.reversible === true && <span className="tag">{t('cc.reversible')}</span>}
          {!r.door && r.reversible === false && <span className="tag">{t('chat.hardToUndo')}</span>}
          {r.related && <span className="tag">{r.related}</span>}
          {pending.length > 0 && <span className="tag">{t('cc.pending', { n: pending.length })}</span>}
        </div>
      </div>
      <DecisionFacts r={r} />
      {open && <>
        {r.detail && <p className="control-detail">{r.detail}</p>}
        {r.messages.length > 0 && (
          <ol className="control-thread" aria-label={t('cc.thread')}>
            {r.messages.map((m) => (
              <li key={m.id} data-author={m.author}>
                <div className="control-msg-head">
                  <strong>{m.author === 'user' ? t('cc.teacher') : m.author === 'control' ? t('chat.control') : names[m.author_session ?? ''] ?? t('chat.session')}</strong>
                  <span className="muted">{kindLabel(m.kind)} · {when(m.created_at)}</span>
                  {m.author === 'user' && (m.target_session || m.new_session) && (
                    <StatusBadge tone={m.delivered_at ? 'success' : 'discovery'}>
                      {m.delivered_at ? t('cc.deliveredAt', { when: when(m.delivered_at) }) : t('cc.waiting')} → {m.new_session ? t('cc.newSession') : names[m.target_session ?? ''] ?? m.target_session}
                    </StatusBadge>
                  )}
                </div>
                {m.choice && <p>{m.kind === 'status' ? t('cc.statusLine', { status: statusLabel(m.choice) }) : t('chat.choice', { label: label(m.choice) })}</p>}
                {m.body && <p className="control-detail">{m.body}</p>}
                {m.delivery_note && <p className="muted small-text">{t('cc.deliveryNote', { note: m.delivery_note })}</p>}
              </li>
            ))}
          </ol>
        )}
        {!['done', 'dropped'].includes(r.status) && (
          <form className="control-answer stack" onSubmit={(e) => { e.preventDefault(); send(); }}>
            {r.options.length > 0 && (
              <fieldset className="control-options">
                <legend>{t('cc.options')}</legend>
                {r.options.map((o) => (
                  <label key={o.key} className="control-option">
                    <input type="radio" name={`choice-${r.id}`} value={o.key} checked={choice === o.key} onChange={() => setChoice(o.key)} />
                    <span><span className="row"><strong>{o.label}</strong>{r.recommended === o.key && <StatusBadge tone="info">{t('cc.recommended')}</StatusBadge>}</span>
                      {o.detail && <span className="field-hint">{o.detail}</span>}</span>
                  </label>
                ))}
              </fieldset>
            )}
            <Field label={t('cc.extra')} optional hint={t('cc.extraHint')}>
              <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
            </Field>
            <div className="row control-send">
              <Field label={t('cc.to')}><TargetSelect value={to} onChange={setTo} sessions={sessions} allowNote /></Field>
              <button type="submit" className="btn btn-primary" disabled={!choice && !body.trim()}>{to === '' ? t('cc.leaveNote') : t('cc.send')}</button>
              <button type="button" className="btn btn-secondary" onClick={() => run(() => call(`/api/admin/control/requests/${r.id}`, 'PATCH', { status: 'done' }))}>{t('cc.done')}</button>
              <button type="button" className="btn-ghost" onClick={() => run(() => call(`/api/admin/control/requests/${r.id}`, 'PATCH', { status: 'dropped' }))}>{t('cc.fold')}</button>
            </div>
          </form>
        )}
        {['done', 'dropped'].includes(r.status) && (
          <div className="row"><button type="button" className="btn btn-secondary btn-sm" onClick={() => run(() => call(`/api/admin/control/requests/${r.id}`, 'PATCH', { status: 'open' }))}>{t('cc.reopen')}</button></div>
        )}
      </>}
    </li>
  );
}
