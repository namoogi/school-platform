'use client';
// 136차(ADR 0052): 한 쪽 스크롤형의 따라오는 차례. 넓은 화면에서 오른쪽에 붙어 있고, 지금 보는 구역을 표시한다(스크롤 위치 따라).
// 휴대폰에서는 숨긴다(머리글 메뉴의 '홈' 아래 같은 차례가 있다). 움직임 줄이기 설정이면 부드러운 스크롤을 쓰지 않는다(CSS).
import { useEffect, useState } from 'react';

export function SiteToc({ label, items }: { label: string; items: { id: string; href: string; label: string }[] }) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    if (!els.length || typeof IntersectionObserver === 'undefined') return;
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set(e.target.id, e.isIntersecting);
      const first = els.find((el) => seen.get(el.id));
      if (first) setActive(first.id);
    }, { rootMargin: '-20% 0px -60% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);
  return (
    <nav className="site-toc" aria-label={label} data-testid="site-toc">
      <p className="site-toc-label">{label}</p>
      <ol>{items.map((i) => <li key={i.id}><a href={i.href} aria-current={active === i.id ? 'location' : undefined}>{i.label}</a></li>)}</ol>
    </nav>
  );
}
