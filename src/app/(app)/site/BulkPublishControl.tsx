'use client';
import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { PublishOutcome, PublishSelection } from '@/lib/site-bulk-publish';

type Candidate = PublishSelection & { title: string };

export function BulkPublishControl({ candidates }: { candidates: Candidate[] }) {
  const router = useRouter();
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
      if (!response.ok) throw new Error(data.error ?? '일괄 공개하지 못했습니다.');
      const results = data.results as PublishOutcome[];
      setMessage(`공개 ${results.filter((r) => r.status === 'published').length}편 · 이미 최신 판 공개 ${results.filter((r) => r.status === 'unchanged').length}편 · 확인 필요 ${results.filter((r) => r.status === 'skipped').length}편`);
      setProblems(results.filter((r) => r.status === 'skipped').map((r) => `${items.find((item) => item.id === r.id)?.title ?? '동화'}: ${r.reason}`));
    } catch (error) {
      setMessage(`${error instanceof Error ? error.message : '일괄 공개 결과를 확인하지 못했습니다.'} 목록을 새로 불러옵니다. 공개 상태를 확인한 뒤 다시 선택해 주세요.`);
    } finally {
      // 응답을 잃어도 같은 선택으로 재전송하지 않고 서버의 공개 상태를 다시 읽는다.
      setReview(null); setSelected([]); setBusy(false); startTransition(() => router.refresh());
    }
  }

  return <div className="site-bulk-publish" data-testid="bulk-publish-control">
    <button type="button" className="btn btn-secondary btn-sm" aria-expanded={review !== null} aria-controls={panelId}
      disabled={disabled || (!review && !candidates.length)} onClick={() => review ? setReview(null) : openReview()}>
      {review ? '선택 접기' : `새 판 일괄 공개 (${candidates.length})`}
    </button>
    {review && <section id={panelId} aria-label="공개할 동화 선택" className="site-bulk-review">
      <p className="fine">선택한 판의 글과 그림, 모든 언어 번역이 방문자에게 공개됩니다. 공개 내림·보관 항목은 제외합니다.</p>
      {candidates.length > 100 && <p className="fine">한 번에 100편까지 공개합니다. 나머지는 다음에 선택해 주세요.</p>}
      <label className="site-bulk-choice"><input type="checkbox" checked={selected.length === review.length} disabled={disabled}
        onChange={(e) => setSelected(e.target.checked ? review.map((item) => item.id) : [])} /> 전체 선택 ({selected.length}/{review.length})</label>
      <div className="site-bulk-options">
        {review.map((item) => <label key={item.id} className="site-bulk-choice">
          <input type="checkbox" checked={selected.includes(item.id)} disabled={disabled}
            onChange={(e) => setSelected((ids) => e.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id))} />
          <span>{item.title}<small>{item.live_version === null ? '첫 공개' : `${item.live_version}판 공개 중`} → {item.base_version}판</small></span>
        </label>)}
      </div>
      <div className="row-wrap">
        <button type="button" className="btn btn-primary btn-sm" disabled={disabled || !selected.length} onClick={publish}>{busy ? '공개하는 중…' : `선택한 ${selected.length}편 공개`}</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={() => setReview(null)}>취소</button>
      </div>
    </section>}
    <div role="status" aria-live="polite">
      {message && <p className="banner">{message}</p>}
      {problems.length > 0 && <ul className="site-bulk-problems">{problems.map((problem, i) => <li key={i}>{problem}</li>)}</ul>}
    </div>
  </div>;
}
