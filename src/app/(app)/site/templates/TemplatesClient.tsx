'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** 65차(ADR 0031): 템플릿 적용 — 없는 쪽만 시안으로 만들고, 이미 있는 쪽은 건너뛴다 */
export function ApplyTemplate({ templateKey, name, existing }: { templateKey: string; name: string; existing: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function apply() {
    setBusy(true); setMsg(null);
    const res = await fetch('/api/site/templates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: templateKey }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ text: body.error ?? '적용하지 못했습니다.', error: true });
    setMsg({ text: `시안 쪽 ${body.created.length}개를 만들었습니다${body.skipped.length ? ` (이미 있는 ${body.skipped.join('·')}는 그대로 둠)` : ''}. 공개 전에 내용을 채워 주세요.` });
    router.refresh();
  }
  return (
    <div className="stack">
      {existing.length > 0 && <p className="fine">이미 있는 쪽({existing.join('·')})은 건드리지 않고 나머지 쪽만 만듭니다.</p>}
      <div className="form-actions">
        <button type="button" className="btn btn-primary" onClick={apply} disabled={busy} data-testid="template-apply">‘{name}’으로 시작하기</button>
      </div>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}{!msg.error && <> <a href="/site?box=page">쪽 목록으로</a></>}</p>}
    </div>
  );
}
