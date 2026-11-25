import { safeBack } from '@/lib/next-path';
import { notFound } from 'next/navigation';
import { loadForPage } from '@/lib/page';
import { NotFoundError } from '@/lib/services';
import { getEntry, getSettings, listAssets, listEntries, pick, type Lang, type PublicSite } from '@/lib/site';
import type { NewsItem } from '@/components/site/SiteRenderer';
import { LiveEditor } from './LiveEditor';

export const dynamic = 'force-dynamic';

/**
 * 35차 화면 편집 (ADR 0011 1단계). 공개 화면과 같은 틀(SiteFrame)·같은 그리기(SiteBlocks)에 최신 판을 넣고,
 * 편집 모드에서 그 자리에서 고친다. 저장은 기존 판 저장 API(시안), 공개는 학교 관리자(기존 RLS).
 * 읽기는 모두 asUser(RLS) — 이 학교 항목만 보인다. 다른 학교 항목 id 는 '없는 항목'이다.
 */
export default async function SiteEditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ back?: string }> }) {
  const { id } = await params;
  // 48차: 공개 화면의 '교직원 로그인'으로 왔으면 편집을 마치고 그 화면으로 돌아갈 링크
  const back = safeBack((await searchParams).back);
  const data = await loadForPage(async ({ db, school }) => {
    const settings = await getSettings(db, school.id);
    let detail;
    try { detail = await getEntry(db, school.id, id); } catch (e) { if (e instanceof NotFoundError) return null; throw e; }
    const entries = await listEntries(db, school.id);
    const home = entries.find((e) => e.kind === 'page' && e.key === 'home');
    const homeContent = home && home.id !== id ? (await getEntry(db, school.id, home.id)).versions[0]?.content : null;
    return { settings, detail, entries, homeContent, assets: await listAssets(db, school.id) };
  }, { module: 'homepage' });
  if (!data?.detail || !data.settings) notFound();
  const { school, settings, detail, entries, homeContent, assets } = data;

  // 틀(머리·메뉴·바닥)은 방문자가 볼 모습을 흉내 낸다: 메뉴는 지금 공개 중인 쪽, 머리·바닥 정보는 첫 화면 최신 판
  const live = entries.filter((e) => e.live_version != null && e.visibility === 'public');
  const frame: PublicSite = {
    slug: settings.public_slug, school: school.name, default_lang: settings.default_lang, langs: settings.langs, theme: settings.theme,
    title: settings.site_title, stories: school.modules.includes('stories') && live.some((e) => e.kind === 'story'),
    has_news: live.some((e) => e.kind === 'news'),
    nav: live.filter((e) => e.kind === 'page' && e.key !== 'home').map((e) => ({ key: e.key, title: e.latest_title })),
  };
  const news: NewsItem[] = live.filter((e) => e.kind === 'news').map((e) => ({ key: e.key, title: e.latest_title, published_at: e.updated_at }));
  const plain = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
  return (
    <LiveEditor
      detail={plain(detail)} frame={plain(frame)} langs={settings.langs as Lang[]} defaultLang={settings.default_lang as Lang}
      canPublish={school.isAdmin} assets={plain(assets.filter((a) => a.mime.startsWith('image/')).map((a) => ({ id: a.id, name: a.name })))} news={plain(news)}
      profile={plain((detail.entry.key === 'home' && detail.entry.kind === 'page' ? detail.versions[0]?.content.site : homeContent?.site) ?? null)}
      siteOpen={settings.is_open} backHref={back}
      pages={plain(entries.filter((e) => !e.archived_at).map((e) => ({ id: e.id, kind: e.kind, key: e.key, title: pick(e.latest_title, settings.default_lang, settings.default_lang) || e.key })))}
    />
  );
}
