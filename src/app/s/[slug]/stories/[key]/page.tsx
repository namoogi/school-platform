import { notFound } from 'next/navigation';
import Link from 'next/link';
import { publicEntry } from '@/lib/site';
import { SiteBlocks } from '@/components/site/SiteRenderer';
import { SiteFrame, sitePath, siteText } from '@/components/site/SiteFrame';
import { ReadingNav } from '@/components/site/ReadingNav';
import { loadSite, newsFor, PageHead, robotsFor } from '@/components/site/load';
import { storyLanguages, storyTerm } from '@/lib/story-language';
import { LANG_LABEL } from '@/lib/site-shared';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ slug: string; key: string }>; searchParams: Promise<{ lang?: string }> };

export default async function Item({ params, searchParams }: P) {
  const { slug, key } = await params;
  const L = await loadSite(slug, (await searchParams).lang);
  const entry = L ? await publicEntry(slug, 'story', key) : null;
  if (!L || !entry) notFound();
  const meta = entry.meta.virtue ? storyTerm(`${entry.meta.virtue}${entry.meta.character ? ` · ${entry.meta.character}` : ''}`, L.lang) : undefined;
  const listLabel = { ko: '동화 목록으로', en: 'Back to stories', th: 'กลับไปยังรายการนิทาน' }[L.lang];
  const available = storyLanguages(entry.content);
  if (!available.includes(L.lang)) return (
    <SiteFrame site={L.site} lang={L.lang} current="stories" path={`/stories/${key}`} profile={L.profile} assetUrl={L.asset}>
      <ReadingNav listHref={L.link('/stories')} listLabel={listLabel} />
      <h1 className="site-h1">{{ ko: '한국어 번역을 준비하고 있어요', en: 'This story is not available in English yet', th: 'กำลังเตรียมคำแปลภาษาไทยของนิทานเรื่องนี้' }[L.lang]}</h1>
      <ul>{available.filter((l) => L.site.langs.includes(l)).map((l) => <li key={l}><Link href={`${sitePath(L.site, `/stories/${key}`)}?lang=${l}`} hrefLang={l} lang={l}>{LANG_LABEL[l]}</Link></li>)}</ul>
    </SiteFrame>
  );
  return (
    <SiteFrame site={L.site} lang={L.lang} current="stories" path={`/stories/${key}`} profile={L.profile} assetUrl={L.asset}>
      <ReadingNav listHref={L.link('/stories')} listLabel={listLabel} />
      <PageHead content={entry.content} lang={L.lang} fallback={L.site.default_lang} asset={L.asset} meta={meta} link={L.link}
        crumb={L.site.theme === 'dawn' ? { href: L.link('/'), label: siteText('home', L.lang) } : undefined} />
      <SiteBlocks content={entry.content} lang={L.lang} fallback={L.site.default_lang} assetUrl={L.asset} link={L.link}
        news={await newsFor(L.site, entry.content)} textInImage={String(entry.meta.text_in_image) === 'true'} />
      <ReadingNav listHref={L.link('/stories')} listLabel={listLabel} />
    </SiteFrame>
  );
}

export async function generateMetadata({ params, searchParams }: P) {
  const { slug, key } = await params;
  const L = await loadSite(slug, (await searchParams).lang);
  const entry = L ? await publicEntry(slug, 'story', key) : null;
  if (!L || !entry) return { title: '없는 글' };
  return { title: entry.content.title[L.lang] || siteText('stories', L.lang), robots: storyLanguages(entry.content).includes(L.lang) ? robotsFor(entry) : { ...robotsFor(entry), index: false } };
}
