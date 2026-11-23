import Link from 'next/link';
import { LANG_LABEL, pick, type Lang, type PublicSite } from '@/lib/site';

const T = {
  home: { ko: '홈', en: 'Home', th: 'หน้าแรก' }, news: { ko: '소식', en: 'News', th: 'ข่าวสาร' },
  stories: { ko: '성품 동화', en: 'Character Stories', th: 'นิทานคุณธรรม' }, lang: { ko: '언어', en: 'Language', th: 'ภาษา' },
} as const;
export const siteText = (k: keyof typeof T, lang: Lang) => T[k][lang];

export function resolveLang(site: PublicSite, requested?: string): Lang {
  return (site.langs as string[]).includes(requested ?? '') ? (requested as Lang) : site.default_lang;
}

/** 공개 홈페이지 틀: 머리말(학교 이름·메뉴·언어) + 본문 + 꼬리말. 학교 운영 화면 셸과는 별개. */
export function SiteFrame({ site, lang, current, path, children }: { site: PublicSite; lang: Lang; current: string; path: string; children: React.ReactNode }) {
  const q = (l: Lang) => (l === site.default_lang ? '' : `?lang=${l}`);
  const href = (p: string) => `/s/${site.slug}${p}${q(lang)}`;
  const title = pick(site.title, lang, site.default_lang) || site.school;
  const nav = [
    { key: 'home', href: href(''), label: siteText('home', lang) },
    ...site.nav.map((n) => ({ key: `p:${n.key}`, href: href(`/p/${n.key}`), label: pick(n.title, lang, site.default_lang) })),
    ...(site.has_news ? [{ key: 'news', href: href('/news'), label: siteText('news', lang) }] : []),
    ...(site.stories ? [{ key: 'stories', href: href('/stories'), label: siteText('stories', lang) }] : []),
  ];
  return (
    <div className="site" data-theme={site.theme} lang={lang}>
      <a className="skip-link" href="#site-main">{lang === 'ko' ? '본문으로 건너뛰기' : lang === 'th' ? 'ข้ามไปยังเนื้อหา' : 'Skip to content'}</a>
      <header className="site-header">
        <div className="site-wrap site-header-row">
          <Link href={href('')} className="site-brand">{title}</Link>
          {site.langs.length > 1 && (
            <nav className="site-langs" aria-label={siteText('lang', lang)}>
              {site.langs.map((l) => <Link key={l} href={`/s/${site.slug}${path}${q(l)}`} aria-current={l === lang ? 'true' : undefined} hrefLang={l} lang={l}>{LANG_LABEL[l]}</Link>)}
            </nav>
          )}
        </div>
        <nav className="site-wrap site-nav" aria-label={title}>
          {nav.map((n) => <Link key={n.key} href={n.href} aria-current={n.key === current ? 'page' : undefined}>{n.label}</Link>)}
        </nav>
      </header>
      <main id="site-main" className="site-wrap site-main">{children}</main>
      <footer className="site-footer"><div className="site-wrap">© {site.school}</div></footer>
    </div>
  );
}
