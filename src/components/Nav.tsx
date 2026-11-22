'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavItem = { href: string; label: string; count?: number };
export type NavGroup = { label: string; items: NavItem[] };

export function Nav({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  const all = groups.flatMap((g) => g.items);
  // 가장 길게 맞는 주소 하나만 현재 항목으로 (예: /admin/lab 에서 /admin 은 현재가 아님)
  const current = all.filter((i) => path === i.href || path.startsWith(i.href + '/')).sort((a, b) => b.href.length - a.href.length)[0];
  return (
    <nav aria-label="플랫폼">
      {groups.map((g) => (
        <div key={g.label} className="nav-group" style={{ marginBottom: 16 }}>
          <div className="menu-label">{g.label}</div>
          {g.items.map((i) => (
            <Link key={i.href} href={i.href} className="nav-item" aria-current={current?.href === i.href ? 'page' : undefined}>
              <span>{i.label}</span>
              {!!i.count && <span className="count-badge" aria-label={`${i.count}건 대기`}>{i.count}</span>}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
