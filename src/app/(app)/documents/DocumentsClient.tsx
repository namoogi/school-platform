'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Template } from '@/lib/services';
import type { MsgKey } from '@/lib/i18n/catalog';
import { useI18n } from '@/components/I18nProvider';

export function PublishButton({ revisionOf, label }: { revisionOf?: string; label?: string }) {
  const router = useRouter();
  const { t } = useI18n();
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
      <button type="button" className="primary" onClick={publish} disabled={busy}>{label ?? t('docs.publishSample')}</button>
      {error && <p className="alert" role="alert">{error}</p>}
    </>
  );
}

export function TemplateForm({ template }: { template: Template }) {
  const router = useRouter();
  const { t } = useI18n();
  const [form, setForm] = useState({
    title: template.title, period_heading: template.period_heading,
    assessment_heading: template.assessment_heading, footer_note: template.footer_note,
  });
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const fields: [keyof typeof form, MsgKey][] = [
    ['title', 'docs.field.title'], ['period_heading', 'docs.field.period'], ['assessment_heading', 'docs.field.assessment'], ['footer_note', 'docs.field.footer'],
  ];
  async function save() {
    const res = await fetch('/api/templates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) });
    const body = await res.json();
    if (!res.ok) return setMsg({ text: body.error, error: true });
    setMsg({ text: t('docs.templateSaved', { v: body.version }) });
    router.refresh();
  }
  return (
    <details>
      <summary className="summary-title">{t('docs.editTemplate', { v: template.version })}</summary>
      <div className="stack">
        {fields.map(([k, label]) => (
          <label key={k}>{t(label)}<input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></label>
        ))}
        <button type="button" className="secondary" onClick={save}>{t('docs.saveTemplate')}</button>
        {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
      </div>
    </details>
  );
}
