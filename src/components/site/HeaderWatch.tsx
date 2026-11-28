'use client';
import { useEffect } from 'react';

/**
 * 138차 후속(2026-11-28 사용자 지시): 휴대폰에서 머리글이 화면 밖으로 나가면 머리글에 data-away를 단다.
 * CSS가 그때 '메뉴' 단추만 화면 위쪽에 띄운다(머리글 전체를 고정하지 않아 본문이 튀지 않는다). 그림은 CSS가 한다.
 */
export function HeaderWatch() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('.site-header');
    if (!header || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) header.removeAttribute('data-away');
      else header.setAttribute('data-away', '');
    });
    io.observe(header);
    return () => { io.disconnect(); header.removeAttribute('data-away'); };
  }, []);
  return null;
}
