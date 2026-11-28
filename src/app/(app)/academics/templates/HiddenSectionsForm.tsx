'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/I18nProvider';
import type { MsgKey } from '@/lib/i18n/catalog';

const ITEMS = ['rank', 'gpa', 'rank_grade', 'period_attendance'] as const;

/** 115차: 우리 학교가 숨길 구획(학교 사본). 템플릿을 처음 고를 때 복사되고, 여기서 학교가 고친다 */
export function HiddenSectionsForm({ current, baseVersion }: { current: string[]; baseVersion: number }) {
  const router = useRouter();
  const { t } = useI18n();
  const [picked, setPicked] = useState<string[]>(current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const toggle = (k: string) => setPicked((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k]));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/academics', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'hidden-sections', sections: picked, base_version: baseVersion }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) router.refresh();
        setMsg({ text: data.error ?? t('academics.saveFailed'), error: true });
        return;
      }
      setMsg({ text: t('atpl.hiddenSaved') });
      router.refresh();
    } catch {
      setMsg({ text: t('academics.saveFailed'), error: true });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="action-form" onSubmit={save} data-testid="hidden-sections-form">
      <fieldset>
        <legend className="sr-only">{t('atpl.ourHidden')}</legend>
        {ITEMS.map((k) => (
          <label key={k} className="check"><input type="checkbox" checked={picked.includes(k)} onChange={() => toggle(k)} data-testid={`hide-${k}`} />
            <span>{t(`atpl.hide.${k}` as MsgKey)}</span></label>
        ))}
      </fieldset>
      <p className="fine">{t('atpl.ourHiddenLead')}</p>
      <div className="form-actions"><button type="submit" className="btn btn-secondary" disabled={busy}>{t('atpl.saveHidden')}</button></div>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
    </form>
  );
}
