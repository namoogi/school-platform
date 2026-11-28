import { siteLabel, templateText } from '@/lib/site-labels';
import Link from 'next/link';
import { loadForPage } from '@/lib/page';
import { getSettings, listEntries, LANG_LABEL, SITE_THEMES, type Lang } from '@/lib/site';
import { SITE_TEMPLATES } from '@/lib/site-templates';
import { type FacetFilter } from '@/lib/site-template-facets';
import type { MsgKey } from '@/lib/i18n/catalog';
import { PageHeader, StatusBadge } from '@/components/ui';
import { MigrateStart } from './TemplatesClient';
import { TemplateFacetGrid } from './TemplateFacets';
import { PickerTabs } from './PickerTabs';
import { getI18n, userLang } from '@/lib/i18n/server';

/** 65차(ADR 0031): 홈페이지 템플릿 둘러보기 — 형식 7종. 미리보기 후 고르면 시안 쪽을 만든다 */
export default async function TemplatesPage({ searchParams }: { searchParams: Promise<FacetFilter & { tab?: string }> }) {
  const sp = await searchParams;
  const { pages, school, settings, uiLang } = await loadForPage(async ({ db, school }) => ({
    uiLang: await userLang(db),
    pages: (await listEntries(db, school.id)).filter((e) => e.kind === 'page').map((e) => e.key),
    settings: await getSettings(db, school.id),
  }), { module: 'homepage' });
  const { t } = await getI18n(uiLang, school.locale);
  const designName = (k: string | null | undefined) => (k ? siteLabel(t, 'theme', k, SITE_THEMES.find((x) => x.key === k)?.name ?? k) : null);
  const filter: FacetFilter = { nav: sp.nav, first: sp.first, content: sp.content };
  const siteState = { exists: !!settings, open: !!settings?.is_open, theme: settings?.theme ?? null, themeName: designName(settings?.theme) };
  return (
    <>
      <PageHeader title={t('site.tpl.title')} crumbs={[{ label: t('nav.site.title'), href: '/site' }, { label: t('site.tpl.crumb') }]}
        description={t('site.tpl.description')}
        meta={<span>{t('site.tpl.pageCount', { n: pages.length })}</span>} />
      {/* 138차 후속(2026-11-28 사용자 지시): 템플릿이 첫 탭, 기존 홈페이지 가져오기가 둘째 탭(가져오기는 학교 관리자만) */}
      {(() => {
        const browse = (
          <>
            <h2 className="section-title">{t('site.tpl.browse')}</h2>
            {/* 136차(ADR 0052): 메뉴 구조 · 첫 화면 구성 · 내용(목적)으로 거르기. 138차 후속: 화면 안에서 바로 거른다(TemplateFacets) */}
            <TemplateFacetGrid initial={filter} items={SITE_TEMPLATES.map(({ key, nav, first, contents }) => ({ key, nav, first, contents }))}
              cards={Object.fromEntries(SITE_TEMPLATES.map((tp) => [tp.key, (
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
              )]))} />
            <p className="fine">{t('site.tpl.research')}</p>
          </>
        );
        if (!school.isAdmin) return browse;
        return <PickerTabs initial={sp.tab === 'import' ? 'import' : 'templates'} templates={browse}
          importPanel={<MigrateStart site={siteState} templates={SITE_TEMPLATES.map((x) => ({ key: x.key, name: templateText(t, x.key, 'name', x.name), summary: templateText(t, x.key, 'summary', x.summary), designName: designName(x.theme) ?? x.theme }))} />} />;
      })()}
    </>
  );
}

