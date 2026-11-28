'use client';
import { useEffect } from 'react';

/**
 * 138차 후속(2026-11-28 사용자 지시): 휴대폰에서 머리글이 화면 밖으로 나가면 머리글에 data-away를 단다.
 * CSS가 그때 '메뉴' 단추만 화면 위쪽에 띄운다(머리글 전체를 고정하지 않아 본문이 튀지 않는다). 그림은 CSS가 한다.
 * 위에 붙어 따라오는 막대(data-sticky-top: 교직원 막대·템플릿 미리보기 막대·화면 편집 도구 막대)가 있으면
 * 가장 높은 막대의 높이를 --site-float-offset으로 넘겨 단추를 그 아래에 둔다(막대는 모두 top: 0이라 겹친다).
 * 높이는 단추가 뜰 때와 화면 크기가 바뀔 때 잰다(휴대폰에서 막대 줄이 바뀌면 높이도 바뀐다).
 */
export function HeaderWatch() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('.site-header');
    if (!header || typeof IntersectionObserver === 'undefined') return;
    const setOffset = () => {
      const bars = [...document.querySelectorAll<HTMLElement>('[data-sticky-top]')];
      const h = Math.max(0, ...bars.map((b) => Math.ceil(b.getBoundingClientRect().height)));
      header.style.setProperty('--site-float-offset', `${h}px`);
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
