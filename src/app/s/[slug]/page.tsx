import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pick, publicList } from '@/lib/site';
import { SiteBlocks } from '@/components/site/SiteRenderer';
import { SiteFrame, siteText } from '@/components/site/SiteFrame';
import { loadSite, newsFor, PageHead } from '@/components/site/load';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> };

/** 공개 홈페이지 첫 화면: 공개한 'home' 쪽 + (그 쪽에 '최근 소식' 블록이 없으면) 최근 소식·동화 */
export default async function SiteHome({ params, searchParams }: P) {
  const { slug } = await params;
  const L = await loadSite(slug, (await searchParams).lang);
  if (!L) notFound();
  const { site, home, lang, link, asset } = L;
  const ownNews = home?.content.blocks.some((b) => b.type === 'news_list');
  const [news, stories, listed] = await Promise.all([
    !ownNews && site.has_news ? publicList(slug, 'news') : [], site.stories ? publicList(slug, 'story') : [], newsFor(site, home?.content),
  ]);
  const t = (x: Parameters<typeof pick>[0]) => pick(x, lang, site.default_lang);
  // 52차: 맨 끝 안내 띠(cta)는 자동 목록(소식·동화) 뒤로 — 쪽은 늘 '다음 할 일'로 끝난다
  const blocks = home?.content.blocks ?? [];
  let cut = blocks.length;
  const trailing = (b: (typeof blocks)[number]) => b.hidden || (b.type === 'section' && (b as { template?: string }).template === 'cta');
  while (cut > 0 && trailing(blocks[cut - 1])) cut--; // 숨긴 관리자 메모도 끝 쪽에 둔다
  const body = blocks.slice(0, cut), closing = blocks.slice(cut);
  return (
    <SiteFrame site={site} lang={lang} current="home" path="" profile={L.profile} assetUrl={asset}>
      {home
        ? <><PageHead content={home.content} lang={lang} fallback={site.default_lang} asset={asset} link={link} />
            <SiteBlocks content={{ ...home.content, blocks: body }} lang={lang} fallback={site.default_lang} assetUrl={asset} link={link} news={listed} /></>
        : <h1 className="site-h1">{t(site.title) || site.school}</h1>}
      {news.length > 0 && (
        <section className="site-section"><h2 className="site-h2">{siteText('news', lang)}</h2>
          <ul className="site-cards">{news.slice(0, 3).map((n) => (
            <li key={n.key}><Link href={link(`/news/${n.key}`)}>{n.cover && /* eslint-disable-next-line @next/next/no-img-element */ <img src={asset(n.cover)} alt="" />}<b>{t(n.title)}</b></Link></li>))}</ul>
        </section>
      )}
      {stories.length > 0 && (
        <section className="site-section story-strip"><h2 className="site-h2">{siteText('stories', lang)}</h2>
          <ul className="site-cards">{stories.slice(0, 4).map((s) => (
            <li key={s.key}><Link href={link(`/stories/${s.key}`)}>{s.cover && /* eslint-disable-next-line @next/next/no-img-element */ <img src={asset(s.cover)} alt="" />}<b>{t(s.title)}</b>{s.meta.virtue && <small>{s.meta.virtue}</small>}</Link></li>))}</ul>
        </section>
      )}
      {home && closing.length > 0 && <SiteBlocks content={{ ...home.content, blocks: closing }} lang={lang} fallback={site.default_lang} assetUrl={asset} link={link} news={listed} />}
    </SiteFrame>
  );
}

export async function generateMetadata({ params }: P) {
  const L = await loadSite((await params).slug);
  return L ? { title: pick(L.site.title, L.site.default_lang, L.site.default_lang) || L.site.school } : { title: '없는 홈페이지' };
}
