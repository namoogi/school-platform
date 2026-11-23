import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pick, publicList, publicSite } from '@/lib/site';
import { resolveLang, SiteFrame, siteText } from '@/components/site/SiteFrame';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> };

export default async function List({ params, searchParams }: P) {
  const { slug } = await params;
  const site = await publicSite(slug);
  if (!site || !site.stories) notFound();
  const lang = resolveLang(site, (await searchParams).lang);
  const items = await publicList(slug, 'story');
  const q = lang === site.default_lang ? '' : `?lang=${lang}`;
  return (
    <SiteFrame site={site} lang={lang} current="stories" path="/stories">
      <h1 className="site-h1">{siteText('stories', lang)}</h1>
      <ul className="site-cards" data-testid="site-list">
        {items.map((s) => (
          <li key={s.key}><Link href={`/s/${slug}/stories/${s.key}${q}`}>
            {s.cover && /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/s/${slug}/a/${s.cover}`} alt="" />}
            <b>{pick(s.title, lang, site.default_lang)}</b>
            {s.meta.virtue && <small>{s.meta.virtue}</small>}
            {s.summary && <span>{pick(s.summary, lang, site.default_lang)}</span>}
          </Link></li>
        ))}
      </ul>
    </SiteFrame>
  );
}
