import { pick, publicEntry, publicList, publicSite, type Content, type Lang, type PublicEntry, type PublicSite } from '@/lib/site';
import { resolveLang, siteLinker } from './SiteFrame';
import type { NewsItem } from './SiteRenderer';

/**
 * 31차: 공개 화면 공용 읽기. 사이트 + 'home' 쪽(머리·바닥 정보가 든 판)을 함께 읽는다.
 * 모두 asPublic(anon, 지금 공개된 판만)으로 읽으므로 시안이나 내린 판은 나오지 않는다.
 */
export async function loadSite(slug: string, requestedLang?: string) {
  const site = await publicSite(slug);
  if (!site) return null;
  const home = await publicEntry(slug, 'page', 'home');
  const lang = resolveLang(site, requestedLang);
  return { site, home, profile: home?.content.site, lang, link: siteLinker(site, lang), asset: (id: string) => `/s/${slug}/a/${id}` };
}
export type Loaded = NonNullable<Awaited<ReturnType<typeof loadSite>>>;

/** 내용에 '최근 소식' 블록이 있을 때만 소식 목록을 읽는다 */
export async function newsFor(site: PublicSite, content: Content | undefined): Promise<NewsItem[]> {
  return site.has_news && content?.blocks.some((b) => b.type === 'news_list') ? publicList(site.slug, 'news') : [];
}

/** 쪽 머리: 머리말 · 제목 · 소개. dawn 에서는 잡지형 머리(.editorial-heading), 첫 화면은 표지 사진이 붙는 여는 머리. */
export function PageHead({ content, lang, fallback, asset, meta }: { content: Content; lang: Lang; fallback: Lang; asset: (id: string) => string; meta?: string }) {
  const t = (x: Parameters<typeof pick>[0]) => pick(x, lang, fallback);
  const opening = content.head?.layout === 'opening';
  return (
    <header className={opening ? 'site-head site-opening' : 'site-head'}>
      {t(content.head?.eyebrow) && <span className="sec-eyebrow">{t(content.head?.eyebrow)}</span>}
      <h1 className="site-h1">{t(content.title)}</h1>
      {meta && <p className="site-meta">{meta}</p>}
      {t(content.summary) && <p className="site-lead">{t(content.summary)}</p>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {opening && content.cover && <figure className="site-panorama"><img src={asset(content.cover)} alt="" /></figure>}
    </header>
  );
}

export const robotsFor = (entry: PublicEntry | null) => (entry?.visibility === 'unlisted' ? { index: false, follow: false } : undefined);
