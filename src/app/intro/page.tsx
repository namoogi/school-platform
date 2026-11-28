import Link from 'next/link';
import type { Metadata } from 'next';
import { getI18n } from '@/lib/i18n/server';
import type { MsgKey } from '@/lib/i18n/catalog';

/**
 * 68차: 시스템 홍보 페이지(로그인 없이). 카피 원문·원칙은 docs/marketing/COPY.md — 있는 기능만, 숫자·후기는 지어내지 않는다.
 * 문구는 이름표(intro.*)라 언어를 더하면 그 언어로도 열린다. 언어 목록·번역 사전만 읽는다(학교 자료는 읽지 않음).
 */
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  const { t } = await getI18n((await searchParams).lang);
  return { title: t('intro.metaTitle'), description: t('intro.metaDesc') };
}

/** 113차: 문구는 이름표(intro.*, 원문 docs/marketing/COPY.md). ?lang= 으로 고른 언어 → 쿠키 → 브라우저 → 한국어 */
export default async function IntroPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { t, lang, languages } = await getI18n((await searchParams).lang);
  const others = languages.filter((l) => l.active && l.code !== lang);
  const pillars = [1, 2, 3].map((i) => ({ title: t(`intro.pillar${i}.title` as MsgKey), body: t(`intro.pillar${i}.body` as MsgKey) }));
  const steps = [1, 2, 3].map((i) => ({ title: t(`intro.step${i}.title` as MsgKey), body: t(`intro.step${i}.body` as MsgKey) }));
  const trust = [1, 2, 3, 4].map((i) => t(`intro.trust${i}` as MsgKey));
  const fit = [1, 2, 3, 4, 5].map((i) => t(`intro.for${i}` as MsgKey));
  return (
    <div className="intro" lang={lang}>
      <header className="intro-top">
        <span className="intro-brand"><span className="brand-mark" aria-hidden="true">學</span>onschools</span>
        <nav className="row-wrap" aria-label={t('intro.nav')}>
          {others.map((l) => <Link key={l.code} href={`/intro?lang=${l.code}`} hrefLang={l.code} lang={l.code}>{l.native_name}</Link>)}
          <Link className="btn btn-sm" href="/login">{t('intro.signIn')}</Link>
        </nav>
      </header>
      <main id="main">
        <section className="intro-hero">
          <p className="overline">onschools</p>
          <h1>{t('intro.title')}</h1>
          <p className="intro-sub">{t('intro.sub')}</p>
          <div className="row-wrap">
            <Link className="btn btn-primary" href="/login?next=/site/templates" data-testid="intro-start">{t('intro.start')}</Link>
            <a className="btn" href="#pillars">{t('intro.more')}</a>
          </div>
        </section>
        <section className="intro-section" id="pillars" aria-labelledby="pillars-h">
          <h2 id="pillars-h">{t('intro.pillarsTitle')}</h2>
          <div className="intro-grid">{pillars.map((p) => <article key={p.title} className="card"><h3>{p.title}</h3><p>{p.body}</p></article>)}</div>
        </section>
        <section className="intro-section" aria-labelledby="steps-h">
          <h2 id="steps-h">{t('intro.stepsTitle')}</h2>
          <ol className="intro-steps">{steps.map((s) => <li key={s.title}><strong>{s.title}</strong><span>{s.body}</span></li>)}</ol>
        </section>
        <section className="intro-section intro-split" aria-labelledby="trust-h">
          <div><h2 id="trust-h">{t('intro.trustTitle')}</h2><ul className="intro-list">{trust.map((x) => <li key={x}>{x}</li>)}</ul></div>
          <div><h2>{t('intro.forTitle')}</h2><ul className="intro-tags">{fit.map((x) => <li key={x}>{x}</li>)}</ul>
            <p className="fine intro-langs">{languages.filter((l) => l.active).map((l) => l.native_name).join(' · ')}</p></div>
        </section>
        <section className="intro-end">
          <h2>{t('intro.endTitle')}</h2>
          <p>{t('intro.endBody')}</p>
          <Link className="btn btn-primary" href="/login?next=/site/templates">{t('intro.start')}</Link>
        </section>
      </main>
    </div>
  );
}
