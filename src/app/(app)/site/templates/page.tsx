import { siteLabel, templateText } from '@/lib/site-labels';
import Link from 'next/link';
import { loadForPage } from '@/lib/page';
import { getSettings, listEntries, LANG_LABEL, SITE_THEMES, type Lang } from '@/lib/site';
import { SITE_TEMPLATES } from '@/lib/site-templates';
import { CONTENT_KINDS, facetCounts, filterTemplates, FIRST_SCREENS, NAV_LAYOUTS, type FacetFilter } from '@/lib/site-template-facets';
import type { MsgKey } from '@/lib/i18n/catalog';
import { PageHeader, StatusBadge } from '@/components/ui';
import { MigrateStart } from './TemplatesClient';
import { getI18n, userLang } from '@/lib/i18n/server';

/** 65차(ADR 0031): 홈페이지 템플릿 둘러보기 — 형식 7종. 미리보기 후 고르면 시안 쪽을 만든다 */
export default async function TemplatesPage({ searchParams }: { searchParams: Promise<FacetFilter> }) {
  const sp = await searchParams;
  const { pages, school, settings, uiLang } = await loadForPage(async ({ db, school }) => ({
    uiLang: await userLang(db),
    pages: (await listEntries(db, school.id)).filter((e) => e.kind === 'page').map((e) => e.key),
    settings: await getSettings(db, school.id),
  }), { module: 'homepage' });
  const { t } = await getI18n(uiLang, school.locale);
  const designName = (k: string | null | undefined) => (k ? siteLabel(t, 'theme', k, SITE_THEMES.find((x) => x.key === k)?.name ?? k) : null);
  const filter: FacetFilter = { nav: sp.nav, first: sp.first, content: sp.content };
  const shown = filterTemplates(SITE_TEMPLATES, filter);
  const counts = facetCounts(SITE_TEMPLATES, filter);
  const siteState = { exists: !!settings, open: !!settings?.is_open, theme: settings?.theme ?? null, themeName: designName(settings?.theme) };
  return (
    <>
      <PageHeader title={t('site.tpl.title')} crumbs={[{ label: t('nav.site.title'), href: '/site' }, { label: t('site.tpl.crumb') }]}
        description={t('site.tpl.description')}
        meta={<span>{t('site.tpl.pageCount', { n: pages.length })}</span>} />
      {school.isAdmin && <MigrateStart site={siteState} templates={SITE_TEMPLATES.map((x) => ({ key: x.key, name: templateText(t, x.key, 'name', x.name), summary: templateText(t, x.key, 'summary', x.summary), designName: designName(x.theme) ?? x.theme }))} />}
      <h2 className="section-title">{t('site.tpl.browse')}</h2>
      {/* 136차(ADR 0052): 메뉴 구조 · 첫 화면 구성 · 내용(목적)으로 거르기. 링크라서 자바스크립트 없이도 되고, 주소를 나눠 줄 수 있다 */}
      <div className="facet-filter" data-testid="template-facets">
        {([['nav', NAV_LAYOUTS], ['first', FIRST_SCREENS], ['content', CONTENT_KINDS]] as const).map(([axis, values]) => (
          <nav key={axis} className="facet-row" aria-label={t(`site.facet.${axis}` as MsgKey)}>
            <span className="facet-label">{t(`site.facet.${axis}` as MsgKey)}</span>
            <Link href={facetHref(filter, axis, undefined)} aria-current={!filter[axis] ? 'true' : undefined}>{t('site.facet.all')}</Link>
            {values.map((v) => counts[axis][v] > 0 || filter[axis] === v
              ? <Link key={v} href={facetHref(filter, axis, v)} aria-current={filter[axis] === v ? 'true' : undefined} data-facet={`${axis}:${v}`}
                  title={axis === 'nav' ? t(`site.facet.nav.${v}.note` as MsgKey) : undefined}>
                  {t(`site.facet.${axis}.${v}` as MsgKey)} <span className="count-badge">{counts[axis][v]}</span></Link>
              : <span key={v} className="facet-off" aria-disabled="true">{t(`site.facet.${axis}.${v}` as MsgKey)} <span className="count-badge">0</span></span>)}
          </nav>
        ))}
        <p className="fine muted" aria-live="polite" data-testid="template-count">{t('site.facet.shown', { n: shown.length, total: SITE_TEMPLATES.length })}</p>
      </div>
      {shown.length === 0 && <p className="empty-state">{t('site.facet.none')} <Link href="/site/templates">{t('site.facet.reset')}</Link></p>}
      <div className="template-grid" data-testid="template-grid">
        {shown.map((tp) => (
          <article key={tp.key} className="card template-card">
            {/* 89차(ADR 0034): 첫 화면과 안쪽 쪽을 겹친 썸네일 — 누르면 전체 화면 미리보기. 다시 찍기: npm run templates:thumbs */}
            <Link className="template-thumb" href={`/templates/${tp.key}`} tabIndex={-1} aria-hidden="true">
              <img src={`/site-templates/${tp.key}.jpg`} alt="" width={960} height={600} loading="lazy" />
            </Link>
            <div className="template-card-head">
              <h2>{templateText(t, tp.key, 'name', tp.name)}</h2>
              <StatusBadge tone="neutral">{t('site.tpl.designBadge', { name: designName(tp.theme) ?? tp.theme })}</StatusBadge>
            </div>
            <p>{templateText(t, tp.key, 'summary', tp.summary)}</p>
            <p className="template-chips fine">
              <span>{t(`site.facet.nav.${tp.nav}` as MsgKey)}</span>
              <span>{t(`site.facet.first.${tp.first}` as MsgKey)}</span>
              <span>{t('site.tpl.pages', { n: tp.pages.length })}</span>
              <span>{tp.langs.map((l) => LANG_LABEL[l as Lang]).join('·')}</span>
              <span>{t('site.tpl.slots', { n: tp.slots.length })}</span>
            </p>
            <p className="fine muted">{t('site.tpl.fits', { fits: templateText(t, tp.key, 'fits', tp.fits.join(' · ')) })}</p>
            <div className="form-actions">
              <Link className="btn btn-primary" href={`/templates/${tp.key}`} data-testid={`template-live-${tp.key}`}>{t('site.tpl.preview')}</Link>
              <Link className="btn" href={`/site/templates/${tp.key}`} data-testid={`template-open-${tp.key}`}>{t('site.tpl.details')}</Link>
            </div>
          </article>
        ))}
      </div>
      <p className="fine">{t('site.tpl.research')}</p>
    </>
  );
}

/** 한 칸의 값을 바꾼 거르기 주소(다른 칸은 그대로). 같은 값을 다시 누르는 '전체'는 그 칸을 비운다 */
function facetHref(f: FacetFilter, axis: keyof FacetFilter, v: string | undefined) {
  const q = new URLSearchParams(Object.entries({ ...f, [axis]: v }).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== ''));
  const qs = q.toString();
  return `/site/templates${qs ? `?${qs}` : ''}`;
}
