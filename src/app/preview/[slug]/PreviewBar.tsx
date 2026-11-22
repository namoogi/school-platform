'use client';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { ChooseDirection } from '@/app/admin/design/ChooseDirection';

/** 시안 위에 떠 있는 비교 막대: 목록으로, 이전·다음 원형, 이 방향 선택 */
export function PreviewBar({ no, total, name, prev, next }: { no: number; total: number; name: string; prev: string; next: string }) {
  return (
    <nav className="pv-bar" aria-label="디자인 원형 비교">
      <Link href="/admin/design" className="pv-link"><ArrowLeft size={14} aria-hidden="true" />비교표</Link>
      <span className="pv-sep" aria-hidden="true" />
      <Link href={`/preview/${prev}`} className="pv-icon" aria-label="이전 원형"><ChevronLeft size={16} /></Link>
      <span className="pv-name"><b>{no}</b>/{total} {name}</span>
      <Link href={`/preview/${next}`} className="pv-icon" aria-label="다음 원형"><ChevronRight size={16} /></Link>
      <span className="pv-sep" aria-hidden="true" />
      <ChooseDirection name={`${no}. ${name}`} />
    </nav>
  );
}
