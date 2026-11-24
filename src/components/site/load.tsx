import { headers } from 'next/headers';
import { publicEntry, publicList, publicSite, type Content, type PublicEntry, type PublicSite } from '@/lib/site';
import { SCHOOL_HOST_HEADER } from '@/lib/site-hosts';
import { currentUserId } from '@/lib/auth';
import { asUser } from '@/lib/db';
import { resolveLang, siteLinker } from './SiteFrame';
import type { NewsItem } from './SiteRenderer';

/**
 * 31차: 공개 화면 공용 읽기. 사이트 + 'home' 쪽(머리·바닥 정보가 든 판)을 함께 읽는다.
 * 모두 asPublic(anon, 지금 공개된 판만)으로 읽으므로 시안이나 내린 판은 나오지 않는다.
 */
export async function loadSite(slug: string, requestedLang?: string) {
  const found = await publicSite(slug);
  if (!found) return null;
  // 47차: 학교 자체 주소로 들어왔으면(proxy 가 표시) 링크를 깨끗한 경로로 만든다
  const site: PublicSite = { ...found, on_own_host: (await headers()).get(SCHOOL_HOST_HEADER) === slug, viewer_admin: await viewerIsAdmin(slug) };
  const home = await publicEntry(slug, 'page', 'home');
  const lang = resolveLang(site, requestedLang);
  return { site, home, profile: home?.content.site, lang, link: siteLinker(site, lang), asset: (id: string) => `/s/${slug}/a/${id}` };
}
/** 49차: 로그인 쿠키가 있을 때만 그 학교 관리자인지 본다(RLS 안에서). 없으면 질의하지 않는다 */
async function viewerIsAdmin(slug: string): Promise<boolean> {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return false;
  return asUser(userId, async (db) => {
    const { rows: [r] } = await db.query<{ ok: boolean }>('select app.is_school_admin(school_id) as ok from public.site_settings where public_slug = $1', [slug]);
    return !!r?.ok;
  }).catch(() => false);
}
export type Loaded = NonNullable<Awaited<ReturnType<typeof loadSite>>>;

/** 내용에 '최근 소식' 블록이 있을 때만 소식 목록을 읽는다 */
export async function newsFor(site: PublicSite, content: Content | undefined): Promise<NewsItem[]> {
  return site.has_news && content?.blocks.some((b) => b.type === 'news_list') ? publicList(site.slug, 'news') : [];
}

export { PageHead } from './SiteRenderer';

export const robotsFor = (entry: PublicEntry | null) => (entry?.visibility === 'unlisted' ? { index: false, follow: false } : undefined);
