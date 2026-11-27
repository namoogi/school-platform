'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/I18nProvider';

/** 61차 F5: 꾸러미 켜기·끄기 — 켜는 것은 사람(학교 관리자)이다 */
export function PackageSwitch({ code, version, enabled, valid }: { code: string; version: number; enabled: boolean; valid: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go(state: 'enabled' | 'disabled') {
    setBusy(true); setError(null);
    const res = await fetch('/api/packages/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, state, version }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? t('pkg.changeFailed'));
    router.refresh();
  }
  return (
    <div className="form-actions">
      {enabled
        ? <button type="button" className="btn" onClick={() => go('disabled')} disabled={busy} data-testid={`pkg-off-${code}`}>{t('pkg.turnOff')}</button>
        : <button type="button" className="btn btn-primary" onClick={() => go('enabled')} disabled={busy || !valid} data-testid={`pkg-on-${code}`}>{t('pkg.turnOn', { v: version })}</button>}
      {!valid && !enabled && <span className="fine">{t('pkg.cantEnable')}</span>}
      {error && <p className="alert" role="alert">{error}</p>}
    </div>
  );
}
