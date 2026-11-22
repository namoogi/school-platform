'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavItem = { href: string; label: string };

export function Nav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav aria-label="플랫폼">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={path === i.href || (path.startsWith(i.href + '/') && !items.some((o) => o.href !== i.href && o.href.startsWith(i.href + '/') && path.startsWith(o.href))) ? 'page' : undefined}>{i.label}</Link>
      ))}
    </nav>
  );
}
