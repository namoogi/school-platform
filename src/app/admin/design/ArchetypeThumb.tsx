'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

/** 1440×900 시안을 카드 폭에 맞춰 줄여 보여 준다(실제 페이지를 그대로 축소, 늘 최신). */
export function ArchetypeThumb({ slug, label }: { slug: string; label: string }) {
  const box = useRef<HTMLAnchorElement>(null);
  const [scale, setScale] = useState(0.25);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / 1440));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <Link ref={box} href={`/preview/${slug}`} className="ar-thumb" aria-label={`${label} 전체 화면으로 보기`}>
      <iframe src={`/preview/${slug}?thumb=1`} title={`${label} 축소 미리보기`} loading="lazy" tabIndex={-1}
        aria-hidden="true" style={{ transform: `scale(${scale})` }} />
    </Link>
  );
}
