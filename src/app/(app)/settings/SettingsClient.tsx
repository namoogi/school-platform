'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Invitation, License, Member, Module } from '@/lib/admin';

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
