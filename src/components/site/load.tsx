import { publicEntry, publicList, publicSite, type Content, type PublicEntry, type PublicSite } from '@/lib/site';
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

export { PageHead } from './SiteRenderer';

export const robotsFor = (entry: PublicEntry | null) => (entry?.visibility === 'unlisted' ? { index: false, follow: false } : undefined);
