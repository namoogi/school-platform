'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SourceFile } from '@/lib/services';
import { FileDrop, type FileDropContext } from '@/components/FileDrop';
import { uploadWithProgress } from '@/lib/file-check';
import { useConfirm } from '@/components/ConfirmDialog';
import { useI18n } from '@/components/I18nProvider';

// 이름은 사전의 intake.status.<상태>
const TONE: Record<SourceFile['status'], string> = { parsed: 'green', registered: 'amber', pending_reader: 'amber' };

export function IntakeClient({ sources }: { sources: SourceFile[] }) {
  const router = useRouter();
  const { t } = useI18n();
  const [ask, confirmDialog] = useConfirm();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [urls, setUrls] = useState<string[]>(['']);

  async function upload(list: File[], { signal, progress }: FileDropContext) {
    const fd = new FormData();
    list.forEach((f) => fd.append('files', f));
    setMessage(null);
    const res = await uploadWithProgress('/api/sources', fd, { signal, onProgress: progress });
    const body = res.body as { error?: string; analysis?: { state?: string } };
    if (!res.ok) throw new Error(body.error ?? t('intake.uploadFailed'));
    const state = body.analysis?.state;
    const note =
      state === 'question_opened' ? ` ${t('intake.analysis.question')}`
      : state === 'matches_confirmed_rule' ? ` ${t('intake.analysis.matches')}`
      : '';
    router.refresh();
    return `${t('intake.added', { n: list.length })}${note}`;
  }

  async function registerSheets() {
    setBusy(true);
    const res = await fetch('/api/sources/sheets', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ urls }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setMessage({ text: body.error, error: true });
    setMessage({ text: t('intake.sheetsAdded', { n: body.added.length }) });
    setUrls(['']);
    router.refresh();
  }

  async function archive(id: string, name: string) {
    if (!(await ask({ title: t('intake.archiveTitle'), description: t('intake.archiveBody', { name }), confirmLabel: t('intake.archive') }))) return;
    const res = await fetch(`/api/sources/${id}/archive`, { method: 'POST' });
    const body = await res.json();
    if (!res.ok) return setMessage({ text: body.error, error: true });
    setMessage({ text: t('intake.archived') });
    router.refresh();
  }

  return (
    <div className="intake-grid">
      {confirmDialog}
      <section className="card">
        <h2>{t('intake.addTitle')}</h2>
        <p className="muted">{t('intake.addLead')}</p>
        <h3 className="section-title">{t('intake.fileSection')}</h3>
        <FileDrop
          label={t('intake.fileLabel')} multiple maxFiles={20} maxSize={2 * 1024 * 1024}
          accept={['.csv', '.tsv', '.txt', '.pdf', '.xlsx', '.docx']} typeLabel="CSV·TSV·TXT·XLSX·DOCX·PDF"
          hint={t('intake.fileHint')}
          testId="dropzone" inputTestId="file-input" disabled={busy} onFiles={upload}
        />
        <p className="fine">{t('intake.readNote')}</p>

        <h3 className="section-title">{t('intake.sheetSection')}</h3>
        {urls.map((u, i) => (
          <label key={i}>{t('intake.sheetLabel', { n: i + 1 })}
            <input type="url" value={u} placeholder="https://docs.google.com/spreadsheets/d/…"
              onChange={(e) => setUrls(urls.map((x, j) => (j === i ? e.target.value : x)))} />
          </label>
        ))}
        <div className="row">
          <button type="button" className="secondary" onClick={() => setUrls([...urls, ''])} disabled={urls.length >= 10}>{t('intake.addUrl')}</button>
          <button type="button" className="primary" onClick={registerSheets} disabled={busy || !urls.some((u) => u.trim())}>{t('intake.registerSheets')}</button>
        </div>
        <p className="fine">{t('intake.sheetNote')}</p>
        {message && <p className={message.error ? 'alert' : 'notice'} role="status">{message.text}</p>}
      </section>

      <section className="card">
        <div className="between"><h2>{t('intake.listTitle')}</h2><span className="tag">{t('common.countN', { n: sources.length })}</span></div>
        {sources.length === 0 && <p className="muted empty">{t('intake.empty')}</p>}
        <ul className="sources" data-testid="source-list">
          {sources.map((s) => (
            <li key={s.id}>
              <div>
                <strong>{s.name}</strong>
                <span className="tags">
                  <span className={`tag ${TONE[s.status]}`}>{t(`intake.status.${s.status}`)}</span>
                  {s.needs_review && <span className="tag amber" title={t('intake.accuracyTitle')}>{t('intake.accuracy')}</span>}
                </span>
                <small className="muted">
                  {s.status_note ?? (s.status === 'parsed' ? t('intake.rowCount', { n: s.row_count }) : '')}
                  {s.sha256 && <> · <code title={s.sha256}>{s.sha256.slice(0, 8)}</code></>}
                </small>
              </div>
              <button type="button" className="link-button" onClick={() => archive(s.id, s.name)}>{t('intake.archive')}</button>
            </li>
          ))}
        </ul>
        <a className="button primary" href="/review">{t('intake.toReview')}</a>
        <p className="fine">{t('intake.appendNote')}</p>
      </section>
    </div>
  );
}
