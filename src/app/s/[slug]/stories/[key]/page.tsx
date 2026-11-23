import { notFound } from 'next/navigation';
import { pick, publicEntry, publicSite } from '@/lib/site';
import { SiteBlocks } from '@/components/site/SiteRenderer';
import { resolveLang, SiteFrame } from '@/components/site/SiteFrame';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ slug: string; key: string }>; searchParams: Promise<{ lang?: string }> };

export default async function Item({ params, searchParams }: P) {
  const { slug, key } = await params;
  const site = await publicSite(slug);
  const entry = site ? await publicEntry(slug, 'story', key) : null;
  if (!site || !entry) notFound();
  const lang = resolveLang(site, (await searchParams).lang);
  return (
    <SiteFrame site={site} lang={lang} current="stories" path={`/stories/${key}`}>
      <h1 className="site-h1">{pick(entry.content.title, lang, site.default_lang)}</h1>
      {entry.meta.virtue && <p className="site-meta">{entry.meta.virtue}{entry.meta.character ? ` · ${entry.meta.character}` : ''}</p>}
      <SiteBlocks content={entry.content} lang={lang} fallback={site.default_lang} assetUrl={(id) => `/s/${slug}/a/${id}`} />
    </SiteFrame>
  );
}

export async function generateMetadata({ params }: P) {
  const { slug, key } = await params;
  const site = await publicSite(slug);
  const entry = site ? await publicEntry(slug, 'story', key) : null;
  if (!site || !entry) return { title: '없는 글' };
  return { title: pick(entry.content.title, site.default_lang, site.default_lang), robots: entry.visibility === 'unlisted' ? { index: false, follow: false } : undefined };
}
