'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/I18nProvider';
import { baseT } from '@/lib/i18n/base';

async function call(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  // 문구가 없을 때만 기준 문구(오류 문구는 6묶음에서 서버가 이름표로 돌려주게 바꾼다)
  if (!res.ok) throw new Error(data.error ?? baseT('common.failed'));
  return data;
}

export function AddLinkForm({ schoolId, kinds }: { schoolId: string; kinds: Record<string, { label: string; example: string }> }) {
  const router = useRouter();
  const { t } = useI18n();
  const [f, setF] = useState({ kind: 'github_repo', label: '', url: '', notes: '', status: 'active' });
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function add() {
    try { await call(`/api/admin/schools/${schoolId}/links`, 'POST', f); setMsg({ text: t('integ.added') }); setF({ ...f, label: '', url: '', notes: '' }); router.refresh(); }
    catch (e) { setMsg({ text: (e as Error).message, error: true }); }
  }
  return (
    <div className="stack" data-testid="add-link">
      <h3 className="section-title">{t('integ.add')}</h3>
      <div className="row">
        <label>{t('integ.col.kind')}<select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
          {Object.entries(kinds).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
        <label>{t('integ.col.status')}<select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="active">{t('devlink.status.active')}</option><option value="planned">{t('devlink.status.planned')}</option></select></label>
      </div>
      <label>{t('integ.col.name')}<input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder={t('integ.labelPlaceholder')} /></label>
      <label>{t('integ.url')}<input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder={kinds[f.kind]?.example} aria-label={t('integ.urlAria')} /></label>
      <label>{t('integ.notes')}<textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
      <button type="button" className="btn btn-primary" onClick={add} disabled={!f.label || !f.url}>{t('integ.add')}</button>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
    </div>
  );
}

export function LinkActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const { t } = useI18n();
  async function set(s: string) {
    try { await call(`/api/admin/links/${id}`, 'PATCH', { status: s }); router.refresh(); } catch (e) { alert((e as Error).message); }
  }
  return status === 'archived'
    ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('active')}>{t('integ.reuse')}</button>
    : <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('archived')}>{t('common.archive')}</button>;
}

export function CopyBox({ label, text }: { label: string; text: string }) {
  const [done, setDone] = useState(false);
  const { t } = useI18n();
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="between"><strong>{label}</strong>
        <button type="button" className="btn btn-secondary btn-sm" onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); }}>{done ? t('integ.copied') : t('integ.copy')}</button></div>
      <pre className="copy-box">{text}</pre>
    </div>
  );
}
