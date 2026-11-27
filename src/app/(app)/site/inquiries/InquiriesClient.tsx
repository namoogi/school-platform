'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Inquiry } from '@/lib/site-inquiries';
import { useI18n } from '@/components/I18nProvider';
import type { MsgKey } from '@/lib/i18n/catalog';

export function InquiriesClient({ inquiries }: { inquiries: Inquiry[] }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [days, setDays] = useState(365);
  const call = async (url: string, method: string, body: unknown) => {
    setMsg(null);
    const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg({ text: data.error ?? t('common.failed'), error: true }); return null; }
    router.refresh();
    return data;
  };
  const fresh = inquiries.filter((i) => i.status === 'new').length;
  return (
    <div className="stack">
      {inquiries.length === 0
        ? <p className="muted" data-testid="inquiries-empty">{t('site.inq.empty')}</p>
        : <>
            <p className="fine">{t('site.inq.count', { total: inquiries.length, fresh })}</p>
            <div className="table-wrap">
              <table className="grid-table" data-testid="inquiries">
                <thead><tr><th scope="col">{t('site.inq.colReceived')}</th><th scope="col">{t('site.inq.colKind')}</th><th scope="col">{t('common.name')}</th><th scope="col">{t('site.inq.colContact')}</th><th scope="col">{t('site.inq.colDate')}</th><th scope="col">{t('site.inq.colMessage')}</th><th scope="col">{t('site.inq.colStatus')}</th></tr></thead>
                <tbody>{inquiries.map((i) => (
                  <tr key={i.id}>
                    <td>{new Date(i.created_at).toLocaleDateString(locale)}</td>
                    <td>{t(`site.inq.kind.${i.kind}` as MsgKey)}</td>
                    <td>{i.name}</td>
                    <td>{i.contact}</td>
                    <td>{i.preferred_date ?? '—'}</td>
                    <td>{i.message ?? '—'}{i.page ? <small className="muted"> · {i.page}</small> : null}</td>
                    <td>{i.redacted_at ? t('site.inq.redacted') : (
                      <button type="button" className="btn btn-sm" aria-pressed={i.status === 'done'} onClick={() => call(`/api/site/inquiries/${i.id}`, 'PATCH', { status: i.status === 'done' ? 'new' : 'done' })}
                        data-testid="inquiry-toggle">{i.status === 'done' ? t('site.inq.done') : t('site.inq.pending')}</button>)}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          </>}
      <details className="card">
        <summary>{t('site.inq.redactTitle')}</summary>
        <div className="stack">
          <p className="fine">{t('site.inq.redactLead')}</p>
          <label>{t('site.inq.keepDays')}<input type="number" min={30} value={days} onChange={(e) => setDays(Number(e.target.value))} /></label>
          <div className="form-actions"><button type="button" className="btn btn-danger" onClick={async () => {
            const r = await call('/api/site/inquiries/redact', 'POST', { keep_days: days });
            if (r) setMsg({ text: t('site.inq.redactedN', { n: r.redacted }) });
          }}>{t('site.inq.redactButton', { n: days })}</button></div>
        </div>
      </details>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
    </div>
  );
}
