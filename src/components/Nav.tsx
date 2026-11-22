'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/intake', label: '자료 첨부' },
  { href: '/review', label: '관리자 확인' },
  { href: '/documents', label: '학사 문서실' },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="플랫폼">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={path.startsWith(i.href) ? 'page' : undefined}>{i.label}</Link>
      ))}
    </nav>
  );
}
