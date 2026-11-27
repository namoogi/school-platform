'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/I18nProvider';
import { useConfirm } from '@/components/ConfirmDialog';

/** 111차 ADR 0043: 템플릿 적용. 확인 창에 '바뀌는 것 / 안 바뀌는 것 / 되돌리기'를 보여 준 뒤 학교 사본을 만든다 */
export function ApplyTemplate({ templateKey, title, baseVersion, current }: { templateKey: string; title: string; baseVersion: number; current: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  const [ask, dialog] = useConfirm();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function apply() {
    const ok = await ask({
      title: t('atpl.confirmTitle', { name: title }),
      description: (
        <ul className="tpl-confirm">
          <li><strong>{t('atpl.changes')}</strong> {t('atpl.changesBody')}</li>
          <li><strong>{t('atpl.keeps')}</strong> {t('atpl.keepsBody')}</li>
          <li><strong>{t('atpl.undo')}</strong> {t('atpl.undoBody')}</li>
        </ul>
      ),
      confirmLabel: t('atpl.apply'), tone: 'primary',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch('/api/academics', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'template', key: templateKey, base_version: baseVersion }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) router.refresh();
        setMsg({ text: data.error ?? t('academics.saveFailed'), error: true });
        return;
      }
      setMsg({ text: t('atpl.applied', { levels: data.made.levels, grades: data.made.grades, periods: data.made.periods, scales: data.made.scales.length }) });
      router.refresh();
    } catch {
      setMsg({ text: t('academics.saveFailed'), error: true });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <button type="button" className={current ? 'btn btn-secondary' : 'btn btn-primary'} onClick={apply} disabled={busy} data-testid={`tpl-apply-${templateKey}`}>
        {current ? t('atpl.reapply') : t('atpl.choose')}
      </button>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
      {dialog}
    </div>
  );
}
