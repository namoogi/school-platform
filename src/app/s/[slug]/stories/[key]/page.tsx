import { notFound } from 'next/navigation';
import { pick, publicEntry } from '@/lib/site';
import { SiteBlocks } from '@/components/site/SiteRenderer';
import { SiteFrame } from '@/components/site/SiteFrame';
import { ReadingNav } from '@/components/site/ReadingNav';
import { loadSite, newsFor, PageHead, robotsFor } from '@/components/site/load';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ slug: string; key: string }>; searchParams: Promise<{ lang?: string }> };

export default async function Item({ params, searchParams }: P) {
  const { slug, key } = await params;
  const L = await loadSite(slug, (await searchParams).lang);
  const entry = L ? await publicEntry(slug, 'story', key) : null;
  if (!L || !entry) notFound();
  const meta = entry.meta.virtue ? `${entry.meta.virtue}${entry.meta.character ? ` · ${entry.meta.character}` : ''}` : undefined;
  const listLabel = { ko: '동화 목록으로', en: 'Back to stories', th: 'กลับไปยังรายการนิทาน' }[L.lang];
  return (
    <SiteFrame site={L.site} lang={L.lang} current="stories" path={`/stories/${key}`} profile={L.profile} assetUrl={L.asset}>
      <ReadingNav listHref={L.link('/stories')} listLabel={listLabel} />
      <PageHead content={entry.content} lang={L.lang} fallback={L.site.default_lang} asset={L.asset} meta={meta} />
      <SiteBlocks content={entry.content} lang={L.lang} fallback={L.site.default_lang} assetUrl={L.asset} link={L.link}
        news={await newsFor(L.site, entry.content)} textInImage={String(entry.meta.text_in_image) === 'true'} />
      <ReadingNav listHref={L.link('/stories')} listLabel={listLabel} />
    </SiteFrame>
  );
}

export async function generateMetadata({ params }: P) {
  const { slug, key } = await params;
  const L = await loadSite(slug);
  const entry = L ? await publicEntry(slug, 'story', key) : null;
  if (!L || !entry) return { title: '없는 글' };
  return { title: pick(entry.content.title, L.site.default_lang, L.site.default_lang), robots: robotsFor(entry) };
}
