'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, ClipboardCheck, FileText, FlaskConical, House, Link2, Palette, Settings, Upload, type LucideIcon } from 'lucide-react';

// 레일 아이콘 (lucide, ISC 라이선스). 장식용이라 화면낭독기에는 숨기고 이름 글자를 함께 보인다.
const ICONS: Record<string, LucideIcon> = {
  '/home': House, '/intake': Upload, '/review': ClipboardCheck, '/documents': FileText, '/settings': Settings,
  '/admin': Building2, '/admin/integrations': Link2, '/admin/lab': FlaskConical, '/admin/design': Palette,
};

/** label: 레일에 보이는 짧은 이름, title: 화면 이름(도움말·화면낭독기) */
export type NavItem = { href: string; label: string; title?: string; count?: number };
export type NavGroup = { label: string; items: NavItem[] };

export function Nav({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  const all = groups.flatMap((g) => g.items);
  // 가장 길게 맞는 주소 하나만 현재 항목으로 (예: /admin/lab 에서 /admin 은 현재가 아님)
  const current = all.filter((i) => path === i.href || path.startsWith(i.href + '/')).sort((a, b) => b.href.length - a.href.length)[0];
  return (
    <nav aria-label="주 메뉴">
      {groups.map((g) => (
        <div key={g.label} className="nav-group">
          {groups.length > 1 && <div className="menu-label">{g.label}</div>}
          {g.items.map((i) => {
            const Icon = ICONS[i.href];
            return (
              <Link key={i.href} href={i.href} className="nav-item" title={i.title} data-tip={i.title ?? i.label} aria-current={current?.href === i.href ? 'page' : undefined}
                aria-label={i.title && i.title !== i.label ? `${i.title}${i.count ? ` (${i.count}건 대기)` : ''}` : undefined}>
                <span className="nav-label">{Icon && <Icon size={22} aria-hidden="true" />}<span className="nav-text">{i.label}</span></span>
                {!!i.count && <span className="count-badge" aria-hidden="true">{i.count}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
