'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { InspectorToken } from '@/lib/inspector';
import { useI18n } from '@/components/I18nProvider';
import { withLink } from '@/components/ui';

/** Claude 점검 접근: 토큰 발급(원문은 한 번만 표시)·목록·폐기 */
export function InspectorPanel({ tokens, readOnly }: { tokens: InspectorToken[]; readOnly: boolean }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const when = (d: string | null) => (d ? new Date(d).toLocaleString(locale, { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '—');
  const [days, setDays] = useState(30);
  const [issued, setIssued] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function create() {
    setErr(null);
    const res = await fetch('/api/admin/inspector', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: 'Claude 세션', days }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(data.error ?? t('insp.issueFailed'));
    setIssued(data.token); router.refresh();
  }
  async function revoke(id: string) {
    const res = await fetch(`/api/admin/inspector/${id}`, { method: 'DELETE' });
    if (!res.ok) return setErr((await res.json().catch(() => ({}))).error ?? t('insp.revokeFailed'));
    router.refresh();
  }
  const active = tokens.filter((t) => !t.revoked_at && new Date(t.expires_at) > new Date());
  return (
    <section className="card" data-testid="inspector-panel">
      <div className="card-header">
        <div><h2>{t('insp.title')}</h2>
          <p>{t('insp.lead')}</p></div>
        <span className="badge" data-tone={active.length ? 'success' : 'neutral'}>{active.length ? t('insp.activeN', { n: active.length }) : t('insp.none')}</span>
      </div>
      {!readOnly && (
        <div className="row-wrap" style={{ alignItems: 'end' }}>
          <label>{t('insp.expiry')}
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {[7, 30, 90].map((n) => <option key={n} value={n}>{t('insp.days', { n })}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-secondary" onClick={create}>{t('insp.issue')}</button>
        </div>
      )}
      {issued && (
        <div className="banner" data-tone="warning" role="status">
          <p><b>{t('insp.onceTitle')}</b>{withLink(t('insp.onceBody'), { credential: <b>{t('insp.credential')}</b> })}</p>
          <pre className="copy-box" data-testid="issued-token">{issued}</pre>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(issued)}>{t('integ.copy')}</button>
        </div>
      )}
      {err && <p className="banner" data-tone="danger" role="alert">{err}</p>}
      {tokens.length > 0 && (
        <table className="grid-table">
          <thead><tr><th scope="col">{t('integ.col.name')}</th><th scope="col">{t('insp.col.issued')}</th><th scope="col">{t('integ.col.expires')}</th><th scope="col">{t('integ.col.lastUsed')}</th><th scope="col">{t('integ.col.status')}</th><th scope="col"><span className="sr-only">{t('integ.col.actions')}</span></th></tr></thead>
          <tbody>{tokens.map((tk) => {
            const live = !tk.revoked_at && new Date(tk.expires_at) > new Date();
            return (
              <tr key={tk.id}>
                <td>{tk.label}</td><td>{when(tk.created_at)}</td><td>{when(tk.expires_at)}</td><td>{when(tk.last_used_at)}</td>
                <td><span className="badge" data-tone={live ? 'success' : 'neutral'}>{tk.revoked_at ? t('insp.revokedState') : live ? t('integ.usable') : t('integ.expired')}</span></td>
                <td>{live && !readOnly && <button type="button" className="btn btn-ghost btn-sm" onClick={() => revoke(tk.id)}>{t('insp.revoke')}</button>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      )}
      <p className="fine">{t('insp.note')}</p>
    </section>
  );
}
