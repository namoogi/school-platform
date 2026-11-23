import { notFound } from 'next/navigation';
import { publicList, publicStoryContents } from '@/lib/site';
import { SiteFrame, siteText } from '@/components/site/SiteFrame';
import { loadSite } from '@/components/site/load';

import { StoryIndex } from '@/components/site/StoryIndex';
import { storyPortraitUrls } from '@/lib/story-index';
import { storyLanguages } from '@/lib/story-language';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> };

export default async function List({ params, searchParams }: P) {
  const { slug } = await params;
  const L = await loadSite(slug, (await searchParams).lang);
  if (!L || !L.site.stories) notFound();
  const { site, lang, link, asset } = L;
  const [items, contents] = await Promise.all([publicList(slug, 'story'), publicStoryContents(slug)]);
  const available = new Set(contents.filter((s) => storyLanguages(s.content).includes(lang)).map((s) => s.key));
  return (
    <SiteFrame site={site} lang={lang} current="stories" path="/stories" profile={L.profile} assetUrl={asset}>
      <header className="site-head"><h1 className="site-h1">{siteText('stories', lang)}</h1></header>
      <StoryIndex items={items.filter((s) => available.has(s.key))} portraits={storyPortraitUrls(slug, contents.map((s) => s.content), asset)} lang={lang} fallback={site.default_lang} link={link} />
    </SiteFrame>
  );
}
