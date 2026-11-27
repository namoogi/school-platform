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

export function ConfirmDialog({ open, options, onAnswer, returnFocus }: {
  open: boolean; options: ConfirmOptions | null; onAnswer: (ok: boolean) => void;
  /** 닫은 뒤 포커스를 돌려줄 요소(보통 대화상자를 연 버튼). Dialog.Trigger를 쓰지 않으므로 직접 돌려준다 */
  returnFocus?: HTMLElement | null;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  if (!options) return null;
  const { title, description, confirmLabel, cancelLabel = '취소', tone = 'danger' } = options;
  // 화면 형식·명암 토큰(data-ui·data-mode)은 .app에 걸려 있다. body로 띄우면 :root의 밝은 기본 토큰을 받으므로
  // 연 버튼이 속한 .app(없으면 첫 .app) 안에 띄워 지금 테마를 그대로 쓴다(85차, Codex P2)
  const container = returnFocus?.closest<HTMLElement>('.app') ?? (typeof document !== 'undefined' ? document.querySelector<HTMLElement>('.app') : null) ?? undefined;
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onAnswer(false); }}>
      <Dialog.Portal container={container}>
        <Dialog.Overlay className={s.overlay} />
        <Dialog.Content className={s.dialog} role="alertdialog" data-testid="confirm-dialog"
          onOpenAutoFocus={(e) => { e.preventDefault(); cancelRef.current?.focus(); }}
          onCloseAutoFocus={(e) => { e.preventDefault(); returnFocus?.focus(); }}>
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
  const [state, setState] = useState<{ options: ConfirmOptions; resolve: (ok: boolean) => void; from: HTMLElement | null } | null>(null);
  const ask = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) =>
    setState({ options, resolve, from: document.activeElement instanceof HTMLElement ? document.activeElement : null })), []);
  const dialog = (
    <ConfirmDialog open={!!state} options={state?.options ?? null} returnFocus={state?.from}
      onAnswer={(ok) => {
        const from = state?.from;
        state?.resolve(ok); setState(null);
        // 대화상자가 바로 사라지므로(닫힘 효과 없음) 다음 화면 그리기 뒤에 포커스를 돌려준다
        if (from) requestAnimationFrame(() => { if (from.isConnected) from.focus(); });
      }} />
  );
  return [ask, dialog];
}
