'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** 작업함 키보드: J 다음 · K 이전 (입력 중에는 무시). 한글 자판에서도 물리 키로 동작한다. */
export function TriageKeys({ hrefs, current }: { hrefs: string[]; current: string | null }) {
  const router = useRouter();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (e.altKey || e.ctrlKey || e.metaKey || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
      const i = current ? hrefs.indexOf(current) : -1;
      if (e.code === 'KeyJ' && i < hrefs.length - 1) router.push(hrefs[i + 1]);
      if (e.code === 'KeyK' && i > 0) router.push(hrefs[i - 1]);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hrefs, current, router]);
  return null;
}
