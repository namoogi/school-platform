import type { I18n } from '@/lib/i18n/server';
import { siteLabel, templateText } from '@/lib/site-labels';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LANG_LABEL, navEntriesOf, SITE_THEMES, type Content, type Lang, type PublicSite } from '@/lib/site';
import { SITE_TEMPLATES } from '@/lib/site-templates';
import { samplePages, sampleAssetUrl, sampleNews, sampleNewsPage, TEMPLATE_SAMPLES } from '@/lib/site-template-samples';
import { SiteFrame } from '@/components/site/SiteFrame';
import { PageHead, SiteBlocks, type NewsItem } from '@/components/site/SiteRenderer';

export type TemplateSearch = { page?: string; lang?: string; view?: string; thumb?: string; news?: string };

/**
 * 89차(ADR 0034): 템플릿 전체 화면 — 방문자가 볼 모습 그대로(디자인·메뉴·바닥). 내용은 가상 학교 예시(또는 안내 자리)이고 DB를 읽지 않는다.
 * 두 주소가 이 하나를 쓴다(2026-11-28 사용자 결정):
 * - `/templates/<key>`: 로그인한 사람의 미리보기. 위에 안내 줄(돌아가기·예시/안내 전환·이 디자인으로 시작)이 붙는다.
 * - `/demo/<key>`: 홍보용 공개 주소. 템플릿 화면만 나온다(bare).
 */
export async function TemplateView({ templateKey, sp, base, bare, tr }: {
  templateKey: string; sp: TemplateSearch; base: '/templates' | '/demo'; bare: boolean; tr: I18n['t'];
}) {
  const key = templateKey;
  const t = SITE_TEMPLATES.find((x) => x.key === key);
  if (!t) notFound();
  const sample = TEMPLATE_SAMPLES[t.key];
  const view = (!bare && sp.view === 'guide') || !sample ? 'guide' : 'sample';
  const pages = view === 'sample' ? samplePages(t) : Object.fromEntries(t.pages.map((p) => [p.key, p.content]));
  const pg = t.pages.find((p) => p.key === sp.page) ?? t.pages[0];
  const lang = (t.langs as string[]).includes(sp.lang ?? '') ? (sp.lang as Lang) : (t.langs[0] as Lang);
  const fallback = t.langs[0] as Lang;
  const href = (o: { page?: string; lang?: string; view?: string }) =>
    `${base}/${t.key}?page=${o.page ?? pg.key}&lang=${o.lang ?? lang}${(o.view ?? view) === 'guide' ? '&view=guide' : ''}`;
  const home = pages.home;
  const site: PublicSite = {
    slug: `template-${t.key}`, school: view === 'sample' ? sample.school : '[학교 이름]', default_lang: fallback, langs: t.langs as Lang[], theme: t.theme,
    title: home.title, stories: false, has_news: view === 'sample', // 126차: 예시 소식이 있으면 '소식' 상위 메뉴(그 아래 하위 쪽)를 보인다
    nav: navEntriesOf(t.pages.map((p) => ({ key: p.key, content: pages[p.key] })), { inquiry: true, news: view === 'sample' }),
  };
  const link = (path: string) => {
    if (path === '/' || path === '') return href({ page: 'home' });
    if (path === '/news') return `${href({})}&news=all`;
    const article = /^\/news\/([a-z0-9-]+)$/.exec(path);
    if (article && sampleNews().some((n) => n.key === article[1])) return `${href({})}&news=${article[1]}`;
    // 126차(ADR 0046): '/p/쪽#메뉴 주소'는 미리보기 주소에서도 #주소를 지킨다
    const m = /^\/p\/([a-z0-9-]+)(#[a-z][a-z0-9-]*)?/.exec(path);
    return m && t.pages.some((p) => p.key === m[1]) ? `${href({ page: m[1] })}${m[2] ?? ''}` : href({ page: 'home' });
  };
  const news: NewsItem[] = view === 'sample' ? sampleNews() : [];
  const content: Content = sampleNewsPage(sp.news) ?? pages[pg.key];
  const design = SITE_THEMES.find((x) => x.key === t.theme);
  return (
    <>
      {!bare && !sp.thumb && <nav className="template-live-bar" aria-label={tr('site.tpl.live.label')}>
        <Link href="/site/templates">{tr('site.tpl.live.back')}</Link>
        <strong>{templateText(tr, t.key, 'name', t.name)}</strong><span className="muted">{tr('site.tpl.live.design', { name: siteLabel(tr, 'theme', t.theme, design?.name ?? t.theme) })}</span>
        {sample && <span className="segmented" role="group" aria-label={tr('site.tpl.view.label')}>
          <Link href={href({ view: 'sample' })} aria-current={view === 'sample' ? 'true' : undefined}>{tr('site.tpl.view.sample')}</Link>
          <Link href={href({ view: 'guide' })} aria-current={view === 'guide' ? 'true' : undefined}>{tr('site.tpl.view.guide')}</Link>
        </span>}
        <Link className="btn btn-primary btn-sm" href={`/site/templates/${t.key}`} data-testid="template-live-start">{tr('site.tpl.live.start')}</Link>
      </nav>}
      {!bare && view === 'sample' && !sp.thumb && <p className="template-live-note">{tr('site.tpl.live.sampleNote', { school: sample.school })} {t.langs.length > 1 ? `${tr('site.tpl.detail.langs')} ${t.langs.map((l) => LANG_LABEL[l as Lang]).join('·')}` : ''}</p>}
      <SiteFrame site={site} lang={lang} current={sampleNewsPage(sp.news) ? 'news' : pg.key === 'home' ? 'home' : `p:${pg.key}`} path={sampleNewsPage(sp.news) ? '/news' : pg.key === 'home' ? '/' : `/p/${pg.key}`}
        profile={home.site} assetUrl={sampleAssetUrl} preview={{ link, langHref: (l) => href({ lang: l }) }}>
        <div data-testid="template-live">
          <PageHead content={content} lang={lang} fallback={fallback} asset={sampleAssetUrl} link={link} />
          <SiteBlocks content={content} lang={lang} fallback={fallback} assetUrl={sampleAssetUrl} link={link} news={news} inquiry={{ slug: null, open: true, page: pg.key }} />
        </div>
      </SiteFrame>
    </>
  );
}
