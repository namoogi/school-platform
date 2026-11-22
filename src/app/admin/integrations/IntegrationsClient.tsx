'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

async function call(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? '처리하지 못했습니다.');
  return data;
}

export function AddLinkForm({ schoolId, kinds }: { schoolId: string; kinds: Record<string, { label: string; example: string }> }) {
  const router = useRouter();
  const [f, setF] = useState({ kind: 'github_repo', label: '', url: '', notes: '', status: 'active' });
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function add() {
    try { await call(`/api/admin/schools/${schoolId}/links`, 'POST', f); setMsg({ text: '연동을 추가했습니다.' }); setF({ ...f, label: '', url: '', notes: '' }); router.refresh(); }
    catch (e) { setMsg({ text: (e as Error).message, error: true }); }
  }
  return (
    <div className="stack" data-testid="add-link">
      <h3 className="section-title">연동 추가</h3>
      <div className="row">
        <label>종류<select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
          {Object.entries(kinds).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
        <label>상태<select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="active">사용 중</option><option value="planned">예정</option></select></label>
      </div>
      <label>이름<input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="예: 홈페이지 맞춤 저장소" /></label>
      <label>주소<input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder={kinds[f.kind]?.example} aria-label="연동 주소" /></label>
      <label>설명 (토큰·키는 적지 마세요)<textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
      <button type="button" className="btn btn-primary" onClick={add} disabled={!f.label || !f.url}>연동 추가</button>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
    </div>
  );
}

export function LinkActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  async function set(s: string) {
    try { await call(`/api/admin/links/${id}`, 'PATCH', { status: s }); router.refresh(); } catch (e) { alert((e as Error).message); }
  }
  return status === 'archived'
    ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('active')}>다시 사용</button>
    : <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('archived')}>보관</button>;
}

export function CopyBox({ label, text }: { label: string; text: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="between"><strong>{label}</strong>
        <button type="button" className="btn btn-secondary btn-sm" onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); }}>{done ? '복사됨' : '복사'}</button></div>
      <pre className="copy-box">{text}</pre>
    </div>
  );
}
