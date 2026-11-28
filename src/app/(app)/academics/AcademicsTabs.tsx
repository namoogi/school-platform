import Link from 'next/link';
import type { TabCounts } from '@/lib/academic-templates';
export { academicsTabCounts } from '@/lib/academic-templates';
import type { MsgKey } from '@/lib/i18n/catalog';

/**
 * 119차(사용자 지시): 학교 구조를 성격별 탭으로 나눈다 — 학교급·학년 / 학기 구조 / 학년도·학기 / 템플릿.
 * 주소로 고르는 탭이라(`?tab=`) 자바스크립트 없이 열리고, 즐겨찾기·뒤로 가기가 된다. 지금 탭은 aria-current="page".
 */
export const ACADEMICS_TABS = ['levels', 'terms', 'years'] as const;
export type AcademicsTab = (typeof ACADEMICS_TABS)[number] | 'templates';

export const academicsTabHref = (tab: AcademicsTab) => (tab === 'templates' ? '/academics/templates' : tab === 'levels' ? '/academics' : `/academics?tab=${tab}`);

export function AcademicsTabs({ current, t, counts: c }: {
  current: AcademicsTab; t: (k: MsgKey, v?: Record<string, string | number>) => string; counts: TabCounts;
}) {
  const v = (n: number | null) => (n == null ? undefined : t('common.version', { v: n }));
  const counts: Partial<Record<AcademicsTab, string | number>> = { levels: c.levels, terms: v(c.rule), years: c.years, templates: c.offers > 0 ? t('tplOffer.tab') : v(c.template) };
  const items: { key: AcademicsTab; label: MsgKey }[] = [
    { key: 'levels', label: 'academics.tab.levels' }, { key: 'terms', label: 'academics.tab.terms' },
    { key: 'years', label: 'academics.tab.years' }, { key: 'templates', label: 'academics.tab.templates' },
  ];
  return (
    <nav className="tabs academics-tabs" aria-label={t('academics.tabs')} data-testid="academics-tabs">
      {items.map((i) => (
        <Link key={i.key} href={academicsTabHref(i.key)} aria-current={i.key === current ? 'page' : undefined} data-testid={`academics-tab-${i.key}`}>
          {t(i.label)}{counts?.[i.key] != null && <span className="count">{counts[i.key]}</span>}
        </Link>
      ))}
    </nav>
  );
}
