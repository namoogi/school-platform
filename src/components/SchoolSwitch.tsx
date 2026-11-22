'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function EnterSchoolButton({ schoolId, label = '이 학교로 들어가기' }: { schoolId: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function enter() {
    setBusy(true);
    const res = await fetch('/api/context', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ schoolId }) });
    setBusy(false);
    if (res.ok) { router.push('/'); router.refresh(); }
    else alert((await res.json()).error);
  }
  return <button type="button" className="secondary small" onClick={enter} disabled={busy}>{label}</button>;
}

export function LeaveSchoolButton() {
  const router = useRouter();
  async function leave() {
    await fetch('/api/context', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ schoolId: null }) });
    router.push('/admin'); router.refresh();
  }
  return <button type="button" className="link-button small" onClick={leave}>나가기</button>;
}
