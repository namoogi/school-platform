import { notFound } from 'next/navigation';
import { pick, publicEntry } from '@/lib/site';
import { subpagesOf } from '@/lib/site-shared';
import { SiteBlocks } from '@/components/site/SiteRenderer';
import { SiteFrame, siteText } from '@/components/site/SiteFrame';
import { loadSite, newsFor, PageHead, robotsFor } from '@/components/site/load';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ slug: string; key: string }>; searchParams: Promise<{ lang?: string }> };

/** 숨은 쪽 묶음: friends, friends-about … 은 첫 쪽(friends)으로 학교 이름 링크를 건다 */
const groupRoot = (key: string) => key.split('-')[0];

export default async function SitePage({ params, searchParams }: P) {
  const { slug, key } = await params;
  const L = await loadSite(slug, (await searchParams).lang);
  const entry = L ? await publicEntry(slug, 'page', key) : null;
  if (!L || !entry) notFound();
  const hidden = entry.visibility === 'unlisted';
  return (
    <SiteFrame site={L.site} lang={L.lang} current={`p:${key}`} path={`/p/${key}`} profile={L.profile} assetUrl={L.asset} hidden={hidden} brandHref={hidden ? `/p/${groupRoot(key)}` : '/'}
      langs={hidden ? L.site.langs.filter((l) => entry.content.title[l]) : undefined}>
      <PageHead content={entry.content} lang={L.lang} fallback={L.site.default_lang} asset={L.asset} link={L.link}
        crumb={L.site.theme === 'dawn' && !hidden ? { href: L.link('/'), label: siteText('home', L.lang) } : undefined} />
      <SiteBlocks content={entry.content} lang={L.lang} fallback={L.site.default_lang} assetUrl={L.asset} link={L.link} news={await newsFor(L.site, entry.content)}
        inquiry={{ slug: L.site.slug, open: !!L.site.inquiry_open, page: `/p/${entry.key}` }} subpages={hidden ? [] : subpagesOf(L.site.nav, entry.key)} />
    </SiteFrame>
  );
}

export async function generateMetadata({ params }: P) {
  const { slug, key } = await params;
  const L = await loadSite(slug);
  const entry = L ? await publicEntry(slug, 'page', key) : null;
  if (!L || !entry) return { title: '없는 쪽' };
  return { title: pick(entry.content.title, L.site.default_lang, L.site.default_lang), robots: robotsFor(entry) };
}
