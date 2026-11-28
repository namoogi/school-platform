'use client';
import { useEffect } from 'react';

/**
 * 138차 후속(2026-11-28 사용자 지시): 휴대폰에서 머리글이 화면 밖으로 나가면 머리글에 data-away를 단다.
 * CSS가 그때 '메뉴' 단추만 화면 위쪽에 띄운다(머리글 전체를 고정하지 않아 본문이 튀지 않는다). 그림은 CSS가 한다.
 * 교직원 막대(.site-admin-bar, 위에 붙어 따라옴)가 있으면 그 높이를 --site-float-offset으로 넘겨 단추를 막대 아래에 둔다.
 * 높이는 단추가 뜰 때와 화면 크기가 바뀔 때 잰다(휴대폰에서 막대 줄이 바뀌면 높이도 바뀐다).
 */
export function HeaderWatch() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('.site-header');
    if (!header || typeof IntersectionObserver === 'undefined') return;
    const setOffset = () => {
      const bar = document.querySelector<HTMLElement>('.site-admin-bar');
      header.style.setProperty('--site-float-offset', `${bar ? Math.ceil(bar.getBoundingClientRect().height) : 0}px`);
    };
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) header.removeAttribute('data-away');
      else { setOffset(); header.setAttribute('data-away', ''); }
    });
    io.observe(header);
    window.addEventListener('resize', setOffset);
    return () => {
      io.disconnect(); window.removeEventListener('resize', setOffset);
      header.removeAttribute('data-away'); header.style.removeProperty('--site-float-offset');
    };
  }, []);
  return null;
}
