'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Invitation, License, Member, Module } from '@/lib/admin';
import { Meter } from '@/components/ui';

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? '처리하지 못했습니다.');
  return data;
}

export function LicenseForm({ info }: { info: { current: License | null; history: License[]; seatsUsed: number; catalog: Module[] } }) {
  const router = useRouter();
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
      setMsg({ text: '라이선스를 새 판으로 저장했습니다.' }); setNote(''); router.refresh();
    } catch (e) { setMsg({ text: (e as Error).message, error: true }); }
  }
  return (
    <>
      <div className="between"><h2>라이선스</h2>{info.current && <span className="tag green">{info.current.version}판</span>}</div>
      <label>좌석 수 <span className="muted">(사용 중 {info.seatsUsed}석: 구성원 + 대기 중 초대)</span>
        <input type="number" min={Math.max(1, info.seatsUsed)} max={10000} value={seats} onChange={(e) => setSeats(Number(e.target.value))} />
      </label>
      <fieldset className="choices">
        <legend>사용할 기능</legend>
        {info.catalog.map((m) => (
          <label key={m.key} className="radio module">
            <input type="checkbox" disabled={!m.available || m.required}
              checked={m.required || selected.includes(m.key)}
              onChange={(e) => setSelected(e.target.checked ? [...selected, m.key] : selected.filter((k) => k !== m.key))} />
            <span><strong>{m.name}</strong>{m.required && <span className="tag">기본</span>}{!m.available && <span className="tag">준비 중</span>}
              <br /><small className="muted">{m.description} · 좌석당 월 {m.monthly_price_per_seat_krw ? won(m.monthly_price_per_seat_krw) : '가격 미정'}</small></span>
          </label>
        ))}
      </fieldset>
      <p className="estimate" data-testid="estimate">월 예상 금액 <strong>{won(perSeat * seats)}</strong> <span className="muted">(좌석 {seats} × {won(perSeat)})</span></p>
      <label>변경 메모 (선택)<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 2학기 교사 충원" /></label>
      <button type="button" className="primary" onClick={save}>라이선스 저장</button>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
      {info.history.length > 1 && (
        <details><summary className="summary-title">변경 이력 {info.history.length}건</summary>
          <ul className="log">{info.history.map((h) => (
            <li key={h.id}>{h.version}판 · 좌석 {h.seats} · {h.modules.join(', ')} · {won(h.monthly_estimate_krw)}{h.note && <span className="muted"> · {h.note}</span>}</li>
          ))}</ul>
        </details>)}
    </>
  );
}

export function MembersPanel({ members, invitations, seats, used }: { members: Member[]; invitations: Invitation[]; seats: number; used: number }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'teacher' | 'admin'>('teacher');
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const ROLE = { admin: '학교 관리자', teacher: '교사' };
  async function act(url: string, body: unknown, ok: string) {
    try { await post(url, body); setMsg({ text: ok }); router.refresh(); }
    catch (e) { setMsg({ text: (e as Error).message, error: true }); }
  }
  return (
    <>
      <div className="between"><h2>구성원</h2><span className={`tag ${used >= seats ? 'amber' : ''}`} data-testid="seat-usage">좌석 {used} / {seats}</span></div>
      <Meter value={used} max={seats} label="좌석 사용 (구성원 + 대기 중 초대)" />
      <ul className="sources">
        {members.map((m) => (
          <li key={m.user_id}><div><strong>{m.display_name}</strong><small className="muted">{m.email} · {ROLE[m.role]}</small></div>
            <button type="button" className="link-button" onClick={() => confirm(`${m.email}을 구성원에서 뺄까요?`) && act('/api/settings/members/remove', { userId: m.user_id }, '구성원에서 뺐습니다.')}>빼기</button></li>
        ))}
        {invitations.map((i) => (
          <li key={i.id}><div><strong>{i.email}</strong><small className="muted">{ROLE[i.role]} · 초대 대기 (첫 로그인 때 합류)</small></div>
            <button type="button" className="link-button" onClick={() => act('/api/settings/invitations/revoke', { id: i.id }, '초대를 취소했습니다.')}>초대 취소</button></li>
        ))}
      </ul>
      <h3 className="section-title">초대</h3>
      <div className="row">
        <input type="email" placeholder="이메일 (Google 계정)" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="초대할 이메일" />
        <select value={role} onChange={(e) => setRole(e.target.value as 'teacher' | 'admin')} aria-label="역할">
          <option value="teacher">교사</option><option value="admin">학교 관리자</option>
        </select>
        <button type="button" className="primary" disabled={!email.trim()}
          onClick={() => act('/api/settings/members', { email, role }, `${email}을 초대했습니다.`).then(() => setEmail(''))}>초대</button>
      </div>
      <p className="fine">교사는 자료를 올리고 볼 수 있습니다. 규칙 확정·문서 발행·설정은 학교 관리자만 할 수 있습니다. 좌석이 차면 좌석 수를 늘린 뒤 초대합니다.</p>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
    </>
  );
}

/** 62차(ADR 0029): 학생·보호자 열람 계정 — 구성원(좌석)과 따로. 첫 로그인(같은 이메일) 때 연결된다 */
type PortalRow = { id: string; kind: 'student' | 'guardian'; name: string | null; email: string; claimed: boolean; under_consent_age: boolean; consent_basis: string | null; ends_on: string | null };
export function PortalAccountsPanel({ accounts, people }: { accounts: PortalRow[]; people: { id: string; name: string }[] }) {
  const router = useRouter();
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
      setMsg({ text: '열람 계정을 만들었습니다. 이 이메일로 로그인하면 연결됩니다.' }); setEmail(''); setNote(''); router.refresh();
    } catch (x) { setMsg({ text: (x as Error).message, error: true }); }
  }
  async function end(id: string) {
    try { await post('/api/settings/portal-accounts/end', { id }); setMsg({ text: '열람 계정을 끝냈습니다.' }); router.refresh(); }
    catch (x) { setMsg({ text: (x as Error).message, error: true }); }
  }
  const open = accounts.filter((a) => !a.ends_on);
  return (
    <>
      <h2>학생·보호자 열람 계정</h2>
      <p className="fine">학생과 보호자가 확정된 기록·출결·발행본을 봅니다. 교직원 좌석을 쓰지 않습니다. 보호자는 가족·보호자 연결이 있는 자녀만 봅니다.</p>
      <form className="stack" onSubmit={add} data-testid="portal-account-form">
        <fieldset><legend>종류</legend><div className="row-wrap">
          <label className="radio"><input type="radio" name="portal-kind" checked={kind === 'student'} onChange={() => setKind('student')} />학생 본인</label>
          <label className="radio"><input type="radio" name="portal-kind" checked={kind === 'guardian'} onChange={() => setKind('guardian')} />보호자</label>
        </div></fieldset>
        <label>{kind === 'student' ? '학생' : '보호자(사람)'}
          <select value={personId} onChange={(e) => setPersonId(e.target.value)} required aria-label="사람">
            <option value="">고르세요</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>로그인 이메일<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="family@example.org" /></label>
        {kind === 'student' && (
          <>
            <label className="radio"><input type="checkbox" checked={under} onChange={(e) => setUnder(e.target.checked)} />동의 연령 미만(한국 만 14세·미국 13세 미만)</label>
            {under && (
              <label>동의 근거
                <select value={basis} onChange={(e) => setBasis(e.target.value)}>
                  <option value="guardian_consent">보호자 동의</option>
                  <option value="school_authorization">학교 승인(교육 목적)</option>
                </select>
              </label>
            )}
          </>
        )}
        <label>메모 (선택)<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 보호자 동의서 2026-03" /></label>
        <button type="submit" className="btn btn-primary" disabled={!personId || !email}>열람 계정 만들기</button>
      </form>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
      {open.length === 0 ? <p className="muted">열린 열람 계정이 없습니다.</p> : (
        <ul className="members" data-testid="portal-account-list">{open.map((a) => (
          <li key={a.id}><span><strong>{a.name ?? '—'}</strong> <span className="tag">{a.kind === 'student' ? '학생' : '보호자'}</span>{' '}
            <small className="muted">{a.email} · {a.claimed ? '연결됨' : '첫 로그인 대기'}{a.under_consent_age ? ` · 동의 근거 ${a.consent_basis === 'guardian_consent' ? '보호자 동의' : '학교 승인'}` : ''}</small></span>
            <button type="button" className="link-button" onClick={() => end(a.id)}>끝내기</button></li>
        ))}</ul>)}
    </>
  );
}
