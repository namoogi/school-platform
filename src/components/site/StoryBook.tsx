'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** 그림책 넘김 보기: 쪽 그림 + 글. ← → 키, 단추, 쪽 번호. 그림 안의 글자와 별도로 선택 언어의 이야기를 항상 그림 아래에 보여 준다. */
export function StoryBook({ pages, labels }: { pages: { image: string | null; text: string }[]; labels: { prev: string; next: string; page: string; story: string } }) {
  const [i, setI] = useState(0);
  const p = pages[i];
  const go = (n: number) => setI(Math.max(0, Math.min(pages.length - 1, n)));
  return (
    <section className="storybook" aria-roledescription="그림책" aria-label={`${labels.page} ${i + 1} / ${pages.length}`} data-testid="storybook"
      tabIndex={0} onKeyDown={(e) => { if (e.key === 'ArrowRight') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1); }}>
      <div className="storybook-page">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {p.image ? <img src={p.image} alt="" /> : <div className="storybook-blank" aria-hidden="true" />}
        {p.text && <div className="storybook-copy" aria-live="polite"><h2>{labels.story}</h2><p className="storybook-text">{p.text}</p></div>}
      </div>
      <div className="storybook-nav">
        <button type="button" onClick={() => go(i - 1)} disabled={i === 0} aria-label={labels.prev}><ChevronLeft size={20} aria-hidden="true" /></button>
        <span className="storybook-count" data-testid="storybook-count">{i + 1} / {pages.length}</span>
        <button type="button" onClick={() => go(i + 1)} disabled={i === pages.length - 1} aria-label={labels.next}><ChevronRight size={20} aria-hidden="true" /></button>
      </div>
    </section>
  );
}
