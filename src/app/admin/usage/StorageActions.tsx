'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/I18nProvider';

export function StorageActions({ configured, left, copies }: { configured: boolean; left: number; copies: number }) {
  const router = useRouter();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  async function run(action: 'check' | 'copy' | 'clear-db') {
    // 128차: DB 사본 비우기는 되돌릴 수 없다 → 확인 창. R2 내용이 같은 것만 비운다(서버가 sha256 대조)
    if (action === 'clear-db' && !window.confirm(t('usage.clearConfirm', { n: copies }))) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/storage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(action === 'clear-db' ? { action, after } : { action }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? t('common.failed'));
      if (action === 'clear-db') {
        setAfter(d.next ?? null);
        setMsg(d.configured === false ? { ok: false, text: t('usage.clearNoR2') } : { ok: true, text: t('usage.clearResult', { cleared: d.cleared, skipped: d.skipped, left: d.left }) });
      } else setMsg({ ok: d.ok !== false, text: d.message ?? t('usage.done') });
      router.refresh();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
  }
  return (
    <div className="row">
      <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !configured} onClick={() => run('check')}>{t('usage.check')}</button>
      <button type="button" className="btn btn-primary btn-sm" disabled={busy || !configured || left === 0} onClick={() => run('copy')}>
        {busy ? t('usage.working') : t('usage.copy', { n: left })}
      </button>
      {copies > 0 && left === 0 && (
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !configured} onClick={() => run('clear-db')}>
          {busy ? t('usage.working') : t('usage.clearDb', { n: copies })}
        </button>)}
      {msg && <span role="status" className={msg.ok ? 'muted' : 'field-error'}>{msg.text}</span>}
    </div>
  );
}
