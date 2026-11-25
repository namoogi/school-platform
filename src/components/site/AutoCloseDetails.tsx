'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * 공개 홈페이지의 펼침 목록(언어 고르기 · ☰ 메뉴).
 * 자바스크립트가 없어도 <details>로 열고 닫히고, 있으면 아래 때 저절로 닫는다:
 * - 쪽·언어가 바뀌었을 때(클라이언트 이동 뒤 열린 채 남지 않게)
 * - 목록 안 링크를 골랐을 때
 * - 목록 밖을 누르거나 다른 곳으로 초점이 옮겨 갔을 때
 * - Esc (초점은 여는 단추로 돌려준다)
 */
export function AutoCloseDetails({ className, summary, children }: { className?: string; summary: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  const search = useSearchParams();
  const route = `${pathname}?${search?.toString() ?? ''}`;

  useEffect(() => { if (ref.current) ref.current.open = false; }, [route]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const close = () => { el.open = false; };
    const onPointer = (e: PointerEvent) => { if (el.open && !el.contains(e.target as Node)) close(); };
    const onFocus = (e: FocusEvent) => { if (el.open && e.target instanceof Node && !el.contains(e.target)) close(); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && el.open) { close(); el.querySelector('summary')?.focus(); }
    };
    const onClick = (e: MouseEvent) => { if ((e.target as Element | null)?.closest('a')) close(); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('focusin', onFocus);
    el.addEventListener('keydown', onKey);
    el.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('focusin', onFocus);
      el.removeEventListener('keydown', onKey);
      el.removeEventListener('click', onClick);
    };
  }, []);

  return <details ref={ref} className={className}><summary>{summary}</summary>{children}</details>;
}
