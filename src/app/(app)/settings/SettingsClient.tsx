'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Invitation, License, Member, Module } from '@/lib/admin';
import { Meter } from '@/components/ui';
import { useConfirm } from '@/components/ConfirmDialog';
import { useI18n } from '@/components/I18nProvider';

// 화면 언어 t·형식용 locale 을 받는 작은 도우미들
function useText() {
  const { t, locale } = useI18n();
  const won = (n: number) => t('common.won', { n: n.toLocaleString(locale) });
  // failed: 서버가 오류 문구를 주지 않을 때 보일 글
  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? t('common.failed'));
    return data;
  }
  return { t, won, post };
}

export function LicenseForm({ info }: { info: { current: License | null; history: License[]; seatsUsed: number; catalog: Module[] } }) {
  const router = useRouter();
  const { t, won, post } = useText();
  const [seats, setSeats] = useState(info.current?.seats ?? 5);
  const [selected, setSelected] = useState<string[]>(info.current?.modules ?? []);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const perSeat = useMemo(() => info.catalog
    .filter((m) => m.available && (m.required || selected.includes(m.key)))
    .reduce((n, m) => n + m.monthly_price_per_seat_krw, 0), [info.catalog, selected]);

  async function save() {
    try {
      await post('/api/settings/license', { seats, modules: selected, note });
      setMsg({ text: t('license.saved') }); setNote(''); router.refresh();
    } catch (e) { setMsg({ text: (e as Error).message, error: true }); }
  }
  return (
    <>
      <div className="between"><h2>{t('license.title')}</h2>{info.current && <span className="tag green">{t('common.version', { v: info.current.version })}</span>}</div>
      <label>{t('license.seats')} <span className="muted">{t('license.seatsUsed', { n: info.seatsUsed })}</span>
        <input type="number" min={Math.max(1, info.seatsUsed)} max={10000} value={seats} onChange={(e) => setSeats(Number(e.target.value))} />
      </label>
      <fieldset className="choices">
        <legend>{t('license.features')}</legend>
        {info.catalog.map((m) => (
          <label key={m.key} className="radio module">
            <input type="checkbox" disabled={!m.available || m.required}
              checked={m.required || selected.includes(m.key)}
              onChange={(e) => setSelected(e.target.checked ? [...selected, m.key] : selected.filter((k) => k !== m.key))} />
            <span><strong>{m.name}</strong>{m.required && <span className="tag">{t('license.required')}</span>}{!m.available && <span className="tag">{t('license.comingSoon')}</span>}
              <br /><small className="muted">{m.description} · {m.monthly_price_per_seat_krw ? t('license.perSeat', { price: won(m.monthly_price_per_seat_krw) }) : t('license.priceTbd')}</small></span>
          </label>
        ))}
      </fieldset>
      <p className="estimate" data-testid="estimate">{t('license.estimate')} <strong>{won(perSeat * seats)}</strong> <span className="muted">{t('license.estimateCalc', { seats, per: won(perSeat) })}</span></p>
      <label>{t('license.memo')}<input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('license.memoPlaceholder')} /></label>
      <button type="button" className="primary" onClick={save}>{t('license.save')}</button>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
      {info.history.length > 1 && (
        <details><summary className="summary-title">{t('license.history', { n: info.history.length })}</summary>
          <ul className="log">{info.history.map((h) => (
            <li key={h.id}>{t('license.historyItem', { v: h.version, seats: h.seats, modules: h.modules.join(', '), amount: won(h.monthly_estimate_krw) })}{h.note && <span className="muted"> · {h.note}</span>}</li>
          ))}</ul>
        </details>)}
    </>
  );
}

export function MembersPanel({ members, invitations, seats, used }: { members: Member[]; invitations: Invitation[]; seats: number; used: number }) {
  const router = useRouter();
  const { t, post } = useText();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'teacher' | 'admin'>('teacher');
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const ROLE = { admin: t('role.admin'), teacher: t('role.teacher') };
  const [ask, confirmDialog] = useConfirm();
  async function act(url: string, body: unknown, ok: string) {
    try { await post(url, body); setMsg({ text: ok }); router.refresh(); }
    catch (e) { setMsg({ text: (e as Error).message, error: true }); }
  }
  return (
    <>
      {confirmDialog}
      <div className="between"><h2>{t('members.title')}</h2><span className={`tag ${used >= seats ? 'amber' : ''}`} data-testid="seat-usage">{t('members.seats', { used, seats })}</span></div>
      <Meter value={used} max={seats} label={t('members.meter')} />
      <ul className="sources">
        {members.map((m) => (
          <li key={m.user_id}><div><strong>{m.display_name}</strong><small className="muted">{m.email} · {ROLE[m.role]}</small></div>
            <button type="button" className="link-button" onClick={async () => { if (await ask({ title: t('members.removeTitle'), description: t('members.removeBody', { email: m.email, name: m.display_name }), confirmLabel: t('members.removeConfirm') })) act('/api/settings/members/remove', { userId: m.user_id }, t('members.removed')); }}>{t('members.remove')}</button></li>
        ))}
        {invitations.map((i) => (
          <li key={i.id}><div><strong>{i.email}</strong><small className="muted">{ROLE[i.role]} · {t('members.pending')}</small></div>
            <button type="button" className="link-button" onClick={() => act('/api/settings/invitations/revoke', { id: i.id }, t('members.revoked'))}>{t('members.revoke')}</button></li>
        ))}
      </ul>
      <h3 className="section-title">{t('members.invite')}</h3>
      <div className="row">
        <input type="email" placeholder={t('members.emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} aria-label={t('members.emailAria')} />
        <select value={role} onChange={(e) => setRole(e.target.value as 'teacher' | 'admin')} aria-label={t('members.role')}>
          <option value="teacher">{t('role.teacher')}</option><option value="admin">{t('role.admin')}</option>
        </select>
        <button type="button" className="primary" disabled={!email.trim()}
          onClick={() => act('/api/settings/members', { email, role }, t('members.invited', { email })).then(() => setEmail(''))}>{t('members.invite')}</button>
      </div>
      <p className="fine">{t('members.note')}</p>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
    </>
  );
}

/** 62차(ADR 0029): 학생·보호자 열람 계정 — 구성원(좌석)과 따로. 첫 로그인(같은 이메일) 때 연결된다 */
type PortalRow = { id: string; kind: 'student' | 'guardian'; name: string | null; email: string; claimed: boolean; under_consent_age: boolean; consent_basis: string | null; ends_on: string | null };
export function PortalAccountsPanel({ accounts, people }: { accounts: PortalRow[]; people: { id: string; name: string }[] }) {
  const router = useRouter();
  const { t, post } = useText();
  const [kind, setKind] = useState<'student' | 'guardian'>('student');
  const [personId, setPersonId] = useState('');
  const [email, setEmail] = useState('');
  const [under, setUnder] = useState(false);
  const [basis, setBasis] = useState('guardian_consent');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await post('/api/settings/portal-accounts', { kind, personId, email, underConsentAge: kind === 'student' && under, consentBasis: kind === 'student' && under ? basis : null, consentNote: note });
      setMsg({ text: t('portalAcc.created') }); setEmail(''); setNote(''); router.refresh();
    } catch (x) { setMsg({ text: (x as Error).message, error: true }); }
  }
  async function end(id: string) {
    try { await post('/api/settings/portal-accounts/end', { id }); setMsg({ text: t('portalAcc.ended') }); router.refresh(); }
    catch (x) { setMsg({ text: (x as Error).message, error: true }); }
  }
  const open = accounts.filter((a) => !a.ends_on);
  return (
    <>
      <h2>{t('portalAcc.title')}</h2>
      <p className="fine">{t('portalAcc.lead')}</p>
      <form className="stack" onSubmit={add} data-testid="portal-account-form">
        <fieldset><legend>{t('portalAcc.kind')}</legend><div className="row-wrap">
          <label className="radio"><input type="radio" name="portal-kind" checked={kind === 'student'} onChange={() => setKind('student')} />{t('portalAcc.student')}</label>
          <label className="radio"><input type="radio" name="portal-kind" checked={kind === 'guardian'} onChange={() => setKind('guardian')} />{t('portalAcc.guardian')}</label>
        </div></fieldset>
        <label>{t(kind === 'student' ? 'common.student' : 'portalAcc.guardianPerson')}
          <select value={personId} onChange={(e) => setPersonId(e.target.value)} required aria-label={t('req.person')}>
            <option value="">{t('req.choose')}</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>{t('portalAcc.email')}<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="family@example.org" /></label>
        {kind === 'student' && (
          <>
            <label className="radio"><input type="checkbox" checked={under} onChange={(e) => setUnder(e.target.checked)} />{t('portalAcc.underAge')}</label>
            {under && (
              <label>{t('portalAcc.basis')}
                <select value={basis} onChange={(e) => setBasis(e.target.value)}>
                  <option value="guardian_consent">{t('portalAcc.basis.guardian_consent')}</option>
                  <option value="school_authorization">{t('portalAcc.basis.school_authorization')}</option>
                </select>
              </label>
            )}
          </>
        )}
        <label>{t('settings.memoOptional')}<input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('portalAcc.memoPlaceholder')} /></label>
        <button type="submit" className="btn btn-primary" disabled={!personId || !email}>{t('portalAcc.create')}</button>
      </form>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
      {open.length === 0 ? <p className="muted">{t('portalAcc.none')}</p> : (
        <ul className="members" data-testid="portal-account-list">{open.map((a) => (
          <li key={a.id}><span><strong>{a.name ?? '—'}</strong> <span className="tag">{t(a.kind === 'student' ? 'common.student' : 'portalAcc.guardian')}</span>{' '}
            <small className="muted">{a.email} · {t(a.claimed ? 'portalAcc.linked' : 'portalAcc.waiting')}{a.under_consent_age ? t('portalAcc.basisSuffix', { basis: t(a.consent_basis === 'guardian_consent' ? 'portalAcc.basis.guardian_consent' : 'portalAcc.basisShort.school') }) : ''}</small></span>
            <button type="button" className="link-button" onClick={() => end(a.id)}>{t('portalAcc.end')}</button></li>
        ))}</ul>)}
    </>
  );
}
