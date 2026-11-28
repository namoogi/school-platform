import { siteLabel, templateText } from '@/lib/site-labels';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadForPage } from '@/lib/page';
import { getSettings, listEntries, LANG_LABEL, navEntriesOf, subpagesOf, type Lang } from '@/lib/site';
import { SITE_TEMPLATES } from '@/lib/site-templates';
import { samplePages, sampleAssetUrl, sampleNews, TEMPLATE_SAMPLES } from '@/lib/site-template-samples';
import { SITE_THEMES } from '@/lib/site';
import { SiteBlocks } from '@/components/site/SiteRenderer';
import { PageHead } from '@/components/site/load';
import { PageHeader } from '@/components/ui';
import { ApplyTemplate, AutofillPanel, MigratePanel } from '../TemplatesClient';
import { getI18n, userLang } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

/** 65차: 템플릿 미리보기 — 방문자 화면과 같은 그리기 코드에 템플릿 안내 내용을 넣는다(DB의 학교 자료는 읽지 않음) */
export default async function TemplatePreview({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ page?: string; lang?: string; view?: string }> }) {
  const { key } = await params;
  const sp = await searchParams;
  const t = SITE_TEMPLATES.find((x) => x.key === key);
  if (!t) notFound();
  const { school, pages, settings, uiLang } = await loadForPage(async ({ db, school }) => ({
    uiLang: await userLang(db),
    pages: (await listEntries(db, school.id)).filter((e) => e.kind === 'page').map((e) => e.key),
    settings: await getSettings(db, school.id),
  }), { module: 'homepage' });
  const { t: tr } = await getI18n(uiLang, school.locale);
  const tplName = templateText(tr, t.key, 'name', t.name);
  const designName = siteLabel(tr, 'theme', t.theme, SITE_THEMES.find((x) => x.key === t.theme)?.name ?? t.theme);
  const siteState = { exists: !!settings, open: !!settings?.is_open, theme: settings?.theme ?? null, themeName: settings?.theme ? siteLabel(tr, 'theme', settings.theme, SITE_THEMES.find((x) => x.key === settings.theme)?.name ?? settings.theme) : null };
  const pg = t.pages.find((p) => p.key === sp.page) ?? t.pages[0];
  const lang = (t.langs as string[]).includes(sp.lang ?? '') ? (sp.lang as Lang) : (t.langs[0] as Lang);
  const slots = t.slots.filter((s) => s.page === pg.key);
  // 86차: 기본은 가상 학교 예시 내용으로 채운 완성 모습, '안내 자리'는 적용하면 들어갈 그대로
  const view = sp.view === 'guide' || !TEMPLATE_SAMPLES[t.key] ? 'guide' : 'sample';
  const shown = view === 'sample' ? samplePages(t)[pg.key] : pg.content;
  const href = (o: { page?: string; lang?: string; view?: string }) =>
    `/site/templates/${t.key}?page=${o.page ?? pg.key}&lang=${o.lang ?? lang}${(o.view ?? view) === 'guide' ? '&view=guide' : ''}`;
  return (
    <>
      <PageHeader title={tr('site.tpl.detail.title', { name: tplName })} crumbs={[{ label: tr('nav.site.title'), href: '/site' }, { label: tr('site.tpl.crumb'), href: '/site/templates' }, { label: tplName }]}
        description={tr('site.tpl.detail.description', { summary: templateText(tr, t.key, 'summary', t.summary), design: designName })} />
      <div className="template-layout">
        <section className="template-stage" aria-label={tr('site.tpl.preview')}>
          {/* 86차(사용자 지시): 미리보기에서 쪽마다 바로 넘겨 본다 — 쪽 탭을 미리보기 바로 위에 둔다 */}
          <nav className="tabs template-page-tabs" aria-label={tr('site.tpl.detail.pageTabs')}>
            {t.pages.map((p) => <Link key={p.key} href={href({ page: p.key })} aria-current={p.key === pg.key ? 'page' : undefined}>
              {p.key === 'home' ? tr('nav.home') : p.content.title[lang] ?? Object.values(p.content.title)[0]}{pages.includes(p.key) ? <small className="muted"> · {tr('site.tpl.detail.exists')}</small> : null}</Link>)}
          </nav>
          {TEMPLATE_SAMPLES[t.key] && <div className="template-view-bar">
            <nav className="segmented" aria-label={tr('site.tpl.view.label')}>
              <Link href={href({ view: 'sample' })} aria-current={view === 'sample' ? 'true' : undefined} data-testid="template-view-sample">{tr('site.tpl.view.sample')}</Link>
              <Link href={href({ view: 'guide' })} aria-current={view === 'guide' ? 'true' : undefined} data-testid="template-view-guide">{tr('site.tpl.view.guide')}</Link>
            </nav>
            <Link className="btn btn-sm" href={`/templates/${t.key}?page=${pg.key}&lang=${lang}${view === 'guide' ? '&view=guide' : ''}`} data-testid="template-live-link">{tr('site.tpl.detail.fullscreen')}</Link>
            <p className="fine muted" data-testid="template-view-note">{view === 'sample'
              ? tr('site.tpl.detail.sampleNote', { school: TEMPLATE_SAMPLES[t.key].school })
              : tr('site.tpl.detail.guideNote')}</p>
          </div>}
          <div className="site site-preview template-preview" data-theme={t.theme} lang={lang} data-testid="template-preview" data-view={view}>
            <main className="site-wrap site-main">
              <PageHead content={shown} lang={lang} fallback={t.langs[0] as Lang} asset={view === 'sample' ? sampleAssetUrl : () => ''} />
              <SiteBlocks content={shown} lang={lang} fallback={t.langs[0] as Lang} assetUrl={view === 'sample' ? sampleAssetUrl : () => ''} link={() => '#'} news={view === 'sample' ? sampleNews() : []} inquiry={{ slug: null, open: true, page: pg.key }}
                subpages={subpagesOf(navEntriesOf(t.pages.map((p) => ({ key: p.key, content: view === 'sample' ? samplePages(t)[p.key] : p.content })), { inquiry: true, news: false }), pg.key)} />
            </main>
          </div>
        </section>
        <aside className="card stack" aria-label={tr('site.tpl.detail.info')}>
          {t.langs.length > 1 && <p className="fine">{tr('site.tpl.detail.langs')} {t.langs.map((l) => <Link key={l} href={href({ lang: l })} aria-current={l === lang ? 'true' : undefined} style={{ marginRight: 8 }}>{LANG_LABEL[l as Lang]}</Link>)}</p>}
          <p className="fine">{tr('site.tpl.detail.pages', { n: t.pages.length, paths: t.pages.map((p) => p.key === 'home' ? '/' : `/p/${p.key}`).join(' · ') })}</p>
          <h2>{tr('site.tpl.detail.slots')}</h2>
          {slots.length === 0 ? <p className="muted">{tr('site.tpl.detail.noSlots')}</p> : <ul className="issue-list">{slots.map((s) => <li key={s.id}><span><strong>{s.label}</strong> <small className="muted">{s.hint}</small></span></li>)}</ul>}
          <h2>{tr('site.tpl.detail.mustHave')}</h2>
          <ul className="issue-list">{t.mustHave.map((m) => <li key={m}>{m}</li>)}</ul>
          {school.isAdmin ? <ApplyTemplate templateKey={t.key} name={tplName} existing={t.pages.map((p) => p.key).filter((k) => pages.includes(k))} site={siteState} designName={designName} />
            : <p className="muted">{tr('site.tpl.detail.adminOnly')}</p>}

        </aside>
      </div>
      {school.isAdmin && t.pages.some((p) => pages.includes(p.key)) && <div className="settings-grid"><div className="card"><AutofillPanel templateKey={t.key} /></div><div className="card"><MigratePanel templateKey={t.key} /></div></div>}
    </>
  );
}
