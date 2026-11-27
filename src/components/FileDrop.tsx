'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Upload, X, FileText, Check, AlertCircle } from 'lucide-react';
import { UPLOAD_NETWORK_ERROR, acceptAttr, checkFiles, describeAccept, formatSize, type FileRules } from '@/lib/file-check';
import { useI18n } from './I18nProvider';

/**
 * 파일 첨부 공통 부품: 끌어 놓기 · 눌러 고르기(Enter/Space) · 붙여넣기 · 형식·크기 검사 · 진행·취소 · 그림 미리보기.
 * 규칙: docs/design/DESIGN-SYSTEM.md '입력·파일 첨부'. 새 파일 첨부는 모두 이 부품을 쓴다.
 *
 * onFiles는 검사를 통과한 파일을 받아 올린다. ctx.signal을 fetch/uploadWithProgress에 넘기면 '취소'가 동작하고,
 * ctx.progress(0~1)를 부르면 진행 막대가 숫자로 바뀐다(부르지 않으면 '올리는 중' 막대만). 던진 오류의 message를 그대로 보여 준다.
 */
export type FileDropContext = { signal: AbortSignal; progress: (ratio: number) => void };

type Item = { key: string; name: string; size: number; preview?: string; state: 'busy' | 'done' | 'error' };

export function FileDrop({
  label, hint, accept, maxSize, maxFiles, multiple = false, typeLabel, disabled = false, compact = false,
  buttonLabel, onFiles, inputTestId, testId, doneText,
}: FileRules & {
  label: string;
  hint?: React.ReactNode;
  disabled?: boolean;
  /** 좁은 자리(블록 카드 안 등)용 한 줄 모양 */
  compact?: boolean;
  buttonLabel?: string;
  onFiles: (files: File[], ctx: FileDropContext) => Promise<void | string>;
  inputTestId?: string;
  testId?: string;
  /** 끝났을 때 문구(onFiles가 문자열을 돌려주면 그것을 쓴다) */
  doneText?: string;
}) {
  const { t } = useI18n();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const ctrl = useRef<AbortController | null>(null);
  const [over, setOver] = useState(false);
  const [ready, setReady] = useState(false); // 수화 뒤 표시(시험이 기다리는 신호)
  useEffect(() => setReady(true), []);
  const [busy, setBusy] = useState(false);
  const [ratio, setRatio] = useState<number | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const rules: FileRules = { accept, maxSize, maxFiles, multiple, typeLabel };
  const kinds = typeLabel ?? (accept?.length ? describeAccept(accept, t) : null);
  const limits = [kinds, maxSize ? t('file.upTo', { size: formatSize(maxSize, t) }) : null, multiple ? (maxFiles ? t('file.maxPerBatch', { n: maxFiles }) : t('file.multiple')) : null]
    .filter(Boolean).join(' · ');
  const off = disabled || busy;

  // 미리보기 주소 정리: 새로 고를 때와 화면을 떠날 때
  const previews = useRef<string[]>([]);
  const dropPreviews = () => { previews.current.forEach((u) => URL.revokeObjectURL(u)); previews.current = []; };
  useEffect(() => dropPreviews, []);

  async function take(list: File[]) {
    if (off || list.length === 0) return;
    const { accepted, errors: errs } = checkFiles(list, rules, t);
    setErrors(errs);
    if (accepted.length === 0) {
      setStatus(t('file.rejectedAll', { errors: errs.join(' ') }));
      return;
    }
    const next: Item[] = accepted.map((f, i) => ({
      key: `${Date.now()}-${i}`, name: f.name, size: f.size, state: 'busy',
      preview: f.type.startsWith('image/') && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(f) : undefined,
    }));
    dropPreviews();
    previews.current = next.flatMap((x) => (x.preview ? [x.preview] : []));
    setItems(next);
    setBusy(true); setRatio(null);
    setStatus(t('file.uploadingN', { n: accepted.length }));
    const c = new AbortController(); ctrl.current = c;
    try {
      const result = await onFiles(accepted, { signal: c.signal, progress: (r) => setRatio(Math.max(0, Math.min(1, r))) });
      setItems((xs) => xs.map((x) => ({ ...x, state: 'done' })));
      setStatus(typeof result === 'string' ? result : (doneText ?? t('file.uploadedN', { n: accepted.length })));
    } catch (e) {
      const aborted = (e as Error)?.name === 'AbortError';
      setItems((xs) => xs.map((x) => ({ ...x, state: 'error' })));
      const msg = aborted ? t('file.cancelled') : (e as Error)?.name === UPLOAD_NETWORK_ERROR ? t('file.err.network') : ((e as Error)?.message || t('file.failed'));
      if (!aborted) setErrors((xs) => [...xs, msg]);
      setStatus(msg);
    } finally {
      setBusy(false); setRatio(null); ctrl.current = null;
      if (input.current) input.current.value = '';
    }
  }

  const hintId = `${id}-hint`;
  const statusId = `${id}-status`;
  return (
    <div className={`file-drop${compact ? ' file-drop-compact' : ''}`}>
      <span className="file-drop-label" id={`${id}-label`}>{label}</span>
      <div
        className="file-drop-zone"
        data-over={over || undefined}
        data-disabled={off || undefined}
        data-testid={testId}
        data-ready={ready || undefined}
        onClick={(e) => { if (!off && e.target === e.currentTarget) input.current?.click(); }}
        onDragEnter={(e) => { e.preventDefault(); depth.current += 1; if (!off) setOver(true); }}
        onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = off ? 'none' : 'copy'; }}
        onDragLeave={() => { depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) setOver(false); }}
        onDrop={(e) => { e.preventDefault(); depth.current = 0; setOver(false); take(Array.from(e.dataTransfer?.files ?? [])); }}
        onPaste={(e) => { const fs = Array.from(e.clipboardData?.files ?? []); if (fs.length) { e.preventDefault(); take(fs); } }}
      >
        <Upload className="file-drop-icon" size={compact ? 18 : 24} aria-hidden="true" />
        <div className="file-drop-text" aria-hidden="true">
          <strong>{over ? t('file.dropHere') : compact ? t('file.dragShort') : t('file.dragLong')}</strong>
          {!compact && <span>{t('file.pasteOk')}</span>}
        </div>
        <button
          type="button" className="btn btn-secondary btn-sm file-drop-button" disabled={off}
          aria-labelledby={`${id}-label ${id}-btn`} aria-describedby={`${hintId} ${statusId}`}
          onClick={() => input.current?.click()}
        ><span id={`${id}-btn`}>{buttonLabel ?? (multiple ? t('file.choose') : t('file.chooseOne'))}</span></button>
        <input
          ref={input} type="file" hidden tabIndex={-1} multiple={multiple} accept={acceptAttr(accept)} disabled={off}
          data-testid={inputTestId} onChange={(e) => take(Array.from(e.target.files ?? []))}
        />
      </div>
      <p className="file-drop-hint" id={hintId}>{limits}{hint ? <>{limits ? ' · ' : ''}{hint}</> : null}</p>

      {busy && (
        <div className="file-drop-progress">
          <div className="progress" role="progressbar" aria-label={t('file.uploadingLabel', { label })}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={ratio === null ? undefined : Math.round(ratio * 100)}
            data-indeterminate={ratio === null || undefined}>
            <div className="progress-fill" style={ratio === null ? undefined : { width: `${ratio * 100}%` }} />
          </div>
          <span className="fine num">{ratio === null ? t('file.uploading') : `${Math.round(ratio * 100)}%`}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => ctrl.current?.abort()}>
            <X size={14} aria-hidden="true" /> {t('common.cancel')}
          </button>
        </div>
      )}

      {items.length > 0 && (
        <ul className="file-drop-list" aria-label={t('file.list')}>
          {items.map((it) => (
            <li key={it.key} data-state={it.state}>
              {it.preview ? <img src={it.preview} alt="" className="file-drop-thumb" /> : <FileText size={18} aria-hidden="true" className="file-drop-thumb-icon" />}
              <span className="file-drop-name">{it.name}</span>
              <span className="fine num">{formatSize(it.size, t)}</span>
              <span className="file-drop-state">
                {it.state === 'done' && <><Check size={14} aria-hidden="true" /> {t('file.state.done')}</>}
                {it.state === 'error' && <><AlertCircle size={14} aria-hidden="true" /> {t('file.state.error')}</>}
                {it.state === 'busy' && t('file.state.busy')}
              </span>
            </li>
          ))}
        </ul>
      )}

      {errors.length > 0 && (
        <ul className="field-error file-drop-errors" data-testid={testId ? `${testId}-errors` : undefined}>
          {errors.map((e, i) => <li key={i}><AlertCircle size={14} aria-hidden="true" /> <span className="sr-only">{t('file.errorPrefix')}</span>{e}</li>)}
        </ul>
      )}
      <p className="sr-only" id={statusId} role="status" aria-live="polite">{status}</p>
    </div>
  );
}
