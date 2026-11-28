'use client';
import { useCallback, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import s from '../ConfirmDialog.module.css';
import p from './PhotoConsent.module.css';
import { useI18n } from '@/components/I18nProvider';

/**
 * 122차 (사용자 지시 2026-11-28): 공개 창 — 사진 공개 허가 확인.
 * 공개하려는 판에 사진이 있으면 사진 목록을 보이고, '허가를 확인했습니다'를 골라야 공개한다.
 * 서버(publish·bulk-publish)도 같은 확인을 요구하고, 확인 시각·사진 목록을 공개 기록에 남긴다.
 *
 * const [askConsent, consentDialog] = usePhotoConsent();
 * const c = await askConsent([{ entryId }]);   // null = 취소, { photo_consent } = 공개 요청에 그대로 붙인다
 */
export type ConsentTarget = { entryId: string; versionId?: string };
type Photo = { id: string; name: string };
type Answer = { photo_consent: boolean } | null;
export class PublishCancelled extends Error {}

const SHOW = 24;

export function usePhotoConsent(): [(targets: ConsentTarget[]) => Promise<Answer>, React.ReactNode] {
  const { t } = useI18n();
  const [state, setState] = useState<{ photos: Photo[]; resolve: (a: Answer) => void; from: HTMLElement | null } | null>(null);
  const [checked, setChecked] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const ask = useCallback(async (targets: ConsentTarget[]): Promise<Answer> => {
    const res = await fetch('/api/site/photos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ targets }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? t('site.consent.loadFailed'));
    const photos = (data.photos ?? []) as Photo[];
    if (!photos.length) return { photo_consent: false }; // 사진이 없으면 창 없이 공개
    const from = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setChecked(false);
    return new Promise<Answer>((resolve) => setState({ photos, resolve, from }));
  }, [t]);

  const answer = (a: Answer) => {
    const from = state?.from;
    state?.resolve(a); setState(null);
    if (from) requestAnimationFrame(() => { if (from.isConnected) from.focus(); });
  };
  const container = typeof document !== 'undefined'
    ? (state?.from?.closest<HTMLElement>('.app') ?? document.querySelector<HTMLElement>('.app') ?? undefined) : undefined;
  const photos = state?.photos ?? [];
  const dialog = (
    <Dialog.Root open={!!state} onOpenChange={(o) => { if (!o) answer(null); }}>
      <Dialog.Portal container={container}>
        <Dialog.Overlay className={s.overlay} />
        <Dialog.Content className={`${s.dialog} ${p.wide}`} data-testid="photo-consent-dialog"
          onOpenAutoFocus={(e) => { e.preventDefault(); cancelRef.current?.focus(); }}
          onCloseAutoFocus={(e) => e.preventDefault()}>
          <Dialog.Title className={s.title}>{t('site.consent.title')}</Dialog.Title>
          <Dialog.Description className={s.desc}>{t('site.consent.body', { n: photos.length })}</Dialog.Description>
          <ul className={p.grid} aria-label={t('site.consent.photos')}>
            {photos.slice(0, SHOW).map((ph) => (
              <li key={ph.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/site/assets/${ph.id}`} alt="" loading="lazy" /><span>{ph.name}</span>
              </li>
            ))}
          </ul>
          {photos.length > SHOW && <p className="fine">{t('site.consent.more', { n: photos.length - SHOW })}</p>}
          <label className={p.check}>
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} data-testid="photo-consent-check" />
            <span>{t('site.consent.check')}</span>
          </label>
          <p className="fine">{t('site.consent.record')}</p>
          <div className={s.actions}>
            <button ref={cancelRef} type="button" className="btn btn-secondary" onClick={() => answer(null)}>{t('common.cancel')}</button>
            <button type="button" className="btn btn-primary" disabled={!checked} onClick={() => answer({ photo_consent: true })} data-testid="photo-consent-confirm">
              {t('site.consent.confirm')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
  return [ask, dialog];
}
