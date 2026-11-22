'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Module } from '@/lib/admin';

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? '처리하지 못했습니다.');
  return data;
}

export function SchoolActions({ schoolId, status, period }: { schoolId: string; status: string; period: string }) {
  const router = useRouter();
  async function run(fn: () => Promise<unknown>) {
    try { await fn(); router.refresh(); } catch (e) { alert((e as Error).message); }
  }
  return (
    <>
      <select aria-label="학교 상태" value={status} className="small"
        onChange={(e) => run(() => post(`/api/admin/schools/${schoolId}/status`, { status: e.target.value }))}>
        <option value="trial">시범</option><option value="active">운영</option><option value="suspended">이용 중지</option>
      </select>
      <button type="button" className="secondary small"
        onClick={() => confirm(`${period} 청구 예정액을 확정할까요? (실제 결제 아님, 확정 후 수정 불가)`) && run(() => post(`/api/admin/schools/${schoolId}/statement`, { period }))}>
        {period} 청구 확정
      </button>
    </>
  );
}

export function CreateSchoolForm({ modules }: { modules: Module[] }) {
  const router = useRouter();
  const [f, setF] = useState({ name: '', slug: '', locale: 'ko', adminEmail: '', seats: 5, modules: ['records'] as string[] });
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function create() {
    try {
      await post('/api/admin/schools', f);
      setMsg({ text: `${f.name}을 만들고 ${f.adminEmail}을 학교 관리자로 초대했습니다.` });
      setF({ ...f, name: '', slug: '', adminEmail: '' }); router.refresh();
    } catch (e) { setMsg({ text: (e as Error).message, error: true }); }
  }
  return (
    <div className="stack" data-testid="create-school">
      <h2>학교 만들기</h2>
      <label>학교 이름<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label>주소 이름 (영문 소문자·숫자·하이픈)<input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} placeholder="예: hope-school" /></label>
      <label>문서 언어<select value={f.locale} onChange={(e) => setF({ ...f, locale: e.target.value })}><option value="ko">한국어</option><option value="en">영어</option><option value="th">태국어</option></select></label>
      <label>첫 학교 관리자 이메일 (Google 계정)<input type="email" value={f.adminEmail} onChange={(e) => setF({ ...f, adminEmail: e.target.value })} /></label>
      <label>시작 좌석 수<input type="number" min={1} value={f.seats} onChange={(e) => setF({ ...f, seats: Number(e.target.value) })} /></label>
      <fieldset className="choices"><legend>시작 기능</legend>
        {modules.filter((m) => m.available).map((m) => (
          <label key={m.key} className="radio"><input type="checkbox" disabled={m.required} checked={m.required || f.modules.includes(m.key)}
            onChange={(e) => setF({ ...f, modules: e.target.checked ? [...f.modules, m.key] : f.modules.filter((k) => k !== m.key) })} /> {m.name}</label>
        ))}
      </fieldset>
      <button type="button" className="primary" onClick={create} disabled={!f.name || !f.slug || !f.adminEmail}>학교 만들기 (시범 상태)</button>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
    </div>
  );
}

export function PriceForm({ modules }: { modules: Module[] }) {
  const router = useRouter();
  const [prices, setPrices] = useState(Object.fromEntries(modules.map((m) => [m.key, m.monthly_price_per_seat_krw])));
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function save(key: string) {
    try { await post('/api/admin/prices', { key, price: prices[key] }); setMsg({ text: '가격을 저장했습니다. 학교별 금액은 다음 라이선스 변경 때 새 가격으로 계산됩니다.' }); router.refresh(); }
    catch (e) { setMsg({ text: (e as Error).message, error: true }); }
  }
  return (
    <div className="stack" data-testid="prices">
      <h2>기능별 가격 (좌석당 월)</h2>
      {modules.map((m) => (
        <div key={m.key} className="row price-row">
          <span className="price-name">{m.name}{!m.available && <span className="tag">준비 중</span>}</span>
          <input type="number" min={0} step={100} value={prices[m.key]} aria-label={`${m.name} 가격`} onChange={(e) => setPrices({ ...prices, [m.key]: Number(e.target.value) })} />
          <button type="button" className="secondary small" onClick={() => save(m.key)}>저장</button>
        </div>
      ))}
      <p className="fine">이미 저장된 라이선스 판의 금액은 그때 가격으로 남습니다(가격 기록 보존).</p>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
    </div>
  );
}
