'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useI18n } from './I18nProvider';
import { Gauge, Building2, Languages, CalendarRange, Users, BookOpen, ClipboardCheck, GraduationCap, CalendarCheck, ScrollText, Layers, MessagesSquare, FileText, FlaskConical, Globe, House, Link2, MessageSquareWarning, Package, Palette, Settings, Upload, type LucideIcon } from 'lucide-react';

// 레일 아이콘 (lucide, ISC 라이선스). 장식용이라 화면낭독기에는 숨기고 이름 글자를 함께 보인다.
const ICONS: Record<string, LucideIcon> = {
  '/home': House, '/intake': Upload, '/site': Globe, '/review': ClipboardCheck, '/academics': CalendarRange, '/people': Users, '/courses': BookOpen, '/grades': GraduationCap, '/attendance': CalendarCheck, '/records': ScrollText, '/documents': FileText, '/packages': Package, '/requests': MessageSquareWarning, '/settings': Settings,
  '/admin': Building2, '/admin/integrations': Link2, '/admin/control': MessagesSquare, '/admin/usage': Gauge, '/admin/baseline': Layers, '/admin/lab': FlaskConical, '/admin/languages': Languages, '/admin/design': Palette,
};

/** label: 레일에 보이는 짧은 이름, title: 화면 이름(마우스 풍선·화면낭독기). 브라우저 기본 title 풍선은 쓰지 않는다 — 우리 풍선과 겹쳐 두 개가 뜨고 늦게 사라진다(90차) */
export type NavItem = { href: string; label: string; title?: string; count?: number };
export type NavGroup = { label: string; items: NavItem[] };

export function Nav({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  const { t } = useI18n();
  const all = groups.flatMap((g) => g.items);
  // 가장 길게 맞는 주소 하나만 현재 항목으로 (예: /admin/lab 에서 /admin 은 현재가 아님)
  const current = all.filter((i) => path === i.href || path.startsWith(i.href + '/')).sort((a, b) => b.href.length - a.href.length)[0];
  // 마지막 입력이 마우스인지 키보드인지 적어 둔다: 마우스면 가리킨 항목, 키보드면 초점 항목의 이름 풍선만 띄운다(globals.css)
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const set = (v: 'pointer' | 'keyboard') => { if (ref.current && ref.current.dataset.input !== v) ref.current.dataset.input = v; };
    const onPointer = () => set('pointer');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Tab' || e.key.startsWith('Arrow')) set('keyboard'); };
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointermove', onPointer); window.removeEventListener('keydown', onKey); };
  }, []);
  return (
    <nav aria-label={t('shell.menu')} ref={ref} data-input="pointer">
      {groups.map((g) => (
        <div key={g.label} className="nav-group">
          {groups.length > 1 && <div className="menu-label">{g.label}</div>}
          {g.items.map((i) => {
            const Icon = ICONS[i.href];
            return (
              <Link key={i.href} href={i.href} className="nav-item" data-tip={i.title ?? i.label} aria-current={current?.href === i.href ? 'page' : undefined}>
                {/* 접근 이름은 aria-label 대신 링크 안 글자로 만든다. 보이는 이름·건수가 그대로 들어가야
                    음성 명령·화면낭독기가 같은 이름으로 찾는다 (WCAG 2.5.3, axe label-content-name-mismatch) */}
                <span className="nav-label">{Icon && <Icon size={22} aria-hidden="true" />}<span className="nav-text">{i.label}</span></span>
                {!!i.count && <> <span className="count-badge">{i.count}<span className="sr-only">{t('nav.pendingSuffix')}</span></span></>}
                {i.title && i.title !== i.label && <span className="sr-only"> ({i.title})</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
