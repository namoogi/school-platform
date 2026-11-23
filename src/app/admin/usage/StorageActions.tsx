'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function StorageActions({ configured, left }: { configured: boolean; left: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(action: 'check' | 'copy') {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/storage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? '처리하지 못했습니다.');
      setMsg({ ok: d.ok !== false, text: d.message ?? '완료' });
      router.refresh();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
  }
  return (
    <div className="row">
      <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !configured} onClick={() => run('check')}>연결 확인</button>
      <button type="button" className="btn btn-primary btn-sm" disabled={busy || !configured || left === 0} onClick={() => run('copy')}>
        {busy ? '처리 중…' : `DB 파일을 R2로 복사 (25개씩, 남은 ${left}개)`}
      </button>
      {msg && <span role="status" className={msg.ok ? 'muted' : 'field-error'}>{msg.text}</span>}
    </div>
  );
}
