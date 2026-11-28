'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/I18nProvider';
import { useConfirm } from '@/components/ConfirmDialog';

/**
 * 125차: 템플릿 새 판 제안 결정(학교 관리자). 수락은 확인 창에서 '바뀌는 것 / 안 바뀌는 것 / 되돌리기'를 본 뒤
 * 새 판을 적용하고 기록한다. 보류·거절은 기록만 한다(학교 사본은 그대로). base_version = 지금 학교 관할 판(지침 10).
 */
export function OfferActions({ title, from, to, baseVersion, canAccept, status }: {
  title: string; from: number; to: number; baseVersion: number; canAccept: boolean; status: string;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [ask, dialog] = useConfirm();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  async function decide(decision: 'accepted' | 'held' | 'declined') {
    if (decision === 'accepted') {
      const ok = await ask({
        title: t('tplOffer.confirmTitle', { name: title, from, to }),
        description: (
          <span className="tpl-confirm">
            <span><strong>{t('atpl.changes')}</strong> {t('tplOffer.changesBody')}</span>
            <span><strong>{t('atpl.keeps')}</strong> {t('atpl.keepsBody')}</span>
            <span><strong>{t('atpl.undo')}</strong> {t('atpl.undoBody')}</span>
          </span>
        ),
        confirmLabel: t('tplOffer.accept'), tone: 'primary',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/academics', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'template-offer', to_version: to, decision, note, base_version: baseVersion }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) router.refresh();
        setMsg({ text: data.error ?? t('academics.saveFailed'), error: true });
        return;
      }
      setMsg({ text: t(`tplOffer.done.${decision}`) });
      router.refresh();
    } catch {
      setMsg({ text: t('academics.saveFailed'), error: true });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack" data-testid={`tpl-offer-actions-${to}`}>
      <label className="field">
        <span className="field-label">{t('settings.memoOptional')}</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} data-testid={`tpl-offer-note-${to}`} />
      </label>
      <div className="form-actions">
        {canAccept && <button type="button" className="btn btn-primary" onClick={() => decide('accepted')} disabled={busy} data-testid={`tpl-offer-accept-${to}`}>{t('tplOffer.accept')}</button>}
        {status !== 'held' && <button type="button" className="btn btn-secondary" onClick={() => decide('held')} disabled={busy} data-testid={`tpl-offer-hold-${to}`}>{t('offer.status.held')}</button>}
        {status !== 'declined' && <button type="button" className="btn btn-ghost" onClick={() => decide('declined')} disabled={busy} data-testid={`tpl-offer-decline-${to}`}>{t('offer.status.declined')}</button>}
      </div>
      {msg && <p className={msg.error ? 'alert' : 'notice'} role="status">{msg.text}</p>}
      {dialog}
    </div>
  );
}
