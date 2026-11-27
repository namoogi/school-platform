'use client';
import { Field } from '@/components/Field';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/I18nProvider';

/** 71차: 학기 구조 직접 정하기 — 한 줄에 '열쇠 이름'(예: s1 1학기). 근거 필수, 새 판으로 쌓인다 */
export function RuleForm({ baseVersion, current }: { baseVersion: number; current: { id: string; label: string }[] }) {
  const router = useRouter();
  const { t } = useI18n();
  const [lines, setLines] = useState(current.map((p) => `${p.id} ${p.label}`).join('\n') || t('academics.defaultTerms'));
  const [why, setWhy] = useState('');
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const periods = lines.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [id, ...rest] = l.split(/\s+/);
      return { id, label: rest.join(' ') || id, assessments: [] };
    });
    const res = await fetch('/api/academics', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'rule', periods, rationale: why, base_version: baseVersion }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg({ text: data.error ?? t('academics.saveFailed'), error: true });
    setMsg({ text: t('academics.ruleSaved', { v: data.version }) }); setWhy(''); router.refresh();
  }
  return (
    <form className="action-form" onSubmit={save} data-testid="rule-form">
      <Field label={t('academics.termsLabel')} required><textarea rows={4} value={lines} onChange={(e) => setLines(e.target.value)} /></Field>
      <Field label={t('academics.reason')} required><input value={why} onChange={(e) => setWhy(e.target.value)} placeholder={t('academics.reasonPlaceholder')} /></Field>
      <div className="form-actions"><button type="submit" className="btn btn-primary">{baseVersion ? t('academics.saveNewVersion') : t('academics.setStructure')}</button></div>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
    </form>
  );
}
