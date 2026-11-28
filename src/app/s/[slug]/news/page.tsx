import Link from 'next/link';
import { notFound } from 'next/navigation';
import { storyTerm } from '@/lib/story-language';
import { pick, publicList } from '@/lib/site';
import { SiteFrame, siteText } from '@/components/site/SiteFrame';
import { loadSite } from '@/components/site/load';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> };

export default async function List({ params, searchParams }: P) {
  const { slug } = await params;
  const L = await loadSite(slug, (await searchParams).lang);
  if (!L) notFound();
  const { site, lang, link, asset } = L;
  const items = await publicList(slug, 'news');
  const t = (x: Parameters<typeof pick>[0]) => pick(x, lang, site.default_lang);
  return (
    <SiteFrame site={site} lang={lang} current="news" path="/news" profile={L.profile} assetUrl={asset}>
      <header className="site-head"><h1 className="site-h1">{siteText('news', lang)}</h1></header>
      <ul className="site-cards story-grid" data-testid="site-list">
        {items.map((s) => (
          <li key={s.key}><Link href={link(`/news/${s.key}`)}>
            {s.cover && /* eslint-disable-next-line @next/next/no-img-element */ <img src={asset(s.cover)} alt="" />}
            <b>{t(s.title)}</b>
            {s.meta.virtue && <small>{storyTerm(s.meta.virtue, lang)}</small>}
            {s.summary && <span>{t(s.summary)}</span>}
          </Link></li>
        ))}
      </ul>
    </SiteFrame>
  );
}

/** 69차: 목록 쪽 탭 제목에 학교 이름(전에는 플랫폼 기본 제목이 나갔다) */
export async function generateMetadata({ params }: P) {
  const L = await loadSite((await params).slug);
  return L ? { title: `${siteText('news', L.site.default_lang)} · ${pick(L.site.title, L.site.default_lang, L.site.default_lang) || L.site.school}` } : { title: '없는 홈페이지' };
}
