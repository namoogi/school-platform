import { notFound } from 'next/navigation';
import { publicList, publicStoryContents } from '@/lib/site';
import { SiteFrame, siteText } from '@/components/site/SiteFrame';
import { loadSite } from '@/components/site/load';

import { StoryIndex } from '@/components/site/StoryIndex';
import { storyPortraitUrls } from '@/lib/story-index';
import { storyLanguages } from '@/lib/story-language';
import { BookOpen, Leaf } from 'lucide-react';

const OPENING = {
  ko: '마음이 자라는 이야기 숲',
  en: 'A forest of stories, a place to grow',
  th: 'ป่าแห่งนิทาน ที่หัวใจค่อย ๆ เติบโต',
};

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
      <div className="story-library">
        <header className="story-library-opening">
          <span className="story-library-emblem" aria-hidden="true"><BookOpen size={36} strokeWidth={1.4} /><Leaf size={20} strokeWidth={1.4} /></span>
          <p className="story-library-eyebrow">{OPENING[lang]}</p>
          <h1 className="site-h1">{siteText('stories', lang)}</h1>
        </header>
        <StoryIndex items={items.filter((s) => available.has(s.key))} portraits={storyPortraitUrls(slug, contents.map((s) => s.content), asset)} lang={lang} fallback={site.default_lang} link={link} />
      </div>
    </SiteFrame>
  );
}
