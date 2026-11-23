import '@fontsource-variable/manrope/index.css';
import '@fontsource/noto-sans-thai/400.css';
import '@fontsource/noto-sans-thai/500.css';
import '@fontsource/noto-serif-thai/400.css';
import '@fontsource/noto-serif-kr/400.css';
import Link from 'next/link';
import { LANG_LABEL, pick, type Lang, type PublicSite, type SiteProfile } from '@/lib/site';

const T = {
  home: { ko: '홈', en: 'Home', th: 'หน้าแรก' }, news: { ko: '소식', en: 'News', th: 'ข่าวสาร' },
  stories: { ko: '성품 동화', en: 'Character Stories', th: 'นิทานคุณธรรม' }, lang: { ko: '언어', en: 'Language', th: 'ภาษา' },
  menu: { ko: '메뉴', en: 'Menu', th: 'เมนู' }, skip: { ko: '본문으로 건너뛰기', en: 'Skip to content', th: 'ข้ามไปยังเนื้อหา' },
  call: { ko: '전화', en: 'Phone', th: 'โทร' }, pages: { ko: '페이지', en: 'Pages', th: 'หน้า' },
} as const;
export const siteText = (k: keyof typeof T, lang: Lang) => T[k][lang];

export function resolveLang(site: PublicSite, requested?: string): Lang {
  return (site.langs as string[]).includes(requested ?? '') ? (requested as Lang) : site.default_lang;
}

/** 사이트 안 경로(/p/about, /news …)를 공개 주소로 바꾸고 지금 언어를 이어 붙인다(기본 언어면 붙이지 않음). */
export function siteLinker(site: PublicSite, lang: Lang) {
  const q = lang === site.default_lang ? '' : `?lang=${lang}`;
  return (p: string) => {
    if (p.startsWith('#')) return p;
    const [path, hash] = p.split('#');
    return `/s/${site.slug}${path === '/' ? '' : path}${q}${hash ? `#${hash}` : ''}`;
  };
}

/**
 * 공개 홈페이지 틀: 머리말(학교 이름·메뉴·언어) + 본문 + 꼬리말. 학교 운영 셸과는 별개.
 * theme="dawn"(새벽빛 매거진, 31차)은 같은 틀에 로고·소개 한 줄·방문 단추·바닥 정보를 더하고 CSS로 잡지 모양을 입힌다.
 * hidden(숨은 쪽, 예: 후원자 /friends)은 학교 메뉴를 보이지 않는다 — 학교 쪽에서 숨은 쪽으로 이끌지 않고, 숨은 쪽에서도 학교 메뉴로 흐름을 섞지 않는다.
 */
export function SiteFrame({ site, lang, current, path, profile, assetUrl, hidden = false, brandHref = '/', langs, children }: {
  site: PublicSite; lang: Lang; current: string; path: string; profile?: SiteProfile; assetUrl?: (id: string) => string;
  hidden?: boolean; /** 학교 이름 링크가 가는 곳(숨은 쪽 묶음이면 그 첫 쪽) */ brandHref?: string;
  /** 언어 고르기에 보일 언어(숨은 쪽은 그 쪽에 글이 있는 언어만) */ langs?: Lang[]; children: React.ReactNode;
}) {
  const link = siteLinker(site, lang);
  const q = (l: Lang) => (l === site.default_lang ? '' : `?lang=${l}`);
  const title = pick(site.title, lang, site.default_lang) || site.school;
  const t = (x: Parameters<typeof pick>[0]) => pick(x, lang, site.default_lang);
  const nav = hidden ? [] : [
    ...(site.theme === 'dawn' ? [] : [{ key: 'home', href: link('/'), label: siteText('home', lang) }]),
    ...site.nav.map((n) => ({ key: `p:${n.key}`, href: link(`/p/${n.key}`), label: pick(n.title, lang, site.default_lang) })),
    ...(site.has_news ? [{ key: 'news', href: link('/news'), label: siteText('news', lang) }] : []),
    ...(site.stories ? [{ key: 'stories', href: link('/stories'), label: siteText('stories', lang) }] : []),
  ];
  const visit = !hidden && profile?.visit && t(profile.visit.label) ? profile.visit : null;
  const navList = nav.map((n) => <Link key={n.key} href={n.href} aria-current={n.key === current ? 'page' : undefined}>{n.label}</Link>);
  return (
    <div className="site" data-theme={site.theme} data-hidden={hidden || undefined} lang={lang}>
      <a className="skip-link" href="#site-main">{siteText('skip', lang)}</a>
      <header className="site-header">
        <div className="site-wrap site-header-row">
          <Link href={link(brandHref)} className="site-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {profile?.logo && assetUrl && <img src={assetUrl(profile.logo)} alt="" width={52} height={52} />}
            <span><strong>{title}</strong>{t(profile?.tagline) && <small>{t(profile?.tagline)}</small>}</span>
          </Link>
          {(langs ?? site.langs).length > 1 && (
            <nav className="site-langs" aria-label={siteText('lang', lang)}>
              {(langs ?? site.langs).map((l) => <Link key={l} href={`/s/${site.slug}${path}${q(l)}`} aria-current={l === lang ? 'true' : undefined} hrefLang={l} lang={l}>{LANG_LABEL[l]}</Link>)}
            </nav>
          )}
          {visit && <Link className="site-button site-visit" href={visit.href.startsWith('/') ? link(visit.href) : visit.href}>{t(visit.label)}</Link>}
        </div>
        {nav.length > 0 && <>
          <nav className="site-wrap site-nav" aria-label={title}>{navList}</nav>
          {site.theme === 'dawn' && (
            <details className="site-wrap site-menu">
              <summary>{siteText('menu', lang)}</summary>
              <nav aria-label={`${title} ${siteText('menu', lang)}`}>{navList}</nav>
            </details>
          )}
        </>}
      </header>
      <main id="site-main" className="site-wrap site-main">{children}</main>
      <footer className="site-footer">
        {site.theme === 'dawn' && !hidden ? (
          <div className="site-wrap site-footer-grid">
            <div>
              <h2>{title}</h2>
              {t(profile?.address) && <p>{t(profile?.address)}</p>}
              {profile?.phone?.[0] && <p>{siteText('call', lang)} <a href={`tel:${profile.phone[0].replace(/[^0-9+]/g, '')}`}>{profile.phone[0]}</a></p>}
              {profile?.facebook && <p><a href={profile.facebook} target="_blank" rel="noopener noreferrer">Facebook</a></p>}
            </div>
            <nav aria-label={siteText('pages', lang)}>{nav.map((n) => <Link key={n.key} href={n.href}>{n.label}</Link>)}</nav>
            <div>{t(profile?.footer) && <p>{t(profile?.footer)}</p>}</div>
            <p className="site-footer-note">© {title}</p>
          </div>
        ) : <div className="site-wrap">© {site.school}</div>}
      </footer>
    </div>
  );
}
