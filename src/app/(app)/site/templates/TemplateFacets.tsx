'use client';
// 138차 후속: 템플릿 거르기를 화면 안에서 바로 한다(쪽을 다시 불러오지 않음 · 스크롤 유지).
// 카드는 서버가 모두 그려 넘기고, 여기서는 보일 카드만 고른다. 주소(?nav=…)는 바꿔 두어 링크를 나눠 줄 수 있고,
// 자바스크립트가 없으면 칩이 보통 링크라서 서버 거르기로 동작한다.
import Link from 'next/link';
import { Fragment, useState, type MouseEvent, type ReactNode } from 'react';
import { useI18n } from '@/components/I18nProvider';
import type { MsgKey } from '@/lib/i18n/catalog';
import { CONTENT_KINDS, facetCounts, filterTemplates, FIRST_SCREENS, NAV_LAYOUTS, type FacetFilter, type TemplateFacets as Facets } from '@/lib/site-template-facets';

type Item = Facets & { key: string };
type Axis = keyof FacetFilter;

/** 한 칸의 값을 바꾼 거르기 주소(다른 칸은 그대로). '전체'는 그 칸을 비운다 */
export function facetHref(f: FacetFilter, axis: Axis, v: string | undefined) {
  const q = new URLSearchParams(Object.entries({ ...f, [axis]: v }).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== ''));
  const qs = q.toString();
  return `/site/templates${qs ? `?${qs}` : ''}`;
}

export function TemplateFacetGrid({ items, cards, initial }: { items: Item[]; cards: Record<string, ReactNode>; initial: FacetFilter }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<FacetFilter>(initial);
  const shown = new Set(filterTemplates(items, filter).map((x) => x.key));
  const counts = facetCounts(items, filter);
  const pick = (axis: Axis, v: string | undefined) => (e: MouseEvent<HTMLAnchorElement>) => {
    // 새 탭·창으로 여는 누름은 그대로 둔다
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    const next = { ...filter, [axis]: v };
    setFilter(next);
    window.history.replaceState(window.history.state, '', facetHref(next, axis, v));
  };
  return (
    <>
      <div className="facet-filter" data-testid="template-facets">
        {([['nav', NAV_LAYOUTS], ['first', FIRST_SCREENS], ['content', CONTENT_KINDS]] as const).map(([axis, values]) => (
          <nav key={axis} className="facet-row" aria-label={t(`site.facet.${axis}` as MsgKey)}>
            <span className="facet-label">{t(`site.facet.${axis}` as MsgKey)}</span>
            <Link href={facetHref(filter, axis, undefined)} onClick={pick(axis, undefined)} aria-current={!filter[axis] ? 'true' : undefined}>{t('site.facet.all')}</Link>
            {values.map((v) => counts[axis][v] > 0 || filter[axis] === v
              ? <Link key={v} href={facetHref(filter, axis, v)} onClick={pick(axis, v)} aria-current={filter[axis] === v ? 'true' : undefined} data-facet={`${axis}:${v}`}
                  title={axis === 'nav' ? t(`site.facet.nav.${v}.note` as MsgKey) : undefined}>
                  {t(`site.facet.${axis}.${v}` as MsgKey)} <span className="count-badge">{counts[axis][v]}</span></Link>
              : <span key={v} className="facet-off" aria-disabled="true">{t(`site.facet.${axis}.${v}` as MsgKey)} <span className="count-badge">0</span></span>)}
          </nav>
        ))}
        <p className="fine muted" aria-live="polite" data-testid="template-count">{t('site.facet.shown', { n: shown.size, total: items.length })}</p>
      </div>
      {shown.size === 0 && <p className="empty-state">{t('site.facet.none')} <Link href="/site/templates" onClick={(e) => { e.preventDefault(); setFilter({}); window.history.replaceState(window.history.state, '', '/site/templates'); }}>{t('site.facet.reset')}</Link></p>}
      <div className="template-grid" data-testid="template-grid">
        {items.map((x) => (shown.has(x.key) ? <Fragment key={x.key}>{cards[x.key]}</Fragment> : null))}
      </div>
    </>
  );
}
