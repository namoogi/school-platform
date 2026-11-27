'use client';
import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { PublishOutcome, PublishSelection } from '@/lib/site-bulk-publish';
import { useI18n } from '@/components/I18nProvider';

type Candidate = PublishSelection & { title: string };

export function BulkPublishControl({ candidates }: { candidates: Candidate[] }) {
  const router = useRouter();
  const { t } = useI18n();
  const panelId = useId();
  const [review, setReview] = useState<Candidate[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const disabled = busy || refreshing;

  function openReview() {
    const batch = candidates.slice(0, 100);
    setReview(batch); setSelected(batch.map((item) => item.id)); setMessage(''); setProblems([]);
  }
  async function publish() {
    if (disabled || !review || !selected.length) return;
    setBusy(true); setMessage(''); setProblems([]);
    try {
      const items = review.filter((item) => selected.includes(item.id));
      const response = await fetch('/api/site/entries/bulk-publish', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: items.map(({ id, base_version, live_version }) => ({ id, base_version, live_version })) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? t('site.bulk.failed'));
      const results = data.results as PublishOutcome[];
      setMessage(t('site.bulk.result', { published: results.filter((r) => r.status === 'published').length, unchanged: results.filter((r) => r.status === 'unchanged').length, skipped: results.filter((r) => r.status === 'skipped').length }));
      setProblems(results.filter((r) => r.status === 'skipped').map((r) => `${items.find((item) => item.id === r.id)?.title ?? t('site.bulk.storyFallback')}: ${r.reason}`));
    } catch (error) {
      setMessage(`${error instanceof Error ? error.message : t('site.bulk.unknownResult')} ${t('site.bulk.reloading')}`);
    } finally {
      // 응답을 잃어도 같은 선택으로 재전송하지 않고 서버의 공개 상태를 다시 읽는다.
      setReview(null); setSelected([]); setBusy(false); startTransition(() => router.refresh());
    }
  }

  return <div className="site-bulk-publish" data-testid="bulk-publish-control">
    <button type="button" className="btn btn-secondary btn-sm" aria-expanded={review !== null} aria-controls={panelId}
      disabled={disabled || (!review && !candidates.length)} onClick={() => review ? setReview(null) : openReview()}>
      {review ? t('site.bulk.collapse') : t('site.bulk.open', { n: candidates.length })}
    </button>
    {review && <section id={panelId} aria-label={t('site.bulk.panelAria')} className="site-bulk-review">
      <p className="fine">{t('site.bulk.lead')}</p>
      {candidates.length > 100 && <p className="fine">{t('site.bulk.limit')}</p>}
      <label className="site-bulk-choice"><input type="checkbox" checked={selected.length === review.length} disabled={disabled}
        onChange={(e) => setSelected(e.target.checked ? review.map((item) => item.id) : [])} /> {t('site.bulk.selectAll', { selected: selected.length, total: review.length })}</label>
      <div className="site-bulk-options">
        {review.map((item) => <label key={item.id} className="site-bulk-choice">
          <input type="checkbox" checked={selected.includes(item.id)} disabled={disabled}
            onChange={(e) => setSelected((ids) => e.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id))} />
          <span>{item.title}<small>{item.live_version === null ? t('site.bulk.firstPublish') : t('site.bulk.liveVersion', { v: item.live_version })} → {t('common.version', { v: item.base_version })}</small></span>
        </label>)}
      </div>
      <div className="row-wrap">
        <button type="button" className="btn btn-primary btn-sm" disabled={disabled || !selected.length} onClick={publish}>{busy ? t('site.bulk.publishing') : t('site.bulk.publishSelected', { n: selected.length })}</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={() => setReview(null)}>{t('common.cancel')}</button>
      </div>
    </section>}
    <div role="status" aria-live="polite">
      {message && <p className="banner">{message}</p>}
      {problems.length > 0 && <ul className="site-bulk-problems">{problems.map((problem, i) => <li key={i}>{problem}</li>)}</ul>}
    </div>
  </div>;
}
