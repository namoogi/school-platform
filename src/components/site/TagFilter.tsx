'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * 90차: '분류로 거르기' 배치 — 항목의 분류(data-tag)로 목록을 거른다(작품 분야·학년별 과정 등).
 * 글자 없이 화면에서만 숨기므로 검색 엔진·화면 읽기 프로그램은 '전체'에서 모든 항목을 읽는다.
 */
export function TagFilter({ tags, allLabel, label, children }: { tags: string[]; allLabel: string; label: string; children: React.ReactNode }) {
  const [on, setOn] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // 분류가 없는 항목도 포함해 목록의 모든 항목을 본다(분류를 고르면 분류 없는 항목은 숨김)
    box.current?.querySelectorAll<HTMLElement>(':scope > ul > li').forEach((li) => { li.hidden = on !== null && li.dataset.tag !== on; });
  }, [on]);
  return (
    <div className="sec-filter" ref={box}>
      <div className="sec-filter-bar" role="group" aria-label={label}>
        <button type="button" aria-pressed={on === null} onClick={() => setOn(null)}>{allLabel}</button>
        {tags.map((t) => <button key={t} type="button" aria-pressed={on === t} onClick={() => setOn(t)}>{t}</button>)}
      </div>
      {children}
    </div>
  );
}
