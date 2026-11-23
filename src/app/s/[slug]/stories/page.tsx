import { notFound } from 'next/navigation';
import { publicList, publicStoryCharacterContent } from '@/lib/site';
import { SiteFrame, siteText } from '@/components/site/SiteFrame';
import { loadSite } from '@/components/site/load';

import { StoryIndex } from '@/components/site/StoryIndex';
import { characterPortraits } from '@/lib/story-index';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> };

export default async function List({ params, searchParams }: P) {
  const { slug } = await params;
  const L = await loadSite(slug, (await searchParams).lang);
  if (!L || !L.site.stories) notFound();
  const { site, lang, link, asset } = L;
  const [items, characterContent] = await Promise.all([publicList(slug, 'story'), publicStoryCharacterContent(slug)]);
  return (
    <SiteFrame site={site} lang={lang} current="stories" path="/stories" profile={L.profile} assetUrl={asset}>
      <header className="site-head"><h1 className="site-h1">{siteText('stories', lang)}</h1></header>
      <StoryIndex items={items} portraits={characterPortraits(characterContent)} lang={lang} fallback={site.default_lang} link={link} asset={asset} />
    </SiteFrame>
  );
}
