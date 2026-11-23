import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pick, publicEntry, publicList, publicSite } from '@/lib/site';
import { SiteBlocks } from '@/components/site/SiteRenderer';
import { resolveLang, SiteFrame, siteText } from '@/components/site/SiteFrame';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> };

/** 공개 홈페이지 첫 화면: 공개한 'home' 쪽 + 최근 소식·동화 */
export default async function SiteHome({ params, searchParams }: P) {
  const { slug } = await params;
  const site = await publicSite(slug);
  if (!site) notFound();
  const lang = resolveLang(site, (await searchParams).lang);
  const [home, news, stories] = await Promise.all([
    publicEntry(slug, 'page', 'home'), site.has_news ? publicList(slug, 'news') : [], site.stories ? publicList(slug, 'story') : [],
  ]);
  const q = lang === site.default_lang ? '' : `?lang=${lang}`;
  const asset = (id: string) => `/s/${slug}/a/${id}`;
  return (
    <SiteFrame site={site} lang={lang} current="home" path="">
      {home
        ? <><h1 className="site-h1">{pick(home.content.title, lang, site.default_lang)}</h1><SiteBlocks content={home.content} lang={lang} fallback={site.default_lang} assetUrl={asset} /></>
        : <h1 className="site-h1">{pick(site.title, lang, site.default_lang) || site.school}</h1>}
      {news.length > 0 && (
        <section className="site-section"><h2 className="site-h2">{siteText('news', lang)}</h2>
          <ul className="site-cards">{news.slice(0, 3).map((n) => (
            <li key={n.key}><Link href={`/s/${slug}/news/${n.key}${q}`}>{n.cover && /* eslint-disable-next-line @next/next/no-img-element */ <img src={asset(n.cover)} alt="" />}<b>{pick(n.title, lang, site.default_lang)}</b></Link></li>))}</ul>
        </section>
      )}
      {stories.length > 0 && (
        <section className="site-section"><h2 className="site-h2">{siteText('stories', lang)}</h2>
          <ul className="site-cards">{stories.slice(0, 4).map((s) => (
            <li key={s.key}><Link href={`/s/${slug}/stories/${s.key}${q}`}>{s.cover && /* eslint-disable-next-line @next/next/no-img-element */ <img src={asset(s.cover)} alt="" />}<b>{pick(s.title, lang, site.default_lang)}</b>{s.meta.virtue && <small>{s.meta.virtue}</small>}</Link></li>))}</ul>
        </section>
      )}
    </SiteFrame>
  );
}

export async function generateMetadata({ params }: P) {
  const site = await publicSite((await params).slug);
  return site ? { title: pick(site.title, site.default_lang, site.default_lang) || site.school } : { title: '없는 홈페이지' };
}
