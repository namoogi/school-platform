import Link from 'next/link';
import { loadForPage } from '@/lib/page';
import { getSettings, listEntries, LANG_LABEL, SITE_THEMES, type Lang } from '@/lib/site';
import { SITE_TEMPLATES } from '@/lib/site-templates';
import { PageHeader, StatusBadge } from '@/components/ui';
import { MigrateStart } from './TemplatesClient';
import { getI18n, userLang } from '@/lib/i18n/server';

/** 65차(ADR 0031): 홈페이지 템플릿 둘러보기 — 형식 7종. 미리보기 후 고르면 시안 쪽을 만든다 */
export default async function TemplatesPage() {
  const { pages, school, settings, uiLang } = await loadForPage(async ({ db, school }) => ({
    uiLang: await userLang(db),
    pages: (await listEntries(db, school.id)).filter((e) => e.kind === 'page').map((e) => e.key),
    settings: await getSettings(db, school.id),
  }), { module: 'homepage' });
  const { t } = await getI18n(uiLang, school.locale);
  const designName = (k: string | null | undefined) => SITE_THEMES.find((x) => x.key === k)?.name ?? null;
  const siteState = { exists: !!settings, open: !!settings?.is_open, theme: settings?.theme ?? null, themeName: designName(settings?.theme) };
  return (
    <>
      <PageHeader title={t('site.tpl.title')} crumbs={[{ label: t('nav.site.title'), href: '/site' }, { label: t('site.tpl.crumb') }]}
        description={t('site.tpl.description')}
        meta={<span>{t('site.tpl.pageCount', { n: pages.length })}</span>} />
      {school.isAdmin && <MigrateStart site={siteState} templates={SITE_TEMPLATES.map((x) => ({ key: x.key, name: x.name, summary: x.summary, designName: designName(x.theme) ?? x.theme }))} />}
      <h2 className="section-title">{t('site.tpl.browse')}</h2>
      <div className="template-grid" data-testid="template-grid">
        {SITE_TEMPLATES.map((tp) => (
          <article key={tp.key} className="card template-card">
            {/* 89차(ADR 0034): 첫 화면과 안쪽 쪽을 겹친 썸네일 — 누르면 전체 화면 미리보기. 다시 찍기: npm run templates:thumbs */}
            <Link className="template-thumb" href={`/templates/${tp.key}`} tabIndex={-1} aria-hidden="true">
              <img src={`/site-templates/${tp.key}.jpg`} alt="" width={960} height={600} loading="lazy" />
            </Link>
            <div className="template-card-head">
              <h2>{tp.name}</h2>
              <StatusBadge tone="neutral">{t('site.tpl.designBadge', { name: designName(tp.theme) ?? tp.theme })}</StatusBadge>
            </div>
            <p>{tp.summary}</p>
            <p className="template-chips fine">
              <span>{t('site.tpl.pages', { n: tp.pages.length })}</span>
              <span>{tp.langs.map((l) => LANG_LABEL[l as Lang]).join('·')}</span>
              <span>{t('site.tpl.slots', { n: tp.slots.length })}</span>
            </p>
            <p className="fine muted">{t('site.tpl.fits', { fits: tp.fits.join(' · ') })}</p>
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
