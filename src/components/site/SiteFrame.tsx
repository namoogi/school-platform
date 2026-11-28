import '@fontsource-variable/manrope/index.css';
import '@fontsource/noto-sans-thai/400.css';
import '@fontsource/noto-sans-thai/500.css';
import '@fontsource/noto-serif-thai/400.css';
import '@fontsource/noto-serif-kr/400.css';
import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { buildNavTree, LANG_LABEL, pick, type Lang, type SiteProfile } from '@/lib/site-shared';
import type { PublicSite } from '@/lib/site';
import { hostForSlug, hostLink, PLATFORM_ORIGIN } from '@/lib/site-hosts';
import { Suspense } from 'react';
import { AutoCloseDetails } from './AutoCloseDetails';
import { SiteToc } from './SiteToc';

const T = {
  home: { ko: '홈', en: 'Home', th: 'หน้าแรก' }, news: { ko: '소식', en: 'News', th: 'ข่าวสาร' },
  stories: { ko: '성품 동화', en: 'Character Stories', th: 'นิทานคุณธรรม' }, lang: { ko: '언어', en: 'Language', th: 'ภาษา' },
  menu: { ko: '메뉴', en: 'Menu', th: 'เมนู' }, skip: { ko: '본문으로 건너뛰기', en: 'Skip to content', th: 'ข้ามไปยังเนื้อหา' },
  call: { ko: '전화', en: 'Phone', th: 'โทร' }, pages: { ko: '페이지', en: 'Pages', th: 'หน้า' },
  staff: { ko: '교직원 로그인', en: 'Staff sign-in', th: 'เข้าสู่ระบบบุคลากร' },
  toc: { ko: '이 쪽 차례', en: 'On this page', th: 'ในหน้านี้' },
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
/**
 * 48차: '교직원 로그인' = 이 화면 편집. 로그인한 뒤 지금 보는 쪽의 화면 편집으로 바로 가고, 편집을 마치면 이 화면으로 돌아온다.
 * 학교 주소(rungarunsuksa.vercel.app 등)에서는 로그인·편집을 플랫폼 주소에서 한다(로그인 쿠키는 주소마다 따로이므로).
 */
export function staffEditHref(site: PublicSite, path: string) {
  const m = /^\/(p|news|stories)\/([a-z0-9][a-z0-9-]{0,59})$/.exec(path);
  const [kind, key] = !path || path === '/' ? ['page', 'home'] : m ? [m[1] === 'p' ? 'page' : m[1] === 'news' ? 'news' : 'story', m[2]] : [path.startsWith('/stories') ? 'story' : 'news', ''];
  const host = site.on_own_host ? hostForSlug(site.slug) : null;
  const back = host ? `https://${host}${sitePath(site, path || '/')}` : sitePath(site, path || '/');
  const q = new URLSearchParams({ slug: site.slug, kind, key, back });
  return `${host ? PLATFORM_ORIGIN : ''}/site/open?${q}`;
}
/** 49차: 관리 막대의 다른 길(소식 쓰기·홈페이지 관리·개선 요청) — 학교를 먼저 맞추려고 모두 /site/open 을 거친다 */
const staffHref = (site: PublicSite, to: 'news' | 'manage' | 'chat') => `${site.on_own_host ? PLATFORM_ORIGIN : ''}/site/open?${new URLSearchParams({ slug: site.slug, to })}`;
/** 47차: 학교 자체 주소로 볼 때는 /about 처럼, 플랫폼 주소로 볼 때는 /s/<학교>/p/about 처럼 */
export function sitePath(site: PublicSite, path: string) {
  if (site.on_own_host) return path === '/' || path === '' ? '/' : hostLink(path);
  return `/s/${site.slug}${path === '/' ? '' : path}`;
}

/**
 * 공개 홈페이지 틀: 머리말(학교 이름·메뉴·언어) + 본문 + 꼬리말. 학교 운영 셸과는 별개.
 * theme="dawn"(새벽빛 매거진, 31차)은 같은 틀에 로고·소개 한 줄·방문 단추·바닥 정보를 더하고 CSS로 잡지 모양을 입힌다.
 * hidden(숨은 쪽, 예: 후원자 /friends)은 학교 메뉴를 보이지 않는다 — 학교 쪽에서 숨은 쪽으로 이끌지 않고, 숨은 쪽에서도 학교 메뉴로 흐름을 섞지 않는다.
 */
export function SiteFrame({ site, lang, current, path, profile, assetUrl, hidden = false, brandHref = '/', langs, preview, children }: {
  site: PublicSite; lang: Lang; current: string; path: string; profile?: SiteProfile; assetUrl?: (id: string) => string;
  /** 89차: 템플릿 전체 화면 미리보기 — 사이트 안 링크·언어 링크를 미리보기 주소로 바꾸고 교직원 링크는 숨긴다 */
  preview?: { link: (path: string) => string; langHref: (l: Lang) => string };
  hidden?: boolean; /** 학교 이름 링크가 가는 곳(숨은 쪽 묶음이면 그 첫 쪽) */ brandHref?: string;
  /** 언어 고르기에 보일 언어(숨은 쪽은 그 쪽에 글이 있는 언어만) */ langs?: Lang[]; children: React.ReactNode;
}) {
  const link = preview?.link ?? siteLinker(site, lang);
  const q = (l: Lang) => (l === site.default_lang ? '' : `?lang=${l}`);
  const title = pick(site.title, lang, site.default_lang) || site.school;
  const t = (x: Parameters<typeof pick>[0]) => pick(x, lang, site.default_lang);
  const dawn = site.theme === 'dawn';
  // 100차: 템플릿 키트 디자인(campus·dawn 제외)은 한 줄 머리글(이름 · 메뉴 · 언어 · 주요 행동)과 4칸 바닥글을 쓴다
  const kit = !dawn && site.theme !== 'campus';
  // 89차: 새벽빛과 템플릿 완성 디자인(ADR 0034)은 학교 이름·메뉴·연락처가 있는 넓은 바닥을 쓴다(학사 기본만 한 줄 바닥)
  const richFooter = site.theme !== 'campus';
  const nav = hidden ? [] : [
    ...(dawn ? [] : [{ key: 'home', href: link('/'), label: siteText('home', lang) }]),
    ...site.nav.map((n) => ({ key: `p:${n.key}`, href: link(`/p/${n.key}`), label: pick(n.title, lang, site.default_lang) })),
    ...(site.has_news ? [{ key: 'news', href: link('/news'), label: siteText('news', lang) }] : []),
    ...(site.stories ? [{ key: 'stories', href: link('/stories'), label: siteText('stories', lang) }] : []),
  ];
  const visit = !hidden && profile?.visit && t(profile.visit.label) ? profile.visit : null;
  const navList = nav.map((n) => <Link key={n.key} href={n.href} aria-current={n.key === current ? 'page' : undefined}>{n.label}</Link>);
  // 126차(ADR 0046): 키트 디자인은 두 단계 메뉴(상위 쪽 아래 하위 쪽·메뉴 주소 구역). campus·dawn은 지금처럼 한 줄
  const tree = kit && !hidden ? [
    { key: 'home', href: link('/'), title: { [lang]: siteText('home', lang) },
      children: (site.home_sections ?? []).map((x) => ({ key: `home#${x.anchor}`, href: `${link('/')}#${x.anchor}`, title: x.title })) },
    ...buildNavTree(site.nav, (k, a) => `${link(`/p/${k}`)}${a ? `#${a}` : ''}`, site.has_news ? { href: link('/news'), title: { [lang]: siteText('news', lang) } } : undefined),
    ...(site.stories ? [{ key: 'stories', href: link('/stories'), title: { [lang]: siteText('stories', lang) }, children: [] }] : []),
  ] : [];
  const here = (n: (typeof tree)[number]) => n.key === current || n.children.some((c) => c.key === current);
  // 136차(ADR 0052): 메뉴 구조. side = 하위 쪽이 있는 묶음 안에서는 옆에 형제 쪽 메뉴, onepage = 홈 구역 차례가 오른쪽에 따라온다
  const layout = kit && !hidden ? profile?.layout : undefined;
  const group = layout === 'side' ? tree.find((n) => n.key !== 'home' && n.children.length > 0 && here(n)) : undefined;
  const toc = layout === 'onepage' && current === 'home' ? (tree[0]?.children ?? []) : [];
  const subList = (n: (typeof tree)[number]) => n.children.length > 0 && (
    <ul className="site-subnav">{n.children.map((c) => <li key={c.key}><Link href={c.href} aria-current={c.key === current ? 'page' : undefined}>{t(c.title)}</Link></li>)}</ul>);
  const treeInline = (
    <ul className="site-nav-tree">{tree.map((n) => (
      <li key={n.key} data-sub={n.children.length > 0 || undefined}>
        <Link href={n.href} aria-current={n.key === current ? 'page' : here(n) ? 'true' : undefined}>{t(n.title)}</Link>{subList(n)}
      </li>))}</ul>);
  const treeMenu = (
    <ul className="site-menu-tree">{tree.map((n) => (
      <li key={n.key}>{n.children.length > 0
        ? <details open={here(n) || undefined}><summary aria-current={here(n) ? 'true' : undefined}>{t(n.title)}<ChevronDown size={18} aria-hidden="true" /></summary>
            <ul className="site-subnav"><li><Link href={n.href} aria-current={n.key === current ? 'page' : undefined}>{t(n.title)}</Link></li>{n.children.map((c) => <li key={c.key}><Link href={c.href} aria-current={c.key === current ? 'page' : undefined}>{t(c.title)}</Link></li>)}</ul></details>
        : <Link href={n.href} aria-current={n.key === current ? 'page' : undefined}>{t(n.title)}</Link>}</li>))}</ul>);
  const langList = langs ?? site.langs;
  const langLinks = langList.map((l) => <Link key={l} href={preview ? preview.langHref(l) : `${sitePath(site, path || '/')}${q(l)}`} aria-current={l === lang ? 'true' : undefined} hrefLang={l} lang={l}>{LANG_LABEL[l]}</Link>);
  return (
    <div className="site" data-theme={site.theme} data-home={current === 'home' || undefined} data-hidden={hidden || undefined} lang={lang}>
      <a className="skip-link" href="#site-main">{siteText('skip', lang)}</a>
      {(site.viewer_admin || site.viewer_staff) && (
        <nav className="site-admin-bar" aria-label={site.viewer_admin ? '학교 관리자' : '학교 교직원'} data-testid="site-admin-bar" data-role={site.viewer_admin ? 'admin' : 'staff'}>
          <span>{site.viewer_admin ? '관리자로 보는 중' : '교직원으로 보는 중 · 시안 저장까지, 공개는 관리자'}</span>
          <a href={staffEditHref(site, path)}>이 화면 편집</a>
          <a href={staffHref(site, 'news')}>소식 쓰기</a>
          <a href={staffHref(site, 'manage')}>홈페이지 관리</a>
          <a href={staffHref(site, 'chat')}>개선 요청</a>
        </nav>
      )}
      <header className="site-header">
        {/* 107차: 머리글 위 작은 줄(주소·전화·언어) — 템플릿 키트 디자인만 */}
        {kit && (t(profile?.address) || profile?.phone?.length || langList.length > 1) && (
          <div className="site-topbar">
            <div className="site-wrap site-topbar-row">
              <p>
                {t(profile?.address) && <span>{t(profile?.address)}</span>}
                {profile?.phone?.length ? <a href={`tel:${profile.phone.at(-1)!.replace(/[^0-9+]/g, '')}`} aria-label={`${siteText('call', lang)} ${profile.phone.at(-1)}`}>{profile.phone.at(-1)}</a> : null}
              </p>
              {langList.length > 1 && <nav className="site-langs" aria-label={siteText('lang', lang)}>{langLinks}</nav>}
            </div>
          </div>
        )}
        <div className="site-wrap site-header-row">
          <Link href={link(brandHref)} className="site-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {profile?.logo && assetUrl && <img src={assetUrl(profile.logo)} alt="" width={52} height={52} />}
            <span><strong>{title}</strong>{t(profile?.tagline) && <small>{t(profile?.tagline)}</small>}</span>
          </Link>
          {/* 42차: 새벽빛은 옛 사이트처럼 메뉴를 머리 한 줄 안에 둔다 */}
          {(dawn || kit) && nav.length > 0 && <nav className="site-nav site-nav-inline" aria-label={title}>{kit ? treeInline : navList}</nav>}
          {langList.length > 1 && !kit && (dawn
            ? (
              <Suspense fallback={<details className="site-lang-menu"><summary><span lang={lang}>{LANG_LABEL[lang]}</span></summary></details>}>
                {/* 언어를 바꾸거나 다른 곳을 누르면 저절로 닫힌다 */}
                <AutoCloseDetails className="site-lang-menu"
                  summary={<><span className="sr-only">{siteText('lang', lang)}: </span><span lang={lang}>{LANG_LABEL[lang]}</span><ChevronDown size={14} aria-hidden="true" /></>}>
                  <nav aria-label={siteText('lang', lang)}>{langLinks}</nav>
                </AutoCloseDetails>
              </Suspense>
            )
            : <nav className="site-langs" aria-label={siteText('lang', lang)}>{langLinks}</nav>)}
          {visit && <Link className="site-button site-visit" href={visit.href.startsWith('/') ? link(visit.href) : visit.href}>{t(visit.label)}</Link>}
        </div>
        {nav.length > 0 && <>
          {!dawn && !kit && <nav className="site-wrap site-nav" aria-label={title}>{navList}</nav>}
          {(dawn || kit) && (
            <Suspense fallback={<details className="site-wrap site-menu"><summary>{siteText('menu', lang)}</summary></details>}>
              <AutoCloseDetails className="site-wrap site-menu" summary={siteText('menu', lang)}>
                <nav aria-label={`${title} ${siteText('menu', lang)}`}>{kit ? treeMenu : navList}</nav>
              </AutoCloseDetails>
            </Suspense>
          )}
        </>}
      </header>
      {group ? (
        <div className="site-wrap site-side" data-testid="site-side">
          <nav className="site-localnav" aria-label={t(group.title)}>
            <Link className="site-localnav-title" href={group.href} aria-current={group.key === current ? 'page' : undefined}>{t(group.title)}</Link>
            <ul>{group.children.map((c) => <li key={c.key}><Link href={c.href} aria-current={c.key === current ? 'page' : undefined}>{t(c.title)}</Link></li>)}</ul>
          </nav>
          <main id="site-main" className="site-main">{children}</main>
        </div>
      ) : <main id="site-main" className="site-wrap site-main">{children}</main>}
      {toc.length > 0 && <SiteToc label={siteText('toc', lang)} items={toc.map((c) => ({ id: c.href.split('#')[1] ?? '', href: c.href, label: t(c.title) }))} />}
      <footer className="site-footer">
        {richFooter && !hidden ? (
          <div className="site-wrap site-footer-grid">
            <div className="site-footer-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {profile?.logo && assetUrl && <img src={assetUrl(profile.logo)} alt="" width={56} height={56} />}
              <h2>{title}</h2>
              {t(profile?.tagline) && <p>{t(profile?.tagline)}</p>}
            </div>
            <nav aria-label={siteText('pages', lang)}>
              <Link href={link('/')}>{siteText('home', lang)}</Link>
              {kit
                ? tree.filter((n) => n.key !== 'home').map((n) => <Link key={n.key} href={n.href}>{t(n.title)}</Link>)
                : nav.filter((n) => n.key !== 'home').map((n) => <Link key={n.key} href={n.href}>{n.label}</Link>)}
            </nav>
            <div className="site-footer-contact">
              {t(profile?.address) && <p>{t(profile?.address)}</p>}
              {/* 옛 바닥처럼 마지막 번호(사무실) 하나 */}
              {profile?.phone?.length ? <p><a href={`tel:${profile.phone.at(-1)!.replace(/[^0-9+]/g, '')}`} aria-label={`${siteText('call', lang)} ${profile.phone.at(-1)}`}>{profile.phone.at(-1)}</a></p> : null}
              {profile?.facebook && <p><a className="site-link" href={profile.facebook} target="_blank" rel="noopener noreferrer">Facebook<ArrowRight className="link-arrow" size={20} strokeWidth={1.4} aria-hidden="true" /></a></p>}
            </div>
            {kit && visit && (
              <div className="site-footer-action">
                <Link className="site-button" href={visit.href.startsWith('/') ? link(visit.href) : visit.href}>{t(visit.label)}</Link>
              </div>
            )}
            <div className="site-footer-note">
              <p>{t(profile?.footer) || `© ${title}`}</p>
              {!preview && <a className="site-footer-staff" href={staffEditHref(site, path)} rel="nofollow" data-testid="staff-edit">{siteText('staff', lang)}</a>}
            </div>
          </div>
        ) : <div className="site-wrap">© {site.school} · <a className="site-footer-inline" href={staffEditHref(site, path)} rel="nofollow" data-testid="staff-edit">{siteText('staff', lang)}</a></div>}
      </footer>
    </div>
  );
}
