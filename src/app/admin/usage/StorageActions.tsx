'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/I18nProvider';

export function StorageActions({ configured, left }: { configured: boolean; left: number }) {
  const router = useRouter();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(action: 'check' | 'copy') {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/storage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t('common.failed'));
      setMsg({ ok: d.ok !== false, text: d.message ?? t('usage.done') });
      router.refresh();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
  }
  return (
    <div className="row">
      <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !configured} onClick={() => run('check')}>{t('usage.check')}</button>
      <button type="button" className="btn btn-primary btn-sm" disabled={busy || !configured || left === 0} onClick={() => run('copy')}>
        {busy ? t('usage.working') : t('usage.copy', { n: left })}
      </button>
      {msg && <span role="status" className={msg.ok ? 'muted' : 'field-error'}>{msg.text}</span>}
    </div>
  );
}
