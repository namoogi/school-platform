'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Template } from '@/lib/services';

export function PublishButton({ revisionOf, label }: { revisionOf?: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function publish() {
    setBusy(true); setError(null);
    const res = await fetch('/api/documents', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revisionOf }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError(body.error);
    router.push(`/documents/${body.id}`);
    router.refresh();
  }
  return (
    <>
      <button type="button" className="primary" onClick={publish} disabled={busy}>{label ?? '예시 문서 발행'}</button>
      {error && <p className="alert" role="alert">{error}</p>}
    </>
  );
}

export function TemplateForm({ template }: { template: Template }) {
  const router = useRouter();
  const [form, setForm] = useState({
    title: template.title, period_heading: template.period_heading,
    assessment_heading: template.assessment_heading, footer_note: template.footer_note,
  });
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const fields: [keyof typeof form, string][] = [
    ['title', '문서 제목'], ['period_heading', '기간 열 제목'], ['assessment_heading', '평가 열 제목'], ['footer_note', '하단 문구'],
  ];
  async function save() {
    const res = await fetch('/api/templates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) });
    const body = await res.json();
    if (!res.ok) return setMsg({ text: body.error, error: true });
    setMsg({ text: `양식 ${body.version}판을 저장했습니다. 지난 발행본은 바뀌지 않습니다.` });
    router.refresh();
  }
  return (
    <details>
      <summary className="summary-title">양식 고치기 · 현재 {template.version}판</summary>
      <div className="stack">
        {fields.map(([k, label]) => (
          <label key={k}>{label}<input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></label>
        ))}
        <button type="button" className="secondary" onClick={save}>새 양식 판으로 저장</button>
        {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
      </div>
    </details>
  );
}
