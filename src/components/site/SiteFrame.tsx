import '@fontsource-variable/manrope/index.css';
import '@fontsource/noto-sans-thai/400.css';
import '@fontsource/noto-sans-thai/500.css';
import '@fontsource/noto-serif-thai/400.css';
import '@fontsource/noto-serif-kr/400.css';
import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { LANG_LABEL, pick, type Lang, type SiteProfile } from '@/lib/site-shared';
import type { PublicSite } from '@/lib/site';
import { hostLink } from '@/lib/site-hosts';

const T = {
  home: { ko: '홈', en: 'Home', th: 'หน้าแรก' }, news: { ko: '소식', en: 'News', th: 'ข่าวสาร' },
  stories: { ko: '성품 동화', en: 'Character Stories', th: 'นิทานคุณธรรม' }, lang: { ko: '언어', en: 'Language', th: 'ภาษา' },
  menu: { ko: '메뉴', en: 'Menu', th: 'เมนู' }, skip: { ko: '본문으로 건너뛰기', en: 'Skip to content', th: 'ข้ามไปยังเนื้อหา' },
  call: { ko: '전화', en: 'Phone', th: 'โทร' }, pages: { ko: '페이지', en: 'Pages', th: 'หน้า' },
  staff: { ko: '교직원 로그인', en: 'Staff sign-in', th: 'เข้าสู่ระบบบุคลากร' },
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
    return `${sitePath(site, path)}${q}${hash ? `#${hash}` : ''}`;
  };
}
/** 46차: 학교 자체 주소로 볼 때는 /about 처럼, 플랫폼 주소로 볼 때는 /s/<학교>/p/about 처럼 */
export function sitePath(site: PublicSite, path: string) {
  if (site.on_own_host) return path === '/' || path === '' ? '/' : hostLink(path);
  return `/s/${site.slug}${path === '/' ? '' : path}`;
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
  const dawn = site.theme === 'dawn';
  const nav = hidden ? [] : [
    ...(dawn ? [] : [{ key: 'home', href: link('/'), label: siteText('home', lang) }]),
    ...site.nav.map((n) => ({ key: `p:${n.key}`, href: link(`/p/${n.key}`), label: pick(n.title, lang, site.default_lang) })),
    ...(site.has_news ? [{ key: 'news', href: link('/news'), label: siteText('news', lang) }] : []),
    ...(site.stories ? [{ key: 'stories', href: link('/stories'), label: siteText('stories', lang) }] : []),
  ];
  const visit = !hidden && profile?.visit && t(profile.visit.label) ? profile.visit : null;
  const navList = nav.map((n) => <Link key={n.key} href={n.href} aria-current={n.key === current ? 'page' : undefined}>{n.label}</Link>);
  const langList = langs ?? site.langs;
  const langLinks = langList.map((l) => <Link key={l} href={`${sitePath(site, path || '/')}${q(l)}`} aria-current={l === lang ? 'true' : undefined} hrefLang={l} lang={l}>{LANG_LABEL[l]}</Link>);
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
          {/* 42차: 새벽빛은 옛 사이트처럼 메뉴를 머리 한 줄 안에 둔다 */}
          {dawn && nav.length > 0 && <nav className="site-nav site-nav-inline" aria-label={title}>{navList}</nav>}
          {langList.length > 1 && (dawn
            ? (
              <details className="site-lang-menu">
                <summary><span className="sr-only">{siteText('lang', lang)}: </span><span lang={lang}>{LANG_LABEL[lang]}</span><ChevronDown size={14} aria-hidden="true" /></summary>
                <nav aria-label={siteText('lang', lang)}>{langLinks}</nav>
              </details>
            )
            : <nav className="site-langs" aria-label={siteText('lang', lang)}>{langLinks}</nav>)}
          {visit && <Link className="site-button site-visit" href={visit.href.startsWith('/') ? link(visit.href) : visit.href}>{t(visit.label)}</Link>}
        </div>
        {nav.length > 0 && <>
          {!dawn && <nav className="site-wrap site-nav" aria-label={title}>{navList}</nav>}
          {dawn && (
            <details className="site-wrap site-menu">
              <summary>{siteText('menu', lang)}</summary>
              <nav aria-label={`${title} ${siteText('menu', lang)}`}>{navList}</nav>
            </details>
          )}
        </>}
      </header>
      <main id="site-main" className="site-wrap site-main">{children}</main>
      <footer className="site-footer">
        {dawn && !hidden ? (
          <div className="site-wrap site-footer-grid">
            <div className="site-footer-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {profile?.logo && assetUrl && <img src={assetUrl(profile.logo)} alt="" width={56} height={56} />}
              <h2>{title}</h2>
              {t(profile?.tagline) && <p>{t(profile?.tagline)}</p>}
            </div>
            <nav aria-label={siteText('pages', lang)}>
              <Link href={link('/')}>{siteText('home', lang)}</Link>
              {nav.map((n) => <Link key={n.key} href={n.href}>{n.label}</Link>)}
            </nav>
            <div className="site-footer-contact">
              {t(profile?.address) && <p>{t(profile?.address)}</p>}
              {/* 옛 바닥처럼 마지막 번호(사무실) 하나 */}
              {profile?.phone?.length ? <p><a href={`tel:${profile.phone.at(-1)!.replace(/[^0-9+]/g, '')}`} aria-label={`${siteText('call', lang)} ${profile.phone.at(-1)}`}>{profile.phone.at(-1)}</a></p> : null}
              {profile?.facebook && <p><a className="site-link" href={profile.facebook} target="_blank" rel="noopener noreferrer">Facebook<ArrowRight className="link-arrow" size={20} strokeWidth={1.4} aria-hidden="true" /></a></p>}
            </div>
            <div className="site-footer-note">
              <p>{t(profile?.footer) || `© ${title}`}</p>
              <Link className="site-footer-staff" href="/login">{siteText('staff', lang)}</Link>
            </div>
          </div>
        ) : <div className="site-wrap">© {site.school}</div>}
      </footer>
    </div>
  );
}
