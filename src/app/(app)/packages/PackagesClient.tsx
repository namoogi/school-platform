'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** 61차 F5: 꾸러미 켜기·끄기 — 켜는 것은 사람(학교 관리자)이다 */
export function PackageSwitch({ code, version, enabled, valid }: { code: string; version: number; enabled: boolean; valid: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go(state: 'enabled' | 'disabled') {
    setBusy(true); setError(null);
    const res = await fetch('/api/packages/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, state, version }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? '바꾸지 못했습니다.');
    router.refresh();
  }
  return (
    <div className="form-actions">
      {enabled
        ? <button type="button" className="btn" onClick={() => go('disabled')} disabled={busy} data-testid={`pkg-off-${code}`}>끄기</button>
        : <button type="button" className="btn btn-primary" onClick={() => go('enabled')} disabled={busy || !valid} data-testid={`pkg-on-${code}`}>{version}판 켜기</button>}
      {!valid && !enabled && <span className="fine">검사 오류가 있어 켤 수 없습니다.</span>}
      {error && <p className="alert" role="alert">{error}</p>}
    </div>
  );
}
