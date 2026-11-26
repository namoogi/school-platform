'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Gauge, Building2, CalendarRange, Users, BookOpen, ClipboardCheck, GraduationCap, CalendarCheck, ScrollText, MessagesSquare, FileText, FlaskConical, Globe, House, Link2, MessageSquareWarning, Package, Palette, Settings, Upload, type LucideIcon } from 'lucide-react';

// 레일 아이콘 (lucide, ISC 라이선스). 장식용이라 화면낭독기에는 숨기고 이름 글자를 함께 보인다.
const ICONS: Record<string, LucideIcon> = {
  '/home': House, '/intake': Upload, '/site': Globe, '/review': ClipboardCheck, '/academics': CalendarRange, '/people': Users, '/courses': BookOpen, '/grades': GraduationCap, '/attendance': CalendarCheck, '/records': ScrollText, '/documents': FileText, '/packages': Package, '/requests': MessageSquareWarning, '/settings': Settings,
  '/admin': Building2, '/admin/integrations': Link2, '/admin/control': MessagesSquare, '/admin/usage': Gauge, '/admin/lab': FlaskConical, '/admin/design': Palette,
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
              <Link key={i.href} href={i.href} className="nav-item" title={i.title} data-tip={i.title ?? i.label} aria-current={current?.href === i.href ? 'page' : undefined}>
                {/* 접근 이름은 aria-label 대신 링크 안 글자로 만든다. 보이는 이름·건수가 그대로 들어가야
                    음성 명령·화면낭독기가 같은 이름으로 찾는다 (WCAG 2.5.3, axe label-content-name-mismatch) */}
                <span className="nav-label">{Icon && <Icon size={22} aria-hidden="true" />}<span className="nav-text">{i.label}</span></span>
                {!!i.count && <> <span className="count-badge">{i.count}<span className="sr-only">건 대기</span></span></>}
                {i.title && i.title !== i.label && <span className="sr-only"> ({i.title})</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
