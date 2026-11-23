import Link from 'next/link';
import { ArrowLeft, List } from 'lucide-react';

/** 명시적인 돌아갈 주소를 사용하므로 새 탭·직접 방문에서도 동작한다. */
export function ReadingNav({ listHref, listLabel, editHref }: { listHref: string; listLabel: string; editHref?: string }) {
  return <nav className="site-reading-nav" aria-label={listLabel} data-testid="reading-nav">
    {editHref && <Link href={editHref}><ArrowLeft size={18} aria-hidden="true" />편집으로 돌아가기</Link>}
    <Link href={listHref} data-testid="reading-list-link">
      {editHref ? <List size={18} aria-hidden="true" /> : <ArrowLeft size={18} aria-hidden="true" />}{listLabel}
    </Link>
  </nav>;
}
