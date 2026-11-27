'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/I18nProvider';
import { useConfirm } from '@/components/ConfirmDialog';

/** 111차 ADR 0043: 템플릿 적용. 확인 창에 '바뀌는 것 / 안 바뀌는 것 / 되돌리기'를 보여 준 뒤 학교 사본을 만든다 */
export function ApplyTemplate({ templateKey, templateVersion, title, baseVersion, mode }: { templateKey: string; templateVersion: number; title: string; baseVersion: number; mode: 'choose' | 'reapply' | 'update' }) {
  const router = useRouter();
  const { t } = useI18n();
  const [ask, dialog] = useConfirm();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function apply() {
    const ok = await ask({
      title: mode === 'update' ? t('atpl.confirmUpdate', { name: title }) : t('atpl.confirmTitle', { name: title }),
      description: (
        // 확인 창 설명은 <p> 안에 들어가므로 목록 대신 줄 단위 span(블록 표시)으로 쓴다
        <span className="tpl-confirm">
          <span><strong>{t('atpl.changes')}</strong> {t('atpl.changesBody')}</span>
          <span><strong>{t('atpl.keeps')}</strong> {t('atpl.keepsBody')}</span>
          <span><strong>{t('atpl.undo')}</strong> {t('atpl.undoBody')}</span>
        </span>
      ),
      confirmLabel: t('atpl.apply'), tone: 'primary',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch('/api/academics', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'template', key: templateKey, version: templateVersion, base_version: baseVersion }) });
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
      <button type="button" className={mode === 'reapply' ? 'btn btn-secondary' : 'btn btn-primary'} onClick={apply} disabled={busy} data-testid={`tpl-apply-${templateKey}`}>
        {mode === 'reapply' ? t('atpl.reapply') : mode === 'update' ? t('atpl.update') : t('atpl.choose')}
      </button>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
      {dialog}
    </div>
  );
}
