import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pick, publicList } from '@/lib/site';
import { SiteFrame, siteText } from '@/components/site/SiteFrame';
import { loadSite } from '@/components/site/load';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> };

export default async function List({ params, searchParams }: P) {
  const { slug } = await params;
  const L = await loadSite(slug, (await searchParams).lang);
  if (!L || !L.site.stories) notFound();
  const { site, lang, link, asset } = L;
  const items = await publicList(slug, 'story');
  const t = (x: Parameters<typeof pick>[0]) => pick(x, lang, site.default_lang);
  return (
    <SiteFrame site={site} lang={lang} current="stories" path="/stories" profile={L.profile} assetUrl={asset}>
      <header className="site-head"><h1 className="site-h1">{siteText('stories', lang)}</h1></header>
      <ul className="site-cards story-grid" data-testid="site-list">
        {items.map((s) => (
          <li key={s.key}><Link href={link(`/stories/${s.key}`)}>
            {s.cover && /* eslint-disable-next-line @next/next/no-img-element */ <img src={asset(s.cover)} alt="" />}
            <b>{t(s.title)}</b>
            {s.meta.virtue && <small>{s.meta.virtue}</small>}
            {s.summary && <span>{t(s.summary)}</span>}
          </Link></li>
        ))}
      </ul>
    </SiteFrame>
  );
}
