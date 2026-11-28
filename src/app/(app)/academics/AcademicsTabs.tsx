import Link from 'next/link';
import type { Db } from '@/lib/db';
import type { MsgKey } from '@/lib/i18n/catalog';

/**
 * 119차(사용자 지시): 학교 구조를 성격별 탭으로 나눈다 — 학교급·학년 / 학기 구조 / 학년도·학기 / 템플릿.
 * 주소로 고르는 탭이라(`?tab=`) 자바스크립트 없이 열리고, 즐겨찾기·뒤로 가기가 된다. 지금 탭은 aria-current="page".
 */
export const ACADEMICS_TABS = ['levels', 'terms', 'years'] as const;
export type AcademicsTab = (typeof ACADEMICS_TABS)[number] | 'templates';

export const academicsTabHref = (tab: AcademicsTab) => (tab === 'templates' ? '/academics/templates' : tab === 'levels' ? '/academics' : `/academics?tab=${tab}`);

export type TabCounts = { levels: number; rule: number | null; years: number; template: number | null };

/** 탭 옆 개수·판 번호를 두 화면(/academics·/academics/templates)이 같은 길로 읽는다(Codex 198번 PR 검토) */
export async function academicsTabCounts(db: Db, schoolId: string): Promise<TabCounts> {
  const { rows: [c] } = await db.query<TabCounts>(
    `select (select count(*)::int from public.school_levels where school_id = $1) as levels,
            (select max(version)::int from public.school_rules where school_id = $1 and topic = 'period_structure') as rule,
            (select count(*)::int from public.academic_years where school_id = $1) as years,
            (select p.template_version from public.school_profiles p where p.school_id = $1 order by p.version desc limit 1) as template`, [schoolId]);
  return c;
}

export function AcademicsTabs({ current, t, counts: c }: {
  current: AcademicsTab; t: (k: MsgKey, v?: Record<string, string | number>) => string; counts: TabCounts;
}) {
  const v = (n: number | null) => (n == null ? undefined : t('common.version', { v: n }));
  const counts: Partial<Record<AcademicsTab, string | number>> = { levels: c.levels, terms: v(c.rule), years: c.years, templates: v(c.template) };
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
