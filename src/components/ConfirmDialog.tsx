'use client';
import { useCallback, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import s from './ConfirmDialog.module.css';

/**
 * 확인 대화상자 (DESIGN-SYSTEM.md: danger 버튼은 확인 대화상자 안에서만).
 * 브라우저 confirm() 대신 쓴다. Radix Dialog가 포커스를 대화상자 안에 가두고, Esc·바깥 누르기로 닫으며,
 * 닫으면 연 버튼으로 포커스를 돌려준다. 되돌릴 수 없는 일이 기본 선택이 되지 않게 처음 포커스는 '취소'에 둔다.
 */
export type ConfirmOptions = {
  title: string;
  /** 무엇이 어떻게 되는지(되돌릴 수 있는지) 한두 문장 */
  description: React.ReactNode;
  /** 동사 + 대상 (예: "구성원 빼기") */
  confirmLabel: string;
  cancelLabel?: string;
  /** danger: 되돌리기 어려운 일, primary: 일반 확인 */
  tone?: 'danger' | 'primary';
};

export function ConfirmDialog({ open, options, onAnswer }: {
  open: boolean; options: ConfirmOptions | null; onAnswer: (ok: boolean) => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  if (!options) return null;
  const { title, description, confirmLabel, cancelLabel = '취소', tone = 'danger' } = options;
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onAnswer(false); }}>
      <Dialog.Portal>
        <Dialog.Overlay className={s.overlay} />
        <Dialog.Content className={s.dialog} role="alertdialog" data-testid="confirm-dialog"
          onOpenAutoFocus={(e) => { e.preventDefault(); cancelRef.current?.focus(); }}>
          <Dialog.Title className={s.title}>{title}</Dialog.Title>
          <Dialog.Description className={s.desc}>{description}</Dialog.Description>
          <div className={s.actions}>
            <button ref={cancelRef} type="button" className="btn btn-secondary" onClick={() => onAnswer(false)}>{cancelLabel}</button>
            <button type="button" className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`} onClick={() => onAnswer(true)}>{confirmLabel}</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * confirm() 자리에 바로 쓰는 훅. `if (!(await ask({...}))) return;`
 * 반환한 dialog 요소를 컴포넌트 안에 함께 그린다.
 */
export function useConfirm(): [(o: ConfirmOptions) => Promise<boolean>, React.ReactNode] {
  const [state, setState] = useState<{ options: ConfirmOptions; resolve: (ok: boolean) => void } | null>(null);
  const ask = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ options, resolve })), []);
  const dialog = (
    <ConfirmDialog open={!!state} options={state?.options ?? null}
      onAnswer={(ok) => { state?.resolve(ok); setState(null); }} />
  );
  return [ask, dialog];
}
